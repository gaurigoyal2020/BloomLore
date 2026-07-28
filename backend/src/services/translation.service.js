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

async function tryMyMemory(text, source, target) {
  const response = await axios.get("https://api.mymemory.translated.net/get", {
    params: { q: text.substring(0, 500), langpair: `${source}|${target}` },
    timeout: REQUEST_TIMEOUT,
  });
  const result = response.data?.responseData?.translatedText;
  // MyMemory returns the original text when it fails — treat that as a miss
  if (!result || result === text) return null;
  return result;
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
 * Tries providers in order, returns original text if all fail.
 */
export const translateText = async (text, sourceLang, targetLang) => {
  const source = normalizeLang(sourceLang);
  const target = normalizeLang(targetLang);

  if (source === target || !text.trim()) {
    logger.debug("Translation skipped (same language or empty)");
    return text;
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
        return result;
      }
    } catch (err) {
      logger.warn(`${name} translation failed`, { message: err.message });
    }
  }

  logger.warn("All translation providers failed — returning original text");
  return text;
};