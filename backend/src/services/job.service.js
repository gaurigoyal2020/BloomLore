import { processVideo } from "./ffmpeg.service.js";
import { transcribeAudio } from "./transcription.service.js";
import { translateText } from "./translation.service.js";
import {
  generateWebVTT,
  groupWordsIntoChunks,
  buildTranslatedChunks,
} from "./subtitle.service.js";
import { ensureDirectoryExists, deleteFile } from "../utils/file.utils.js";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.config.js";

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
export const createJob = ({ jobId, videoPath, targetLang, originalName, userId }) => {
  jobs.set(jobId, {
    id: jobId,
    userId,
    status: "queued", // 'queued' | 'processing' | 'complete' | 'error'
    stage: "queued", // finer-grained: which pipeline step is active right now
    error: null,
    data: null, // filled in with the full result once status is 'complete'
    createdAt: Date.now(),
  });

  pendingQueue.push({ jobId, videoPath, targetLang, originalName });

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
async function processJob({ jobId, videoPath, targetLang, originalName }) {
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
    const translatedText = await timedStage("translation", () =>
      translateText(transcript, detectedLang, targetLang)
    );

    logger.info("Transcript", { detectedLang, chars: transcript.length });
    logger.debug("Translated", { targetLang, chars: translatedText.length });

    job.stage = "building-subtitles";
    generateWebVTT(words, outputPath, translatedText);

    const chunks = groupWordsIntoChunks(words);
    const subtitleCues = chunks.map((chunk) => ({
      start: chunk.start,
      end: chunk.end,
      text: chunk.words.join(" "),
    }));
    const translatedCues =
      translatedText !== transcript
        ? buildTranslatedChunks(chunks, translatedText)
        : null;

    // Original upload no longer needed once ffmpeg has read from it.
    deleteFile(videoPath);

    logger.info("[timing] TOTAL", {
      seconds: Number(((Date.now() - pipelineStart) / 1000).toFixed(1)),
    });

    const base = `${env.baseUrl}/uploads/courses/${jobId}`;
    const videoUrl = `${base}/index.m3u8`;
    const subtitleUrl = `${base}/subtitles.vtt`;
    const translatedSubtitleUrl =
      translatedText !== transcript ? `${base}/subtitles-translated.vtt` : null;

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
      originalLang: detectedLang,
      targetLang,
      wordCount: words.length,
      subtitles: subtitleCues,
      translatedSubtitles: translatedCues,
    };
  } catch (err) {
    // Same cleanup-on-error behavior as before, just triggered from
    // inside the background worker instead of an HTTP catch block.
    deleteFile(videoPath);
    logger.error("Job failed", { jobId, error: err.message });
    job.status = "error";
    job.error = err.message || "Processing failed";
  }
}