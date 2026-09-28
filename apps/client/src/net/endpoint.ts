import type { EndpointSettings } from '@colyseus/sdk';

/**
 * Same-origin endpoint so the game works behind any reverse proxy (wss:// under https).
 * In dev, Vite runs on another port, so talk to the game server on :2567 directly.
 */
export function colyseusEndpoint(): EndpointSettings {
  const secure = location.protocol === 'https:';
  if (import.meta.env.DEV) return { hostname: location.hostname, port: 2567, secure };
  const port = location.port ? Number(location.port) : secure ? 443 : 80;
  return { hostname: location.hostname, port, secure };
}
