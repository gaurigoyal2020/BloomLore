import { getLessonsForUser, getLessonById, updateLessonSubtitleCues } from "../services/db.service.js";
import { cuesToVTT } from "../services/subtitle.service.js";
import { uploadFileToR2 } from "../services/storage.service.js";
import { logger } from "../utils/logger.js";

/** Every subtitle array must match this shape: [{ start, end, text }, ...] */
function isValidCueArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (cue) =>
        cue &&
        typeof cue.start === "number" &&
        typeof cue.end === "number" &&
        typeof cue.text === "string"
    )
  );
}

/**
 * Shapes a raw Supabase lesson row into the API response shape ResultsPage
 * expects — the SAME shape the live job-status endpoint returns (see
 * job.service.js's job.data). Pulled into one function so getLesson and
 * updateLesson can't independently drift out of sync with each other, or
 * with job.service.js, the way job.data and this endpoint's response
 * previously did (job.data was missing originalFilename for a while).
 */
function shapeLesson(lesson) {
  return {
    lessonId: lesson.id,
    videoUrl: lesson.video_url,
    subtitleUrl: lesson.subtitle_url,
    translatedSubtitleUrl: lesson.translated_subtitle_url,
    transcript: lesson.transcript,
    translatedText: lesson.translated_text,
    originalFilename: lesson.original_filename,
    fileSize: lesson.file_size,
    originalLang: lesson.original_lang,
    targetLang: lesson.target_lang,
    wordCount: lesson.word_count,
    subtitles: lesson.subtitles,
    translatedSubtitles: lesson.translated_subtitles,
  };
}

/** GET /api/lessons — the current user's upload history, newest first. */
export const listLessons = async (req, res) => {
  const start = Date.now();
  const lessons = await getLessonsForUser(req.user.id);
  // Isolates the DB round-trip specifically — combined with the JWT
  // verify timing in auth.middleware.js, this is enough to tell whether
  // a slow dashboard load is the Supabase query, the auth check, or
  // neither (i.e. genuinely just the two sequential network hops
  // themselves, browser→backend→Supabase, on a slow connection).
  logger.debug("[timing] listLessons query", {
    ms: Date.now() - start,
    userId: req.user.id,
    count: lessons.length,
  });
  res.status(200).json({ success: true, data: { lessons } });
};

/**
 * GET /api/lessons/:id — one full past lesson, shaped exactly like the
 * job-status endpoint's `result` object so ResultsPage can render it
 * without needing to know whether it came from a live job or history.
 */
export const getLesson = async (req, res) => {
  const lesson = await getLessonById(req.params.id, req.user.id);

  // Same 404-for-both reasoning as job status: "doesn't exist" and
  // "exists but isn't yours" look identical to the caller on purpose.
  if (!lesson) {
    return res.status(404).json({ success: false, error: "Lesson not found" });
  }

  res.status(200).json({ success: true, data: shapeLesson(lesson) });
};

/**
 * PATCH /api/lessons/:id — lets a user edit subtitle TEXT (timing stays
 * as originally transcribed) for a lesson they own. Regenerates and
 * re-uploads the corresponding .vtt file(s) to R2 — the video player's
 * caption track and any subtitle download both read straight from those
 * files, so persisting only to Postgres and leaving the R2 files stale
 * would mean an "edit" that never actually shows up anywhere real.
 * Persists the same cues to Postgres too, so the edit survives a future
 * GET /api/lessons/:id fetch, not just the one player session.
 */
export const updateLesson = async (req, res, next) => {
  try {
    const { subtitles, translatedSubtitles } = req.body ?? {};

    if (subtitles === undefined && translatedSubtitles === undefined) {
      return res.status(400).json({
        success: false,
        error: "Nothing to update — provide subtitles and/or translatedSubtitles",
      });
    }
    if (subtitles !== undefined && !isValidCueArray(subtitles)) {
      return res.status(400).json({
        success: false,
        error: "subtitles must be a non-empty array of { start, end, text }",
      });
    }
    if (translatedSubtitles !== undefined && !isValidCueArray(translatedSubtitles)) {
      return res.status(400).json({
        success: false,
        error: "translatedSubtitles must be a non-empty array of { start, end, text }",
      });
    }

    // Fetch first: confirms ownership before we do any R2 writes, and
    // lets us check whether a translated track actually exists to edit.
    const existing = await getLessonById(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Lesson not found" });
    }

    // Can't edit a translated track that was never generated in the
    // first place — same-language uploads and failed translations both
    // have translated_subtitle_url === null, so there's no
    // subtitles-translated.vtt on R2 to overwrite.
    if (translatedSubtitles !== undefined && !existing.translated_subtitle_url) {
      return res.status(400).json({
        success: false,
        error: "This lesson has no translated subtitles to edit",
      });
    }

    // Same key prefix uploadDirectoryToR2 originally used for this job
    // (courses/{jobId}/...) — jobId and lessonId are the same identifier
    // for the lifetime of a lesson (see job.service.js), so this is
    // reconstructible directly from the id rather than needing to parse
    // it back out of videoUrl.
    const prefix = `courses/${existing.id}`;

    if (subtitles !== undefined) {
      await uploadFileToR2(`${prefix}/subtitles.vtt`, cuesToVTT(subtitles), "text/vtt");
    }
    if (translatedSubtitles !== undefined) {
      await uploadFileToR2(`${prefix}/subtitles-translated.vtt`, cuesToVTT(translatedSubtitles), "text/vtt");
    }

    const updated = await updateLessonSubtitleCues(req.params.id, req.user.id, {
      subtitles,
      translatedSubtitles,
    });

    // Extremely unlikely (existing was just fetched with the same
    // ownership check moments ago) but not impossible under a race — bail
    // out clearly rather than sending back a shaped response for `null`.
    if (!updated) {
      return res.status(404).json({ success: false, error: "Lesson not found" });
    }

    logger.info("Lesson subtitles updated", {
      lessonId: updated.id,
      updatedOriginal: subtitles !== undefined,
      updatedTranslated: translatedSubtitles !== undefined,
    });

    res.status(200).json({ success: true, data: shapeLesson(updated) });
  } catch (err) {
    next(err);
  }
};