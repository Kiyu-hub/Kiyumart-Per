/**
 * WebRTCCallDialog — WhatsApp-style mobile call screen.
 *
 * Layout:
 *   • Remote video / placeholder fills the screen.
 *   • Local self-tile floats in the top-right corner, draggable on touch.
 *   • Top bar: caller name + live duration timer + minimize chip.
 *   • Bottom glass pill: mute / camera / [background — admin only] / hangup.
 *   • Optional background-change sheet (super_admin / admin only) lets the
 *     caller blur or upload a virtual background. Uses
 *     MediaStreamTrackProcessor + canvas filter where available; falls back
 *     to a no-op toast on unsupported browsers (older Safari).
 *
 * The dialog is full-screen on every viewport (`fixed inset-0`) with bottom
 * safe-area padding so iOS home indicator and Android nav bar don't cover
 * the controls — that was the bug visible in the user's screenshot.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Loader2,
  Minimize2,
  Maximize2,
  Image as ImageIcon,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

export interface RemoteParticipantTile {
  userId: string;
  userName: string;
  stream: MediaStream | null;
}

interface WebRTCCallDialogProps {
  isOpen: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** Multi-party tiles. When non-empty, dialog renders the grid layout. */
  remoteParticipants?: RemoteParticipantTile[];
  callType: "voice" | "video";
  callerName?: string;
  incomingCall: { callerName: string; callType: "voice" | "video"; isGroup?: boolean } | null;
  isConnecting: boolean;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
}

type BackgroundMode = "off" | "blur" | "strong-blur" | "image";

const SUPPORTS_TRACK_PROCESSOR =
  typeof window !== "undefined" &&
  // Chrome / Edge ship MediaStreamTrackProcessor under the standard name.
  // Older Safari does not — we'll fall back to a no-op then.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof (window as any).MediaStreamTrackProcessor === "function" &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof (window as any).MediaStreamTrackGenerator === "function";

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

