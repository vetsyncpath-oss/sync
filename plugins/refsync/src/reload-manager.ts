import type { ConfigScope } from "./config-scope";
export interface ReloadRequest {
  paths: string[];
  policy: ConfigScope["reload"];
  idleSeconds: number;
  at: number;
}
// Reload attempts are persisted before calling the host, including failed requests.
export function canAutoReload(history: number[], now = Date.now()) {
  const recent = history.filter((v) => v > now - 3600000);
  return recent.length < 2 && recent.every((v) => v <= now - 300000);
}
