import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env.config.js";
import { logger } from "../utils/logger.js";

/**
 * WHY THIS EXISTS
 * Before this middleware, /api/upload had zero abuse protection — anyone
 * who found the URL could hit it repeatedly with no account, no rate
 * limit, nothing, and burn straight through the Deepgram credit. This
 * makes every protected route require a real, currently-logged-in user.
 *
 * HOW SUPABASE TOKENS GET VERIFIED
 * When someone logs in on the frontend via supabase.auth.signInWithPassword(),
 * Supabase's own servers hand back a signed JWT ("access token"). Our job
 * here is NOT to create that token — Supabase already did that — our job
 * is just to check it's genuine before trusting it.
 *
 * We deliberately do NOT use the older "shared secret" verification
 * method (a single password-like string both sides know). Supabase's own
 * docs now recommend against it: a leaked shared secret lets an attacker
 * forge valid-looking tokens for ANY user. Instead we verify against
 * Supabase's public signing keys (JWKS = "JSON Web Key Set") — these are
 * public by design, safe to fetch openly, and can only be used to check
 * signatures, never to create fake ones. `jose`'s createRemoteJWKSet
 * fetches and caches those public keys automatically, including handling
 * key rotation without any code changes on our side.
 */
// Built lazily (on first actual request) rather than immediately when
// this file is imported. Reason: ANY module-level code in an imported
// file runs before the importing file's own code does — including
// index.js's validateEnv() check. Building this eagerly meant a missing
// SUPABASE_URL would crash with a cryptic node:internal/url error before
// validateEnv() ever got a chance to give a clear "you're missing
// SUPABASE_URL" message. Lazy construction means this only ever runs
// after the whole app has already started successfully.
let jwks = null;
function getJWKS() {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${env.supabaseUrl}/auth/v1/.well-known/jwks.json`)
    );
  }
  return jwks;
}

/**
 * Express middleware — put this in front of any route that should only
 * be reachable by a logged-in user. On success, attaches `req.user`
 * (currently just { id, email }) so downstream handlers know who's
 * making the request. On failure, responds 401 and never calls next(),
 * so the route handler after it never runs.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: "Missing or invalid Authorization header" });
  }

  try {
    const verifyStart = Date.now();
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: `${env.supabaseUrl}/auth/v1`,
      audience: "authenticated", // Supabase sets this for logged-in users
    });
    // Cheap to log always (not just on slow requests) — this call is
    // either near-instant (JWKS already cached) or a real network round
    // trip to Supabase (first request after server start, or after the
    // cache's TTL expires). Having both numbers in the logs is what lets
    // "dashboard is slow" actually get diagnosed instead of guessed at.
    logger.debug("[timing] JWT verify", {
      ms: Date.now() - verifyStart,
    });

    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    // Covers: expired token, tampered signature, wrong project, etc.
    // We don't distinguish these to the client — "your token isn't
    // valid, log in again" is all the frontend needs to know.
    logger.warn("Auth token rejected", { reason: err.message });
    return res.status(401).json({ success: false, error: "Invalid or expired session" });
  }
}