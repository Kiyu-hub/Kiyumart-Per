type RiskSignal =
  | "gps_dropout"
  | "route_deviation"
  | "impossible_speed"
  | "verification_failure"
  | "idle_spike"
  | "manual_cancellation_spike";

interface RiderRiskState {
  riderId: string;
  score: number;
  updatedAt: number;
  signals: Array<{ signal: RiskSignal; weight: number; at: number }>;
}

const riskByRider = new Map<string, RiderRiskState>();
const DECAY_PER_HOUR = 0.96;
const SIGNAL_WINDOW = 80;

function applyDecay(state: RiderRiskState): RiderRiskState {
  const now = Date.now();
  const hours = Math.max(0, (now - state.updatedAt) / 3_600_000);
  const decayedScore = state.score * Math.pow(DECAY_PER_HOUR, hours);
  return {
    ...state,
    score: decayedScore,
    updatedAt: now,
  };
}

export function recordRiderRiskSignal(riderId: string, signal: RiskSignal, weight = 1): RiderRiskState {
  const existing = riskByRider.get(riderId) || {
    riderId,
    score: 0,
    updatedAt: Date.now(),
    signals: [],
  };
  const decayed = applyDecay(existing);
  const nextSignal = { signal, weight, at: Date.now() };
  const next: RiderRiskState = {
    ...decayed,
    score: decayed.score + weight,
    signals: [...decayed.signals, nextSignal].slice(-SIGNAL_WINDOW),
  };
  riskByRider.set(riderId, next);
  return next;
}

export function getRiderRiskScore(riderId: string): RiderRiskState {
  const existing = riskByRider.get(riderId) || {
    riderId,
    score: 0,
    updatedAt: Date.now(),
    signals: [],
  };
  const decayed = applyDecay(existing);
  riskByRider.set(riderId, decayed);
  return decayed;
}

export function listRiderRiskScores(limit = 200): RiderRiskState[] {
  const items = Array.from(riskByRider.values()).map((state) => applyDecay(state));
  items.forEach((state) => riskByRider.set(state.riderId, state));
  return items
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}

