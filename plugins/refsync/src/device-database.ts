// IndexedDB commits each baseline atomically and avoids the Web Storage string quota.
import type { Baseline } from "./model";
export class DeviceDatabase {
  private opening?: Promise<IDBDatabase>;
  private open() {
    return (this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("sync-studio-device-state", 2);
      req.onupgradeneeded = () => {
        for (const name of ["baselines", "digests"])
          if (!req.result.objectStoreNames.contains(name))
            req.result.createObjectStore(name);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        this.opening = undefined;
        reject(req.error);
      };
    }));
  }
  async readDigests(
    device: string,
  ): Promise<[string, { version: string; hash: string }][]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("digests"),
        r = tx
          .objectStore("digests")
          .getAll(IDBKeyRange.bound([device, ""], [device, []]), 100000);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async writeDigests(
    device: string,
    changes: Map<string, { version: string; hash: string } | null>,
  ) {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("digests", "readwrite"),
        s = tx.objectStore("digests");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? Error("state"));
      for (const [key, value] of changes)
        if (value) s.put([key, value], [device, key]);
        else s.delete([device, key]);
    });
  }
  async get(key: string): Promise<Baseline | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("baselines"),
        r = tx.objectStore("baselines").get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async put(key: string, b: Baseline) {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("baselines", "readwrite");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? Error("state"));
      tx.objectStore("baselines").put(b, key);
    });
  }
}
