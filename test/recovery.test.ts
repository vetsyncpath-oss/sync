import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recover } from "../src/core/recovery";
import { policyKey } from "../src/core/planner";
import {
  newProfile,
  type FileInfo,
  type PendingOperation,
  type Pair,
} from "../src/core/model";
import { StateFile } from "../src/adapters/state-file";
const file = (hash: string): FileInfo => ({
  path: "a.md",
  hash,
  version: hash,
  size: 10,
});
const pending = (
  action: PendingOperation["operation"]["action"] = "download",
): PendingOperation => ({
  runId: "run",
  identity: "same",
  direction: "pull",
  policyKey: policyKey(newProfile()),
  operation: {
    id: "op",
    path: "a.md",
    action,
    reason: "test",
    local: file("local-old"),
    remote: file("remote-old"),
  },
});
test("crash after write: recovery does not acknowledge a later remote edit", () => {
  const p = pending();
  const out = recover(p, "same", file("remote-old"), file("remote-new"), false);
  assert.equal(out.kind, "commit");
  if (out.kind === "commit") {
    assert.equal(out.pair.local, "remote-old");
    assert.equal(out.pair.remote, "remote-old");
  }
});
test("crash before write with later source edit: replan, do not mutate", () => {
  assert.equal(
    recover(pending(), "same", file("local-old"), file("remote-new"), false)
      .kind,
    "retry",
  );
});
test("crash after receipt: preserve confirmed pair despite later changes on both sides", () => {
  const p = pending();
  p.result = {
    local: "remote-old",
    remote: "remote-old",
    policyKey: p.policyKey,
  };
  const out = recover(p, "same", file("local-new"), file("remote-new"), false);
  assert.deepEqual(out, { kind: "commit", pair: p.result });
});
test("unknown target after interrupted mutation blocks rather than accepting divergence", () => {
  assert.equal(
    recover(pending(), "same", file("unknown"), file("remote-old"), false).kind,
    "blocked",
  );
});
test("changed account or folder cannot complete old pending operation", () => {
  assert.equal(
    recover(
      pending(),
      "different",
      file("remote-old"),
      file("remote-old"),
      true,
    ).kind,
    "blocked",
  );
});
test("keep-both recovery requires preserved original copy after mutation", () => {
  const p = pending("keep-both");
  assert.equal(
    recover(p, "same", file("remote-old"), file("remote-old"), false).kind,
    "blocked",
  );
  assert.equal(
    recover(p, "same", file("remote-old"), file("remote-old"), true).kind,
    "commit",
  );
});
test("keep-both cancelled before backup can be retried", () => {
  assert.equal(
    recover(
      pending("keep-both"),
      "same",
      file("local-old"),
      file("remote-old"),
      false,
    ).kind,
    "retry",
  );
});
test("interrupted deletion records tombstone but not newly recreated source", () => {
  const p = pending("delete-local");
  p.operation.remote = undefined;
  const out = recover(p, "same", undefined, file("recreated"), false);
  assert.equal(out.kind, "commit");
  if (out.kind === "commit") {
    assert.equal(out.pair.local, undefined);
    assert.equal(out.pair.remote, undefined);
  }
});
test("push recovery uses stored direction even if live profile could change", () => {
  const p = pending("keep-both");
  p.direction = "push";
  const out = recover(p, "same", file("local-new"), file("local-old"), true);
  assert.equal(out.kind, "commit");
  if (out.kind === "commit") assert.equal(out.pair.local, "local-old");
});
test("state file serializes concurrent checkpoints and rejects corruption", async () => {
  const root = await mkdtemp(join(tmpdir(), "studio-state-"));
  try {
    const store = new StateFile<{ step: number }>(root);
    assert.deepEqual(await store.read({ step: 0 }), { step: 0 });
    await Promise.all([store.write({ step: 1 }), store.write({ step: 2 })]);
    assert.deepEqual(await store.read({ step: 0 }), { step: 2 });
    const name = join(root, ".sync-studio/state-v1.json");
    const data = JSON.parse(await readFile(name, "utf8"));
    data.payload = '{"step":99}';
    await writeFile(name, JSON.stringify(data));
    await assert.rejects(() => store.read({ step: 0 }), /повреждён/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
