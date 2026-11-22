import { category, inScope, type ConfigScope } from "./config-scope";
import { hash, type StorageProvider } from "./model";
import { deliveryBytes, settingsHash, type Projection } from "./json-overlay";
import { RunBudget } from "./runtime";
import type { ApplyJournal, Transaction } from "./state";
export const needsReload = (p: string) =>
  !["snippets", "data"].includes(category(p) ?? "core");
export interface VerifyReport {
  id: string;
  repaired: number;
  unresolved: string[];
}
export async function verifySettings(
  journal: ApplyJournal,
  target: (t: Transaction) => StorageProvider,
  current: (t: Transaction) => ConfigScope | undefined,
  budget = new RunBudget(),
) {
  const reports: VerifyReport[] = [],
    covered = new Set<string>();
  const transactions = (await journal.transactions())
    .filter((t) => t.settings?.local)
    .sort((a, b) => b.settings!.at - a.settings!.at);
  for (const t of transactions) {
    if (
      !(await journal.disk.has(t.id + "/done")) ||
      (await journal.disk.has(t.id + "/rolled-back"))
    )
      continue;
    const cfg = current(t),
      policy = t.settings!.projection,
      paths: number[] = [];
    const undone = await journal.disk.has(t.id + "/undo-start");
    for (const [i, step] of t.steps.entries()) {
      if (await journal.disk.has(t.id + "/skipped/" + i)) continue;
      const key = JSON.stringify([t.target, step.path]);
      if (covered.has(key)) continue;
      covered.add(key);
      if (!undone && cfg && inScope(step.path, cfg, false)) paths.push(i);
    }
    if (
      undone ||
      !cfg ||
      (await journal.disk.has(t.id + "/verified")) ||
      (await journal.disk.has(t.id + "/verify-failed"))
    )
      continue;
    const store = target(t),
      report: VerifyReport = { id: t.id, repaired: 0, unresolved: [] };
    const read = async (path: string) =>
      (await budget.io(() => store.stat(path)))
        ? await budget.io(() => store.download(path))
        : null;
    const equivalent = async (
      path: string,
      local: ArrayBuffer | null,
      expected: ArrayBuffer | null,
      projection: Projection,
    ) => {
      if (!local || !expected) return local === expected;
      try {
        return (
          (await settingsHash(path, local, projection)) ===
          (await settingsHash(path, expected, projection))
        );
      } catch {
        return false;
      }
    };
    for (const i of paths) {
      const step = t.steps[i],
        path = step.path,
        expected =
          step.action === "delete"
            ? null
            : await journal.disk.read(t.id + "/stage/" + i);
      if (expected && (await hash(expected)) !== step.digest)
        throw Error("incomplete");
      let ok = await equivalent(path, await read(path), expected, policy);
      for (let attempt = 1; !ok && attempt <= 2; attempt++) {
        const marker = t.id + "/verify/" + i + "/" + attempt;
        if (await journal.disk.has(marker)) continue;
        await journal.mark(marker);
        const fix = async () => {
          const old = await read(path);
          if (expected) {
            await budget.io(
              () =>
                store.upload(
                  path,
                  deliveryBytes(path, expected, policy, old),
                  step.mtime,
                ),
              false,
            );
          } else if (old) await budget.io(() => store.delete(path), false);
        };
        try {
          if (store.withFilePaused) await store.withFilePaused(path, fix);
          else await fix();
          report.repaired++;
        } catch (e) {
          budget.fence.check();
          if (attempt === 2) break;
        }
        ok = await equivalent(path, await read(path), expected, policy);
      }
      if (!ok) report.unresolved.push(path);
    }
    await journal.mark(
      t.id + (report.unresolved.length ? "/verify-failed" : "/verified"),
    );
    if (!report.unresolved.length) {
      await journal.disk.removeTree(t.id + "/stage");
      await journal.disk.removeTree(t.id + "/unchanged");
    }
    reports.push(report);
  }
  return reports;
}
