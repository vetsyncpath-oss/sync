import test from "node:test";
import assert from "node:assert/strict";
import {
  VamGate,
  guardedStore,
  readScope,
  type ManagerContext,
  type VamBridge,
} from "../src/vam-gate";
import { selectionReason } from "../src/classifier";
import { deliveryBytes } from "../src/json-overlay";

test("SDK 6 leases require same vault manager, current bundle and live unexpired grant", () => {
  const scope = { tenantId: "org", bundleId: "notes" };
  let until = Date.now() + 60000,
    granted = true,
    registrations = 0;
  const listeners = new Set<() => void>();
  const api: VamBridge = {
    version: "6",
    access(q) {
      assert.deepEqual(q, { ...context.scope, capability: "sync.run" });
      return {
        status: granted ? "granted" : "pending",
        validUntil: until,
        reason: granted ? null : "device-not-approved",
      };
    },
    register(id) {
      assert.equal(id, "refsync");
      registrations++;
    },
    subscribe(cb) {
      listeners.add(cb);
      cb();
      return () => listeners.delete(cb);
    },
  };
  let context: ManagerContext = {};
  const g = new VamGate(
    () => context,
    () => {},
  );
  assert.throws(() => g.lease(), /vamMissing/);
  context = { manager: {}, scope, bridge: api };

  const lease = g.lease();
  lease();
  assert.equal(registrations, 1);
  granted = false;
  for (const cb of listeners) cb();
  assert.throws(lease, /vamDevice/);
  granted = true;
  assert.throws(lease, /vamSessionChanged/);
  const next = g.lease();
  until = Date.now() - 1;
  assert.throws(next, /vamExpired/);
  until = Date.now() + 60000;
  const formerScopeLease = g.lease();
  context.scope = { ...scope, tenantId: "another" };
  g.require();
  assert.throws(formerScopeLease, /vamSessionChanged/);
  const otherScopeLease = g.lease();
  context.scope = undefined;
  assert.throws(otherScopeLease, /vamScope/);
  context.scope = { ...scope, bundleId: "" };
  assert.throws(() => g.require(), /vamScope/);
  context.scope = scope;
  context.bridge = { ...api, version: "5" };
  assert.throws(() => g.require(), /vamProtocol/);
  context = {};
  assert.throws(() => g.require(), /vamMissing/);
  assert.equal(listeners.size, 0);
  context = { manager: {}, scope, bridge: api };
  g.require();
  g.dispose();
  assert.throws(() => g.require(), /vamMissing/);
  assert.equal(listeners.size, 0);
  assert.deepEqual(readScope({ ...scope, defaultPassword: "dummy" }), scope);
});
test("a captured provider and chunk reader recheck permission at each operation", async () => {
  let authorized = true,
    reads = 0;
  const file = guardedStore(
    {
      chunkSource: () => ({
        size: 1,
        read: async () => {
          reads++;
          return new ArrayBuffer(1);
        },
      }),
    } as unknown as import("../src/model").StorageProvider,
    () => {
      if (!authorized) throw Error("denied");
    },
  );
  const source = file.chunkSource!("doc", 1)!;
  await source.read(0, 1);
  authorized = false;
  assert.throws(() => source.read(0, 1), /denied/);
  assert.throws(() => file.chunkSource!("doc", 1), /denied/);
  assert.equal(reads, 1);
});
test("managed plugin is protected in both scopes and retains destination membership", () => {
  const id = "vault-access-manager";
  for (const [path, scope] of [
    ["Cfg/plugins/" + id + "/main.js", "content"],
    ["plugins/" + id + "/main.js", "settings"],
  ] as const)
    assert.equal(
      selectionReason(path, scope, "Cfg", "refsync", false, undefined, {
        config: true,
        hidden: true,
        rules: [],
      }),
      "protected",
    );
  const list = (ids: string[]) =>
    new TextEncoder().encode(JSON.stringify(ids)).buffer;
  const project = (from: string[], to: string[]) =>
    JSON.parse(
      new TextDecoder().decode(
        deliveryBytes(
          "community-plugins.json",
          list(from),
          { self: "refsync", rules: [], blocked: [] },
          list(to),
          true,
        ),
      ),
    );
  assert.deepEqual(project([], [id]), ["refsync", id]);
  assert.deepEqual(project([id], []), ["refsync"]);
});

test("publish permission is scoped and rechecked after a review stays open", () => {
  let publish = true;
  const gate = new VamGate(() => ({
    manager, scope: {tenantId:"org",bundleId:"notes"}, bridge
  }), () => {});
  const manager = {}, bridge: VamBridge = {version:"6",register(){},subscribe(){return () => {};},
    access(q){ return {status:q.capability === "sync.publish" && !publish ? "blocked" : "granted", reason:null, validUntil:Date.now()+10000}; }};
  const apply = gate.lease(true);
  publish = false;
  gate.require();
  assert.throws(apply,/vamPublishBlocked/);
  gate.dispose();
});
