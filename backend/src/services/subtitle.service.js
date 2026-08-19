import path from "path";
import { formatTime } from "../utils/time.utils.js";
import { writeFile } from "../utils/file.utils.js";

const MAX_WORDS_PER_CHUNK = 8;

export function groupWordsIntoChunks(words) {
  const chunks = [];
  let current = { words: [], start: null, end: null };

  words.forEach((word, index) => {
    if (current.start === null) current.start = word.start;

    current.words.push(word.word);
    current.end = word.end;

    const endsWithPunctuation =
      word.word.includes(".") || word.word.includes("!") || word.word.includes("?");
    const isFull = current.words.length >= MAX_WORDS_PER_CHUNK;
    const isLast = index === words.length - 1;

    if (endsWithPunctuation || isFull || isLast) {
      chunks.push({ ...current });
      current = { words: [], start: null, end: null };
    }
  });

  return chunks;
}

// Translation has no timing of its own — MyMemory/DeepL just return text,
// with no idea when each word was spoken. So translated subtitle timing is
// an APPROXIMATION: we take the real timing chunks from the original
// (Deepgram-timed) words, and spread the translated text proportionally
// across those same time slots. This is the one place that logic lives —
// both the .vtt file and the API response for the frontend table use it,
// so they can never disagree with each other.
export function buildTranslatedChunks(chunks, translatedText) {
  const translatedWords = translatedText.split(" ");
  const wordsPerChunk = Math.ceil(translatedWords.length / chunks.length);

  return chunks.map((chunk, i) => {
    const start = i * wordsPerChunk;
    const end = Math.min(start + wordsPerChunk, translatedWords.length);
    return {
      start: chunk.start,
      end: chunk.end,
      text: translatedWords.slice(start, end).join(" "),
    };
  });
}

function buildVTT(chunks, textsFn) {
  let vtt = "WEBVTT\n\n";
  chunks.forEach((chunk, i) => {
    vtt += `${i + 1}\n`;
    vtt += `${formatTime(chunk.start)} --> ${formatTime(chunk.end)}\n`;
    vtt += `${textsFn(chunk, i)}\n\n`;
  });
  return vtt;
}

export const generateWebVTT = (words, outputPath, translatedText = null) => {
  if (!words?.length) return null;

  const chunks = groupWordsIntoChunks(words);

  // Original subtitles
  const originalVtt = buildVTT(chunks, (chunk) => chunk.words.join(" "));
  const vttPath = path.join(outputPath, "subtitles.vtt");
  writeFile(vttPath, originalVtt);

  if (!translatedText) return { original: vttPath };

  // Translated subtitles — same distribution logic used for the API response
  const translatedChunks = buildTranslatedChunks(chunks, translatedText);
  const translatedVtt = buildVTT(chunks, (_chunk, i) => translatedChunks[i].text);

  const translatedVttPath = path.join(outputPath, "subtitles-translated.vtt");
  writeFile(translatedVttPath, translatedVtt);

  return { original: vttPath, translated: translatedVttPath };
};

/**
 * Builds WebVTT text directly from an array of already-formed
 * { start, end, text } cues, rather than from Deepgram's raw word-level
 * timing (that's what generateWebVTT/groupWordsIntoChunks are for). Used
 * when a user EDITS subtitle text via ResultsPage: the timing already
 * exists and isn't changing, only the text per cue is. Reuses the same
 * buildVTT formatter so an edited file comes out byte-for-byte the same
 * style as a freshly-generated one.
 */
export function cuesToVTT(cues) {
  return buildVTT(cues, (cue) => cue.text);
}