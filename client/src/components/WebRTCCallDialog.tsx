import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WebRTCCallDialogProps {
  isOpen: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  callType: "voice" | "video";
  callerName?: string;
  incomingCall: { callerName: string; callType: "voice" | "video" } | null;
  isConnecting: boolean;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
}

export function WebRTCCallDialog({
  isOpen,
  localStream,
  remoteStream,
  callType,
  callerName,
  incomingCall,
  isConnecting,
  onAccept,
  onReject,
  onEnd,
}: WebRTCCallDialogProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

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

  // Reset mute/video state when call changes
  useEffect(() => {
    if (!isOpen) {
      setIsMuted(false);
      setIsVideoOff(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleMute = () => {
    localStream?.getAudioTracks().forEach((t) => {
      t.enabled = isMuted;
    });
    setIsMuted((prev) => !prev);
  };

  const toggleVideo = () => {
    localStream?.getVideoTracks().forEach((t) => {
      t.enabled = isVideoOff;
    });
    setIsVideoOff((prev) => !prev);
  };

  // ─── Incoming call ring screen ───────────────────────────────────────────────
  if (incomingCall && !localStream) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="bg-card border rounded-2xl p-8 text-center space-y-6 max-w-sm w-full mx-4 shadow-2xl">
          <div className="w-20 h-20 rounded-full bg-primary/10 border-4 border-primary flex items-center justify-center mx-auto">
            <Phone className="h-9 w-9 text-primary animate-bounce" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">
              Incoming {incomingCall.callType} call
            </p>
            <h2 className="text-2xl font-bold tracking-tight">{incomingCall.callerName}</h2>
          </div>
          <div className="flex justify-center gap-8">
            <div className="flex flex-col items-center gap-2">
              <Button
                variant="destructive"
                size="icon"
                className="h-14 w-14 rounded-full"
                onClick={onReject}
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              <span className="text-xs text-muted-foreground">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button
                size="icon"
                className="h-14 w-14 rounded-full bg-green-500 hover:bg-green-600"
                onClick={onAccept}
              >
                <Phone className="h-6 w-6" />
              </Button>
              <span className="text-xs text-muted-foreground">Accept</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Active / connecting call screen ─────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-gray-950">
      {/* Remote video / connecting placeholder */}
      <div className="flex-1 relative overflow-hidden">
        {callType === "video" && remoteStream && !isConnecting ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="w-28 h-28 rounded-full bg-gray-800 flex items-center justify-center">
              {callType === "video" ? (
                <Video className="h-12 w-12 text-gray-400" />
              ) : (
                <Phone className="h-12 w-12 text-gray-400" />
              )}
            </div>
            {callerName && (
              <p className="text-white text-xl font-semibold">{callerName}</p>
            )}
            {isConnecting && (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Connecting…</span>
              </div>
            )}
            {!isConnecting && !remoteStream && (
              <p className="text-gray-400 text-sm">Waiting for other party…</p>
            )}
          </div>
        )}

        {/* Local video PiP */}
        {callType === "video" && localStream && !isVideoOff && (
          <div className="absolute bottom-4 right-4 w-32 h-24 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg bg-gray-900">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="flex items-center justify-center gap-4 py-6 px-4 bg-gray-900/80 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          className={`h-12 w-12 rounded-full border ${
            isMuted ? "bg-red-600/20 border-red-500 text-red-400" : "border-gray-600 text-white hover:bg-gray-700"
          }`}
          onClick={toggleMute}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </Button>

        {callType === "video" && (
          <Button
            variant="ghost"
            size="icon"
            className={`h-12 w-12 rounded-full border ${
              isVideoOff ? "bg-red-600/20 border-red-500 text-red-400" : "border-gray-600 text-white hover:bg-gray-700"
            }`}
            onClick={toggleVideo}
            title={isVideoOff ? "Turn on camera" : "Turn off camera"}
          >
            {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </Button>
        )}

        <Button
          variant="destructive"
          size="icon"
          className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 shadow-lg"
          onClick={onEnd}
          title="End call"
        >
          <PhoneOff className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
}

export default WebRTCCallDialog;
