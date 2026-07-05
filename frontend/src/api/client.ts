const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

let token: string | null = localStorage.getItem("trickline_token");

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem("trickline_token", t);
  else localStorage.removeItem("trickline_token");
}

export function hasToken() {
  return !!token;
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status}: ${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface VideoOut {
  id: string;
  trick_tag: string | null;
  category: string | null;
  note: string | null;
  duration_seconds: number | null;
  status: string;
  created_at: string;
  playback_url: string | null;
  thumbnail_url: string | null;
}

interface Token {
  access_token: string;
}

interface UploadInit {
  video_id: string;
  upload_url: string;
  thumbnail_upload_url: string;
}

export const api = {
  health: () => req<{ status: string }>("/api/health"),

  register: (email: string, password: string, level?: string) =>
    req<Token>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, level }),
    }),

  login: async (email: string, password: string) => {
    // OAuth2 password flow expects form-encoded body.
    const body = new URLSearchParams({ username: email, password });
    const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", body });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return (await res.json()) as Token;
  },

  listVideos: () => req<VideoOut[]>("/api/videos"),

  uploadInit: (body: {
    content_type: string;
    duration_seconds: number;
    trick_tag?: string;
    category?: string;
  }) => req<UploadInit>("/api/videos/upload-init", { method: "POST", body: JSON.stringify(body) }),

  uploadComplete: (videoId: string, note?: string) =>
    req<VideoOut>(`/api/videos/${videoId}/complete`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),

  deleteVideo: (videoId: string) =>
    req<void>(`/api/videos/${videoId}`, { method: "DELETE" }),
};

/** PUT bytes directly to the presigned object-storage URL (F-06). */
export async function putToStorage(url: string, body: Blob, contentType: string) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!res.ok) throw new Error(`storage PUT failed: ${res.status} ${await res.text()}`);
}
