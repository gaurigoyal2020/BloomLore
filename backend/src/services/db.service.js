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
 * Returns a user's lesson history, newest first — summary fields only
 * (no transcript/subtitle arrays, which can be large and aren't needed
 * for a list view). Ownership is enforced here directly: only rows
 * matching this exact user_id are ever returned, same "don't trust the
 * caller, filter explicitly" pattern already used for job-status lookups.
 */
export async function getLessonsForUser(userId) {
  const { data, error } = await supabaseAdmin
    .from("lessons")
    .select("id, original_filename, original_lang, target_lang, word_count, created_at, expires_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Failed to fetch lessons", { userId, error: error.message });
    return [];
  }
  return data;
}

/**
 * Returns one full lesson (everything ResultsPage needs to render it)
 * — but ONLY if it belongs to the requesting user. Returns null both
 * when the id doesn't exist AND when it belongs to someone else, same
 * "don't leak whether it exists" reasoning as job-status lookups.
 */
export async function getLessonById(id, userId) {
  const { data, error } = await supabaseAdmin
    .from("lessons")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logger.error("Failed to fetch lesson", { id, error: error.message });
    return null;
  }
  return data;
}

/**
 * Updates the subtitle-cue column(s) on a lesson the user owns — used by
 * PATCH /api/lessons/:id when a user edits subtitle text. Only touches
 * whichever of `subtitles`/`translatedSubtitles` was actually passed, so a
 * request that only edits one track doesn't clobber the other. Same
 * "filter by user_id, don't trust the caller" ownership check as every
 * other lesson query — a request for a lesson that exists but belongs to
 * someone else updates zero rows and returns null, same as a lesson that
 * doesn't exist at all.
 */
export async function updateLessonSubtitleCues(id, userId, { subtitles, translatedSubtitles }) {
  const patch = {};
  if (subtitles !== undefined) patch.subtitles = subtitles;
  if (translatedSubtitles !== undefined) patch.translated_subtitles = translatedSubtitles;

  const { data, error } = await supabaseAdmin
    .from("lessons")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (error) {
    logger.error("Failed to update lesson subtitles", { id, error: error.message });
    throw error;
  }
  return data;
}

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
  fileSize,
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
    file_size: fileSize, // bytes — this is req.file.size from multer,
    // captured at upload time in video.controller.js since it's never
    // otherwise recoverable afterward (not derivable from anything
    // stored on R2 or elsewhere).
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