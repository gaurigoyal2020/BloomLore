import express from "express";
import helmet from "helmet";

export const setupMiddlewares = (app) => {
  // Helmet sets a batch of security-related HTTP response headers that
  // Express does not send by default — HSTS (force HTTPS on repeat
  // visits), X-Content-Type-Options: nosniff (stops the browser from
  // "helpfully" reinterpreting a response as a different content type
  // than what Content-Type declares), X-Frame-Options / frame-ancestors
  // (stops this API's responses from being embedded in an <iframe> on
  // another site, i.e. clickjacking), and a conservative default
  // Content-Security-Policy. This app is a JSON API, not an HTML-serving
  // site, so CSP has little to defend here directly — but it's zero-cost
  // baseline hardening and these headers do nothing to prevent the RCE
  // or IDOR classes of bugs. Runs first, before body parsing, so every
  // response — including error responses — carries these headers.
  app.use(helmet());

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  //app.use("/uploads", express.static("uploads"));
  // NOTE: "./uploads" is intentionally NOT served over HTTP. It is
  // transient local scratch space that ffmpeg/job.service.js write to
  // and clean up — original videos, audio.mp3, and in-progress HLS
  // segments/subtitles all live here before (or instead of) being
  // uploaded to R2. Serving it via express.static() would make every
  // file in it world-readable with zero authentication or ownership
  // checks, bypassing requireAuth entirely. Finished assets are served
  // exclusively from R2 (see storage.service.js / R2_PUBLIC_URL).
};