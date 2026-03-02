import { useEffect, useState } from "react";
import type { UsageSnapshot } from "@/tracking/interfaces";
import { usageMonitor } from "@/tracking/usage/usageMonitor";

export function useUsageMonitorSnapshot(): UsageSnapshot {
  const [snapshot, setSnapshot] = useState<UsageSnapshot>(usageMonitor.getSnapshot());

  useEffect(() => usageMonitor.subscribe(setSnapshot), []);

  return snapshot;
}

