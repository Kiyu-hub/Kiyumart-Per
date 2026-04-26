import { cn } from "@/lib/utils";

interface TypingIndicatorProps {
  name?: string;
  className?: string;
}

export function TypingIndicator({ name, className }: TypingIndicatorProps) {
  return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5", className)}>
      <div className="flex items-end gap-0.5 rounded-2xl rounded-bl-none bg-muted px-3 py-2">
        <span
          className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "0ms", animationDuration: "900ms" }}
        />
        <span
          className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "200ms", animationDuration: "900ms" }}
        />
        <span
          className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "400ms", animationDuration: "900ms" }}
        />
      </div>
      {name && (
        <span className="text-xs text-muted-foreground">{name} is typing…</span>
      )}
    </div>
  );
}

export default TypingIndicator;
