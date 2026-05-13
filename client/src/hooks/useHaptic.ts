type HapticStyle = "light" | "medium" | "heavy" | "success" | "error" | "warning";

const patterns: Record<HapticStyle, number[]> = {
  light: [10],
  medium: [20],
  heavy: [40],
  success: [10, 50, 10],
  error: [50, 30, 50],
  warning: [30, 20, 30],
};

export function useHaptic() {
  const trigger = (style: HapticStyle = "medium") => {
    if (!("vibrate" in navigator)) return;
    navigator.vibrate(patterns[style]);
  };
  return { trigger };
}
