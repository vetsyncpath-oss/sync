// Values in this report cross the plugin boundary. File paths, profile IDs,
// provider responses and raw errors belong only in Sync Studio's local journal.
const errorCodes = new Set([
  "stopped",
  "busy",
  "invalid",
  "invalidConfig",
  "overlap",
  "readonly",
  "cloudRecovery",
  "incomplete",
  "collision",
  "referenceChanged",
  "vamSessionChanged",
  "vamExpired",
  "vamLogin",
  "vamBlocked",
  "vamMissing",
  "vamPending",
  "vamDevice",
  "vamOffline",
  "vamScope",
  "vamProtocol",
]);
export type DispatchEvent = {
  eventId: string;
  at: number;
  code: "started" | "completed" | "partial" | "failed";
  errorCode?: string;
};
export class DispatchDiagnostics {
  private events: DispatchEvent[] = [];
  private failed = new Set<string>();
  private lastAttemptAt?: number;
  private lastSuccessAt?: number;
  private lastErrorCode?: string;

  constructor(private changed: () => void) {}
  private record(code: DispatchEvent["code"], errorCode?: string) {
    const at = Date.now();
    this.events.push({
      eventId: crypto.randomUUID(),
      at,
      code,
      ...(errorCode && { errorCode }),
    });
    if (this.events.length > 32) this.events.shift();
    this.changed();
    return at;
  }
  start() {
    this.lastAttemptAt = this.record("started");
  }
  finish(profile: string, partial: boolean) {
    this.failed.delete(profile);
    const at = this.record(partial ? "partial" : "completed");
    if (!partial) this.lastSuccessAt = at;
  }
  fail(profile: string, cause: unknown) {
    this.failed.add(profile);
    this.lastErrorCode =
      cause instanceof Error && errorCodes.has(cause.message)
        ? cause.message
        : "failed";
    this.record("failed", this.lastErrorCode);
  }
  snapshot(profiles: readonly { id: string }[]) {
    return {
      lastAttemptAt: this.lastAttemptAt,
      lastSuccessAt: this.lastSuccessAt,
      lastErrorCode: this.lastErrorCode,
      failedProfiles: profiles.reduce(
        (n, p) => n + Number(this.failed.has(p.id)),
        0,
      ),
      events: this.events.map((e) => ({ ...e })),
    };
  }
}
