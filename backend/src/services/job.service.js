import { processVideo } from "./ffmpeg.service.js";
import { transcribeAudio } from "./transcription.service.js";
import { translateText } from "./translation.service.js";
import {
  generateWebVTT,
  groupWordsIntoChunks,
  buildTranslatedChunks,
} from "./subtitle.service.js";
import { uploadDirectoryToR2 } from "./storage.service.js";
import { insertLesson } from "./db.service.js";
import { ensureDirectoryExists, deleteFile, deleteDirectory } from "../utils/file.utils.js";
import { logger } from "../utils/logger.js";

// ── In-memory job store ─────────────────────────────────────────────
// This is a plain JS Map living in the Node process's memory — NOT a
// database. Two consequences, both fine for now on purpose:
//   1. All job history is wiped every time the server restarts/redeploys.
//   2. It can't be shared across multiple server instances (only matters
//      once you're running more than one backend process, which you're not).
// The project handoff doc already flags a real persistent store
// (Cloudflare D1) as needed before deployment — this in-memory version
// is just enough to make the queue *behave* correctly right now.
const jobs = new Map();

// ── Sequential worker queue ─────────────────────────────────────────
// Jobs are processed strictly ONE AT A TIME, on purpose. This matches
// the cost/hosting plan already decided: a single cheap VPS handles one
// video at a time, and if two people upload at once, the second person's
// job just waits its turn in `pendingQueue` instead of both jobs fighting
// over the same CPU for ffmpeg encoding. It's a wait-time tradeoff for
// users during busy periods, not a cost tradeoff — no extra infra needed.
const pendingQueue = [];
let isWorkerRunning = false;

// Same timing-log helper that used to live in the controller — moved
// here since the actual work happens here now.
const timedStage = async (label, fn) => {
  const start = Date.now();
  const result = await fn();
  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  logger.info(`[timing] ${label}`, { seconds: Number(seconds) });
  return result;
};

/**
 * Registers a new job as 'queued' and adds it to the processing line.
 * Returns immediately — it does NOT wait for the video to finish
 * processing. This is the key change from the old flow: the HTTP
 * handler that calls this only has to wait for createJob() to return
 * (near-instant), not for the whole pipeline.
 */
export const createJob = ({ jobId, videoPath, targetLang, originalName, fileSize, userId }) => {
  jobs.set(jobId, {
    id: jobId,
    userId,
    status: "queued", // 'queued' | 'processing' | 'complete' | 'error'
    stage: "queued", // finer-grained: which pipeline step is active right now
    error: null,
    data: null, // filled in with the full result once status is 'complete'
    createdAt: Date.now(),
  });

  pendingQueue.push({ jobId, videoPath, targetLang, originalName, fileSize });

  // Safe to call even if a worker is already chewing through the queue —
  // runWorker() checks isWorkerRunning and no-ops if so.
  runWorker();
};

/** Reads the current status of a job. Returns null if the id is unknown. */
export const getJob = (jobId) => jobs.get(jobId) ?? null;

/**
 * The worker loop. Pulls one job off the front of the queue, processes
 * it fully (awaiting every step), then moves to the next. The
 * isWorkerRunning flag stops this from accidentally starting twice if
 * two uploads arrive close together — both would call runWorker(), but
 * only the first one actually starts the loop.
 */
async function runWorker() {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  while (pendingQueue.length > 0) {
    const next = pendingQueue.shift();
    await processJob(next);
  }

  isWorkerRunning = false;
}

/**
 * Does the actual video processing for one job. This is the SAME
 * pipeline that used to run directly inside the HTTP request handler —
 * ffmpeg, then Deepgram transcription, then translation, then subtitle
 * generation. Nothing about *how* a video is processed changed here,
 * only *when* and *where*: this now runs in the background and updates
 * the job's `stage` as it goes, instead of blocking a live HTTP response.
 */
