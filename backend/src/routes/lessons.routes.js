import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { listLessons, getLesson, updateLesson } from "../controllers/lessons.controller.js";
import { apiLimiter } from "../config/rateLimit.config.js";

const router = express.Router();

router.get("/", requireAuth, apiLimiter, listLessons);
router.get("/:id", requireAuth, apiLimiter, getLesson);
router.patch("/:id", requireAuth, apiLimiter, updateLesson);

export default router;