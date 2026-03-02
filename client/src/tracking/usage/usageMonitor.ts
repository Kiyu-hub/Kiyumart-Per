import { TRACKING_BUDGETS, TRACKING_THRESHOLDS } from "@/tracking/config";
import type { UsageMonitor, UsageSnapshot } from "@/tracking/interfaces";

type MetricName = "tile" | "route" | "map";

const listeners = new Set<(snapshot: UsageSnapshot) => void>();
let snapshot: UsageSnapshot = {
  tileLoads: 0,
  routeCalls: 0,
  mapInstantiations: 0,
  tileUsagePct: 0,
  routeUsagePct: 0,
  mapUsagePct: 0,
  disableReroute: false,
  freezeSecondaryLayers: false,
  alerts: [],
};

const raised = new Set<string>();

function pct(value: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.round((value / budget) * 100);
}

function emit(metric: MetricName, levelPct: number) {
  const key = `${metric}-${levelPct}`;
  if (raised.has(key)) return;
  raised.add(key);
  snapshot = {
    ...snapshot,
    alerts: [...snapshot.alerts, { metric, levelPct, timestampMs: Date.now() }],
  };
}

function updateDerived() {
  const tileUsagePct = pct(snapshot.tileLoads, TRACKING_BUDGETS.tileLoads);
  const routeUsagePct = pct(snapshot.routeCalls, TRACKING_BUDGETS.routeCalls);
  const mapUsagePct = pct(snapshot.mapInstantiations, TRACKING_BUDGETS.mapInstantiations);

  for (const level of TRACKING_THRESHOLDS) {
    if (tileUsagePct >= level) emit("tile", level);
    if (routeUsagePct >= level) emit("route", level);
    if (mapUsagePct >= level) emit("map", level);
  }

  const maxUsage = Math.max(tileUsagePct, routeUsagePct, mapUsagePct);
  snapshot = {
    ...snapshot,
    tileUsagePct,
    routeUsagePct,
    mapUsagePct,
    disableReroute: maxUsage >= 80,
    freezeSecondaryLayers: maxUsage >= 90,
  };
}

function notify() {
  listeners.forEach((listener) => listener(snapshot));
}

class InMemoryUsageMonitor implements UsageMonitor {
  trackTileLoad() {
    snapshot = { ...snapshot, tileLoads: snapshot.tileLoads + 1 };
    updateDerived();
    notify();
  }

  trackRouteCall() {
    snapshot = { ...snapshot, routeCalls: snapshot.routeCalls + 1 };
    updateDerived();
    notify();
  }

  trackMapInstantiation() {
    snapshot = { ...snapshot, mapInstantiations: snapshot.mapInstantiations + 1 };
    updateDerived();
    notify();
  }

  getSnapshot(): UsageSnapshot {
    return snapshot;
  }

  subscribe(listener: (next: UsageSnapshot) => void): () => void {
    listeners.add(listener);
    listener(snapshot);
    return () => listeners.delete(listener);
  }
}

export const usageMonitor: UsageMonitor = new InMemoryUsageMonitor();
