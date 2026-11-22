import type { App } from "obsidian";
// Obsidian exposes these operations on desktop and mobile. Feature detection
// leaves startup verification available if a host has no transient toggles.
interface PluginHost {
  plugins?: Record<string, unknown>;
  disablePlugin?: (id: string) => Promise<void>;
  enablePlugin?: (id: string) => Promise<void>;
  isEnabled?: () => boolean;
}
export async function withPluginData(
  app: App,
  self: string,
  path: string,
  write: () => Promise<void>,
) {
  const id = /^plugins\/([^/]+)\/data\.json$/.exec(path)?.[1];
  const host = (app as App & { plugins?: PluginHost }).plugins;
  if (
    !id ||
    id === self ||
    !host?.plugins?.[id] ||
    typeof host.disablePlugin !== "function" ||
    typeof host.enablePlugin !== "function" ||
    host.isEnabled?.() === false
  ) {
    await write();
    return;
  }
  await host.disablePlugin(id);
  try {
    await write();
  } finally {
    await host.enablePlugin(id);
  }
}
export function reloadApp(app: App) {
  const commands = (
    app as App & { commands?: { executeCommandById?: (id: string) => boolean } }
  ).commands;
  if (!commands?.executeCommandById?.("app:reload"))
    throw Error("reloadUnavailable");
}
