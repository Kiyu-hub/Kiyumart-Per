import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { Mic, Pause, Play, Send, Trash2 } from "lucide-react";

interface VoiceRecorderControlsProps {
  onSendAudio: (file: File) => Promise<void> | void;
  disabled?: boolean;
}

function formatDuration(totalSec: number): string {
  const mins = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, "0");
  const secs = (totalSec % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export default function VoiceRecorderControls({ onSendAudio, disabled = false }: VoiceRecorderControlsProps) {
  const recorder = useVoiceRecorder({ onRecordingReady: onSendAudio });

  if (!recorder.isRecording) {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={recorder.start}
          disabled={disabled || recorder.isProcessing}
          title="Record voice note"
        >
          <Mic className="h-4 w-4" />
        </Button>
        {recorder.error && (
          <button
            type="button"
            className="text-xs text-destructive underline"
            onClick={recorder.clearError}
          >
            {recorder.error}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border px-2 py-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={recorder.cancel}
        disabled={disabled || recorder.isProcessing}
        title="Delete recording"
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={recorder.isPaused ? recorder.resume : recorder.pause}
        disabled={disabled || recorder.isProcessing}
        title={recorder.isPaused ? "Resume recording" : "Pause recording"}
      >
        {recorder.isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </Button>
      <span className="text-xs font-medium tabular-nums">{formatDuration(recorder.durationSec)}</span>
      <Button
        type="button"
        size="icon"
        onClick={recorder.stop}
        disabled={disabled || recorder.isProcessing}
        title="Send voice note"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
