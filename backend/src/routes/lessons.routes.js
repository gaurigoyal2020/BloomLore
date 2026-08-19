import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { listLessons, getLesson, updateLesson } from "../controllers/lessons.controller.js";

const router = express.Router();

router.get("/", requireAuth, listLessons);
router.get("/:id", requireAuth, getLesson);
router.patch("/:id", requireAuth, updateLesson);

export default router;