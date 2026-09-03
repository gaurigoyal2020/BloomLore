import { getR2Object, CONTENT_TYPES } from "../services/storage.service.js";
import { verifyMediaToken } from "../utils/mediaToken.utils.js";
import { logger } from "../utils/logger.utils.js";

// The ONLY filenames this app ever writes into a course's R2 prefix —
// see job.service.js (uploadDirectoryToR2 calls) for where each of
// these gets created. Rejecting anything outside this exact set means
// :filename can never be used to build an R2 key this app didn't
// itself generate, regardless of what a client sends.
const ALLOWED_FILENAME_PATTERN = /^(index\.m3u8|segment\d+\.ts|subtitles(-translated)?\.vtt)$/;

/**
 * Buffers a Node Readable stream into one string. Only used for
 * index.m3u8 below — that file is always a few hundred bytes (a
 * handful of text lines), never large like a video segment, so
 * buffering it fully (instead of streaming it straight through like
 * every other file this route serves) is fine and is what lets us edit
 * its contents before sending it on.
 */
function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}

/**
 * GET /api/media/:jobId/:filename?token=...
 *
 * Replaces directly-public R2 URLs. There is deliberately NO
 * `requireAuth` in front of this route (see media.routes.js) — a
 * browser's native <video>/<track> tags and an HLS player's own
 * playlist/segment requests are issued by the browser itself, and there
 * is no way to attach a custom Authorization header to those. Instead,
 * authorization travels as a signed `?token=` query parameter — see
 * utils/mediaToken.utils.js for the full explanation of how that token
 * proves a request is legitimate without needing a header at all.
 *
 * The ownership check ("does this user actually own this jobId?") does
 * NOT happen here — it already happened once, at the moment the token
 * was minted (job.service.js for a just-finished live job,
 * lessons.controller.js for a history view). All this route re-checks
 * is "was this exact token, for this exact jobId, genuinely issued by
 * us, and has it not expired yet?" — see verifyMediaToken().
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
    const { token } = req.query;

    if (!ALLOWED_FILENAME_PATTERN.test(filename)) {
      return res.status(400).json({ success: false, error: "Invalid file name" });
    }

    if (!verifyMediaToken(token, jobId)) {
      // 401, not 404, is correct here (unlike the old header-based
      // version): there's no "this jobId doesn't exist" vs "isn't
      // yours" distinction to hide anymore, since knowing a jobId alone
      // was never the secret — the signed token is. An invalid/expired/
      // missing token just means "this URL isn't currently authorized,"
      // which is exactly what the HLS player/frontend should re-request
      // a fresh token in response to.
      logger.warn("Rejected media request: invalid or expired token", { jobId, filename });
      return res.status(401).json({ success: false, error: "Invalid or expired media token" });
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

    // index.m3u8 needs special handling: its segment lines are plain
    // relative filenames ("segment000.ts"), and relative-URL resolution
    // in a browser/HLS player does NOT carry a query string from the
    // playlist's own URL over to the files it references — the segment
    // requests would go out with no `?token=` at all and get rejected
    // by the check above. So we rewrite each segment line to carry the
    // SAME token this playlist request was authorized with before
    // sending the playlist text on. Every other file (segments,
    // subtitles) has no such internal references and is streamed
    // through untouched.
    if (filename === "index.m3u8") {
      const playlistText = await streamToString(object.stream);
      const rewritten = playlistText
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          // Lines starting with "#" are HLS directives/metadata, not
          // file references — leave them alone. Blank lines too.
          if (!trimmed || trimmed.startsWith("#")) return line;
          return `${trimmed}?token=${encodeURIComponent(token)}`;
        })
        .join("\n");

      res.setHeader("Content-Type", CONTENT_TYPES[ext] ?? "application/octet-stream");
      // NOT cached the way segments/subtitles are below: the token
      // embedded in this rewritten playlist expires, so a long-cached
      // copy would eventually serve segment links that 401. Segments/
      // subtitles are fine to cache because the CLIENT re-fetches the
      // playlist (and gets fresh segment tokens) far more often than
      // the token TTL, in normal playback.
      res.status(200).send(rewritten);
      return;
    }

    res.setHeader("Content-Type", CONTENT_TYPES[ext] ?? "application/octet-stream");
    if (object.contentLength != null) {
      res.setHeader("Content-Length", object.contentLength);
    }
    // Safe to cache: these files never change after upload (a subtitle
    // edit rewrites the same KEY with new content — see uploadFileToR2's
    // call site in lessons.controller.js — so a stale cached copy would
    // only ever affect that one lesson's browser cache for a bounded
    // time, not leak anything across users, since the token check above
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