/**
 * JitsiCallDialog - Full-featured Jitsi Meet Call UI
 * 
 * Features:
 * - Incoming call notification with accept/reject
 * - Embedded Jitsi Meet iframe
 * - Call controls (mute, camera, end call)
 * - Participant list
 */

import React, { useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Users,
  X,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface JitsiCallDialogProps {
  // Call state
  isOpen: boolean;
  roomUrl: string | null;
  roomName: string | null;
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
  const iframeRef = useRef<HTMLIFrameElement>(null);

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

  // Active call UI with embedded Jitsi
  if (roomUrl) {
    return (
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-[95vw] w-full h-[90vh] max-h-[90vh] p-0 gap-0 overflow-hidden bg-[#0b1014] border border-white/10">
          <div className="absolute left-4 top-4 z-20 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
            <span className="inline-flex items-center gap-1.5">
              {callType === "video" ? <Video className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
              {participants.length > 0
                ? `${participants.length} participant${participants.length !== 1 ? "s" : ""}`
                : "In call"}
            </span>
          </div>

          <div className="flex-1 bg-black">
            <iframe
              ref={iframeRef}
              src={roomUrl}
              className="w-full h-full border-0"
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              allowFullScreen
            />
          </div>

          <div className="absolute inset-x-0 bottom-4 z-20 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={onLeave}
              className="h-12 w-12 rounded-full border-white/25 bg-black/55 text-white hover:bg-green-600 hover:text-white hover:border-green-600 backdrop-blur-sm"
              title="Leave call"
            >
              <PhoneOff className="h-5 w-5" />
            </Button>
            {isHost && (
              <Button
                variant="outline"
                size="icon"
                onClick={onEnd}
                className="h-12 w-12 rounded-full border-white/25 bg-black/55 text-white hover:bg-green-600 hover:text-white hover:border-green-600 backdrop-blur-sm"
                title="End call for all"
              >
                <X className="h-5 w-5" />
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
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
