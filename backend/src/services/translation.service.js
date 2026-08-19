import axios from "axios";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.config.js";

const LANG_MAP = {
  en: "en", es: "es", fr: "fr", de: "de",
  hi: "hi", zh: "zh", ja: "ja", ko: "ko",
  pt: "pt", ru: "ru", ar: "ar", it: "it",
};

const normalizeLang = (lang) => LANG_MAP[lang] ?? lang;
const REQUEST_TIMEOUT = 12_000;

// ── Individual provider attempts ──────────────────────────────────────────────
// LibreTranslate.de and Lingva.ml used to live here too, but both are
// confirmed dead: LibreTranslate's public endpoint now requires a paid
// API key on every request (permanent 400, not flaky), and lingva.ml's
// instance has been down for a while (Cloudflare 523). MyMemory is the
// primary provider; DeepL is a fallback that only runs if MyMemory fails,
// since DeepL's free credit is a one-time, non-renewing budget (see
// translateText below for why the order matters here).

// MyMemory's free/anonymous tier caps each request at 500 characters.
// text.substring(0, 500) used to just silently cut everything after that
// off — for any transcript longer than ~500 chars (a few sentences),
// only the first slice ever got translated. Downstream,
// buildTranslatedChunks (subtitle.service.js) spreads THAT short
// translated string proportionally across every original timing chunk,
// so once the real translated words ran out, every later subtitle cue
// got an empty string — the video's subtitles cutting off partway
// through that the user reported.
//
// Fix: split the transcript into <=500-char pieces at sentence (then
// word) boundaries, translate each piece separately, and rejoin them in
// order. The combined string is still proportional to the full
// transcript, so buildTranslatedChunks' word-distribution logic (which
// we're not touching) covers the whole video again.
const MYMEMORY_MAX_CHARS = 500;

export function chunkTextForTranslation(text, maxChars = MYMEMORY_MAX_CHARS) {
  const chunks = [];
  let remaining = text.trim();

  while (remaining.length > maxChars) {
    // Prefer breaking at the end of a sentence within the limit — keeps
    // each request grammatically self-contained, which MyMemory
    // translates more reliably than a mid-sentence fragment.
    let breakAt = -1;
    for (const punct of [". ", "! ", "? "]) {
      const idx = remaining.lastIndexOf(punct, maxChars);
      if (idx > breakAt) breakAt = idx + punct.length - 1;
    }
    // No sentence boundary in range — fall back to the last word boundary.
    if (breakAt <= 0) breakAt = remaining.lastIndexOf(" ", maxChars);
    // No spaces either (one giant token) — hard cut as a last resort.
    if (breakAt <= 0) breakAt = maxChars - 1;

    chunks.push(remaining.slice(0, breakAt + 1).trim());
    remaining = remaining.slice(breakAt + 1).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

async function tryMyMemory(text, source, target) {
  const chunks = chunkTextForTranslation(text);
  const translatedChunks = [];

  // Sequential, not Promise.all — MyMemory's anonymous tier is rate
  // limited per IP, and a long transcript can mean a dozen+ chunks.
  // Firing them all at once risks tripping that limit; one at a time
  // costs a little wall-clock time but stays well under it.
  for (const chunk of chunks) {
    const response = await axios.get("https://api.mymemory.translated.net/get", {
      params: { q: chunk, langpair: `${source}|${target}` },
      timeout: REQUEST_TIMEOUT,
    });
    const result = response.data?.responseData?.translatedText;
    // MyMemory returns the original text when it fails — treat that as
    // a miss for the WHOLE transcript (not just this chunk), same as
    // before: a partial translation stitched together with untranslated
    // fragments is worse than falling through to the DeepL fallback.
    if (!result || result === chunk) return null;
    translatedChunks.push(result);
  }

  return translatedChunks.join(" ");
}

async function tryDeepL(text, source, target) {
  // No key configured — skip quietly rather than logging a "failure"
  // every time for people who haven't set this up.
  if (!env.deeplApiKey) return null;

  // DeepL wants uppercase language codes. When English is the TARGET
  // (not source), it specifically wants a region variant (EN-US/EN-GB)
  // rather than plain "EN" — source language doesn't need this.
  const target_lang = target === "en" ? "EN-US" : target.toUpperCase();
  const source_lang = source.toUpperCase();

  const response = await axios.post(
    "https://api-free.deepl.com/v2/translate", // note: api-free, not api — free keys only work on this host
    { text: [text], source_lang, target_lang },
    {
      headers: {
        Authorization: `DeepL-Auth-Key ${env.deeplApiKey}`,
        "Content-Type": "application/json",
      },
      timeout: REQUEST_TIMEOUT,
    }
  );

  return response.data?.translations?.[0]?.text ?? null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Translate text from sourceLang to targetLang.
 * Tries providers in order.
 *
 * Returns { text, status } rather than just a string — the caller (and
 * ultimately the frontend) needs to tell apart three different outcomes
 * that all used to look identical (translatedText === original text):
 *   - 'skipped'  — source and target languages are the same; nothing to do.
 *   - 'success'  — a provider actually translated the text.
 *   - 'failed'   — a translation genuinely SHOULD have happened but every
 *                  provider errored out or returned nothing usable, so we
 *                  fell back to the original text as a last resort.
 * Without this, 'failed' silently looked exactly like 'skipped' to every
 * downstream consumer, and the frontend had no way to tell a user "this
 * didn't actually get translated" instead of showing it as Completed.
 */
export const translateText = async (text, sourceLang, targetLang) => {
  const source = normalizeLang(sourceLang);
  const target = normalizeLang(targetLang);

  if (source === target || !text.trim()) {
    logger.debug("Translation skipped (same language or empty)");
    return { text, status: "skipped" };
  }

  // MyMemory first: free and resets on its own, so no reason to conserve it.
  // DeepL only runs if MyMemory fails — its 1M-character credit is a
  // ONE-TIME budget that never refills, so we don't want to spend it on
  // every request when MyMemory would have worked fine on its own.
  const providers = [
    { name: "MyMemory", fn: () => tryMyMemory(text, source, target) },
    { name: "DeepL",    fn: () => tryDeepL(text, source, target) },
  ];

  for (const { name, fn } of providers) {
    try {
      const result = await fn();
      if (result) {
        logger.info(`Translation successful via ${name}`, { source, target });
        return { text: result, status: "success" };
      }
    } catch (err) {
      logger.warn(`${name} translation failed`, { message: err.message });
    }
  }

  logger.warn("All translation providers failed — returning original text");
  return { text, status: "failed" };
};