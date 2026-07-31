import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.config.js";
import { logger } from "../utils/logger.js";

/**
 * A separate Supabase client from the one the frontend uses — this one
 * is built with the SERVICE ROLE key, which trusts the backend
 * completely and skips Row Level Security. That's intentional and safe
 * here specifically because we only ever call insertLesson() with a
 * user_id we already verified ourselves (via requireAuth, using the
 * user's own JWT) earlier in the same request/job — we're not trusting
 * anything from outside when we use this elevated access.
 */
const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);

/**
 * Returns the ids of every lesson whose 24h window has passed. Just ids
 * — the cleanup job only needs enough to know which R2 prefix to wipe
 * and which row to remove, not the full transcript/subtitle data.
 */
export async function getExpiredLessonIds() {
  const { data, error } = await supabaseAdmin
    .from("lessons")
    .select("id")
    .lt("expires_at", new Date().toISOString());

  if (error) {
    logger.error("Failed to fetch expired lessons", { error: error.message });
    return [];
  }
  return data.map((row) => row.id);
}

/** Deletes one lesson row by id. */
export async function deleteLessonRow(id) {
  const { error } = await supabaseAdmin.from("lessons").delete().eq("id", id);
  if (error) {
    logger.error("Failed to delete lesson row", { id, error: error.message });
    throw error; // Let the caller decide whether to still count this as cleaned up.
  }
}
/**
 * Writes one row to the lessons table once a job finishes successfully.
 * This is the durable record upload history will be built on top of —
 * separate from the in-memory job queue's ephemeral 'processing' state,
 * which is thrown away once a job completes either way.
 */
export async function insertLesson({
  jobId,
  userId,
  videoUrl,
  subtitleUrl,
  translatedSubtitleUrl,
  transcript,
  translatedText,
  subtitles,
  translatedSubtitles,
  originalFilename,
  originalLang,
  targetLang,
  wordCount,
}) {
  const { error } = await supabaseAdmin.from("lessons").insert({
    id: jobId,
    user_id: userId,
    video_url: videoUrl,
    subtitle_url: subtitleUrl,
    translated_subtitle_url: translatedSubtitleUrl,
    transcript,
    translated_text: translatedText,
    subtitles,
    translated_subtitles: translatedSubtitles,
    original_filename: originalFilename,
    original_lang: originalLang,
    target_lang: targetLang,
    word_count: wordCount,
  });

  if (error) {
    // Deliberately NOT thrown — see the comment where this is called
    // from job.service.js for why a DB write failure shouldn't fail an
    // otherwise-successful job.
    logger.error("Failed to write lesson record", { jobId, error: error.message });
  }
}