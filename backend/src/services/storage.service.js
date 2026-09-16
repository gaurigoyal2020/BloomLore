import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import fs from "fs/promises";
import path from "path";
import { env } from "../config/env.config.js";
import { logger } from "../utils/logger.utils.js";

/**
 * R2 is S3-compatible object storage, so we talk to it with AWS's own
 * S3 SDK — R2 just needs a different endpoint and region: "auto" instead
 * of a real AWS region. Nothing else about how S3 clients work changes.
 *
 * requestHandler IS the fix for the "job stuck forever" bug: by
 * default, the AWS SDK's underlying HTTP client has NO timeout at all
 * for a request that's already connected but just... never responds —
 * a dropped packet, an R2-side hiccup, a flaky network path that
 * silently swallows the connection instead of closing it cleanly.
 * Confirmed directly: the exact same client config without this option
 * hung for 20+ seconds against a deliberately unresponsive endpoint in
 * testing, with zero error and zero retry ever triggered — it would
 * have hung indefinitely.
 *
 * That matters far beyond just "this one upload fails" — job.service.js
 * processes jobs strictly one at a time (`await processJob(next)` in
 * its worker loop, with no timeout of its own around that await). A
 * single upload call that never resolves and never rejects means
 * processJob() never returns, which means the ENTIRE queue is
 * permanently stuck — every job after it too, forever, until the
 * server process itself is restarted. That's exactly what a stalled
 * upload followed by nothing but repeated status-poll log lines looks
 * like: the frontend keeps asking "is it done yet?", and the answer is
 * frozen at "processing" because nothing will ever update it again.
 *
 * With this configured: a stalled request now fails with a real
 * TimeoutError instead of hanging — which the AWS SDK's own default
 * retry logic (3 attempts) gets a chance to retry automatically for a
 * genuinely transient blip, and which surfaces as a real thrown error
 * (caught by processJob's try/catch → job marked 'error', queue moves
 * on to the next job) if the connection is actually dead. Values here
 * are generous for a several-MB .ts segment on a modest VPS uplink,
 * not a hair-trigger.
 */
const s3 = new S3Client({
  region: "auto",
  endpoint: env.r2Endpoint,
  credentials: {
    accessKeyId: env.r2AccessKeyId,
    secretAccessKey: env.r2SecretAccessKey,
  },
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 5000, // ms to establish the TCP connection at all
    requestTimeout: 30000, // ms to wait for a response once connected
  }),
});

// Maps file extensions to the Content-Type a browser/video player needs
// to actually understand them. Getting this wrong doesn't break the
// upload itself — it breaks playback, since browsers refuse to treat an
// HLS playlist as a playlist without the right MIME type.
export const CONTENT_TYPES = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".vtt": "text/vtt",
};

/**
 * Uploads files in a local directory (non-recursive — the HLS output
 * directory is flat: one .m3u8, several .ts segments, one or two .vtt
 * files) to R2 under the given key prefix, then returns the base public
 * URL those files now live at.
 *
 * By default uploads everything in the directory. Pass `extensions` to
 * upload only a subset — used by job.service.js to kick off the (large)
 * HLS video upload as soon as ffmpeg finishes, running it concurrently
 * with transcription/translation instead of waiting for those to finish
 * first, then uploading just the (small) .vtt files once they exist.
 * Local disk is just scratch space here — R2 is the actual permanent
 * home for these files (with lifecycle rules deleting them after 24h,
 * once that's set up on the bucket).
 */
export async function uploadDirectoryToR2(localDirPath, keyPrefix, { extensions } = {}) {
  const allFiles = await fs.readdir(localDirPath);
  const files = extensions
    ? allFiles.filter((filename) => extensions.includes(path.extname(filename)))
    : allFiles;

  // PutObjectCommand with a Buffer body instead of lib-storage's Upload
  // helper with a stream. The difference: a Buffer has a known length up
  // front, so this sends ONE request per file. A stream's length is
  // unknown until it's fully read, so the SDK has no choice but to
  // treat it as "possibly huge" and run the full multipart sequence
  // (create → upload part → complete — three round trips) even for a
  // 2KB subtitle file. These output files are small (unlike the
  // original video), so buffering them is safe and meaningfully faster.
  await Promise.all(
    files.map(async (filename) => {
      const ext = path.extname(filename);
      const filePath = path.join(localDirPath, filename);
      const body = await fs.readFile(filePath);

      await s3.send(
        new PutObjectCommand({
          Bucket: env.r2BucketName,
          Key: `${keyPrefix}/${filename}`,
          Body: body,
          ContentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
        })
      );
    })
  );

  logger.info("Uploaded to R2", { keyPrefix, fileCount: files.length });

  return `${env.r2PublicUrl}/${keyPrefix}`;
}

