/**
 * JitsiCallDialog - Full-featured Jitsi Meet Call UI
 * 
 * Features:
 * - Incoming call notification with accept/reject
 * - Embedded Jitsi Meet iframe
 * - Call controls (mute, camera, end call)
 * - Participant list
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff, Video, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JitsiCallDialogProps {
  // Call state
  isOpen: boolean;
  roomUrl: string | null;
  roomName: string | null;
  jitsiConfig?: {
    domain: string;
    roomName: string;
    isModerator?: boolean;
    userInfo?: { displayName?: string; email?: string };
    configOverwrite?: Record<string, any>;
    interfaceConfigOverwrite?: Record<string, any>;
  } | null;
  callType: 'voice' | 'video';
  participants?: { id: string; name: string }[];
  isHost: boolean;
  
  // Incoming call handling
  incomingCall?: {
    callerName: string;
    callType: 'voice' | 'video';
  } | null;
  
  // Actions
  onAccept?: () => void;
  onReject?: () => void;
  onLeave: () => void;
  onEnd?: () => void;
  
  // Loading states
  isJoining?: boolean;
}

export function JitsiCallDialog({
  isOpen,
  roomUrl,
  roomName,
  jitsiConfig,
  callType,
  participants = [],
  isHost,
  incomingCall,
  onAccept,
  onReject,
  onLeave,
  onEnd,
  isJoining,
}: JitsiCallDialogProps) {
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  const connectionTimeoutRef = useRef<number | null>(null);
  const conferenceJoinedRef = useRef(false);
  const [participantCount, setParticipantCount] = useState(1);
  const [conferenceJoined, setConferenceJoined] = useState(false);
  const [mountError, setMountError] = useState<string | null>(null);

  const fullToolbarButtons = useMemo(
    () => [
      "microphone",
      "camera",
      "desktop",
      "fodeviceselection",
      "videoquality",
      "fullscreen",
      "participants-pane",
      "raisehand",
      "tileview",
      "filmstrip",
      "settings",
      "select-background",
      "hangup",
      ...(jitsiConfig?.isModerator
        ? ["mute-everyone", "mute-video-everyone"]
        : []),
    ],
    [jitsiConfig?.isModerator]
  );

  const sanitizeRoomName = (value?: string | null) => {
    const normalized = (value || "")
      .trim()
      .toLowerCase()
      .replace(/[\/\\]+/g, "-")
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return normalized || `kiyumart-call-${Date.now()}`;
  };

  useEffect(() => {
    if (!isOpen || !roomUrl || !jitsiContainerRef.current) return;
    setMountError(null);
    setConferenceJoined(false);
    conferenceJoinedRef.current = false;
    setParticipantCount(1);
    const enforcedDomain = "meet.jit.si";

    const parsed = (() => {
      try {
        const noHash = roomUrl.split("#")[0];
        const url = new URL(noHash);
        const parsedRoom = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
        return {
          domain: enforcedDomain,
          room: sanitizeRoomName(roomName || parsedRoom || jitsiConfig?.roomName),
        };
      } catch {
        return {
          domain: enforcedDomain,
          room: sanitizeRoomName(roomName || jitsiConfig?.roomName || ""),
        };
      }
    })();

    if (!parsed.room) return;

    const ensureScript = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        const matchingScript = document.querySelector<HTMLScriptElement>(`script[data-jitsi-domain="${parsed.domain}"]`);
        if (matchingScript && (window as any).JitsiMeetExternalAPI) {
          if (matchingScript.dataset.jitsiReady === "true") {
            resolve();
            return;
          }
          matchingScript.addEventListener("load", () => resolve(), { once: true });
          matchingScript.addEventListener("error", () => reject(new Error("Failed to load Jitsi script")), { once: true });
          return;
        }

        const staleScripts = document.querySelectorAll<HTMLScriptElement>("script[data-jitsi-domain]");
        staleScripts.forEach((staleScript) => {
          if (staleScript.dataset.jitsiDomain !== parsed.domain) {
            staleScript.remove();
          }
        });
        try {
          delete (window as any).JitsiMeetExternalAPI;
        } catch {
          (window as any).JitsiMeetExternalAPI = undefined;
        }

        const script = document.createElement("script");
        script.src = `https://${parsed.domain}/external_api.js?v=kiyumart-call-flow-v2`;
        script.async = true;
        script.dataset.jitsiDomain = parsed.domain;
        script.onload = () => {
          script.dataset.jitsiReady = "true";
          resolve();
        };
        script.onerror = () => reject(new Error("Failed to load Jitsi script"));
        document.body.appendChild(script);
      });
    };

    const mount = async () => {
      try {
        await ensureScript();
        if (!jitsiContainerRef.current || !(window as any).JitsiMeetExternalAPI) return;

        apiRef.current?.dispose?.();
        jitsiContainerRef.current.innerHTML = "";

        // 60-second connection timeout
        if (connectionTimeoutRef.current !== null) {
          window.clearTimeout(connectionTimeoutRef.current);
        }
        connectionTimeoutRef.current = window.setTimeout(() => {
          if (!conferenceJoinedRef.current) {
            setMountError("Connection timed out. Please end and retry the call.");
          }
          connectionTimeoutRef.current = null;
        }, 60000);

        const api = new (window as any).JitsiMeetExternalAPI(parsed.domain, {
          roomName: parsed.room,
          parentNode: jitsiContainerRef.current,
          width: "100%",
          height: "100%",
          userInfo: jitsiConfig?.userInfo || { displayName: "User" },
          configOverwrite: {
            prejoinPageEnabled: false,
            prejoinConfig: { enabled: false, hideDisplayName: true },
            requireDisplayName: false,
            disableDeepLinking: true,
            enableWelcomePage: false,
            enableFeaturesBasedOnToken: false,
            enableUserRolesBasedOnToken: false,
            enableClosePage: false,
            enableLobbyChat: false,
            disableLobbyPassword: true,
            lobby: { enabled: false, autoKnock: false },
            startWithAudioMuted: false,
            startWithVideoMuted: callType === "voice",
            startAudioOnly: callType === "voice",
            disableInviteFunctions: true,
            hideLobbyButton: true,
            disableThirdPartyRequests: false,
            virtualBackground: { disabled: false, backgroundType: "none" },
            p2p: { enabled: false },
            toolbarConfig: { alwaysVisible: true },
            toolbarButtons: fullToolbarButtons,
            ...(jitsiConfig?.configOverwrite || {}),
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_POWERED_BY: false,
            MOBILE_APP_PROMO: false,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
            TOOLBAR_ALWAYS_VISIBLE: true,
            SHOW_CHROME_EXTENSION_BANNER: false,
            DISPLAY_WELCOME_FOOTER: false,
            HIDE_INVITE_MORE_HEADER: true,
            GENERATE_ROOMNAMES_ON_WELCOME_PAGE: false,
            ENFORCE_NOTIFICATION_AUTO_DISMISS_TIMEOUT: 5000,
            DEFAULT_REMOTE_DISPLAY_NAME: "Participant",
            DEFAULT_LOCAL_DISPLAY_NAME: jitsiConfig?.userInfo?.displayName || "You",
            TOOLBAR_BUTTONS: fullToolbarButtons,
            ...(jitsiConfig?.interfaceConfigOverwrite || {}),
          },
        });

        apiRef.current = api;
        api.addListener("videoConferenceJoined", () => {
          setConferenceJoined(true);
          conferenceJoinedRef.current = true;
          setParticipantCount(1);
          if (connectionTimeoutRef.current !== null) {
            window.clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          if (callType !== "voice") {
            try {
              api.executeCommand("setTileView", true);
            } catch {
              // no-op
            }
          }
        });
        api.addListener("participantJoined", () => {
          setParticipantCount((prev) => prev + 1);
        });
        api.addListener("participantLeft", () => {
          setParticipantCount((prev) => Math.max(1, prev - 1));
        });
        api.addListener("readyToClose", () => {
          onLeave();
        });
      } catch (error) {
        console.error("Jitsi mount failed:", error);
        setMountError("Unable to initialize call interface.");
      }
    };

    mount();

    return () => {
      if (connectionTimeoutRef.current !== null) {
        window.clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      apiRef.current?.dispose?.();
      apiRef.current = null;
    };
  }, [isOpen, roomUrl, roomName, jitsiConfig, callType, fullToolbarButtons]);

  // Handle closing - don't close if in active call
  const handleOpenChange = (open: boolean) => {
    if (!open && roomUrl) {
      // Don't automatically close, user must explicitly leave
      return;
    }
    if (!open && incomingCall) {
      onReject?.();
    }
  };

  // Incoming call UI
  if (incomingCall && !roomUrl) {
    return (
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">
              Incoming {incomingCall.callType === 'video' ? 'Video' : 'Voice'} Call
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex flex-col items-center gap-6 py-6">
            {/* Caller avatar placeholder */}
            <div className="relative">
              <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                {incomingCall.callType === 'video' ? (
                  <Video className="h-12 w-12 text-primary" />
                ) : (
                  <Phone className="h-12 w-12 text-primary" />
                )}
              </div>
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-500 text-white text-xs rounded-full animate-bounce">
                Calling...
              </span>
            </div>
            
            <div className="text-center">
              <p className="text-lg font-semibold">{incomingCall.callerName}</p>
              <p className="text-sm text-muted-foreground">
                {incomingCall.callType === 'video' ? 'Video Call' : 'Voice Call'}
              </p>
            </div>
            
            {/* Accept/Reject buttons */}
            <div className="flex gap-8">
              <Button
                variant="destructive"
                size="lg"
                className="h-16 w-16 rounded-full"
                onClick={onReject}
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              
              <Button
                variant="default"
                size="lg"
                className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600"
                onClick={onAccept}
                disabled={isJoining}
              >
                {isJoining ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : incomingCall.callType === 'video' ? (
                  <Video className="h-6 w-6" />
                ) : (
                  <Phone className="h-6 w-6" />
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Active call UI — true full-screen overlay (Jitsi toolbar handles all in-call controls)
  if (isOpen && roomUrl) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
        {/* Minimal top bar: participant count + emergency leave */}
        <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur-sm pointer-events-auto">
            {callType === "video" ? <Video className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
            {participantCount > 1
              ? `${participantCount} participants`
              : conferenceJoined ? "In call" : "Connecting..."}
          </span>
          {/* Emergency leave button — only visible before conference is joined or as fallback */}
          {(!conferenceJoined || mountError) && (
            <Button
              size="sm"
              variant="destructive"
              onClick={onLeave}
              className="pointer-events-auto rounded-full h-8 px-3 text-xs"
              title="Leave call"
            >
              <PhoneOff className="h-3.5 w-3.5 mr-1" />
              Leave
            </Button>
          )}
        </div>

        {/* Jitsi iframe — fills the entire screen */}
        <div ref={jitsiContainerRef} className="flex-1 w-full h-full" />

        {/* Connecting overlay */}
        {!conferenceJoined && !mountError && (
          <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
            <div className="rounded-xl border border-white/20 bg-black/70 px-6 py-4 text-center backdrop-blur-sm">
              <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-white" />
              <p className="text-sm text-white">Connecting call...</p>
            </div>
          </div>
        )}

        {/* Mount error overlay */}
        {mountError && (
          <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center bg-black/90 text-white gap-4">
            <p className="text-sm font-medium">{mountError}</p>
            <Button size="sm" variant="destructive" onClick={onLeave} className="rounded-full">
              <PhoneOff className="h-4 w-4 mr-1" />
              End Call
            </Button>
          </div>
        )}

        {/* Waiting for others overlay */}
        {conferenceJoined && participantCount <= 1 && !mountError && (
          <div className="pointer-events-none absolute bottom-28 inset-x-0 z-[5] flex justify-center">
            <div className="rounded-full border border-white/20 bg-black/50 px-4 py-2 text-center backdrop-blur-sm">
              <p className="text-xs text-white/80">Waiting for others to join...</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

/**
 * CallButton - Button to initiate a call
 */
interface CallButtonProps {
  onClick: () => void;
  callType: 'voice' | 'video';
  disabled?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
}

export function CallButton({
  onClick,
  callType,
  disabled,
  loading,
  size = 'md',
  variant = 'outline',
  className,
}: CallButtonProps) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-9 w-9',
    lg: 'h-10 w-10',
  };

  const iconSizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <Button
      variant={variant}
      size="icon"
      className={cn(sizeClasses[size], className)}
      onClick={onClick}
      disabled={disabled || loading}
      title={callType === 'video' ? 'Start video call' : 'Start voice call'}
    >
      {loading ? (
        <Loader2 className={cn(iconSizeClasses[size], 'animate-spin')} />
      ) : callType === 'video' ? (
        <Video className={iconSizeClasses[size]} />
      ) : (
        <Phone className={iconSizeClasses[size]} />
      )}
    </Button>
  );
}

/**
 * InlineCallInvite - Small inline notification for incoming calls
 */
interface InlineCallInviteProps {
  callerName: string;
  callType: 'voice' | 'video';
  onAccept: () => void;
  onReject: () => void;
  className?: string;
}

export function InlineCallInvite({
  callerName,
  callType,
  onAccept,
  onReject,
  className,
}: InlineCallInviteProps) {
  return (
    <Card className={cn('animate-pulse border-green-500', className)}>
      <CardContent className="p-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
            {callType === 'video' ? (
              <Video className="h-5 w-5 text-green-600" />
            ) : (
              <Phone className="h-5 w-5 text-green-600" />
            )}
          </div>
          <div>
            <p className="font-medium text-sm">{callerName}</p>
            <p className="text-xs text-muted-foreground">
              Incoming {callType} call
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-foreground hover:text-white hover:bg-green-600"
            onClick={onReject}
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            variant="default"
            size="icon"
            className="h-9 w-9 bg-green-500 hover:bg-green-600"
            onClick={onAccept}
          >
            <Phone className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default JitsiCallDialog;
