import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export const generateLessonId = () => uuidv4();

export const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};


export const writeFile = (filePath, content) =>
  fs.writeFileSync(filePath, content);

/**
 * Deletes a single file. Logs but does not throw if missing.
 */
export const deleteFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn(`⚠️  Could not delete file ${filePath}:`, err.message);
  }
};

/**
 * Deletes a directory and all its contents recursively.
 * Logs but does not throw on failure.
 */
export const deleteDirectory = (dirPath) => {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`⚠️  Could not delete directory ${dirPath}:`, err.message);
  }
};

/**
 * Ensures the base uploads directory exists on startup.
 */
export const ensureUploadsDir = () => {
  const dirs = ["./uploads", "./uploads/courses"];
  dirs.forEach(ensureDirectoryExists);
};