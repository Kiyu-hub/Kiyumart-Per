export const DIRECT_VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov", ".m4v"] as const;

export const isDirectVideoUrl = (value?: string | null) => {
  const normalized = String(value || "").trim().toLowerCase();
  return DIRECT_VIDEO_EXTENSIONS.some((ext) => normalized.includes(ext));
};

export const detectVideoProvider = (value?: string | null) => {
  const url = String(value || "").trim().toLowerCase();
  if (!url) return "unknown";
  if (isDirectVideoUrl(url)) return "direct";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("vimeo.com")) return "vimeo";
   if (url.includes("instagram.com")) return "instagram";
   if (url.includes("facebook.com") || url.includes("fb.watch")) return "facebook";
  return "unknown";
};

export const prefersPortraitVideoLayout = (value?: string | null) => {
  const provider = detectVideoProvider(value);
  return provider === "tiktok" || provider === "instagram";
};

export const getVideoResolvePath = (value?: string | null) =>
  `/api/video-source?url=${encodeURIComponent(String(value || "").trim())}`;
