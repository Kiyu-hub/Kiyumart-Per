function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const runtimeConfig = {
  upload: {
    profileImageMaxBytes: parseNumber(process.env.PROFILE_IMAGE_MAX_BYTES, 5 * 1024 * 1024),
    audioMaxBytes: parseNumber(process.env.AUDIO_UPLOAD_MAX_BYTES, 5 * 1024 * 1024),
    supportMediaMaxBytes: parseNumber(process.env.SUPPORT_MEDIA_MAX_BYTES, 5 * 1024 * 1024),
  },
  dispatch: {
    autoDispatchMinutes: parseNumber(process.env.AUTO_DISPATCH_MINUTES, 60),
  },
  presence: {
    heartbeatIntervalMs: parseNumber(process.env.PRESENCE_HEARTBEAT_INTERVAL_MS, 8000),
    heartbeatTimeoutMs: parseNumber(process.env.PRESENCE_HEARTBEAT_TIMEOUT_MS, 15000),
    awayThresholdMs: parseNumber(process.env.PRESENCE_AWAY_THRESHOLD_MS, 60000),
    cleanupIntervalMs: parseNumber(process.env.PRESENCE_CLEANUP_INTERVAL_MS, 5000),
  },
  alerts: {
    messageQueueWarnSize: parseNumber(process.env.ALERT_MESSAGE_QUEUE_WARN_SIZE, 100),
    dispatchBacklogWarnCount: parseNumber(process.env.ALERT_DISPATCH_BACKLOG_WARN_COUNT, 20),
  },
};
