import { getExpiredLessonIds, deleteLessonRow } from "./db.service.js";
import { deleteR2Prefix } from "./storage.service.js";
import { logger } from "../utils/logger.js";

/**
 * Runs one cleanup pass: finds every lesson whose 24h window has
 * passed, deletes its files from R2, then deletes its row from
 * Postgres. Called on a schedule (see index.js) — every 15 minutes by
 * default, meaning a video's real lifetime is "24h, plus up to 15
 * minutes" rather than exactly 24h00m. Tune the schedule in index.js if
 * tighter precision matters more than fewer DB queries.
 *
 * Each lesson is processed independently, on purpose: if R2 deletion
 * fails for one video, its Postgres row is deliberately left alone
 * too — it'll just get picked up and retried on the next run — rather
 * than deleting the DB row anyway and leaving an orphaned, invisible
 * R2 file that nothing will ever clean up again. R2 is deleted BEFORE
 * the DB row for the same reason, in that specific order.
 */
export async function runCleanup() {
  const expiredIds = await getExpiredLessonIds();

  if (expiredIds.length === 0) {
    logger.info("Cleanup: nothing expired");
    return;
  }

  logger.info("Cleanup: found expired lessons", { count: expiredIds.length });

  let succeeded = 0;
  let failed = 0;

  for (const id of expiredIds) {
    try {
      await deleteR2Prefix(`courses/${id}`);
      await deleteLessonRow(id);
      succeeded++;
    } catch (err) {
      // Logged individually inside deleteR2Prefix/deleteLessonRow
      // already — this catch just keeps one failed video from stopping
      // the rest of the batch from being processed.
      failed++;
      logger.error("Cleanup failed for lesson", { id, error: err.message });
    }
  }

  logger.info("Cleanup complete", { succeeded, failed });
}