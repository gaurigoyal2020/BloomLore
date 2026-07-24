import express from "express";
import { upload } from "../config/multer.config.js";
import { uploadVideo, getJobStatusHandler } from "../controllers/video.controller.js";

const router = express.Router();

// POST /api/upload — accepts a file, queues it, returns a jobId right away
router.post("/upload", upload.single("file"), uploadVideo);

// GET /api/status/:jobId — poll this to track real processing progress
router.get("/status/:jobId", getJobStatusHandler);

export default router;