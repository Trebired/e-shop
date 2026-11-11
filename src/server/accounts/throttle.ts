const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 5;
const MAX_KEYS = 10000;

function createThrottle(limit = LIMIT, windowMs = WINDOW_MS) {
  const failures = new Map<string, number[]>();
  const recent = (key: string) => (failures.get(key) ?? []).filter((at) => at > Date.now() - windowMs);
  return {
    blocked: (key: string) => recent(key).length >= limit,
    fail: (key: string) => {
      if (failures.size > MAX_KEYS) failures.clear();
      failures.set(key, [...recent(key), Date.now()]);
    },
    reset: (key: string) => void failures.delete(key),
    resetPrefix: (prefix: string) => {
      for (const key of [...failures.keys()]) if (key.startsWith(prefix)) failures.delete(key);
    },
  };
}

export { createThrottle };
