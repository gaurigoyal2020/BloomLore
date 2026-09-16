import axios from "axios";
import { createReadStream } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { env } from "../config/env.config.js";
import { logger } from "../utils/logger.utils.js";

const execFilePromise = promisify(execFile);

/**
 * Real duration of the audio file on disk, via ffprobe — used only to
 * sanity-check what Deepgram claims to have transcribed (see the
 * completeness check below). Deliberately doesn't throw: if ffprobe
 * itself fails for some reason, that's not a reason to fail the whole
 * transcription job over a diagnostic check.
 */
async function getAudioDurationSeconds(audioPath) {
  try {
    const { stdout } = await execFilePromise(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audioPath],
      { timeout: 30_000 }
    );
    return parseFloat(stdout);
  } catch {
    return null;
  }
}

export const transcribeAudio = async (audioPath) => {
  try {
    const response = await axios.post(
      "https://api.deepgram.com/v1/listen",
      // A readable stream instead of a fully-loaded Buffer. axios/Node
      // pipe this to Deepgram in small chunks (using chunked transfer
      // encoding, since there's no upfront Content-Length to give) —
      // the whole audio file is never held in memory at once. This
      // mirrors what Deepgram's own SDK does internally for file
      // transcription: it accepts fs.createReadStream() the same way.
      createReadStream(audioPath),
      {
        headers: {
          Authorization: `Token ${env.deepgramApiKey}`,
          "Content-Type": "audio/mp3",
        },
        params: {
          model: "nova-3",
          smart_format: true,
          punctuate: true,
          detect_language: true,
          diarize: false,
          utterances: true,
        },
        timeout: 10 * 60 * 1000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    const channel = response.data?.results?.channels?.[0];
    const alt = channel?.alternatives?.[0];
    if (!alt) throw new Error("Deepgram returned no transcription results");

    const transcript = alt.transcript ?? "";
    const words = alt.words ?? [];
    const detectedLang = channel?.detected_language ?? "en";
    // Deepgram's own docs are explicit that detect_language's guess isn't
    // meant to be trusted blindly — language_confidence is the metric
    // they say to check before relying on it. This app was reading
    // detected_language but never looking at this at all. Concretely:
    // an empty transcript alongside a LOW language_confidence here means
    // "detect_language took a bad guess and then failed to find speech
    // in the wrong language it picked" — a specific, fixable failure
    // mode (e.g. restricting detect_language to expected languages, or
    // falling back to a fixed language on low confidence). An empty
    // transcript alongside a HIGH confidence would point somewhere else
    // entirely (genuinely no speech, or a real model issue) — so this
    // number is what actually distinguishes those two very different
    // problems, instead of guessing from chars:0 alone after the fact.
    const languageConfidence = channel?.language_confidence ?? null;

    // Completeness sanity check — NOT a fix for the nova-3 bug above (a
    // dropped sentence in the MIDDLE of the audio wouldn't show up
    // here, since word timestamps on either side of the gap still look
    // continuous). What this DOES catch: Deepgram returning a
    // transcript that stops well short of the audio's actual end,
    // which is the specific shape of the bug reported in this app so
    // far. Logged, not thrown — a short/quiet video legitimately having
    // its last spoken word end before the file's last second isn't an
    // error, so this can't safely be a hard failure. But it turns "we
    // silently got a truncated transcript" into a concrete, greppable
    // log line with real numbers, instead of only being discoverable by
    // a user noticing their subtitles stopped early.
    const lastWordEnd = words.length > 0 ? words[words.length - 1].end : 0;
    const audioDurationSeconds = await getAudioDurationSeconds(audioPath);
    if (audioDurationSeconds != null) {
      const uncoveredSeconds = audioDurationSeconds - lastWordEnd;
      if (uncoveredSeconds > 5) {
        logger.warn("Transcript may be incomplete — coverage ends well before audio does", {
          audioDurationSeconds,
          lastWordEnd,
          uncoveredSeconds,
          wordCount: words.length,
          transcriptChars: transcript.length,
          detectedLang,
          languageConfidence,
        });
      }
    }

    return {
      transcript,
      words,
      detectedLang,
      languageConfidence,
    };
  } catch (err) {
    if (err.response?.status === 401)
      throw new Error("Deepgram authentication failed. Check your DEEPGRAM_API_KEY.");
    throw new Error(`Transcription failed: ${err.message}`);
  }
};