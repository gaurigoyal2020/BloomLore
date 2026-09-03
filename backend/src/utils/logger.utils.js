import { env } from "../config/env.config.js";

const timestamp = () => new Date().toISOString();

export const logger = {
  info: (msg, meta = {}) => {
    const hasMeta = Object.keys(meta).length > 0;
    console.log(`[${timestamp()}] INFO  ${msg}${hasMeta ? " " + JSON.stringify(meta) : ""}`);
  },

  warn: (msg, meta = {}) => {
    const hasMeta = Object.keys(meta).length > 0;
    console.warn(`[${timestamp()}] WARN  ${msg}${hasMeta ? " " + JSON.stringify(meta) : ""}`);
  },

  error: (msg, err, meta = {}) => {
    const hasMeta = Object.keys(meta).length > 0;
    console.error(
      `[${timestamp()}] ERROR ${msg}${hasMeta ? " " + JSON.stringify(meta) : ""}`,
      err ?? ""
    );
  },

  debug: (msg, meta = {}) => {
    if (!env.isDev) return;
    const hasMeta = Object.keys(meta).length > 0;
    console.debug(`[${timestamp()}] DEBUG ${msg}${hasMeta ? " " + JSON.stringify(meta) : ""}`);
  },
};
