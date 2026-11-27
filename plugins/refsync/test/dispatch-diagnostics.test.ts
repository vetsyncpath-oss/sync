import assert from "node:assert/strict";
import test from "node:test";
import { DispatchDiagnostics } from "../src/dispatch-diagnostics";

test("paired diagnostics bound events, discard free text, and count distinct current failures", () => {
  const d = new DispatchDiagnostics(() => {});
  const id = "C:/private/vault/note.md";
  const profiles = [{ id }, { id: "second" }];
  for (let i = 0; i < 40; i++) {
    d.start();
    d.fail(id, Error(id));
  }
  d.start();
  d.fail("second", Error("referenceChanged"));
  let snapshot = d.snapshot(profiles);
  assert.equal(snapshot.events.length, 32);
  assert.equal(new Set(snapshot.events.map((e) => e.eventId)).size, 32);
  assert.equal(snapshot.failedProfiles, 2);
  assert.equal(snapshot.lastErrorCode, "referenceChanged");
  assert.equal(snapshot.lastSuccessAt, undefined);
  assert.equal(JSON.stringify(snapshot).includes(id), false);
  snapshot.events[0].code = "partial";
  assert.notEqual(d.snapshot(profiles).events[0].code, "partial");
  d.finish("second", true);
  assert.equal(d.snapshot(profiles).lastSuccessAt, undefined);
  assert.equal(d.snapshot([{ id: "second" }]).failedProfiles, 0);
  d.finish(id, false);
  snapshot = d.snapshot(profiles);
  assert.equal(snapshot.failedProfiles, 0);
  assert.ok(snapshot.lastAttemptAt && snapshot.lastSuccessAt);
});