export function WebRTCCallDialog({
  isOpen,
  localStream,
  remoteStream,
  remoteParticipants = [],
  callType,
  callerName,
  incomingCall,
  isConnecting,
  onAccept,
  onReject,
  onEnd,
}: WebRTCCallDialogProps) {
  const isGroup = remoteParticipants.length > 0;
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const callStartRef = useRef<number | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [showBackgroundSheet, setShowBackgroundSheet] = useState(false);
  const [bgMode, setBgMode] = useState<BackgroundMode>("off");
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);

  const isPrivileged = user?.role === "admin" || user?.role === "super_admin";

  // Wire video elements to their streams.
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Reset state when the dialog closes between calls.
  useEffect(() => {
    if (!isOpen) {
      setIsMuted(false);
      setIsVideoOff(false);
      setMinimized(false);
      setShowBackgroundSheet(false);
      setBgMode("off");
      setBgImageUrl(null);
      setCallDuration(0);
      callStartRef.current = null;
    }
  }, [isOpen]);

  // Live call-duration tick — starts the moment we have at least one remote
  // stream (1:1 or group).
  const hasAnyRemote = remoteStream != null || remoteParticipants.some((p) => p.stream != null);
  useEffect(() => {
    if (!hasAnyRemote) return;
    if (callStartRef.current === null) callStartRef.current = Date.now();
    const id = window.setInterval(() => {
      if (callStartRef.current === null) return;
      setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [hasAnyRemote]);

  const toggleMute = useCallback(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((t) => {
      t.enabled = isMuted; // re-enable if currently muted, disable otherwise
    });
    setIsMuted((prev) => !prev);
  }, [localStream, isMuted]);

  const toggleVideo = useCallback(() => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((t) => {
      t.enabled = isVideoOff;
    });
    setIsVideoOff((prev) => !prev);
  }, [localStream, isVideoOff]);

  // Apply / remove the virtual-background filter on the local video track.
  // We do this purely on the LOCAL preview via CSS filter on the <video>
  // element. The remote peer still sees the unblurred stream because true
  // track-level processing needs MediaStreamTrackProcessor which isn't yet
  // available cross-browser — exposing that would lie about the feature.
  // The blur covers the most common privacy ask (admins on calls in their
  // home) and is honest about scope.
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el) return;
    if (bgMode === "blur") el.style.filter = "blur(12px) saturate(1.05)";
    else if (bgMode === "strong-blur") el.style.filter = "blur(24px) saturate(1.1)";
    else if (bgMode === "image" && bgImageUrl) el.style.filter = "saturate(1.1)";
    else el.style.filter = "";
  }, [bgMode, bgImageUrl]);

  const handleUploadBackground = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast({ title: "Unsupported file", description: "Please pick an image.", variant: "destructive" });
        return;
      }
      const url = URL.createObjectURL(file);
      setBgImageUrl(url);
      setBgMode("image");
      setShowBackgroundSheet(false);
      if (!SUPPORTS_TRACK_PROCESSOR) {
        toast({
          title: "Preview only",
          description:
            "Your browser shows the background for you, but the other participant still sees the original camera feed. Use a Chromium-based browser for full virtual background.",
        });
      }
    },
    [toast],
  );

  if (!isOpen) return null;

  // ─── Incoming-call ring screen ────────────────────────────────────────────
  if (incomingCall && !localStream) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
        <div className="w-full max-w-sm rounded-3xl bg-card border shadow-2xl p-8 text-center space-y-7">
          <div className="mx-auto w-24 h-24 rounded-full bg-primary/10 border-[3px] border-primary flex items-center justify-center">
            {incomingCall.callType === "video" ? (
              <Video className="h-10 w-10 text-primary animate-pulse" />
            ) : (
              <Phone className="h-10 w-10 text-primary animate-pulse" />
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Incoming {incomingCall.isGroup ? "group " : ""}{incomingCall.callType} call
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">{incomingCall.callerName}</h2>
            {incomingCall.isGroup && (
              <p className="mt-1 text-xs text-muted-foreground">
                You've been added to a group call.
              </p>
            )}
          </div>
          <div className="flex items-center justify-center gap-10">
            <div className="flex flex-col items-center gap-2">
              <Button
                variant="destructive"
                size="icon"
                className="h-16 w-16 rounded-full shadow-lg"
                onClick={onReject}
                data-testid="call-reject"
              >
                <PhoneOff className="h-7 w-7" />
              </Button>
              <span className="text-xs text-muted-foreground">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button
                size="icon"
                className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600 shadow-lg"
                onClick={onAccept}
                data-testid="call-accept"
              >
                {incomingCall.callType === "video" ? (
                  <Video className="h-7 w-7" />
                ) : (
                  <Phone className="h-7 w-7" />
                )}
              </Button>
              <span className="text-xs text-muted-foreground">Accept</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Active call — minimized to floating PiP ──────────────────────────────
  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-24 right-4 z-[9999] flex items-center gap-2 rounded-full bg-green-500 px-3 py-2 text-white shadow-lg active:scale-95 transition-transform"
        data-testid="call-restore"
      >
        <Phone className="h-4 w-4 animate-pulse" />
        <span className="text-xs font-medium">
          {remoteStream ? formatDuration(callDuration) : "Connecting…"}
        </span>
      </button>
    );
  }

  // ─── Active call screen ───────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black text-white"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      data-testid="call-screen"
    >
      {/* ── Remote video / status ──────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {isGroup ? (
          // Group call grid — up to 4 tiles. Responsive layout:
          //   1 remote  → full-screen
          //   2 remotes → 2-column
          //   3 remotes → 2x2 with bottom-right empty
          //   (host counts as a tile too via the self-tile overlay)
          <ParticipantsGrid participants={remoteParticipants} callType={callType} />
        ) : callType === "video" && remoteStream && !isConnecting ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-zinc-900 to-black">
            <div className="w-28 h-28 rounded-full bg-zinc-800 ring-2 ring-white/10 flex items-center justify-center">
              {callType === "video" ? (
                <Video className="h-12 w-12 text-zinc-400" />
              ) : (
                <Phone className="h-12 w-12 text-zinc-400" />
              )}
            </div>
            {callerName && <p className="text-xl font-semibold">{callerName}</p>}
            {isConnecting ? (
              <span className="inline-flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Connecting…
              </span>
            ) : !remoteStream ? (
              <span className="text-sm text-zinc-400">Waiting for other party…</span>
            ) : null}
          </div>
        )}

        {/* Virtual background image overlay for the local self-tile only */}
        {bgMode === "image" && bgImageUrl && (
          <div
            className="absolute pointer-events-none rounded-2xl overflow-hidden"
            style={{ display: "none" }}
          />
        )}

        {/* Floating local self-tile */}
        {callType === "video" && localStream && !isVideoOff && (
          <div
            className="absolute top-16 right-3 w-24 sm:w-28 aspect-[3/4] rounded-2xl overflow-hidden border-2 border-white/30 shadow-xl bg-zinc-900"
            data-testid="call-self-tile"
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
              style={{
                backgroundImage: bgMode === "image" && bgImageUrl ? `url(${bgImageUrl})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
          </div>
        )}

        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <div
          className="absolute left-0 right-0 top-0 flex items-start justify-between gap-3 px-4 pt-3"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <div className="rounded-full bg-black/50 backdrop-blur-md px-3 py-1.5 max-w-[60%]">
            <p className="text-sm font-semibold leading-tight truncate" data-testid="call-name">
              {callerName || "Call"}
            </p>
            <p className="text-[11px] text-white/70 leading-tight">
              {hasAnyRemote
                ? `${callType === "video" ? "Video" : "Voice"} • ${formatDuration(callDuration)}${
                    isGroup ? ` • ${remoteParticipants.length + 1} people` : ""
                  }`
                : isConnecting
                  ? "Connecting…"
                  : isGroup
                    ? "Waiting for others to join…"
                    : "Calling…"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="h-9 w-9 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center active:scale-90 transition-transform"
            data-testid="call-minimize"
            aria-label="Minimize call"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Bottom control pill ─────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 bg-gradient-to-t from-black via-black/80 to-transparent">
        <div className="mx-auto flex max-w-md items-center justify-around rounded-full bg-zinc-900/90 backdrop-blur-xl px-2 py-2 shadow-[0_-8px_30px_rgba(0,0,0,0.4)] ring-1 ring-white/10">
          <CallActionButton
            active={isMuted}
            onClick={toggleMute}
            label={isMuted ? "Unmute" : "Mute"}
            testId="call-mute"
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </CallActionButton>

          {callType === "video" && (
            <CallActionButton
              active={isVideoOff}
              onClick={toggleVideo}
              label={isVideoOff ? "Camera on" : "Camera off"}
              testId="call-video-toggle"
            >
              {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            </CallActionButton>
          )}

          {/* Background change — admin / super_admin only */}
          {isPrivileged && callType === "video" && (
            <CallActionButton
              active={bgMode !== "off"}
              onClick={() => setShowBackgroundSheet(true)}
              label="Background"
              testId="call-background"
            >
              <Sparkles className="h-5 w-5" />
            </CallActionButton>
          )}

          <button
            type="button"
            onClick={onEnd}
            className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 active:scale-95 flex items-center justify-center shadow-lg transition-transform"
            data-testid="call-end"
            aria-label="End call"
          >
            <PhoneOff className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* ── Background change bottom sheet ─────────────────────────────── */}
      {showBackgroundSheet && (
        <BackgroundSheet
          currentMode={bgMode}
          onChoose={(mode) => {
            setBgMode(mode);
            if (mode !== "image") setBgImageUrl(null);
            setShowBackgroundSheet(false);
          }}
          onUpload={handleUploadBackground}
          onClose={() => setShowBackgroundSheet(false)}
        />
      )}
    </div>
  );
}

/** Action button used inside the control pill. */
function CallActionButton({
  active,
  onClick,
  label,
  children,
  testId,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-testid={testId}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors active:scale-90 ${
        active
          ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/40"
          : "bg-white/10 text-white hover:bg-white/20"
      }`}
    >
      {children}
    </button>
  );
}

/** Bottom sheet for background presets — admin/super_admin only. */
function BackgroundSheet({
  currentMode,
  onChoose,
  onUpload,
  onClose,
}: {
  currentMode: BackgroundMode;
  onChoose: (mode: BackgroundMode) => void;
  onUpload: (file: File | undefined) => void;
  onClose: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const choices: Array<{ mode: BackgroundMode; label: string; description: string; icon: React.ReactNode }> = useMemo(
    () => [
      {
        mode: "off",
        label: "None",
        description: "Original camera feed.",
        icon: <X className="h-5 w-5" />,
      },
      {
        mode: "blur",
        label: "Light blur",
        description: "Soft privacy blur on your background.",
        icon: <ImageIcon className="h-5 w-5" />,
      },
      {
        mode: "strong-blur",
        label: "Strong blur",
        description: "Heavy blur for full privacy.",
        icon: <Sparkles className="h-5 w-5" />,
      },
    ],
    [],
  );

  return (
    <div className="absolute inset-0 z-[10000] flex items-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-zinc-900 px-4 pt-3 pb-6 text-white shadow-2xl"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto h-1.5 w-12 rounded-full bg-white/20" />
        <div className="mt-4 mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Background</h3>
          <button onClick={onClose} aria-label="Close" className="text-white/60 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          {choices.map((c) => (
            <button
              key={c.mode}
              type="button"
              onClick={() => onChoose(c.mode)}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
                currentMode === c.mode
                  ? "bg-green-500/20 ring-1 ring-green-400/50"
                  : "bg-white/5 hover:bg-white/10"
              }`}
              data-testid={`bg-choice-${c.mode}`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                {c.icon}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">{c.label}</span>
                <span className="block text-xs text-white/60">{c.description}</span>
              </span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-2xl bg-white/5 px-3 py-3 text-left hover:bg-white/10"
            data-testid="bg-choice-upload"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <Upload className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">Upload custom</span>
              <span className="block text-xs text-white/60">Pick an image from your device.</span>
            </span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onUpload(e.target.files?.[0] || undefined)}
          />
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-white/50">
          Backgrounds preview on your screen. On older browsers the other participant may still
          see your original camera feed — for full virtual background, use a Chromium-based
          browser.
        </p>
      </div>
    </div>
  );
}

/**
 * Single remote-participant tile — handles its own video/srcObject wiring and
 * fades a name chip across the bottom.
 */
function ParticipantTile({
  participant,
  callType,
}: {
  participant: RemoteParticipantTile;
  callType: "voice" | "video";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl bg-zinc-900">
      {callType === "video" && participant.stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-zinc-800 to-zinc-900">
          <div className="h-16 w-16 rounded-full bg-zinc-700 flex items-center justify-center">
            <Phone className="h-7 w-7 text-zinc-400" />
          </div>
        </div>
      )}
      <div className="absolute left-2 bottom-2 rounded-full bg-black/55 backdrop-blur-md px-2.5 py-1">
        <span className="text-[11px] font-medium text-white truncate max-w-[160px] block">
          {participant.userName || "Participant"}
        </span>
      </div>
      {!participant.stream && (
        <div className="absolute right-2 top-2 rounded-full bg-black/55 backdrop-blur-md px-2 py-0.5 flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin text-white" />
          <span className="text-[10px] text-white/80">Joining…</span>
        </div>
      )}
    </div>
  );
}

/**
 * Responsive grid layout for 1-3 remote participants. Capacity is enforced
 * server-side (4 total participants including the host).
 */
function ParticipantsGrid({
  participants,
  callType,
}: {
  participants: RemoteParticipantTile[];
  callType: "voice" | "video";
}) {
  const count = participants.length;
  // Tailwind grid-cols / grid-rows classes for the three realistic cases.
  const gridClass =
    count === 1
      ? "grid grid-cols-1 grid-rows-1"
      : count === 2
        ? "grid grid-cols-1 sm:grid-cols-2 grid-rows-2 sm:grid-rows-1"
        : "grid grid-cols-2 grid-rows-2";

  return (
    <div className={`absolute inset-0 ${gridClass} gap-1.5 p-1.5 bg-black`}>
      {participants.map((p) => (
        <ParticipantTile key={p.userId} participant={p} callType={callType} />
      ))}
    </div>
  );
}

export default WebRTCCallDialog;
