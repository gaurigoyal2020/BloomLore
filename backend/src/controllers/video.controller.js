import { createJob, getJob } from "../services/job.service.js";
import { generateLessonId } from "../utils/file.utils.js";
import { logger } from "../utils/logger.js";

/**
 * POST /api/upload
 *
 * OLD behavior: this one handler did everything — ffmpeg, Deepgram,
 * translation, subtitle generation — and only sent a response once ALL
 * of that finished. A slow video meant a slow response, with real risk
 * of hitting a host's request timeout on longer videos.
 *
 * NEW behavior: this handler's only job is to accept the uploaded file,
 * hand it to the background job queue (job.service.js), and respond
 * immediately with a jobId. The actual video processing happens
 * separately, in the background. The frontend polls
 * GET /api/status/:jobId to find out when it's done.
 */
export const uploadVideo = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    // jobId is generated here, immediately, before any processing starts —
    // and it's the SAME id used as the lessonId once processing finishes.
    // One identifier for the whole lifetime of this upload.
    const jobId = generateLessonId();
    const targetLang = req.body.targetLang ?? "en";

    logger.info("Job queued", { jobId, userId: req.user.id, originalName: req.file.originalname });

    createJob({
      jobId,
      videoPath: req.file.path,
      targetLang,
      originalName: req.file.originalname,
      userId: req.user.id,
    });

    // 202 Accepted = "request understood, work is not finished yet" — the
    // more accurate HTTP status now that this endpoint no longer returns
    // a finished result (used to be 201 Created, since a finished
    // resource genuinely existed by the time it responded).
    return res.status(202).json({
      success: true,
      message: "Video queued for processing",
      data: { jobId },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/status/:jobId
 *
 * The frontend calls this repeatedly (polling) until status is
 * 'complete' or 'error'. `result` is only populated once processing has
 * actually finished — no partial/fake data gets sent early.
 */
export const getJobStatusHandler = (req, res) => {
  const job = getJob(req.params.jobId);

  // Same 404 for "doesn't exist" and "exists but isn't yours" — on
  // purpose. Returning a different error for "belongs to someone else"
  // would let an attacker confirm a jobId is real just by trying it,
  // even without ever seeing its contents.
  if (!job || job.userId !== req.user.id) {
    return res.status(404).json({ success: false, error: "Job not found" });
  }

  return res.status(200).json({
    success: true,
    data: {
      jobId: job.id,
      status: job.status, // 'queued' | 'processing' | 'complete' | 'error'
      stage: job.stage, // e.g. 'converting', 'transcribing', 'translating', 'building-subtitles', 'done'
      error: job.error,
      result: job.status === "complete" ? job.data : null,
    },
  });
};