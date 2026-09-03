import crypto from "crypto";
import { env } from "../config/env.config.js";

/**
 * WHY THIS FILE EXISTS
 *
 * Every other protected route in this app uses `requireAuth`
 * (auth.middleware.js), which reads a `Bearer <jwt>` from the
 * Authorization header. That works great when OUR OWN frontend code
 * makes the request with `fetch()` or `axios`, because we control the
 * request and can attach that header ourselves.
 *
 * It does NOT work for a browser's native <video>, <track>, or an HLS
 * player's internal playlist/segment requests — those are issued by the
 * browser itself, and browsers give you no way to attach a custom header
 * to them. So `requireAuth` in front of /api/media/... just meant every
 * real playback request got rejected with 401, even from the video's
 * rightful owner.
 *
 * THE FIX: a "capability token" in the URL itself
 *
 * Instead of asking "who is making this request?" (needs a header), we
 * ask a narrower question that a URL alone CAN answer: "did WE
 * ourselves generate a token for THIS EXACT jobId, recently?" That's
 * exactly what an HMAC signature gives us — this is the same trick
 * video platforms like Mux / Cloudflare Stream / S3 presigned URLs use.
 *
 * A token here is: base64url(`${jobId}.${expiresAt}`) + "." + signature
 *   - jobId/expiresAt are NOT secret — anyone can decode and read them.
 *   - What makes the token trustworthy is the signature: it's an
 *     HMAC-SHA256 of that payload, keyed with MEDIA_TOKEN_SECRET, a
 *     value ONLY this backend knows. Nobody can compute a valid
 *     signature for a jobId/expiresAt pair they invent themselves,
 *     because they don't have the secret — they can only ever replay a
 *     signature WE already generated, for the exact payload we signed.
 *   - expiresAt bounds how long a leaked/logged/cached URL stays useful
 *     (see env.config.js's mediaTokenTtlMinutes).
 *
 * This intentionally does NOT re-check "does this jobId belong to this
 * user?" at verify time — there's no user identity in a token at all.
 * That check already happened once, at the moment we minted the token
 * (see job.service.js / lessons.controller.js, both of which only ever
 * call signMediaToken() after their own existing ownership check has
 * already passed). The token is proof that check happened, not a
 * replacement for it.
 */

/** HMAC-SHA256 of `payload`, keyed with our server-only secret. */
function sign(payload) {
  return crypto.createHmac("sha256", env.mediaTokenSecret).update(payload).digest("base64url");
}

/**
 * Mints a token authorizing access to ONE specific jobId's media files,
 * valid for `mediaTokenTtlMinutes` from right now.
 */
export function signMediaToken(jobId) {
  const expiresAt = Date.now() + env.mediaTokenTtlMinutes * 60 * 1000;
  const payload = `${jobId}.${expiresAt}`;
  const signature = sign(payload);
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${signature}`;
}

/**
 * Checks that `token` is: well-formed, signed by us (not forged or
 * tampered with), not expired, AND minted for THIS `jobId` specifically
 * — a valid token for job A must never work on job B's files, even
 * though both are equally "genuine" tokens we once issued.
 */
export function verifyMediaToken(token, jobId) {
  if (!token || typeof token !== "string") return false;

  const dot = token.lastIndexOf(".");
  if (dot === -1) return false;
  const encodedPayload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  let payload;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    return false;
  }

  // Recompute what the signature SHOULD be for this payload, then
  // compare using a constant-time comparison. A normal `===` comparison
  // returns as soon as it finds the first mismatched byte, which means
  // comparing an attacker-supplied signature against the real one takes
  // slightly longer the more leading bytes they happen to guess right —
  // in theory, that timing difference can be measured over many
  // attempts to guess a signature one byte at a time. timingSafeEqual
  // always takes the same amount of time regardless of where (or
  // whether) the mismatch is, so there's nothing to measure.
  const expectedSignature = sign(payload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return false;
  }

  // Payload was never encrypted, only signed — signature check above is
  // what stops someone from editing this part and having it still verify.
  const payloadDot = payload.lastIndexOf(".");
  if (payloadDot === -1) return false;
  const tokenJobId = payload.slice(0, payloadDot);
  const expiresAt = Number(payload.slice(payloadDot + 1));

  if (tokenJobId !== jobId) return false;
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  return true;
}