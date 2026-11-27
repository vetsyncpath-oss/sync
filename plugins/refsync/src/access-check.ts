import { errorKey } from "./i18n";
import { hash, type StorageProvider } from "./model";
export type AccessStep =
  "probeList" | "probeCreate" | "probeRead" | "probeReplace" | "probeDelete";
export interface AccessResult {
  steps: AccessStep[];
  failed?: AccessStep;
  error?: string;
  leftover?: string;
}
export async function testAccess(
  store: StorageProvider,
  write: boolean,
): Promise<AccessResult> {
  const result: AccessResult = { steps: [] };
  const name = "sync-studio-check-" + crypto.randomUUID() + ".txt";
  const encode = (n: number) => new TextEncoder().encode(name + " " + n).buffer;
  const one = encode(1),
    two = encode(2);
  let step: AccessStep = "probeList",
    attempted = false;
  try {
    await store.list("");
    result.steps.push(step);
    if (!write) return result;
    step = "probeCreate";
    if (await store.stat(name)) throw Error("collision");
    attempted = true;
    await store.upload(name, one);
    result.steps.push(step);
    step = "probeRead";
    if ((await hash(await store.download(name))) !== (await hash(one)))
      throw Error("referenceChanged");
    result.steps.push(step);
    step = "probeReplace";
    await store.upload(name, two);
    if ((await hash(await store.download(name))) !== (await hash(two)))
      throw Error("referenceChanged");
    result.steps.push(step);
    step = "probeDelete";
    await store.delete(name);
    store.reset?.();
    if (await store.stat(name)) throw Error("incomplete");
    attempted = false;
    result.steps.push(step);
  } catch (e) {
    result.failed = step;
    result.error = e instanceof Error ? errorKey(e.message) : "failed";
    if (attempted)
      try {
        store.reset?.();
        if (await store.stat(name)) {
          const digest = await hash(await store.download(name));
          if (digest !== (await hash(one)) && digest !== (await hash(two)))
            throw Error("referenceChanged");
          await store.delete(name);
          store.reset?.();
          if (await store.stat(name)) throw Error("incomplete");
        }
      } catch {
        result.leftover = name;
      }
  }
  return result;
}
export function describeAccess(
  result: AccessResult,
  t: (key: string) => string,
) {
  return [
    ...result.steps.map((s) => "✓ " + t(s)),
    ...(result.failed
      ? ["× " + t(result.failed) + " · " + t(result.error ?? "failed")]
      : []),
    ...(result.leftover ? [t("probeRemaining") + " " + result.leftover] : []),
  ].join(" · ");
}
