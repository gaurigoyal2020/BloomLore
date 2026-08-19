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
 * accessToken is the current user's Supabase session token — required
 * now that the backend's /api/upload route checks for a logged-in user
 * (see auth.middleware.js). Sent the same way any Bearer-token API
 * expects it: an `Authorization: Bearer <token>` header.
 *
 * @returns {Promise<{ jobId: string }>}
 */
export async function submitUpload(file, targetLang, accessToken, onProgress) {
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
        // 401 here specifically means the session expired mid-use —
        // worth a clearer message than the backend's generic one, since
        // the fix (log in again) is different from a normal upload error.
        if (xhr.status === 401) message = "Your session expired — please log in again.";
        reject(new Error(message));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error — is the server running?")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

    xhr.open("POST", `${BASE_URL}/api/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
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
export async function getJobStatus(jobId, accessToken) {
  const res = await fetch(`${BASE_URL}/api/status/${jobId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) throw new Error("Your session expired — please log in again.");
  if (!res.ok) throw new Error("Failed to fetch job status");
  const body = await res.json();
  return body.data;
}

export const healthCheck = () =>
  fetch(`${BASE_URL}/health`).then((r) => r.json());

/** GET /api/lessons — the current user's upload history. */
export async function getLessons(accessToken) {
  const res = await fetch(`${BASE_URL}/api/lessons`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) throw new Error("Your session expired — please log in again.");
  if (!res.ok) throw new Error("Failed to fetch upload history");
  const body = await res.json();
  return body.data.lessons;
}

/** GET /api/lessons/:id — one past lesson, shaped like a completed job's result. */
export async function getLessonDetail(id, accessToken) {
  const res = await fetch(`${BASE_URL}/api/lessons/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) throw new Error("Your session expired — please log in again.");
  if (res.status === 404) throw new Error("This video wasn't found — it may have expired.");
  if (!res.ok) throw new Error("Failed to fetch this video");
  const body = await res.json();
  return body.data;
}

/**
 * PATCH /api/lessons/:id — saves edited subtitle text. Pass ONE of the two
 * fields depending on which track is being edited:
 *   updateLessonSubtitles(id, { subtitles: [...] }, token)              — original
 *   updateLessonSubtitles(id, { translatedSubtitles: [...] }, token)    — translated
 * Each cue must be { start, end, text } — only `text` is meant to change;
 * start/end should be passed through unmodified from what was fetched.
 * Returns the updated lesson, shaped the same as getLessonDetail/getJobStatus.
 */
export async function updateLessonSubtitles(id, payload, accessToken) {
  const res = await fetch(`${BASE_URL}/api/lessons/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new Error("Your session expired — please log in again.");
  if (res.status === 404) throw new Error("This video wasn't found — it may have expired.");
  if (!res.ok) {
    let message = "Failed to save subtitle edits";
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  const body = await res.json();
  return body.data;
}