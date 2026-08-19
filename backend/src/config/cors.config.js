import cors from "cors";
import { env } from "./env.config.js";

export const corsConfig = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);

    if (env.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error(`CORS: origin '${origin}' is not allowed`));
  },
  credentials: true,
  // PATCH added for PATCH /api/lessons/:id (subtitle edits) — every other
  // route in this app used GET/POST, so PATCH was never in this list
  // before and the browser's CORS preflight check rejected it outright.
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});