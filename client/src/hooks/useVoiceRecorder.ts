import { useCallback, useEffect, useRef, useState } from "react";

interface UseVoiceRecorderOptions {
  onRecordingReady: (file: File) => Promise<void> | void;
}

function getSupportedAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
    "audio/mpeg",
  ];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime));
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("mpeg")) return "mp3";
  return "webm";
}

export function useVoiceRecorder({ onRecordingReady }: UseVoiceRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const selectedMimeRef = useRef<string | undefined>(undefined);

  const clearTimer = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const cleanupStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setDurationSec(0);
    setIsRecording(false);
    setIsPaused(false);
    audioChunksRef.current = [];
    mediaRecorderRef.current = null;
    selectedMimeRef.current = undefined;
    cancelledRef.current = false;
  }, [clearTimer]);

  const start = useCallback(async () => {
    if (isRecording || isProcessing) return;
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      cancelledRef.current = false;

      const selectedMime = getSupportedAudioMimeType();
      selectedMimeRef.current = selectedMime;
      const recorder = selectedMime ? new MediaRecorder(stream, { mimeType: selectedMime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalize = async () => {
          try {
            clearTimer();
            setIsRecording(false);
            setIsPaused(false);

            if (cancelledRef.current) {
              return;
            }
            const mimeType = recorder.mimeType || selectedMimeRef.current || "audio/webm";
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            if (blob.size === 0) {
              setError("No audio captured");
              return;
            }
            const extension = extensionFromMimeType(mimeType);
            const file = new File([blob], `voice-note-${Date.now()}.${extension}`, {
              type: blob.type || mimeType,
            });
            setIsProcessing(true);
            await onRecordingReady(file);
          } catch (err: any) {
            setError(err?.message || "Failed to process recording");
          } finally {
            setIsProcessing(false);
            cleanupStream();
            reset();
          }
        };
        void finalize();
      };

      recorder.start();
      setIsRecording(true);
      setIsPaused(false);
      setDurationSec(0);
      clearTimer();
      recordingTimerRef.current = setInterval(() => {
        setDurationSec((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      setError(err?.message || "Could not start voice recording");
      cleanupStream();
      reset();
    }
  }, [clearTimer, cleanupStream, isProcessing, isRecording, onRecordingReady, reset]);

  const pause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.pause();
    setIsPaused(true);
    clearTimer();
  }, [clearTimer]);

  const resume = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    recorder.resume();
    setIsPaused(false);
    clearTimer();
    recordingTimerRef.current = setInterval(() => {
      setDurationSec((prev) => prev + 1);
    }, 1000);
  }, [clearTimer]);

  const stop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    cancelledRef.current = true;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      cleanupStream();
      reset();
    }
  }, [cleanupStream, reset]);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      cancelledRef.current = true;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      cleanupStream();
      clearTimer();
    };
  }, [cleanupStream, clearTimer]);

  return {
    isRecording,
    isPaused,
    isProcessing,
    durationSec,
    error,
    start,
    pause,
    resume,
    stop,
    cancel,
    clearError,
  };
}
