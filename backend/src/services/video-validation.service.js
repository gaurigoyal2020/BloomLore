import { execFile } from "child_process";
import { promisify } from "util";
import { env } from "../config/env.config.js";
import { logger } from "../utils/logger.js";

const execFilePromise = promisify(execFile);

// A file this app should refuse to process. Thrown deliberately (not a
// generic Error) so job.service.js can tell "this upload is invalid" —
// a normal, expected outcome worth a clear user-facing message — apart
// from "something on our end broke."
export class InvalidVideoError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidVideoError";
  }
}

/**
 * Inspects an uploaded file with ffprobe and rejects it unless it is a
 * genuine, well-formed video within this app's limits.
 *
 * WHY THIS EXISTS: multer's fileFilter only checks the `Content-Type`
 * header the client's browser/HTTP request sent — and that header is
 * just a string the client chose to include. An attacker can label ANY
 * file as `video/mp4` and multer's filter will happily accept it, so it
 * proves nothing about what's actually in the file. That matters here
 * specifically because the file that check waves through is the exact
 * file handed to ffmpeg next — a complex C parser processing untrusted
 * bytes. If that file isn't really a video, the safest place to find
 * out is here, before ffmpeg ever opens it, not by letting ffmpeg
 * discover it the hard way.
 *
 * ffprobe reports on a file the same way a real video player's decoder
 * would — it can't be fooled by a renamed file the way a MIME-type
 * check can, because it actually parses the container/codec structure
 * rather than trusting a label. If ffprobe can't make sense of the
 * file, nothing downstream will be able to either.
 *
 * Beyond "is this really a video," this also enforces the resource
 * limits from env.config.js (duration, resolution, stream count) —
 * because a file can be entirely genuine and still be built to make
 * ffmpeg spend an unreasonable amount of CPU/time/disk on it.
 */
export async function validateVideoFile(filePath) {
  let probeJson;
  try {
    const { stdout } = await execFilePromise(
      "ffprobe",
      [
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        filePath,
      ],
      { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }
    );
    probeJson = JSON.parse(stdout);
  } catch (err) {
    logger.warn("ffprobe rejected uploaded file", { filePath, error: err.message });
    throw new InvalidVideoError(
      "This file isn't a valid, readable video. It may be corrupted or not actually a video file."
    );
  }

  const streams = probeJson.streams ?? [];
  const videoStreams = streams.filter((s) => s.codec_type === "video");

  if (videoStreams.length === 0) {
    throw new InvalidVideoError("No video stream found in this file.");
  }

  if (streams.length > env.maxVideoStreamCount) {
    // A legitimate video has a small handful of streams (one video, one
    // or two audio tracks, maybe subtitles). Dozens/hundreds of streams
    // is a construction meant to make a decoder do unreasonable amounts
    // of work per byte uploaded, not a real recording.
    throw new InvalidVideoError(
      `This file has too many embedded streams (${streams.length}). Maximum allowed is ${env.maxVideoStreamCount}.`
    );
  }

  const durationSeconds = parseFloat(probeJson.format?.duration ?? "0");
  const maxDurationSeconds = env.maxVideoDurationMinutes * 60;
  if (durationSeconds > maxDurationSeconds) {
    throw new InvalidVideoError(
      `Video is too long (${Math.round(durationSeconds / 60)} min). Maximum allowed is ${env.maxVideoDurationMinutes} min.`
    );
  }

  const primaryVideo = videoStreams[0];
  const width = primaryVideo.width ?? 0;
  const height = primaryVideo.height ?? 0;
  if (width > env.maxVideoWidth || height > env.maxVideoHeight) {
    throw new InvalidVideoError(
      `Video resolution (${width}x${height}) exceeds the maximum allowed (${env.maxVideoWidth}x${env.maxVideoHeight}).`
    );
  }

  logger.info("Video passed validation", {
    filePath,
    durationSeconds,
    width,
    height,
    streamCount: streams.length,
  });
}