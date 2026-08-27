import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { env } from "./env.config.js";

const ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",   // .mov
  "video/x-msvideo",  // .avi
  "video/x-matroska", // .mkv
  "video/webm",
  "video/mpeg",
];

// Maps each allowed MIME type to the ONE extension we'll ever write to
// disk for it. Previously the stored extension came from
// `path.extname(file.originalname)` — a string the client fully
// controls and that has nothing to do with the file's actual content.
// It no longer determines shell behavior (ffmpeg.service.js now uses
// execFile with an argv array), but there's still no reason to let an
// arbitrary attacker-chosen string become part of a server-side
// filesystem path when a small, known, safe set of extensions is all
// this app will ever need. This is defense in depth, not the primary
// fix for any one bug.
const MIME_TO_EXTENSION = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/x-msvideo": ".avi",
  "video/x-matroska": ".mkv",
  "video/webm": ".webm",
  "video/mpeg": ".mpeg",
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, "./uploads");
  },
  filename: (_req, file, cb) => {
    // Falls back to ".bin" only in the (should-be-impossible) case this
    // ever runs for a mimetype fileFilter didn't already reject — never
    // trust file.originalname's extension for this.
    const ext = MIME_TO_EXTENSION[file.mimetype] ?? ".bin";
    const safeName = file.fieldname + "-" + uuidv4() + ext;
    cb(null, safeName);
  },
});

function fileFilter(_req, file, cb) {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type '${file.mimetype}'. Allowed: mp4, mov, avi, mkv, webm`
      ),
      false
    );
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.maxFileSizeMb * 1024 * 1024,
  },
});