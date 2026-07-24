// Single source of truth for API communication.

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/**
 * Uploads a video file. Resolves as soon as the SERVER HAS ACCEPTED the
 * file and queued it for processing — NOT once the video is fully
 * processed. Because of the job-queue change on the backend, this
 * request now returns almost immediately with a jobId, instead of
 * staying open for however long ffmpeg/Deepgram/translation take.
 *
 * onProgress here only covers the actual file transfer (0-100% of the
 * upload itself). To track real processing progress after that, call
 * getJobStatus() repeatedly with the returned jobId.
 *
 * @returns {Promise<{ jobId: string }>}
 */
export async function submitUpload(file, targetLang, onProgress) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("targetLang", targetLang);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress?.(pct);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText);
          resolve(body.data); // { jobId }
        } catch {
          reject(new Error("Invalid JSON response from server"));
        }
      } else {
        let message = "Upload failed";
        try {
          const body = JSON.parse(xhr.responseText);
          message = body.error ?? message;
        } catch { /* ignore */ }
        reject(new Error(message));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error — is the server running?")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

    xhr.open("POST", `${BASE_URL}/api/upload`);
    xhr.send(formData);
  });
}

/**
 * Fetches the current status of a processing job ONCE — call this
 * repeatedly (e.g. every couple seconds) from the caller to poll.
 * Deliberately not built as a built-in polling loop in here — App.jsx
 * owns the poll timing so it can stop cleanly on unmount/reset.
 *
 * @returns {Promise<{jobId, status, stage, error, result}>}
 */
export async function getJobStatus(jobId) {
  const res = await fetch(`${BASE_URL}/api/status/${jobId}`);
  if (!res.ok) throw new Error("Failed to fetch job status");
  const body = await res.json();
  return body.data;
}

export const healthCheck = () =>
  fetch(`${BASE_URL}/health`).then((r) => r.json());