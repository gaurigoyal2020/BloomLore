import axios from "axios";
import { createReadStream } from "fs";
import { env } from "../config/env.config.js";

export const transcribeAudio = async (audioPath) => {
  try {
    const response = await axios.post(
      "https://api.deepgram.com/v1/listen",
      // A readable stream instead of a fully-loaded Buffer. axios/Node
      // pipe this to Deepgram in small chunks (using chunked transfer
      // encoding, since there's no upfront Content-Length to give) —
      // the whole audio file is never held in memory at once. This
      // mirrors what Deepgram's own SDK does internally for file
      // transcription: it accepts fs.createReadStream() the same way.
      createReadStream(audioPath),
      {
        headers: {
          Authorization: `Token ${env.deepgramApiKey}`,
          "Content-Type": "audio/mp3",
        },
        params: {
          smart_format: true,
          punctuate: true,
          detect_language: true,
          diarize: false,
          utterances: true,
        },
        timeout: 10 * 60 * 1000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    const channel = response.data?.results?.channels?.[0];
    const alt = channel?.alternatives?.[0];
    if (!alt) throw new Error("Deepgram returned no transcription results");

    return {
      transcript: alt.transcript ?? "",
      words: alt.words ?? [],
      detectedLang: channel?.detected_language ?? "en",
    };
  } catch (err) {
    if (err.response?.status === 401)
      throw new Error("Deepgram authentication failed. Check your DEEPGRAM_API_KEY.");
    throw new Error(`Transcription failed: ${err.message}`);
  }
};