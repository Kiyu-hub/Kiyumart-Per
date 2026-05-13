import { useRef, useState, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useHaptic } from "@/hooks/useHaptic";

interface SwipeAction {
  label: string;
  icon?: ReactNode;
  color: "destructive" | "primary" | "warning" | "success";
  onPress: () => void;
}

interface SwipeableRowProps {
  children: ReactNode;
  leftAction?: SwipeAction;
  rightAction?: SwipeAction;
  className?: string;
  disabled?: boolean;
}

const COLOR_MAP = {
  destructive: "bg-destructive text-destructive-foreground",
  primary:     "bg-primary text-primary-foreground",
  warning:     "bg-amber-500 text-white",
  success:     "bg-emerald-500 text-white",
};

const ACTION_WIDTH = 76;
const TRIGGER_THRESHOLD = ACTION_WIDTH * 0.55;

export function SwipeableRow({
  children,
  leftAction,
  rightAction,
  className,
  disabled = false,
}: SwipeableRowProps) {
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const isDragging = useRef(false);
  const isHorizontal = useRef<boolean | null>(null);
  const { trigger: haptic } = useHaptic();

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isHorizontal.current = null;
    isDragging.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || disabled) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Determine direction on first significant move
    if (isHorizontal.current === null && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      isHorizontal.current = Math.abs(dx) > Math.abs(dy);
    }
    if (!isHorizontal.current) return;

    e.preventDefault();
    const bounded = Math.max(
      rightAction ? -ACTION_WIDTH : 0,
      Math.min(leftAction ? ACTION_WIDTH : 0, dx),
    );
    setOffsetX(bounded);
  };

  const onTouchEnd = () => {
    if (!isDragging.current || disabled) return;
    isDragging.current = false;

    if (offsetX <= -TRIGGER_THRESHOLD && rightAction) {
      haptic("medium");
      setOffsetX(-ACTION_WIDTH);
    } else if (offsetX >= TRIGGER_THRESHOLD && leftAction) {
      haptic("medium");
      setOffsetX(ACTION_WIDTH);
    } else {
      setOffsetX(0);
    }
  };

  const reset = () => setOffsetX(0);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Left action — revealed by swiping right */}
      {leftAction && (
        <button
          className={cn(
            "absolute left-0 top-0 bottom-0 flex flex-col items-center justify-center gap-1",
            "font-semibold text-xs touch-ripple",
            COLOR_MAP[leftAction.color],
          )}
          style={{ width: ACTION_WIDTH }}
          onClick={() => { leftAction.onPress(); reset(); }}
        >
          {leftAction.icon}
          <span>{leftAction.label}</span>
        </button>
      )}

      {/* Right action — revealed by swiping left */}
      {rightAction && (
        <button
          className={cn(
            "absolute right-0 top-0 bottom-0 flex flex-col items-center justify-center gap-1",
            "font-semibold text-xs touch-ripple",
            COLOR_MAP[rightAction.color],
          )}
          style={{ width: ACTION_WIDTH }}
          onClick={() => { rightAction.onPress(); reset(); }}
        >
          {rightAction.icon}
          <span>{rightAction.label}</span>
        </button>
      )}

      {/* Main content */}
      <div
        className="relative bg-card"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging.current ? "none" : "transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
