function positiveInt(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`expected a positive integer, got "${value}"`);
  return n;
}

// The v1 API is mounted only when EVENTPASS_TOKEN_KEY is set. Credential and scanner
// secrets are HMAC'd with this key, so it must be a real secret that stays out of git.
export function loadConfig(env = process.env) {
  const tokenKey = env.EVENTPASS_TOKEN_KEY || null;
  if (tokenKey && tokenKey.length < 32) {
    throw new Error("EVENTPASS_TOKEN_KEY must be at least 32 characters");
  }
  return {
    tokenKey,
    sessionTtlHours: positiveInt(env.EVENTPASS_SESSION_TTL_HOURS, 12),
    loginLimitPer15Min: positiveInt(env.EVENTPASS_LOGIN_LIMIT, 20),
    apiLimitPerMinute: positiveInt(env.EVENTPASS_API_LIMIT, 600),
    cookieSecure: env.EVENTPASS_COOKIE_SECURE !== "false",
  };
}
