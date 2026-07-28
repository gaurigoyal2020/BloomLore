import multer from "multer";
import path from "path";
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

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, "./uploads");
  },
  filename: (_req, file, cb) => {
    const safeName = file.fieldname + "-" + uuidv4() + path.extname(file.originalname);
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
