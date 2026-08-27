import express from "express";
import { upload } from "../config/multer.config.js";
import { uploadVideo, getJobStatusHandler } from "../controllers/video.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { uploadLimiter, pollLimiter } from "../config/rate-limit.config.js";

const router = express.Router();

// Order matters: requireAuth first (cheap JWT check, rejects unauthed
// requests before we do anything else) → uploadLimiter (rejects
// over-quota users before we spend time/bandwidth parsing a potentially
// huge multipart body) → multer (the expensive part) → handler.
router.post("/upload", requireAuth, uploadLimiter, upload.single("file"), uploadVideo);

// Also protected — job status/results shouldn't be readable by anyone
// who happens to guess or intercept a jobId. pollLimiter bounds runaway
// polling without affecting normal frontend polling intervals.
router.get("/status/:jobId", requireAuth, pollLimiter, getJobStatusHandler);

export default router;