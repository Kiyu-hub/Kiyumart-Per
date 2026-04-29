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

/** Returns a platform-native embed iframe URL if one can be derived, otherwise null. */
export const getPlatformEmbedUrl = (value?: string | null): string | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const provider = detectVideoProvider(raw);

  if (provider === "youtube") {
    // Extract YouTube video ID from various URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (match?.[1]) {
        return `https://www.youtube.com/embed/${match[1]}?rel=0&modestbranding=1`;
      }
    }
  }

  if (provider === "vimeo") {
    const match = raw.match(/vimeo\.com\/(\d+)/);
    if (match?.[1]) {
      return `https://player.vimeo.com/video/${match[1]}?byline=0&portrait=0`;
    }
  }

  if (provider === "facebook") {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(raw)}&show_text=false`;
  }

  if (provider === "tiktok") {
    const match = raw.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
    if (match?.[1]) {
      return `https://www.tiktok.com/embed/v2/${match[1]}`;
    }
  }

  if (provider === "instagram") {
    const match = raw.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (match?.[1]) {
      return `https://www.instagram.com/p/${match[1]}/embed/`;
    }
  }

  return null;
};

export const getVideoResolvePath = (value?: string | null) =>
  `/api/video-source?url=${encodeURIComponent(String(value || "").trim())}`;
