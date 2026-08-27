import { getR2Object, CONTENT_TYPES } from "../services/storage.service.js";
import { getJob } from "../services/job.service.js";
import { getLessonById } from "../services/db.service.js";
import { logger } from "../utils/logger.js";

// The ONLY filenames this app ever writes into a course's R2 prefix —
// see job.service.js (uploadDirectoryToR2 calls) for where each of
// these gets created. Rejecting anything outside this exact set means
// :filename can never be used to build an R2 key this app didn't
// itself generate, regardless of what a client sends.
const ALLOWED_FILENAME_PATTERN = /^(index\.m3u8|segment\d+\.ts|subtitles(-translated)?\.vtt)$/;

/**
 * Checks whether `userId` is allowed to read files belonging to `jobId`,
 * checking TWO sources rather than just one — and the reason is a real
 * timing gap, not caution for its own sake:
 *
 * job.service.js marks a job "complete" (and the frontend's poll
 * immediately sees that, videoUrl and all) BEFORE the matching Postgres
 * `lessons` row has actually been written — that insert is deliberately
 * fire-and-forget, so the user waiting on their result isn't held up by
 * a slow/failed database write (see the comment above insertLesson()'s
 * call site). If this function only checked the `lessons` table, a
 * request for the just-finished video could land in the split second
 * before that row exists and get a false "not found" — on a totally
 * legitimate request, right after the exact upload that created it.
 *
 * Checking the in-memory job store first closes that gap: it's written
 * synchronously at job creation, before any processing starts, so it's
 * always there the instant a job finishes. The lessons-table check is
 * the fallback for everything the in-memory store can't answer —
 * history views from an earlier session, or any lookup after a server
 * restart (which wipes the in-memory store, per job.service.js's own
 * comment on why that's an accepted limitation for now).
 */
async function userOwnsJob(jobId, userId) {
  const job = getJob(jobId);
  if (job) {
    return job.userId === userId;
  }
  const lesson = await getLessonById(jobId, userId);
  return lesson !== null;
}

/**
 * GET /api/media/:jobId/:filename
 *
 * Replaces directly-public R2 URLs. Every request re-checks ownership
 * before reading anything back from R2 — same authenticated pattern as
 * every other per-user resource in this app (status polling, lesson
 * fetch), just applied to video/subtitle bytes instead of JSON.
 *
 * The HLS player requests the playlist through THIS route
 * (/api/media/:jobId/index.m3u8), and because the playlist itself
 * references its segments by plain relative filename ("segment000.ts"),
 * the player automatically re-requests those segments through this same
 * route too — no rewriting of the playlist's contents is needed.
 *
 * NOTE: this does not implement HTTP Range requests. Each HLS segment
 * is a small (~10s) whole file the player fetches in full, so this
 * doesn't affect HLS playback or seeking. It WOULD matter for a plain
 * `<video src="whole-file.mp4">` with browser-native scrubbing, which
 * this app doesn't use.
 */
export async function getMediaFile(req, res, next) {
  try {
    const { jobId, filename } = req.params;

    if (!ALLOWED_FILENAME_PATTERN.test(filename)) {
      return res.status(400).json({ success: false, error: "Invalid file name" });
    }

    const authorized = await userOwnsJob(jobId, req.user.id);
    if (!authorized) {
      // Same 404-for-both reasoning as getJobStatusHandler: don't let a
      // different response for "exists but isn't yours" confirm a jobId
      // is real to someone who doesn't own it.
      return res.status(404).json({ success: false, error: "Not found" });
    }

    const ext = "." + filename.split(".").pop();
    const key = `courses/${jobId}/${filename}`;

    let object;
    try {
      object = await getR2Object(key);
    } catch (err) {
      // R2/S3 throws rather than returning null for a missing key.
      logger.warn("Requested media not found in R2", { key, error: err.message });
      return res.status(404).json({ success: false, error: "Not found" });
    }

    res.setHeader("Content-Type", CONTENT_TYPES[ext] ?? "application/octet-stream");
    if (object.contentLength != null) {
      res.setHeader("Content-Length", object.contentLength);
    }
    // Safe to cache: these files never change after upload (a subtitle
    // edit rewrites the same KEY with new content — see uploadFileToR2's
    // call site in lessons.controller.js — so a stale cached copy would
    // only ever affect that one lesson's browser cache for a bounded
    // time, not leak anything across users, since the auth check above
    // already ran).
    res.setHeader("Cache-Control", "private, max-age=3600");

    object.stream.pipe(res);
    object.stream.on("error", (err) => {
      logger.error("Error streaming media from R2", { key, error: err.message });
      if (!res.headersSent) res.status(500).end();
    });
  } catch (err) {
    next(err);
  }
}