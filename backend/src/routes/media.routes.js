import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { getMediaFile } from "../controllers/media.controller.js";
import { pollLimiter } from "../config/rate-limit.config.js";

const router = express.Router();

// pollLimiter (120/min/user) reused here rather than a new limiter — an
// HLS player fetching a playlist plus ~a dozen segments well within a
// minute is normal use, and this bounds the same "someone scripting
// requests against this endpoint" case that limiter already exists for.
router.get("/:jobId/:filename", requireAuth, pollLimiter, getMediaFile);

export default router;