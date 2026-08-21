import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../utils/logger.js";

const execPromise = promisify(exec);

// 30 minute timeout for large videos
const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Convert video to HLS format (.m3u8 + .ts segments) AND extract the
 * audio track as MP3, in a single ffmpeg invocation.
 *
 * Why one call instead of two: ffmpeg supports multiple outputs from a
 * single input. Given one -i input, it reads and decodes the source file
 * ONCE, then feeds that decoded data to both output encoders (HLS + mp3).
 * Two separate calls (the old approach) each open and decode the file
 * independently — doubling the most expensive part of this step for no
 * benefit. The encoded output bytes are identical either way; this only
 * removes the redundant read/decode pass.
 */
export const processVideo = async (videoPath, outputPath, hlsPath, audioPath) => {
  const cmd = [
    "ffmpeg -y",
    `-i "${videoPath}"`,
    // ── Output 1: HLS video ──
    "-codec:v libx264",
    // veryfast = x264 spends less time searching for optimal compression.
    // Trade-off: slightly larger file at the same visual quality. Does NOT
    // affect transcription/translation accuracy — that's a separate stage
    // that reads the extracted audio, not this encoded video.
    "-preset veryfast",
    "-codec:a aac",
    "-hls_time 10",
    "-hls_playlist_type vod",
    `-hls_segment_filename "${outputPath}/segment%03d.ts"`,
    "-start_number 0",
    `"${hlsPath}"`,
    // ── Output 2: MP3 audio (same decoded source, no video track) ──
    "-vn",
    "-acodec libmp3lame",
    `"${audioPath}"`,
  ].join(" ");

  // execPromise gives us nothing until the WHOLE command exits — on a
  // slower machine with a longer video, that can be minutes with zero
  // output, which is indistinguishable from a genuine hang from the
  // logs alone. This heartbeat doesn't make ffmpeg any faster, it just
  // proves it's still alive: one log line every 15s for as long as this
  // is running, cleared the moment it finishes (success or failure).
  const heartbeatStart = Date.now();
  const heartbeat = setInterval(() => {
    logger.info("[ffmpeg] still processing", {
      elapsedSeconds: Math.round((Date.now() - heartbeatStart) / 1000),
    });
  }, 15_000);

  try {
    await execPromise(cmd, { timeout: FFMPEG_TIMEOUT_MS });
    logger.info("Video processed (HLS + audio)", { hlsPath, audioPath });
  } catch (err) {
    logger.error("FFmpeg processing failed", err, { videoPath });
    throw new Error("Video conversion failed. Ensure the file is a valid video.");
  } finally {
    clearInterval(heartbeat);
  }
};