/**
 * Fetches ONE object's raw bytes back from R2, for the authenticated
 * media proxy (routes/media.routes.js) to stream to the browser. R2 is
 * private now — see that file for why — so this backend, which already
 * holds the R2 credentials for uploading, is also the only thing
 * allowed to read a file back out.
 *
 * Returns the SDK's Body stream directly (a Node Readable) rather than
 * buffering it into memory first — this app streams potentially many
 * MB of .ts video segments per request, and buffering each one fully
 * before forwarding it would multiply memory use under concurrent
 * requests for no benefit.
 */
export async function getR2Object(key) {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: env.r2BucketName, Key: key })
  );
  return {
    stream: response.Body, // Node Readable — pipe this straight to res
    contentLength: response.ContentLength,
  };
}

/**
 * Uploads a single piece of content (a string or Buffer, not a file on
 * disk) directly to R2 at an exact key. Used when only one file needs to
 * change — e.g. regenerating subtitles.vtt after a user edits subtitle
 * text — rather than re-running uploadDirectoryToR2 over an entire course
 * directory whose video segments and other subtitle file didn't change.
 */
export async function uploadFileToR2(key, body, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.r2BucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  logger.info("Uploaded single file to R2", { key });
}

/**
 * Deletes every object under a given key prefix — e.g. everything under
 * "courses/{jobId}/" (the playlist, every .ts segment, both subtitle
 * files). Used by the cleanup cron once a lesson's 24h expiry has
 * passed. Two-step because R2/S3 has no "delete by prefix" operation —
 * you have to list what exists first, then delete each key you found.
 *
 * THROWS if anything is left over after this returns — either because
 * listing didn't finish, or because R2 reported specific keys it
 * couldn't delete. This matters because of how cleanup.service.js uses
 * this function: it deliberately does NOT delete a lesson's database
 * row unless this call succeeds, specifically so a failed cleanup gets
 * retried on the next pass instead of silently losing track of an
 * orphaned R2 file forever. That guarantee only holds if this function
 * actually throws on every real failure — which, before this fix, it
 * did not (see below).
 */
export async function deleteR2Prefix(prefix) {
  // ── Step 1: list ALL matching keys, not just the first page ──
  // ListObjectsV2Command caps a single response at 1,000 keys and sets
  // `IsTruncated: true` (plus a `NextContinuationToken`) when there's
  // more. A job with more than ~1,000 files — a long video sliced into
  // many small HLS segments — would silently have its later segments
  // left off `listed.Contents` entirely, with no error raised anywhere,
  // and never even get included in the delete request below. Looping
  // until `IsTruncated` is false is what makes this safe for any job
  // size instead of only ones under 1,000 files.
  const keys = [];
  let continuationToken;
  do {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: env.r2BucketName,
        Prefix: `${prefix}/`,
        ContinuationToken: continuationToken,
      })
    );
    keys.push(...(listed.Contents ?? []).map((obj) => obj.Key));
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);

  if (keys.length === 0) return; // Already gone (or never existed) — not an error.

  // ── Step 2: delete in batches of ≤1000 (the API's own hard limit) ──
  // DeleteObjectsCommand rejects a request with more than 1,000 objects
  // outright, so for the (rare) job that lists more keys than that,
  // this has to be split into multiple calls.
  const BATCH_SIZE = 1000;
  const batches = [];
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    batches.push(keys.slice(i, i + BATCH_SIZE));
  }

  const allErrors = [];
  let deletedCount = 0;

  for (const batch of batches) {
    const response = await s3.send(
      new DeleteObjectsCommand({
        Bucket: env.r2BucketName,
        Delete: { Objects: batch.map((Key) => ({ Key })) },
      })
    );

    // THE ACTUAL BUG: this command returns HTTP 200 even when some
    // individual objects failed to delete — it never throws for that.
    // Per-object failures (wrong permissions, object locked, a
    // transient error on just that one key) show up ONLY in
    // `response.Errors`, which the old code never even read. That's
    // exactly how a "successful" cleanup pass could leave real files
    // behind in the bucket while still telling the DB row it's safe to
    // delete.
    if (response.Errors?.length) {
      allErrors.push(...response.Errors);
    }
    deletedCount += batch.length - (response.Errors?.length ?? 0);
  }

  if (allErrors.length > 0) {
    logger.error("R2 deletion had partial failures", {
      prefix,
      failedCount: allErrors.length,
      // Each entry is { Key, Code, Message } straight from R2 — logging
      // it in full is what actually lets you diagnose WHY a specific
      // key won't delete (permissions vs. lock vs. something else)
      // instead of just knowing that it didn't.
      errors: allErrors.map((e) => ({ key: e.Key, code: e.Code, message: e.Message })),
    });
    // Throwing here is what makes cleanup.service.js's existing
    // try/catch do the right thing: it already skips deleting the DB
    // row when this function throws, and logs the failure — it just
    // never used to receive a throw for THIS failure mode before.
    throw new Error(
      `Failed to delete ${allErrors.length}/${keys.length} object(s) under ${prefix}/`
    );
  }

  logger.info("Deleted from R2", { prefix, fileCount: deletedCount });
}