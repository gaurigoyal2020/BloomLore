/**
 * Validates all required environment variables on startup.
 * Crashes early with a clear message rather than failing silently at runtime.
 */

const REQUIRED = [
  "DEEPGRAM_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_URL",
];

export function validateEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("❌  Missing required environment variables:");
    missing.forEach((key) => console.error(`   • ${key}`));
    console.error("\nCopy .env.example → .env and fill in the values.");
    process.exit(1);
  }

  console.log("✅  Environment variables validated");
}

export const env = {
  get port() { return parseInt(process.env.PORT ?? "8000", 10); },
  get nodeEnv() { return process.env.NODE_ENV ?? "development"; },
  get isDev() { return (process.env.NODE_ENV ?? "development") === "development"; },
  get allowedOrigins() {
    return (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:3000")
      .split(",").map((s) => s.trim());
  },
  get deepgramApiKey() { return process.env.DEEPGRAM_API_KEY ?? ""; },
  get deeplApiKey() { return process.env.DEEPL_API_KEY ?? ""; },
  get baseUrl() { return process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? "8000"}`; },
  get maxFileSizeMb() { return parseInt(process.env.MAX_FILE_SIZE_MB ?? "2000", 10); },
  // Your Supabase project URL, e.g. https://abcdefgh.supabase.co
  // Used to build the JWKS URL for verifying user access tokens — see
  // auth.middleware.js. This is NOT a secret (it's the same URL your
  // frontend uses), so it's fine to require it plainly like this.
  get supabaseUrl() { return process.env.SUPABASE_URL ?? ""; },
  // DANGER: this key bypasses Row Level Security entirely — it can read
  // or write ANY row for ANY user, not just the current request's user.
  // Unlike the frontend's publishable key, this must NEVER be sent to
  // the browser or committed to git. It only belongs here, server-side,
  // used exclusively for the backend's own trusted writes (inserting a
  // completed lesson row) where we've already independently verified
  // req.user.id ourselves via requireAuth before ever touching this key.
  get supabaseServiceRoleKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""; },

  // ── Cloudflare R2 (video/subtitle storage) ──
  // R2_ENDPOINT: the "S3 API" URL shown on your bucket's Settings page,
  // e.g. https://<account-id>.r2.cloudflarestorage.com
  get r2Endpoint() { return process.env.R2_ENDPOINT ?? ""; },
  get r2AccessKeyId() { return process.env.R2_ACCESS_KEY_ID ?? ""; },
  get r2SecretAccessKey() { return process.env.R2_SECRET_ACCESS_KEY ?? ""; },
  get r2BucketName() { return process.env.R2_BUCKET_NAME ?? ""; },
  // The public r2.dev URL (or your own custom domain later) — this is
  // what actually gets embedded in videoUrl/subtitleUrl in API responses,
  // NOT the S3 endpoint above (that's for authenticated read/write only).
  get r2PublicUrl() { return process.env.R2_PUBLIC_URL ?? ""; },
};