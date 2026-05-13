import { useEffect, useRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxHeight?: string;
  showHandle?: boolean;
  className?: string;
}

export function MobileSheet({
  open,
  onClose,
  title,
  children,
  maxHeight = "85dvh",
  showHandle = true,
  className,
}: MobileSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="mobile-sheet-overlay" onClick={onClose} aria-hidden />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal
        className={cn("mobile-sheet", className)}
        style={{ maxHeight }}
      >
        {showHandle && <div className="mobile-sheet-handle" />}
        {title && (
          <div className="flex items-center justify-between px-4 pb-3 pt-1 border-b border-border/30">
            <h2 className="mobile-title-3 font-semibold">{title}</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="touch-ripple h-8 w-8 rounded-full"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
        <div className="overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </>
  );
}
