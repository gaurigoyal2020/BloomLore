/**
 * Validates all required environment variables on startup.
 * Crashes early with a clear message rather than failing silently at runtime.
 */

const REQUIRED = ["DEEPGRAM_API_KEY", "SUPABASE_URL"];

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
};