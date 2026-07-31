import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import fs from "fs/promises";
import path from "path";
import { env } from "../config/env.config.js";
import { logger } from "../utils/logger.js";

/**
 * R2 is S3-compatible object storage, so we talk to it with AWS's own
 * S3 SDK — R2 just needs a different endpoint and region: "auto" instead
 * of a real AWS region. Nothing else about how S3 clients work changes.
 */
const s3 = new S3Client({
  region: "auto",
  endpoint: env.r2Endpoint,
  credentials: {
    accessKeyId: env.r2AccessKeyId,
    secretAccessKey: env.r2SecretAccessKey,
  },
});

// Maps file extensions to the Content-Type a browser/video player needs
// to actually understand them. Getting this wrong doesn't break the
// upload itself — it breaks playback, since browsers refuse to treat an
// HLS playlist as a playlist without the right MIME type.
const CONTENT_TYPES = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".vtt": "text/vtt",
};

/**
 * Uploads every file in a local directory (non-recursive — the HLS
 * output directory is flat: one .m3u8, several .ts segments, one or two
 * .vtt files) to R2 under the given key prefix, then returns the base
 * public URL those files now live at.
 *
 * Called ONCE per job, after ffmpeg/transcription/translation/subtitle
 * generation have all already finished writing their output locally.
 * Local disk is just scratch space here — R2 is the actual permanent
 * home for these files (with lifecycle rules deleting them after 24h,
 * once that's set up on the bucket).
 */
export async function uploadDirectoryToR2(localDirPath, keyPrefix) {
  const files = await fs.readdir(localDirPath);

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
 * Deletes every object under a given key prefix — e.g. everything under
 * "courses/{jobId}/" (the playlist, every .ts segment, both subtitle
 * files). Used by the cleanup cron once a lesson's 24h expiry has
 * passed. Two-step because R2/S3 has no "delete by prefix" operation —
 * you have to list what exists first, then delete each key you found.
 */
export async function deleteR2Prefix(prefix) {
  const listed = await s3.send(
    new ListObjectsV2Command({ Bucket: env.r2BucketName, Prefix: `${prefix}/` })
  );

  const keys = (listed.Contents ?? []).map((obj) => obj.Key);
  if (keys.length === 0) return; // Already gone (or never existed) — not an error.

  // DeleteObjectsCommand deletes up to 1000 keys in a single request —
  // far cheaper than one DeleteObjectCommand call per file, and an HLS
  // job's file count (playlist + segments + subtitles) is always well
  // under that limit.
  await s3.send(
    new DeleteObjectsCommand({
      Bucket: env.r2BucketName,
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    })
  );

  logger.info("Deleted from R2", { prefix, fileCount: keys.length });
}