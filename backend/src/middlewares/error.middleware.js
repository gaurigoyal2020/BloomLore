import multer from "multer";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.config.js";

export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = "AppError";
  }
}

/**
 * 404 handler — mount BEFORE errorHandler
 */
export const notFoundHandler = (_req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
};

/**
 * Global error handler — must be last middleware
 */
export const errorHandler = (err, req, res, _next) => {
  // Multer errors (file size, wrong type)
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `File too large. Maximum size is ${env.maxFileSizeMb}MB`
        : err.message;

    return res.status(400).json({ success: false, error: message });
  }

  // File type validation error from our fileFilter
  if (err.message?.startsWith("Invalid file type")) {
    return res.status(400).json({ success: false, error: err.message });
  }

  // CORS errors
  if (err.message?.startsWith("CORS")) {
    return res.status(403).json({ success: false, error: err.message });
  }

  // Known AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ success: false, error: err.message });
  }

  // Unknown / unexpected
  logger.error("Unhandled error", err, { path: req.path, method: req.method });

  res.status(500).json({
    success: false,
    error: "Internal server error",
    ...(env.isDev && { detail: err.message, stack: err.stack }),
  });
};