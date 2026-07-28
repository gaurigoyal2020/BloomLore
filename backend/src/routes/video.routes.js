import express from "express";
import { upload } from "../config/multer.config.js";
import { uploadVideo, getJobStatusHandler } from "../controllers/video.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

// requireAuth runs BEFORE multer parses the file body — rejecting an
// unauthenticated request before we spend any time/bandwidth reading a
// potentially large upload is cheaper than checking auth afterward.
router.post("/upload", requireAuth, upload.single("file"), uploadVideo);

// Also protected — job status/results shouldn't be readable by anyone
// who happens to guess or intercept a jobId.
router.get("/status/:jobId", requireAuth, getJobStatusHandler);

export default router;