import { mkdir, open, readFile, rename, lstat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { sha } from "../core/paths";
export async function syncDirectory(dir: string) {
  try {
    const handle = await open(dir, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (
      process.platform === "win32" &&
      ["EPERM", "EISDIR", "EINVAL", "EACCES"].includes(code || "")
    )
      return;
    throw e;
  }
}
/** New, small durable store: intent and confirmation share one atomic state envelope. */
export class StateFile<T> {
  private chain: Promise<void> = Promise.resolve();
  private dir: string;
  private file: string;
  constructor(vaultRoot: string) {
    this.dir = join(vaultRoot, ".sync-studio");
    this.file = join(this.dir, "state-v1.json");
  }
  private async directory() {
    await mkdir(this.dir, { recursive: true });
    if ((await lstat(this.dir)).isSymbolicLink())
      throw Error("Служебная папка не может быть символической ссылкой");
  }
  async read(fallback: T): Promise<T> {
    await this.directory();
    let raw: string;
    try {
      if ((await lstat(this.file)).isSymbolicLink())
        throw Error("Файл состояния не может быть ссылкой");
      raw = await readFile(this.file, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
      throw e;
    }
    const envelope = JSON.parse(raw);
    if (
      envelope.schema !== 1 ||
      typeof envelope.payload !== "string" ||
      sha(Buffer.from(envelope.payload)) !== envelope.sha256
    )
      throw Error(
        "Файл состояния повреждён. Автоматическое создание пустой истории запрещено.",
      );
    return JSON.parse(envelope.payload) as T;
  }
  write(data: T): Promise<void> {
    const payload = JSON.stringify(data);
    const envelope = JSON.stringify({
      schema: 1,
      sha256: sha(Buffer.from(payload)),
      payload,
    });
    const run = async () => {
      await this.directory();
      const temp = join(this.dir, crypto.randomUUID() + ".tmp");
      const handle = await open(temp, "wx", 0o600);
      try {
        await handle.writeFile(envelope);
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await rename(temp, this.file);
        await syncDirectory(this.dir);
      } catch (e) {
        await unlink(temp).catch(() => {});
        throw e;
      }
    };
    const result = this.chain.then(run);
    this.chain = result.catch(() => {});
    return result;
  }
}
