// Upload URLs authorize writing a specific object. Keep them encrypted on this
// device. Waiting for a strict transaction commit before sending the first PUT
// also protects the checkpoint if the Obsidian process is killed immediately.
export class DeviceDriveSessions {
  private database?: Promise<IDBDatabase>;
  private key?: Promise<CryptoKey>;

  private open() {
    if (!this.database)
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("sync-studio-drive-transfers", 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("keys");
          request.result.createObjectStore("sessions");
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            this.database = undefined;
            this.key = undefined;
          };
          resolve(db);
        };
        request.onerror = () => {
          this.database = undefined;
          reject(request.error);
        };
      });
    return this.database;
  }

  private encryptionKey() {
    this.key ??= this.loadKey().catch((error) => {
      this.key = undefined;
      throw error;
    });
    return this.key;
  }

  private async loadKey(): Promise<CryptoKey> {
    const db = await this.open();
    const candidate = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    return new Promise((resolve, reject) => {
      const tx = db.transaction("keys", "readwrite", { durability: "strict" });
      const store = tx.objectStore("keys");
      const read = store.get("device");
      let selected: CryptoKey;
      read.onsuccess = () => {
        selected = read.result ?? candidate;
        if (!read.result) store.put(selected, "device");
      };
      tx.oncomplete = () => resolve(selected);
      tx.onabort = () => reject(tx.error ?? Error("state"));
    });
  }

  async get(id: string): Promise<string | null> {
    const db = await this.open();
    const entry = await new Promise<
      | { iv: Uint8Array<ArrayBuffer>; cipher: ArrayBuffer; expires: number }
      | undefined
    >((resolve, reject) => {
      const request = db
        .transaction("sessions")
        .objectStore("sessions")
        .get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!entry) return null;
    if (entry.expires <= Date.now()) {
      await this.set(id, null);
      return null;
    }
    const bytes = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: entry.iv,
        additionalData: new TextEncoder().encode(id),
      },
      await this.encryptionKey(),
      entry.cipher,
    );
    return new TextDecoder().decode(bytes);
  }

  async set(
    id: string,
    value: string | null,
    expires = Date.now() + 7 * 86400000,
  ) {
    const db = await this.open();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const entry =
      value === null
        ? null
        : {
            iv,
            expires,
            cipher: await crypto.subtle.encrypt(
              {
                name: "AES-GCM",
                iv,
                additionalData: new TextEncoder().encode(id),
              },
              await this.encryptionKey(),
              new TextEncoder().encode(value),
            ),
          };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sessions", "readwrite", {
          durability: "strict",
        }),
        store = tx.objectStore("sessions");
      if (entry) store.put(entry, id);
      else store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? Error("state"));
    });
  }
}
