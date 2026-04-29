/**
 * useJitsiCall — thin wrapper around JitsiCallContext.
 * All state and socket listeners live in the global JitsiCallProvider
 * so incoming calls ring on every page, not just where this hook is mounted.
 */
import { useJitsiCallContext } from "@/contexts/JitsiCallContext";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useJitsiCall(_userId?: string) {
  return useJitsiCallContext();
}
