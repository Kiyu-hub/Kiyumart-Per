import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { detectVideoProvider, getVideoResolvePath, getPlatformEmbedUrl, isDirectVideoUrl, prefersPortraitVideoLayout } from "@/lib/videoPlayback";

interface ResolvedVideoSource {
  playbackUrl: string;
  posterUrl?: string | null;
  provider?: string;
}

interface CleanVideoPlayerProps {
  videoUrl?: string | null;
  title?: string;
  className?: string;
  compact?: boolean;
  layout?: "auto" | "landscape";
}

const formatSeconds = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const total = Math.floor(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export default function CleanVideoPlayer({
  videoUrl,
  title = "Product video",
  className,
  compact = false,
  layout = "auto",
}: CleanVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isPortraitMedia, setIsPortraitMedia] = useState(
    layout === "landscape" ? false : prefersPortraitVideoLayout(videoUrl),
  );

  const normalizedUrl = String(videoUrl || "").trim();
  const directVideoUrl = isDirectVideoUrl(normalizedUrl) ? normalizedUrl : null;
  // Use platform-native iframe embed when available (YouTube, Vimeo, Facebook)
  const platformEmbedUrl = directVideoUrl ? null : getPlatformEmbedUrl(normalizedUrl);
  const provider = detectVideoProvider(normalizedUrl);
  // Only hit API resolver for TikTok/Instagram/unknown (not platforms we can embed natively)
  const needsApiResolve = Boolean(normalizedUrl) && !directVideoUrl && !platformEmbedUrl;

  const {
    data: resolvedSource,
    isLoading: isResolving,
    isError: resolveError,
  } = useQuery<ResolvedVideoSource>({
    queryKey: ["/api/video-source", normalizedUrl],
    queryFn: async () => {
      const response = await fetch(getVideoResolvePath(normalizedUrl), {
        credentials: "same-origin",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error || "Could not load this video");
      }
      return body;
    },
    enabled: needsApiResolve,
    staleTime: 5 * 60 * 1000,
  });

  const playbackUrl = directVideoUrl || resolvedSource?.playbackUrl || "";
  const posterUrl = resolvedSource?.posterUrl || null;

  useEffect(() => {
    setLoadFailed(false);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setIsPortraitMedia(layout === "landscape" ? false : prefersPortraitVideoLayout(normalizedUrl));
  }, [normalizedUrl, layout]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
  }, [muted]);

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (video.paused) {
        await video.play();
        setIsPlaying(true);
      } else {
        video.pause();
        setIsPlaying(false);
      }
    } catch {
      setLoadFailed(true);
    }
  };

  const handleSeek = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value;
    setCurrentTime(value);
  };

  const handleFullscreen = async () => {
    const frame = frameRef.current;
    if (!frame) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await frame.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen failures.
    }
  };

  const playerState = useMemo(() => {
    if (!normalizedUrl) return "empty";
    if (platformEmbedUrl) return "embed";
    if (playbackUrl) return "ready";
    if (needsApiResolve && isResolving) return "loading";
    if (resolveError || loadFailed) return "error";
    return "unsupported";
  }, [normalizedUrl, platformEmbedUrl, playbackUrl, needsApiResolve, isResolving, resolveError, loadFailed]);

  const aspectClass =
    layout === "landscape"
      ? "aspect-video"
      : isPortraitMedia
        ? "aspect-[9/16] max-w-[420px] mx-auto"
        : "aspect-video";
  const frameClass = compact ? "rounded-2xl" : "rounded-[28px]";

  return (
    <div
      ref={frameRef}
      className={cn(
        "relative overflow-hidden border border-border/50 bg-black shadow-[0_18px_60px_-20px_rgba(0,0,0,0.55)]",
        frameClass,
        className,
      )}
    >
      <div className={cn("relative w-full bg-black", aspectClass)}>
        {playerState === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black text-white/80">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Preparing video...</p>
          </div>
        )}

        {playerState === "embed" && platformEmbedUrl && (
          <iframe
            src={platformEmbedUrl}
            title={title}
            className="absolute inset-0 w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            data-testid="platform-embed-player"
          />
        )}

        {playerState === "ready" && (
          <>
            <video
              ref={videoRef}
              src={playbackUrl}
              poster={posterUrl || undefined}
              playsInline
              preload="metadata"
              controlsList="nodownload noplaybackrate"
              disablePictureInPicture
              className="h-full w-full object-contain bg-black"
              onClick={togglePlayback}
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                setDuration(video.duration || 0);
                if (layout !== "landscape" && video.videoWidth && video.videoHeight) {
                  setIsPortraitMedia(video.videoHeight > video.videoWidth);
                }
              }}
              onTimeUpdate={(event) => {
                setCurrentTime(event.currentTarget.currentTime);
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onError={() => setLoadFailed(true)}
              data-testid="clean-video-player"
            />

            {!isPlaying && (
              <button
                type="button"
                onClick={togglePlayback}
                className="absolute inset-0 flex items-center justify-center bg-black/10 transition hover:bg-black/20"
                aria-label="Play video"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/92 shadow-xl">
                  <Play className="ml-1 h-7 w-7 text-black" fill="currentColor" />
                </span>
              </button>
            )}

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-3 pt-10 text-white">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  {!compact && <p className="truncate text-sm font-medium">{title}</p>}
                  {!compact && provider !== "direct" && (
                    <p className="text-xs text-white/70 capitalize">{provider} video</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMuted((prev) => !prev)}
                    className="rounded-full bg-white/10 p-2 transition hover:bg-white/20"
                    aria-label={muted ? "Unmute" : "Mute"}
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  {!compact && (
                    <button
                      type="button"
                      onClick={handleFullscreen}
                      className="rounded-full bg-white/10 p-2 transition hover:bg-white/20"
                      aria-label="Fullscreen"
                    >
                      <Maximize className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlayback}
                  className="rounded-full bg-white/10 p-2 transition hover:bg-white/20"
                  aria-label={isPlaying ? "Pause video" : "Play video"}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={Math.min(currentTime, duration || 0)}
                  onChange={(event) => handleSeek(Number(event.target.value))}
                  className="h-1 flex-1 cursor-pointer accent-white"
                  aria-label="Video progress"
                />
                <span className="shrink-0 text-xs tabular-nums text-white/80">
                  {formatSeconds(currentTime)} / {formatSeconds(duration)}
                </span>
              </div>
            </div>
          </>
        )}

        {(playerState === "error" || playerState === "unsupported") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white/80">
            <AlertCircle className="h-8 w-8 text-white/70" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-white">Video preview unavailable</p>
              <p className="text-xs leading-relaxed text-white/65">
                We could not prepare this video for the in-app player. Try uploading the video directly for the cleanest playback.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
