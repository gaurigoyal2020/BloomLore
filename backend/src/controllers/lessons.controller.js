import { getLessonsForUser, getLessonById } from "../services/db.service.js";

/** GET /api/lessons — the current user's upload history, newest first. */
export const listLessons = async (req, res) => {
  const lessons = await getLessonsForUser(req.user.id);
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

  res.status(200).json({
    success: true,
    data: {
      lessonId: lesson.id,
      videoUrl: lesson.video_url,
      subtitleUrl: lesson.subtitle_url,
      translatedSubtitleUrl: lesson.translated_subtitle_url,
      transcript: lesson.transcript,
      translatedText: lesson.translated_text,
      originalFilename: lesson.original_filename,
      originalLang: lesson.original_lang,
      targetLang: lesson.target_lang,
      wordCount: lesson.word_count,
      subtitles: lesson.subtitles,
      translatedSubtitles: lesson.translated_subtitles,
    },
  });
};