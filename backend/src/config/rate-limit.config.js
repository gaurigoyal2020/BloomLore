import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// Every route that uses these limiters already has requireAuth in front
// of it, so req.user.id is set by the time this middleware runs. Keying
// by user id (not IP) means one abusive account gets throttled without
// punishing everyone else behind the same IP (offices, mobile carriers,
// and university networks all commonly NAT many real users onto one
// public IP). Falls back to IP only as a safety net, in case a limiter
// is ever reused ahead of requireAuth by mistake — ipKeyGenerator (not
// the raw req.ip string) is required here because a single IPv6 client
// can present a different address per request within the same /64
// block; without normalizing to the block, that's a free way to dodge
// the limit entirely.
const keyByUser = (req) => req.user?.id ?? ipKeyGenerator(req.ip);

/**
 * POST /api/upload is the single most expensive endpoint in this app —
 * every request that gets through costs real money and CPU: ffmpeg
 * encoding, a Deepgram transcription call, a translation API call, R2
 * storage. Without a cap here, one account (or one leaked/shared token)
 * can run up the Deepgram bill indefinitely. It also creates a
 * denial-of-service angle unique to this app's architecture: jobs run
 * strictly ONE AT A TIME (see job.service.js's single-worker queue), so
 * one user flooding this endpoint doesn't just cost money — it puts
 * every OTHER user's upload behind theirs in line.
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 uploads/hour/user — generous for real use, bounded for abuse
  keyGenerator: keyByUser,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many uploads. Please wait before uploading again." },
});

/**
 * GET /api/status/:jobId is polled repeatedly by the frontend while a
 * job runs, so this has to stay generous — this is not meant to catch
 * normal polling, only a runaway loop (buggy client code, or a script
 * hammering the endpoint directly).
 */
export const pollLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // ~2 req/sec sustained — comfortably above real polling intervals
  keyGenerator: keyByUser,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please slow down." },
});

/**
 * General-purpose limiter for the lessons endpoints (history list,
 * single-lesson fetch, subtitle edits). Hit far less often than status
 * polling, but still worth bounding rather than leaving unlimited.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: keyByUser,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please slow down." },
});