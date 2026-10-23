type Environment = Record<string, string | undefined>;

/** Dedicated local development only; deployment/CI markers fail closed. */
export function isLocalDevelopmentEnvironment(env: Environment): boolean {
  return env.NODE_ENV === "development" && !env.CI && !env.VERCEL && !env.VERCEL_ENV;
}
export function isLocalDeveloperHost(host: string | null): boolean {
  const match = host?.match(/^(localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?$/i);
  return !!match && (match[2] === undefined || Number(match[2]) > 0 && Number(match[2]) <= 65535);
}
export function isLocalDeveloperRequest(request: Request): boolean {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  if (!isLocalDeveloperHost(host)) return false;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded && !forwarded.split(",").every(peer => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer.trim()))) return false;
  const realPeer = request.headers.get("x-real-ip");
  if (realPeer && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(realPeer)) return false;
  const forwardedHost = request.headers.get("x-forwarded-host");
  return !request.headers.has("forwarded") && (!forwardedHost || forwardedHost === host);
}
