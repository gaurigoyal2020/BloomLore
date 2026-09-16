import express from "express";
import helmet from "helmet";
import { getMediaFile } from "../controllers/media.controller.js";
import { pollLimiter } from "../config/rateLimit.config.js";

const router = express.Router();

// Helmet's app-wide default (set in app.config.js) sends
// `Cross-Origin-Resource-Policy: same-origin` on every response. That
// header is unrelated to the CORS setup in cors.config.js — CORS
// governs fetch()/XHR, but a browser's native <video src="...">/<track
// src="..."> load their resource in "no-cors" mode, which CORS never
// even applies to. CORP is the separate check THAT mode is subject to,
// and "same-origin" tells the browser "refuse to display this if the
// requesting page isn't on the exact same origin as this API."
//
// Since cors.config.js's origin allowlist only makes sense if the
// frontend runs on a different origin than this backend, that default
// would make every video/subtitle file 200 OK at the network level yet
// silently fail to render — the browser blocks it client-side after a
// successful response, which is a genuinely confusing thing to debug.
// Overriding it to "cross-origin" here doesn't loosen this route's
// actual security: these files were never gated by CORP, only by the
// signed ?token= (see media.controller.js) — CORP only ever affected
// whether a legitimate browser could DISPLAY an already-successful
// response, not who could fetch one.
router.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));

// No requireAuth here — deliberately. A browser's native <video>/<track>
// tags and an HLS player's internal playlist/segment requests can't
// attach an Authorization header, which is exactly the bug this whole
// change fixes. Authorization instead travels in the URL itself, as a
// signed `?token=` query param — see media.controller.js and
// utils/mediaToken.utils.js.
//
// pollLimiter is still applied, but note WHAT it keys by now changes:
// rateLimit.config.js's keyByUser falls back to IP when req.user isn't
// set (exactly this case, per its own comment), so this route is now
// rate-limited per IP rather than per user. Still a meaningful cap on
// runaway/scripted requests against this endpoint.
router.get("/:jobId/:filename", pollLimiter, getMediaFile);

export default router;