async function processJob({ jobId, videoPath, targetLang, originalName, fileSize }) {
  const job = jobs.get(jobId);
  const pipelineStart = Date.now();
  const outputPath = `./uploads/courses/${jobId}`;
  const hlsPath = `${outputPath}/index.m3u8`;
  const audioPath = `${outputPath}/audio.mp3`;

  try {
    job.status = "processing";
    logger.info("Processing video", { jobId, originalName });
    ensureDirectoryExists(outputPath);

    job.stage = "converting";
    await timedStage("ffmpeg (HLS + audio)", () =>
      processVideo(videoPath, outputPath, hlsPath, audioPath)
    );

    job.stage = "transcribing";
    const { transcript, words, detectedLang } = await timedStage(
      "transcription (Deepgram)",
      () => transcribeAudio(audioPath)
    );

    job.stage = "translating";
    // translationStatus: 'skipped' (source === target, nothing to do),
    // 'success' (a provider actually translated it), or 'failed' (every
    // provider errored — translatedText falls back to the original text).
    // Everything downstream (VTT generation, cue building, the URL sent
    // to the frontend) keys off this status now instead of comparing
    // translatedText to transcript by string equality, which couldn't
    // tell 'skipped' apart from 'failed' — both just look like "same text".
    const { text: translatedText, status: translationStatus } = await timedStage(
      "translation",
      () => translateText(transcript, detectedLang, targetLang)
    );
    const translationSucceeded = translationStatus === "success";

    logger.info("Transcript", { detectedLang, chars: transcript.length });
    logger.debug("Translated", { targetLang, translationStatus, chars: translatedText.length });

    job.stage = "building-subtitles";
    // Only generate/upload a translated VTT file when a translation
    // genuinely happened — previously this ran unconditionally (since
    // translatedText is always a truthy string), writing and uploading a
    // subtitles-translated.vtt file to R2 even on 'skipped'/'failed' jobs,
    // which the frontend never even linked to.
    generateWebVTT(words, outputPath, translationSucceeded ? translatedText : null);

    const chunks = groupWordsIntoChunks(words);
    const subtitleCues = chunks.map((chunk) => ({
      start: chunk.start,
      end: chunk.end,
      text: chunk.words.join(" "),
    }));
    const translatedCues = translationSucceeded
      ? buildTranslatedChunks(chunks, translatedText)
      : null;

    // Original upload no longer needed once ffmpeg has read from it.
    deleteFile(videoPath);

    // audio.mp3 was only ever an internal artifact for Deepgram — it was
    // never part of what the frontend serves, so it shouldn't go to R2
    // at all. Deleting it here (rather than filtering it out during
    // upload) keeps uploadDirectoryToR2 simple: it can just upload
    // everything it finds, no exclusion-list logic needed.
    deleteFile(audioPath);

    logger.info("[timing] TOTAL", {
      seconds: Number(((Date.now() - pipelineStart) / 1000).toFixed(1)),
    });

    job.stage = "uploading";
    const base = await timedStage("upload to R2", () =>
      uploadDirectoryToR2(outputPath, `courses/${jobId}`)
    );
    const videoUrl = `${base}/index.m3u8`;
    const subtitleUrl = `${base}/subtitles.vtt`;
    const translatedSubtitleUrl = translationSucceeded
      ? `${base}/subtitles-translated.vtt`
      : null;

    // Local disk was only ever scratch space for ffmpeg to write into —
    // R2 is the actual permanent home for these files now. No reason to
    // keep a second copy sitting on the VPS's disk indefinitely.
    deleteDirectory(outputPath);

    job.status = "complete";
    job.stage = "done";
    job.data = {
      lessonId: jobId, // jobId IS the lessonId — same identifier from the
      // moment the upload is accepted, no separate id minted later. This
      // also answers the open question in the handoff doc about whether
      // lessonId would need to change shape for the job queue — it doesn't.
      videoUrl,
      subtitleUrl,
      translatedSubtitleUrl,
      transcript,
      translatedText,
      // Was missing here even though lessons.controller.js's getLesson
      // response includes it and its own comment claims the two shapes
      // match exactly ("so ResultsPage can render it without needing to
      // know whether it came from a live job or history") — without this,
      // that parity was only true for history views, not the live-poll
      // result a user sees right after uploading.
      originalFilename: originalName,
      fileSize, // bytes — from multer's req.file.size, see video.controller.js
      originalLang: detectedLang,
      targetLang,
      wordCount: words.length,
      subtitles: subtitleCues,
      translatedSubtitles: translatedCues,
    };

    // Fire-and-forget on purpose — NOT awaited before returning, and its
    // own internal error handling never throws (see db.service.js). A
    // failed history write is a lesser problem than the video pipeline
    // itself: the user is actively waiting on THIS job's result right
    // now, and it already fully succeeded (video's in R2, subtitles are
    // ready). Losing the ability to see it later in "upload history" is
    // a real but smaller failure — it shouldn't retroactively turn an
    // otherwise-successful job into an error for the person waiting.
    insertLesson({
      jobId,
      userId: job.userId,
      videoUrl,
      subtitleUrl,
      translatedSubtitleUrl,
      transcript,
      translatedText,
      subtitles: subtitleCues,
      translatedSubtitles: translatedCues,
      originalFilename: originalName,
      fileSize,
      originalLang: detectedLang,
      targetLang,
      wordCount: words.length,
    }).catch((err) => {
      // Belt-and-suspenders: insertLesson already logs Supabase's own
      // returned {error} responses internally, but this call itself
      // isn't awaited by the caller — without this .catch(), an actual
      // thrown/rejected failure (bad key, network issue, connection
      // problem) here would vanish as a silent unhandled rejection
      // instead of ever showing up in the logs at all.
      logger.error("insertLesson threw unexpectedly", { jobId, error: err.message });
    });
  } catch (err) {
    // Same cleanup-on-error behavior as before, just triggered from
    // inside the background worker instead of an HTTP catch block.
    // Also cleans up outputPath now — whatever ffmpeg/subtitle
    // generation managed to write before the failure would otherwise
    // sit on disk forever, since nothing else ever revisits a failed job.
    deleteFile(videoPath);
    deleteDirectory(outputPath);
    logger.error("Job failed", { jobId, error: err.message });
    job.status = "error";
    job.error = err.message || "Processing failed";
  }
}