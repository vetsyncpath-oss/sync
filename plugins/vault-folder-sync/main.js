"use strict";

// src/public-sources.js
var import_obsidian = require("obsidian");

// ../../src/adapters/http-response.ts
async function json(http, url, opts = {}) {
  const r = await http.fetch(url, opts);
  if (r.status < 200 || r.status >= 300) {
    let reason = "";
    try {
      const body = JSON.parse(await r.text());
      const candidate = typeof body.error === "string" ? body.error : body.error?.errors?.[0]?.reason || body.error?.status;
      if (typeof candidate === "string" && /^[a-zA-Z0-9_.-]{1,100}$/.test(candidate))
        reason = " (" + candidate + ")";
    } catch {
    }
    const hint = r.status === 401 ? " Переподключите аккаунт: токен недействителен." : r.status === 403 ? " Проверьте права доступа и включение API сервиса." : r.status === 404 ? " Проверьте путь/ID папки и доступ аккаунта." : r.status === 429 ? " Лимит запросов сервиса. Повторите позже." : " Повторите проверку подключения.";
    throw Object.assign(
      Error(new URL(url).hostname + ": HTTP " + r.status + reason + hint),
      { status: r.status }
    );
  }
  try {
    return JSON.parse(await r.text());
  } catch {
    throw Error("Некорректный JSON API");
  }
}
async function bytes(http, url, opts = {}) {
  const r = await http.fetch(url, opts);
  if (r.status !== 200)
    throw Object.assign(Error("Скачивание: HTTP " + r.status), {
      status: r.status
    });
  return new Uint8Array(await r.arrayBuffer());
}

// node_modules/@noble/hashes/esm/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
function rotl(word, shift) {
  return word << shift | word >>> 32 - shift >>> 0;
}
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes2) {
  abytes(bytes2);
  if (hasHexBuiltin)
    return bytes2.toHex();
  let hex = "";
  for (let i = 0; i < bytes2.length; i++) {
    hex += hexes[bytes2[i]];
  }
  return hex;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
var Hash = class {
};
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}

// node_modules/@noble/hashes/esm/_md.js
function setBigUint64(view, byteOffset, value, isLE) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE);
  const _32n = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE ? 4 : 0;
  const l = isLE ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE);
  view.setUint32(byteOffset + l, wl, isLE);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class extends Hash {
  constructor(blockLen, outputLen, padOffset, isLE) {
    super();
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// node_modules/@noble/hashes/esm/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA256 = class extends HashMD {
  constructor(outputLen = 32) {
    super(64, outputLen, 8, false);
    this.A = SHA256_IV[0] | 0;
    this.B = SHA256_IV[1] | 0;
    this.C = SHA256_IV[2] | 0;
    this.D = SHA256_IV[3] | 0;
    this.E = SHA256_IV[4] | 0;
    this.F = SHA256_IV[5] | 0;
    this.G = SHA256_IV[6] | 0;
    this.H = SHA256_IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset2) {
    for (let i = 0; i < 16; i++, offset2 += 4)
      SHA256_W[i] = view.getUint32(offset2, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var sha256 = /* @__PURE__ */ createHasher(() => new SHA256());

// node_modules/@noble/hashes/esm/sha256.js
var sha2562 = sha256;

// node_modules/@noble/hashes/esm/legacy.js
var SHA1_IV = /* @__PURE__ */ Uint32Array.from([
  1732584193,
  4023233417,
  2562383102,
  271733878,
  3285377520
]);
var SHA1_W = /* @__PURE__ */ new Uint32Array(80);
var SHA1 = class extends HashMD {
  constructor() {
    super(64, 20, 8, false);
    this.A = SHA1_IV[0] | 0;
    this.B = SHA1_IV[1] | 0;
    this.C = SHA1_IV[2] | 0;
    this.D = SHA1_IV[3] | 0;
    this.E = SHA1_IV[4] | 0;
  }
  get() {
    const { A, B, C, D, E } = this;
    return [A, B, C, D, E];
  }
  set(A, B, C, D, E) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
  }
  process(view, offset2) {
    for (let i = 0; i < 16; i++, offset2 += 4)
      SHA1_W[i] = view.getUint32(offset2, false);
    for (let i = 16; i < 80; i++)
      SHA1_W[i] = rotl(SHA1_W[i - 3] ^ SHA1_W[i - 8] ^ SHA1_W[i - 14] ^ SHA1_W[i - 16], 1);
    let { A, B, C, D, E } = this;
    for (let i = 0; i < 80; i++) {
      let F, K2;
      if (i < 20) {
        F = Chi(B, C, D);
        K2 = 1518500249;
      } else if (i < 40) {
        F = B ^ C ^ D;
        K2 = 1859775393;
      } else if (i < 60) {
        F = Maj(B, C, D);
        K2 = 2400959708;
      } else {
        F = B ^ C ^ D;
        K2 = 3395469782;
      }
      const T = rotl(A, 5) + F + E + K2 + SHA1_W[i] | 0;
      E = D;
      D = C;
      C = rotl(B, 30);
      B = A;
      A = T;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    this.set(A, B, C, D, E);
  }
  roundClean() {
    clean(SHA1_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var sha1 = /* @__PURE__ */ createHasher(() => new SHA1());
var p32 = /* @__PURE__ */ Math.pow(2, 32);
var K = /* @__PURE__ */ Array.from({ length: 64 }, (_, i) => Math.floor(p32 * Math.abs(Math.sin(i + 1))));
var MD5_IV = /* @__PURE__ */ SHA1_IV.slice(0, 4);
var MD5_W = /* @__PURE__ */ new Uint32Array(16);
var MD5 = class extends HashMD {
  constructor() {
    super(64, 16, 8, true);
    this.A = MD5_IV[0] | 0;
    this.B = MD5_IV[1] | 0;
    this.C = MD5_IV[2] | 0;
    this.D = MD5_IV[3] | 0;
  }
  get() {
    const { A, B, C, D } = this;
    return [A, B, C, D];
  }
  set(A, B, C, D) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
  }
  process(view, offset2) {
    for (let i = 0; i < 16; i++, offset2 += 4)
      MD5_W[i] = view.getUint32(offset2, true);
    let { A, B, C, D } = this;
    for (let i = 0; i < 64; i++) {
      let F, g, s;
      if (i < 16) {
        F = Chi(B, C, D);
        g = i;
        s = [7, 12, 17, 22];
      } else if (i < 32) {
        F = Chi(D, B, C);
        g = (5 * i + 1) % 16;
        s = [5, 9, 14, 20];
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
        s = [4, 11, 16, 23];
      } else {
        F = C ^ (B | ~D);
        g = 7 * i % 16;
        s = [6, 10, 15, 21];
      }
      F = F + A + K[i] + MD5_W[g];
      A = D;
      D = C;
      C = B;
      B = B + rotl(F, s[i % 4]);
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    this.set(A, B, C, D);
  }
  roundClean() {
    clean(MD5_W);
  }
  destroy() {
    this.set(0, 0, 0, 0);
    clean(this.buffer);
  }
};
var md5 = /* @__PURE__ */ createHasher(() => new MD5());

// node_modules/@noble/hashes/esm/sha1.js
var sha12 = sha1;

// src/portable-hash.js
function createHash(name) {
  const algorithm = { sha256: sha2562, md5, sha1: sha12 }[name];
  if (!algorithm) throw new Error("Unsupported hash: " + name);
  const state = algorithm.create();
  return {
    update(bytes2) {
      state.update(bytes2);
      return this;
    },
    digest(encoding) {
      if (encoding !== "hex") throw new Error("Unsupported digest encoding");
      return bytesToHex(state.digest());
    }
  };
}

// src/portable-timer.js
function setTimeout2(ms, value, { signal } = {}) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve(value);
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

// ../../src/sources/drive-upload.ts
var CHUNK = 8 * 1024 * 1024;
function driveMime(p) {
  const types = {
    md: "text/markdown",
    txt: "text/plain",
    json: "application/json",
    canvas: "application/json",
    base: "application/json",
    css: "text/css",
    js: "text/javascript",
    html: "text/html",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    svg: "image/svg+xml",
    gif: "image/gif",
    webp: "image/webp",
    mp3: "audio/mpeg",
    mp4: "video/mp4"
  };
  return types[p.split(".").at(-1).toLowerCase()] || "application/octet-stream";
}
function failure(r) {
  throw Object.assign(Error("Загрузка Drive: HTTP " + r.status), {
    status: r.status
  });
}
function offset(r, total) {
  if (!r.headers.range) return 0;
  const m = /^bytes=0-(\d+)$/.exec(r.headers.range);
  const n = m ? Number(m[1]) + 1 : NaN;
  if (!Number.isSafeInteger(n) || n < 0 || n >= total)
    throw Error("Некорректное подтверждение диапазона Drive");
  return n;
}
async function driveUpload(http, url, method, metadata, data, options) {
  const total = data.length;
  const start = await http.fetch(url, {
    ...options,
    method,
    body: JSON.stringify(metadata),
    headers: {
      ...options.headers,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(total),
      "X-Upload-Content-Type": String(
        metadata.mimeType || "application/octet-stream"
      )
    }
  });
  if (start.status < 200 || start.status >= 300) failure(start);
  if (!start.headers.location)
    throw Error("Drive не вернул адрес сессии загрузки");
  const session = new URL(start.headers.location);
  if (session.origin !== "https://www.googleapis.com" || session.username || session.password || !session.pathname.startsWith("/upload/drive/v3/files"))
    throw Error("Недоверенный адрес сессии Drive");
  const send = (body, range) => http.fetch(session.href, {
    ...options,
    method: "PUT",
    body,
    redirect: "error",
    headers: {
      ...options.headers,
      "Content-Type": "application/octet-stream",
      "Content-Range": range
    }
  });
  const query = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      options.signal?.throwIfAborted();
      try {
        const r = await send(new Uint8Array(), `bytes */${total}`);
        if (r.status < 500 && r.status !== 429) return r;
      } catch (e) {
        options.signal?.throwIfAborted();
        if (attempt === 2) throw e;
      }
    }
    throw Error(
      "Не удалось проверить сессию Drive. Перепроверьте файлы перед повторным запуском."
    );
  };
  let at = 0, stalls = 0, interruptions = 0;
  while (true) {
    options.signal?.throwIfAborted();
    const end = Math.min(at + CHUNK, total);
    let r;
    try {
      r = await send(
        data.subarray(at, end),
        total ? `bytes ${at}-${end - 1}/${total}` : "bytes */0"
      );
      if (r.status >= 500 || r.status === 429) {
        if (++interruptions > 3) failure(r);
        r = await query();
      }
    } catch (e) {
      options.signal?.throwIfAborted();
      if (++interruptions > 3) throw e;
      r = await query();
    }
    if (r.status === 200 || r.status === 201) return JSON.parse(await r.text());
    if (r.status !== 308) failure(r);
    const next = offset(r, total);
    if (next < at || next > end)
      throw Error("Drive подтвердил неожиданный диапазон загрузки");
    if (next === at) {
      if (++stalls > 3) throw Error("Загрузка Drive не продвигается");
    } else stalls = 0;
    at = next;
  }
}

// ../../src/core/paths.ts
var sha = (b) => createHash("sha256").update(b).digest("hex");
function path(value, allowEmpty = false) {
  const v = value.replace(/\/$/, "");
  if (!v && allowEmpty) return "";
  if (!v || v.startsWith("/") || v.includes("\\") || /[\x00-\x1f<>:"|?*]/.test(v) || v.split("/").some(
    (s) => !s || s === "." || s === ".." || /[. ]$/.test(s) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(s)
  ))
    throw Error("Недопустимый относительный путь: " + value);
  return v;
}
var join = (a, b) => a ? a + "/" + b : b;
var under = (p, root) => !root || p === root || p.startsWith(root + "/");
var PathCollision = class extends Error {
  constructor(message2, paths) {
    super(message2);
    this.paths = paths;
    this.name = "PathCollision";
  }
};
function uniquePaths(paths) {
  const seen = /* @__PURE__ */ new Map();
  for (const p of paths) {
    path(p);
    const key = p.normalize("NFC").toLowerCase();
    if (seen.has(key)) {
      const first = seen.get(key);
      throw new PathCollision(
        first === p ? `Коллизия: несколько объектов имеют один путь «${p}». В Google Drive допустимы одинаковые имена, в vault — нет. Переименуйте дубль в Drive или исключите этот путь из профиля.` : `Коллизия регистра/Unicode: «${first}» и «${p}». Переименуйте один из объектов или исключите путь из профиля.`,
        [.../* @__PURE__ */ new Set([first, p])]
      );
    }
    seen.set(key, p);
  }
}

// ../../src/sources/remotes.ts
var hashCache = /* @__PURE__ */ new Map();
var FOLDER = "application/vnd.google-apps.folder";
var fields = "id,name,mimeType,resourceKey,size,modifiedTime,version,sha256Checksum,md5Checksum,trashed,capabilities(canEdit,canDownload,canAddChildren)";
function driveRoot(value) {
  const v = value.trim();
  if (!v.startsWith("https://")) {
    if (!/^[\w-]+$/.test(v))
      throw Error("Укажите ID папки Google Drive или ссылку");
    return v;
  }
  const u = new URL(v);
  if (u.hostname !== "drive.google.com")
    throw Error("Ожидается ссылка drive.google.com");
  const id = u.pathname.match(/\/folders\/([\w-]+)/)?.[1] || u.searchParams.get("id");
  if (!id || !/^[\w-]+$/.test(id)) throw Error("Ссылка не содержит folder ID");
  return id;
}
var DriveStore = class {
  constructor(http, root, limit, publicKey, identityAccount = "", rules, duplicates = "error") {
    this.http = http;
    this.limit = limit;
    this.rules = rules;
    this.duplicates = duplicates;
    this.root = driveRoot(root);
    this.key = publicKey;
    const rootKey = root.startsWith("https:") ? new URL(root).searchParams.get("resourcekey") : "";
    if (rootKey) this.resourceKeys.set(this.root, rootKey);
    this.writable = !publicKey && duplicates === "error";
    this.trashSupported = this.writable;
    this.identity = "drive:" + identityAccount + ":" + this.root;
  }
  identity;
  writable;
  trashSupported;
  root;
  folders = /* @__PURE__ */ new Map();
  key;
  resourceKeys = /* @__PURE__ */ new Map();
  url(suffix, query = {}, upload = false) {
    const u = new URL(
      "https://www.googleapis.com/" + (upload ? "upload/" : "") + "drive/v3/" + suffix
    );
    for (const [k, v] of Object.entries({
      ...query,
      supportsAllDrives: "true",
      ...this.key ? { key: this.key } : {}
    }))
      u.searchParams.set(k, v);
    return u.href;
  }
  opts(signal, extra = {}, id = this.root) {
    const key = this.resourceKeys.get(id);
    return {
      ...extra,
      signal,
      headers: {
        ...key ? { "X-Goog-Drive-Resource-Keys": `${id}/${key}` } : {},
        ...extra.headers
      }
    };
  }
  async inspect(id, signal) {
    return json(
      this.http,
      this.url("files/" + encodeURIComponent(id), { fields }),
      this.opts(signal, {}, id)
    );
  }
  async info(f, p, signal) {
    if (typeof f.id !== "string" || typeof f.version !== "string" && typeof f.version !== "number")
      throw Error("Drive не вернул версию файла");
    const size = Number(f.size);
    if (!Number.isSafeInteger(size) || size < 0)
      throw Error("Drive не вернул размер файла");
    let hash2 = f.sha256Checksum;
    if (size > this.limit) hash2 = "oversize:" + size;
    else if (typeof hash2 !== "string" || !/^[a-f\d]{64}$/i.test(hash2)) {
      const key = f.id + ":" + f.version;
      hash2 = hashCache.get(key);
      if (!hash2) {
        hash2 = sha(await this.download(f, signal));
        if (hashCache.size > 1e5) hashCache.clear();
        hashCache.set(key, hash2);
      }
    }
    return {
      path: p,
      hash: String(hash2).toLowerCase(),
      size,
      mtime: Date.parse(f.modifiedTime) || void 0,
      id: f.id,
      version: String(f.version)
    };
  }
  async children(id, signal) {
    const out = [];
    let next = "";
    const pages = /* @__PURE__ */ new Set();
    do {
      if (pages.has(next)) throw Error("Повтор страницы Drive");
      pages.add(next);
      const d = await json(
        this.http,
        this.url("files", {
          q: `'${id.replace(/'/g, "\\'")}' in parents and trashed=false`,
          fields: `files(${fields}),nextPageToken,incompleteSearch`,
          pageSize: "1000",
          includeItemsFromAllDrives: "true",
          ...next ? { pageToken: next } : {}
        }),
        this.opts(signal, {}, id)
      );
      if (d.incompleteSearch || !Array.isArray(d.files))
        throw Error("Неполный ответ Drive");
      if (d.nextPageToken !== void 0 && typeof d.nextPageToken !== "string")
        throw Error("Некорректная страница Drive");
      for (const child2 of d.files) {
        if (child2.resourceKey) this.resourceKeys.set(child2.id, child2.resourceKey);
      }
      out.push(...d.files);
      next = d.nextPageToken || "";
    } while (next);
    return out;
  }
  choose(entries, p, warnings) {
    if (entries.length <= 1) return entries[0];
    if (this.duplicates !== "newest" || entries.some(
      (f) => f.mimeType === FOLDER || f.name !== entries[0].name || !Number.isFinite(Date.parse(f.modifiedTime))
    ))
      throw new PathCollision(
        "Коллизия: несколько объектов Drive имеют путь «" + p + "». Переименуйте дубль, исключите путь или для файлов включите выбор новейшего при получении.",
        [p]
      );
    const sorted = [...entries].sort(
      (a, b) => Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime) || String(a.id).localeCompare(String(b.id))
    );
    warnings?.push(
      `Drive: из ${entries.length} файлов «${p}» выбран новейший (ID ${sorted[0].id}); остальные остаются в источнике.`
    );
    return sorted[0];
  }
  async scan(signal) {
    const root = await this.inspect(this.root, signal);
    if (root.trashed || root.mimeType !== FOLDER)
      throw Error("Папка Drive недоступна");
    const files = /* @__PURE__ */ Object.create(null), directories = [], warnings = [], seen = /* @__PURE__ */ new Set(), all = [];
    this.folders = /* @__PURE__ */ new Map([["", this.root]]);
    const walk = async (id, base, depth) => {
      signal.throwIfAborted();
      if (depth > 60 || seen.size > 1e5)
        throw Error("Превышен предел обхода Drive");
      if (seen.has(id)) throw Error("Повтор ID папки Drive");
      seen.add(id);
      const groups = /* @__PURE__ */ new Map();
      for (const f of await this.children(id, signal)) {
        if (/[\\/]/.test(f.name))
          throw Error("Недопустимый разделитель в имени удалённого файла");
        path(f.name);
        const p = join(base, f.name);
        if (f.mimeType === FOLDER ? this.rules && !this.rules.folder(p) : this.rules && !this.rules.file(p))
          continue;
        const group = groups.get(f.name) || [];
        group.push(f);
        groups.set(f.name, group);
      }
      for (const group of groups.values()) {
        const p = join(base, group[0].name);
        const f = this.choose(group, p, warnings);
        all.push(p);
        if (f.mimeType === FOLDER) {
          directories.push(p);
          this.folders.set(p, f.id);
          await walk(f.id, p, depth + 1);
        } else if (String(f.mimeType).startsWith("application/vnd.google-apps.")) {
          warnings.push(
            "Пропущен Google Docs / shortcut (нужен экспорт): " + p
          );
          files[p] = {
            path: p,
            size: Number.MAX_SAFE_INTEGER,
            hash: "unsupported:" + f.mimeType,
            version: String(f.version || ""),
            id: f.id
          };
        } else files[p] = await this.info(f, p, signal);
      }
    };
    await walk(this.root, "", 0);
    uniquePaths(all);
    return {
      files,
      directories,
      complete: true,
      warnings,
      identity: this.identity
    };
  }
  async download(f, signal) {
    const b = await bytes(
      this.http,
      this.url("files/" + encodeURIComponent(f.id), { alt: "media" }),
      this.opts(signal, { maxBytes: this.limit }, f.id)
    );
    if (b.length !== Number(f.size))
      throw Error("Размер Drive-файла не совпал");
    if (f.sha256Checksum && sha(b) !== f.sha256Checksum.toLowerCase())
      throw Error("SHA-256 Drive не совпал");
    if (f.md5Checksum && createHash("md5").update(b).digest("hex") !== f.md5Checksum.toLowerCase())
      throw Error("MD5 Drive не совпал");
    const after = await this.inspect(f.id, signal);
    if (String(after.version) !== String(f.version) || after.trashed)
      throw Error("Файл Drive изменился во время скачивания");
    return b;
  }
  async read(f, signal) {
    const current = await this.inspect(f.id, signal);
    if (String(current.version) !== f.version || current.trashed)
      throw Error("Файл Drive изменился");
    await this.verifyPath(f.path, f.id, signal);
    return this.download(current, signal);
  }
  /** Sync Engine's fresh path-chain lookup, adapted to reject ambiguous names. */
  async verifyPath(p, expectedId, signal) {
    let id = this.root;
    const parts2 = p.split("/");
    for (let i = 0; i < parts2.length; i++) {
      const matches = (await this.children(id, signal)).filter(
        (f2) => f2.name.normalize("NFC").toLowerCase() === parts2[i].normalize("NFC").toLowerCase()
      );
      const f = this.choose(matches, p);
      if (!f) {
        if (expectedId)
          throw Error("Путь Drive исчез после планирования: " + p);
        return;
      }
      if (i === parts2.length - 1) {
        if (!expectedId || f.id !== expectedId || f.name !== parts2[i])
          throw Error(
            "Путь Drive изменился или появился после планирования: " + p
          );
      } else if (f.mimeType !== FOLDER || f.name !== parts2[i])
        throw Error("Папка Drive изменилась после планирования: " + p);
      id = f.id;
    }
  }
  async confirmAbsent(p, signal) {
    const root = await this.inspect(this.root, signal);
    if (root.trashed || root.mimeType !== FOLDER) throw Error("Корень Drive недоступен");
    await this.verifyPath(p, void 0, signal);
  }
  async verifyExpected(p, expected, signal) {
    if (expected) {
      const r = await this.http.fetch(
        this.url("files/" + encodeURIComponent(expected.id), { fields }),
        this.opts(signal)
      );
      if (r.status !== 200) throw Error("Drive-файл недоступен");
      const f = JSON.parse(await r.text());
      if (f.trashed || String(f.version) !== expected.version)
        throw Error("Drive-файл изменился");
      if (!r.headers.etag)
        throw Error("Drive не вернул ETag; безопасная перезапись запрещена");
      await this.verifyPath(p, expected.id, signal);
      return r.headers.etag;
    }
    await this.verifyPath(p, void 0, signal);
    return void 0;
  }
  async parent(p, signal) {
    let base = "", id = this.root;
    for (const name of p.split("/").slice(0, -1)) {
      base = join(base, name);
      const cached = this.folders.get(base);
      let next;
      {
        const found = (await this.children(id, signal)).filter(
          (f) => f.name.normalize("NFC").toLowerCase() === name.normalize("NFC").toLowerCase()
        );
        if (found.length > 1 || found[0] && (found[0].mimeType !== FOLDER || found[0].name !== name))
          throw Error("Коллизия папки Drive");
        next = found[0]?.id;
        if (cached && next !== cached)
          throw Error(
            "Папка Drive перемещена или заменена после планирования: " + base
          );
        if (!next) {
          const d = await json(
            this.http,
            this.url("files", { fields: "id" }),
            this.opts(signal, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, mimeType: FOLDER, parents: [id] })
            })
          );
          next = d.id;
          if (typeof next !== "string" || !next)
            throw Error("Drive не вернул ID созданной папки");
        }
        this.folders.set(base, next);
      }
      id = next;
    }
    return id;
  }
  async write(p, b, expected, mtime, signal) {
    if (!this.writable)
      throw Error(
        "Drive доступен только для чтения: публичный доступ или выбор новейшего дубля"
      );
    path(p);
    const etag = await this.verifyExpected(p, expected, signal);
    const root = await this.inspect(this.root, signal);
    if (root.trashed || root.mimeType !== FOLDER)
      throw Error("Корень Drive недоступен перед записью");
    const parent = await this.parent(p, signal);
    if (!expected) await this.verifyExpected(p, void 0, signal);
    const boundary = "sync_studio_" + crypto.randomUUID();
    const metadata = {
      name: p.split("/").at(-1),
      mimeType: driveMime(p),
      ...!expected ? { parents: [parent] } : {},
      ...mtime ? { modifiedTime: new Date(mtime).toISOString() } : {}
    };
    const body = b.length > 5 * 1024 * 1024 ? void 0 : await new Blob([
      `--${boundary}\r
Content-Type: application/json; charset=UTF-8\r
\r
${JSON.stringify(metadata)}\r
--${boundary}\r
Content-Type: ${driveMime(p)}\r
\r
`,
      Uint8Array.from(b).buffer,
      `\r
--${boundary}--\r
`
    ]).arrayBuffer();
    const f = b.length > 5 * 1024 * 1024 ? await driveUpload(
      this.http,
      this.url(
        expected ? "files/" + encodeURIComponent(expected.id) : "files",
        { uploadType: "resumable", fields },
        true
      ),
      expected ? "PATCH" : "POST",
      metadata,
      b,
      this.opts(signal, { headers: etag ? { "If-Match": etag } : {} })
    ) : await json(
      this.http,
      this.url(
        expected ? "files/" + encodeURIComponent(expected.id) : "files",
        { uploadType: "multipart", fields },
        true
      ),
      this.opts(signal, {
        method: expected ? "PATCH" : "POST",
        headers: {
          "Content-Type": "multipart/related; boundary=" + boundary,
          ...etag ? { "If-Match": etag } : {}
        },
        body
      })
    );
    const result = await this.info(f, p, signal);
    if (result.hash !== sha(b)) throw Error("Проверка записи Drive не прошла");
    return result;
  }
  async delete(f, trash, signal) {
    if (!this.writable) throw Error("Источник только для чтения");
    const etag = await this.verifyExpected(f.path, f, signal);
    const root = await this.inspect(this.root, signal);
    if (root.trashed || root.mimeType !== FOLDER)
      throw Error("Корень Drive недоступен перед удалением");
    const r = await this.http.fetch(
      this.url(
        "files/" + encodeURIComponent(f.id),
        trash ? { fields: "id" } : {}
      ),
      this.opts(signal, {
        method: trash ? "PATCH" : "DELETE",
        headers: { "If-Match": etag, "Content-Type": "application/json" },
        ...trash ? { body: '{"trashed":true}' } : {}
      })
    );
    if (r.status < 200 || r.status >= 300)
      throw Error("Удаление Drive: HTTP " + r.status);
  }
};
var GitHubStore = class {
  constructor(http, repo, ref, prefix2, token, limit, rules) {
    this.http = http;
    this.ref = ref;
    this.prefix = prefix2;
    this.token = token;
    this.limit = limit;
    this.rules = rules;
    const m = repo.replace(/^https:\/\/github.com\//, "").replace(/\.git$/, "").replace(/\/$/, "").match(/^([\w.-]+)\/([\w.-]+)$/);
    if (!m) throw Error("Репозиторий: owner/repo");
    path(prefix2, true);
    this.base = `https://api.github.com/repos/${m[1]}/${m[2]}`;
    this.identity = `github:${m[1]}/${m[2]}:${ref}:${prefix2}`;
  }
  identity;
  writable = false;
  trashSupported = false;
  base;
  options(signal) {
    return {
      signal,
      maxBytes: 16 * 1024 * 1024,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Obsidian-Sync-Studio",
        ...this.token ? { Authorization: "Bearer " + this.token } : {}
      }
    };
  }
  async scan(signal) {
    const c = await json(
      this.http,
      this.base + "/commits/" + encodeURIComponent(this.ref || "HEAD"),
      this.options(signal)
    );
    if (!c.commit?.tree?.sha) throw Error("GitHub не вернул дерево коммита");
    const tree = await json(
      this.http,
      this.base + "/git/trees/" + c.commit.tree.sha + "?recursive=1",
      this.options(signal)
    );
    if (tree.truncated || !Array.isArray(tree.tree))
      throw Error("Неполное дерево GitHub: запуск остановлен");
    if (this.prefix && !tree.tree.some((f) => f.type === "tree" && f.path === this.prefix))
      throw Error("Каталог GitHub не найден");
    const files = /* @__PURE__ */ Object.create(null);
    const directories = [];
    for (const f of tree.tree) {
      if (!under(f.path, this.prefix) || f.path === this.prefix) continue;
      const p = this.prefix ? f.path.slice(this.prefix.length + 1) : f.path;
      if (f.type === "tree") {
        if (!this.rules || this.rules.folder(p)) directories.push(path(p));
        continue;
      }
      if (this.rules && !this.rules.file(p)) continue;
      path(p);
      if (f.type !== "blob" || !["100644", "100755"].includes(f.mode))
        throw Error("Ссылки и submodules не поддерживаются: " + f.path);
      if (!Number.isSafeInteger(f.size) || f.size < 0)
        throw Error("GitHub не вернул размер");
      let hash2 = "oversize:" + f.size;
      if (f.size <= this.limit) {
        hash2 = hashCache.get("git:" + f.sha) || sha(await this.blob(f.sha, signal));
        if (hashCache.size > 1e5) hashCache.clear();
        hashCache.set("git:" + f.sha, hash2);
      }
      files[p] = { path: p, hash: hash2, size: f.size, version: f.sha, id: f.sha };
    }
    uniquePaths([...Object.keys(files), ...directories]);
    return {
      files,
      directories,
      identity: this.identity,
      complete: true,
      warnings: [
        "GitHub: только получение; файловое время изменения недоступно."
      ]
    };
  }
  async confirmAbsent(p, signal) {
    const commit = await json(this.http, this.base + "/commits/" + encodeURIComponent(this.ref || "HEAD"), this.options(signal));
    const id = commit.commit?.tree?.sha;
    if (!id) throw Error("GitHub не вернул дерево коммита");
    const tree = await json(this.http, this.base + "/git/trees/" + id + "?recursive=1", this.options(signal));
    if (tree.truncated !== false || !Array.isArray(tree.tree) || this.prefix && !tree.tree.some((f) => f.type === "tree" && f.path === this.prefix))
      throw Error("Невозможно подтвердить отсутствие пути GitHub");
    if (tree.tree.some((f) => f.path === join(this.prefix, p))) throw Error("Путь снова появился в GitHub: " + p);
  }
  async blob(id, signal) {
    const r = await json(this.http, this.base + "/git/blobs/" + id, {
      ...this.options(signal),
      maxBytes: Math.ceil(this.limit * 1.5) + 1024
    });
    if (r.encoding !== "base64" || typeof r.content !== "string")
      throw Error("Неподдерживаемый ответ GitHub");
    const b = Uint8Array.from(atob(r.content), (c) => c.charCodeAt(0));
    if (b.length > this.limit) throw Error("Превышен размер файла");
    const hash2 = createHash("sha1").update(new TextEncoder().encode(`blob ${b.length}\0`)).update(b).digest("hex");
    if (hash2 !== id) throw Error("GitHub blob checksum mismatch");
    if (new TextDecoder().decode(b.subarray(0, 80)).startsWith("version https://git-lfs.github.com/spec"))
      throw Error("Git LFS требует отдельного скачивания");
    return b;
  }
  async read(f, signal) {
    signal.throwIfAborted();
    return this.blob(f.id, signal);
  }
  async write() {
    throw Error("GitHub в этой версии — только получение");
  }
  async delete() {
    throw Error("GitHub в этой версии — только получение");
  }
};
var YandexStore = class {
  constructor(http, root, token, limit, rules) {
    this.http = http;
    this.token = token;
    this.limit = limit;
    this.rules = rules;
    this.root = "disk:/" + root.replace(/^disk:\//, "").replace(/^\//, "").replace(/\/$/, "");
    path(this.root.slice(6), true);
    this.identity = "yandex:" + this.root;
  }
  identity;
  writable = true;
  trashSupported = true;
  base = "https://cloud-api.yandex.net/v1/disk";
  root;
  url(endpoint2, params) {
    return this.base + endpoint2 + "?" + new URLSearchParams(params);
  }
  options(signal, extra = {}) {
    return {
      ...extra,
      signal,
      headers: { Authorization: "OAuth " + this.token, ...extra.headers }
    };
  }
  full(p) {
    return p ? this.root.replace(/\/$/, "") + "/" + path(p) : this.root;
  }
  async meta(p, signal) {
    return json(
      this.http,
      this.url("/resources", { path: this.full(p), limit: "200" }),
      this.options(signal)
    );
  }
  async folders(relative, signal) {
    const out = [];
    let offset2 = 0, total;
    do {
      const d = await json(
        this.http,
        this.url("/resources", {
          path: this.full(relative),
          limit: "200",
          offset: String(offset2)
        }),
        this.options(signal)
      );
      const e = d._embedded;
      if (d.type !== "dir" || !e || !Array.isArray(e.items) || !Number.isSafeInteger(e.total) || e.offset !== offset2 || total !== void 0 && e.total !== total)
        throw Error("Не удалось прочитать полный список папок Яндекс Диска");
      total = e.total;
      for (const f of e.items)
        if (f.type === "dir") {
          if (/[\\/]/.test(f.name)) throw Error("Недопустимое имя папки");
          out.push({ id: join(relative, path(f.name)), name: f.name });
        }
      offset2 += e.items.length;
      if (!e.items.length && offset2 < total)
        throw Error("Неполный список папок");
    } while (offset2 < total);
    return out;
  }
  info(f, p) {
    if (!Number.isSafeInteger(f.size) || typeof f.sha256 !== "string" || !/^[a-f\d]{64}$/i.test(f.sha256))
      throw Error("Яндекс Диск не вернул checksum/размер: " + p);
    return {
      path: p,
      hash: f.sha256.toLowerCase(),
      size: f.size,
      mtime: Date.parse(f.modified) || void 0,
      version: f.sha256.toLowerCase(),
      id: f.path
    };
  }
  async scan(signal) {
    const files = /* @__PURE__ */ Object.create(null), directories = [], paths = [];
    let count = 0;
    const walk = async (p, depth) => {
      if (depth > 60 || ++count > 1e5)
        throw Error("Превышен предел обхода Яндекс Диска");
      let offset2 = 0, total;
      const names = /* @__PURE__ */ new Set();
      do {
        signal.throwIfAborted();
        const d = await json(
          this.http,
          this.url("/resources", {
            path: this.full(p),
            limit: "200",
            offset: String(offset2)
          }),
          this.options(signal)
        );
        const e = d._embedded;
        if (d.type !== "dir" || !e || !Array.isArray(e.items) || !Number.isSafeInteger(e.total) || e.offset !== offset2 || total !== void 0 && e.total !== total)
          throw Error("Неполный или изменившийся список Яндекс Диска");
        total = e.total;
        for (const f of e.items) {
          if (/[\\/]/.test(f.name))
            throw Error("Недопустимый разделитель в имени удалённого файла");
          path(f.name);
          if (names.has(f.name))
            throw Error("Повтор файла при обходе Яндекс Диска");
          names.add(f.name);
          const rel = join(p, f.name);
          if (f.type === "dir" ? this.rules && !this.rules.folder(rel) : this.rules && !this.rules.file(rel))
            continue;
          paths.push(rel);
          if (f.type === "dir") {
            directories.push(rel);
            await walk(rel, depth + 1);
          } else if (f.type === "file") files[rel] = this.info(f, rel);
          else throw Error("Неизвестный тип файла Яндекс Диска");
        }
        offset2 += e.items.length;
        if (!e.items.length && offset2 < total)
          throw Error("Пустая страница Яндекс Диска");
      } while (offset2 < total);
    };
    await walk("", 0);
    uniquePaths(paths);
    return {
      files,
      directories,
      identity: this.identity,
      complete: true,
      warnings: [
        "Яндекс Диск не предоставляет атомарную проверку версии при перезаписи: не изменяйте файлы другим клиентом во время отправки."
      ]
    };
  }
  trusted(href) {
    const u = new URL(href);
    if (u.protocol !== "https:" || u.username || u.password || !["yandex.net", "yandex.ru", "yandex.com"].some(
      (d) => u.hostname === d || u.hostname.endsWith("." + d)
    ))
      throw Error("Неожиданный адрес передачи Яндекс Диска");
    return href;
  }
  async read(f, signal) {
    if ((await this.meta(f.path, signal)).sha256.toLowerCase() !== f.hash)
      throw Error("Файл Яндекс Диска изменился");
    const d = await json(
      this.http,
      this.url("/resources/download", { path: this.full(f.path) }),
      this.options(signal)
    );
    return bytes(this.http, this.trusted(d.href), {
      signal,
      maxBytes: this.limit,
      redirect: "follow"
    });
  }
  async check(p, expected, signal) {
    try {
      const f = await this.meta(p, signal);
      if (!expected || f.sha256?.toLowerCase() !== expected.hash)
        throw Error("Файл Яндекс Диска изменился или появился");
    } catch (e) {
      if (e.status === 404 && !expected) return;
      throw e;
    }
  }
  async confirmAbsent(p, signal) {
    if ((await this.meta("", signal)).type !== "dir") throw Error("Корень Яндекс Диска недоступен");
    await this.check(p, void 0, signal);
  }
  async mkdirs(p, signal) {
    let at = "";
    for (const x of p.split("/").slice(0, -1)) {
      at = join(at, x);
      const r = await this.http.fetch(
        this.url("/resources", { path: this.full(at) }),
        this.options(signal, { method: "PUT" })
      );
      if (r.status === 409) {
        const f = await this.meta(at, signal);
        if (f.type !== "dir") throw Error("Файл блокирует создание папки");
      } else if (r.status !== 201)
        throw Error("Создание папки Яндекс Диска: HTTP " + r.status);
    }
  }
  async write(p, b, expected, _mtime, signal) {
    await this.mkdirs(p, signal);
    await this.check(p, expected, signal);
    const d = await json(
      this.http,
      this.url("/resources/upload", {
        path: this.full(p),
        overwrite: expected ? "true" : "false"
      }),
      this.options(signal)
    );
    const r = await this.http.fetch(this.trusted(d.href), {
      method: "PUT",
      signal,
      body: b
    });
    if (r.status < 200 || r.status >= 300)
      throw Error("Загрузка Яндекс Диска: HTTP " + r.status);
    const attempts = r.status === 202 ? 20 : 1;
    const expectedHash = sha(b);
    for (let i = 0; i < attempts; i++) {
      signal.throwIfAborted();
      try {
        const f = this.info(await this.meta(p, signal), p);
        if (f.hash === expectedHash) return f;
      } catch (e) {
        if (e.status !== 404) throw e;
      }
      if (i + 1 < attempts) await setTimeout2(500, void 0, { signal });
    }
    throw Error(
      "Запись Яндекс Диска ещё не подтверждена ожидаемой checksum. Перепроверьте файлы; незавершённая операция сохранена."
    );
  }
  async delete(f, trash, signal) {
    await this.check(f.path, f, signal);
    const r = await this.http.fetch(
      this.url("/resources", {
        path: this.full(f.path),
        permanently: String(!trash)
      }),
      this.options(signal, { method: "DELETE" })
    );
    if (r.status === 202) {
      const d = JSON.parse(await r.text());
      const url = new URL(this.trusted(d.href));
      if (url.origin !== "https://cloud-api.yandex.net")
        throw Error("Неожиданный адрес операции");
      for (let i = 0; i < 30; i++) {
        signal.throwIfAborted();
        const op = await json(this.http, url.href, this.options(signal));
        if (op.status === "success") return;
        if (op.status === "failed")
          throw Error("Удаление Яндекс Диска не выполнено");
        await new Promise((r2) => setTimeout(r2, 1e3));
      }
      throw Error("Удаление ещё выполняется. Повторите проверку позже.");
    }
    if (r.status !== 204)
      throw Error("Удаление Яндекс Диска: HTTP " + r.status);
  }
};

// src/public-git.js
async function openNativeGit(repo, ref, prefix2, included, signal) {
  const fs = require("node:fs/promises"), os = require("node:os"), path2 = require("node:path");
  const { execFile } = require("node:child_process");
  const dir = await fs.mkdtemp(path2.join(os.tmpdir(), "obsidian-public-git-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))
  );
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ALLOW_PROTOCOL: "https"
  });
  const git = (args, maxBuffer = 64 * 1024 * 1024) => new Promise(
    (resolve, reject) => execFile(
      "git",
      ["-c", "credential.helper=", ...args],
      {
        cwd: dir,
        env,
        signal,
        encoding: "buffer",
        maxBuffer,
        timeout: 12e4,
        windowsHide: true
      },
      (err, out) => err ? reject(
        Error(
          err.code === "ENOENT" ? "Установите Git и добавьте его в PATH." : "Git не смог прочитать репозиторий или версию: " + args[0]
        )
      ) : resolve(out)
    )
  );
  const close = () => fs.rm(dir, { recursive: true, force: true });
  const fetchCommit = async () => {
    await git([
      "fetch",
      "--quiet",
      "--depth=1",
      "--no-tags",
      "--no-recurse-submodules",
      "--",
      repo,
      ref
    ]);
    return (await git(["rev-parse", "--verify", "FETCH_HEAD^{commit}"])).toString().trim();
  };
  try {
    await git(["init", "--bare", "--template=", "."]);
    const commit = await fetchCommit();
    const tree = async (at) => {
      const treeish = prefix2 ? at + ":" + prefix2 : at;
      if (prefix2) {
        const type = await git(["cat-file", "-t", treeish]).catch(() => null);
        if (type?.toString().trim() !== "tree")
          throw Error("Подпапка Git отсутствует: " + prefix2);
      }
      const data = await git(["ls-tree", "-rzt", treeish]);
      return new TextDecoder("utf-8", { fatal: true }).decode(data).split("\0").filter(Boolean);
    };
    const read = async (file) => {
      const data = await git(["cat-file", "blob", file.id]);
      if (data.subarray(0, 80).toString().startsWith("version https://git-lfs.github.com/spec"))
        throw Error("Git LFS не поддерживается: " + file.path);
      return data;
    };
    return {
      close,
      read,
      async scan() {
        const files = /* @__PURE__ */ Object.create(null), directories = [];
        for (const row of await tree(commit)) {
          const match = /^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/.exec(row);
          if (!match) throw Error("Некорректное дерево Git.");
          const [, mode, type, id, p] = match;
          if (!included(p)) continue;
          if (type === "tree") {
            directories.push(p);
            continue;
          }
          if (type !== "blob" || !["100644", "100755"].includes(mode))
            throw Error("Ссылка или submodule в выбранной папке: " + p);
          const bytes2 = await read({ id, path: p });
          const hash2 = Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", bytes2)),
            (b) => b.toString(16).padStart(2, "0")
          ).join("");
          files[p] = { path: p, id, size: bytes2.length, hash: hash2 };
        }
        return { files, directories, complete: true };
      },
      async confirmAbsent(p) {
        if ((await tree(await fetchCommit())).some(
          (line) => line.slice(line.indexOf("	") + 1) === p
        ))
          throw Error("Путь снова появился в Git: " + p);
      }
    };
  } catch (e) {
    await close();
    throw e;
  }
}

// src/public-sources.js
var publicSource = (engine) => ["googlePublic", "yandexPublic", "git"].includes(engine);
var anonymous = (engine) => engine === "yandexPublic" || engine === "git";
var needsCredential = (s) => !anonymous(s.engine) && (s.engine !== "webdav" || !!s.user);
function gitLocation(s) {
  const u = new URL(s.url.trim());
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || u.pathname === "/")
    throw Error("Введите HTTPS URL клонирования публичного репозитория.");
  const repo = u.href.replace(/\/$/, "").replace(/\.git$/, "");
  const ref = (s.gitRef || "").trim() || "HEAD";
  if (ref.startsWith("-") || /[\s~^:?*\[\\\x00-\x1f\x7f]|\.\.|@\{|\/\/|\/$/.test(ref))
    throw Error("Проверьте имя ветки, тега или коммита.");
  const prefix2 = path((s.gitFolder || "").trim().replace(/^\/|\/$/g, ""), true);
  if (u.hostname === "github.com" && !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repo))
    throw Error(
      "Укажите URL репозитория GitHub. Ветку и подпапку введите в отдельных полях."
    );
  return { repo, ref, prefix: prefix2 };
}
function publicRoot(s) {
  if (s.engine === "git") return gitLocation(s).repo;
  if (s.engine === "googlePublic") return driveRoot(s.url);
  const u = new URL(s.url.trim());
  if (u.protocol !== "https:" || u.username || u.password || !/^(?:yadi\.sk|(?:disk(?:\.360)?|360)\.yandex\.(?:ru|com|kz|by))$/.test(
    u.hostname
  ) || u.pathname === "/")
    throw Error("Укажите публичную ссылку Яндекс Диска на папку.");
  return u.origin + u.pathname.replace(/\/$/, "");
}
var YandexPublic = class {
  constructor(http, key, included) {
    this.http = http;
    this.key = key;
    this.included = included;
  }
  url(p, download = false, offset2 = 0) {
    const q = new URLSearchParams({ public_key: this.key, path: "/" + p });
    if (!download) {
      q.set("limit", "200");
      q.set("offset", String(offset2));
    }
    return "https://cloud-api.yandex.net/v1/disk/public/resources" + (download ? "/download?" : "?") + q;
  }
  async scan(signal) {
    const files = /* @__PURE__ */ Object.create(null), directories = [], paths = [], pending = [""];
    while (pending.length) {
      const dir = pending.pop();
      let offset2 = 0, total;
      do {
        const data = await json(this.http, this.url(dir, false, offset2), {
          signal
        });
        const page = data._embedded;
        if (data.type !== "dir" || !page || !Array.isArray(page.items) || !Number.isSafeInteger(page.total) || page.total < 0 || page.offset !== offset2 || total !== void 0 && total !== page.total || offset2 + page.items.length > page.total || !page.items.length && offset2 < page.total)
          throw Error("Неполный список публичной папки Яндекс Диска.");
        total = page.total;
        for (const item of page.items) {
          if (typeof item.name !== "string" || /[/\\]/.test(item.name))
            throw Error("Некорректное имя на Яндекс Диске.");
          const p = path(dir ? dir + "/" + item.name : item.name);
          if (!this.included(p)) continue;
          paths.push(p);
          if (item.type === "dir") {
            directories.push(p);
            pending.push(p);
          } else if (item.type === "file") {
            if (!Number.isSafeInteger(item.size) || item.size < 0)
              throw Error("Нет размера файла: " + p);
            const f = {
              path: p,
              size: item.size,
              mtime: Date.parse(item.modified),
              hash: item.sha256?.toLowerCase()
            };
            if (!/^[a-f\d]{64}$/.test(f.hash || "")) {
              const content = await this.read(f, signal);
              f.hash = Array.from(
                new Uint8Array(await crypto.subtle.digest("SHA-256", content)),
                (b) => b.toString(16).padStart(2, "0")
              ).join("");
            }
            files[p] = f;
          } else throw Error("Неизвестный тип ресурса: " + p);
        }
        offset2 += page.items.length;
      } while (offset2 < total);
    }
    uniquePaths(paths);
    return { files, directories, complete: true };
  }
  async read(file, signal) {
    const link = await json(this.http, this.url(file.path, true), { signal });
    const u = new URL(link.href);
    if (u.protocol !== "https:" || u.username || u.password || !/(^|\.)yandex\.(net|ru|com)$/.test(u.hostname))
      throw Error("Неизвестный адрес загрузки Яндекс Диска.");
    const data = await bytes(this.http, u.href, { signal });
    if (data.length !== file.size) throw Error("Файл изменился: " + file.path);
    return data;
  }
  async confirmAbsent(p, signal) {
    if ((await json(this.http, this.url(""), { signal })).type !== "dir")
      throw Error("Публичная папка недоступна.");
    try {
      await json(this.http, this.url(p), { signal });
    } catch (e) {
      if (e.status === 404) return;
      throw e;
    }
    throw Error("Файл снова появился на Яндекс Диске: " + p);
  }
};
async function openPublic(s, credential, included, signal, http) {
  const root = publicRoot(s), rules = { file: included, folder: included };
  let store, identity = [s.engine, root];
  if (s.engine === "git") {
    const { repo, ref, prefix: prefix2 } = gitLocation(s);
    identity.push(ref, prefix2);
    if (new URL(repo).hostname === "github.com")
      store = new GitHubStore(
        http,
        repo,
        ref,
        prefix2,
        "",
        Number.MAX_SAFE_INTEGER,
        rules
      );
    else {
      if (!import_obsidian.Platform?.isDesktopApp)
        throw Error(
          "На мобильном клиенте используйте публичный репозиторий GitHub."
        );
      store = await openNativeGit(repo, ref, prefix2, included, signal);
    }
  } else if (s.engine === "googlePublic") {
    if (!credential.trim())
      throw Error("Введите API key проекта с включённым Google Drive API.");
    store = new DriveStore(
      http,
      s.url.trim(),
      Number.MAX_SAFE_INTEGER,
      credential.trim(),
      "",
      rules
    );
  } else store = new YandexPublic(http, root, included);
  try {
    const snapshot = await store.scan(signal);
    return {
      identity,
      snapshot,
      close: () => store.close?.(),
      async read(p) {
        return Uint8Array.from(await store.read(snapshot.files[p], signal)).buffer;
      },
      async confirmAbsent(p) {
        await store.confirmAbsent(p, signal);
      }
    };
  } catch (e) {
    await store.close?.();
    throw e;
  }
}

// src/cloud.js
var import_obsidian2 = require("obsidian");

// ../../src/core/send-budget.ts
var SendBudgetError = class extends Error {
};
var SendBudget = class {
  count = 0;
  take() {
    if (++this.count > 3)
      throw new SendBudgetError("Превышен лимит повторов запроса");
  }
};
function sendWithBudget(transport2, url, options) {
  if (!transport2.accountsSendBudget) options.sendBudget?.take();
  return transport2.fetch(url, options);
}

// ../../src/core/sync-issue.ts
var SyncFault = class extends Error {
  constructor(code, message2, scope = "file", retryable = false) {
    super(message2);
    this.code = code;
    this.scope = scope;
    this.retryable = retryable;
    this.name = "SyncFault";
  }
};

// ../../src/core/net.ts
var NetError = class extends Error {
};

// ../../src/auth/google-auth.ts
var GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive", "openid"];
var TOKEN_URL = "https://oauth2.googleapis.com/token";
function waitForGoogle(pending, signal, discardLate) {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException("Google request cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    pending.then((value) => {
      cleanup();
      if (signal.aborted) {
        discardLate?.(value);
        return;
      }
      resolve(value);
    }, (error) => {
      cleanup();
      reject(error);
    });
    if (signal.aborted) abort();
  });
}
async function withGoogleTimeout(signal, timeoutMs, error, run) {
  signal.throwIfAborted();
  const controller = new AbortController(), abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(error), timeoutMs);
  try {
    return await waitForGoogle(Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return run(controller.signal);
    }), controller.signal);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
function googleNetworkFailure(error, signal) {
  signal?.throwIfAborted();
  if (error instanceof SendBudgetError || error instanceof SyncFault || error instanceof NetError || error?.name === "AbortError") return error;
  const status = error?.status, code = error?.code;
  if (status !== void 0 && Number.isInteger(status) && status >= 400 && status <= 599)
    return Object.assign(new SyncFault(status === 401 ? "auth-required" : "google-api", `Google transport failed: HTTP ${status}`, "source", status === 408 || status === 429 || status >= 500), { status });
  if (code && ["file-too-large", "redirect-policy", "response-format"].includes(code)) return new SyncFault(code, "Google transport rejected the response", "source");
  return new SyncFault("network", "Google connection interrupted; retry required", "source", true);
}
function parseGoogleClient(raw) {
  const value = JSON.parse(raw)?.installed;
  if (!value || typeof value.client_id !== "string" || !value.client_id.endsWith(".apps.googleusercontent.com"))
    throw Error("Import a Google OAuth Desktop app client JSON");
  if (value.client_secret !== void 0 && typeof value.client_secret !== "string") throw Error("Invalid Desktop client configuration");
  return { clientId: value.client_id, clientSecret: value.client_secret };
}
async function googleJson(transport2, url, request) {
  request.signal?.throwIfAborted();
  try {
    const response = await waitForGoogle(transport2.fetch(url, { ...request, maxBytes: request.maxBytes ?? 1024 * 1024, redirect: "error" }), request.signal, (response2) => response2.discard?.());
    return await googleResponse(response, request.signal);
  } catch (error) {
    throw googleNetworkFailure(error, request.signal);
  }
}
async function googleResponse(response, signal) {
  let raw;
  try {
    raw = await waitForGoogle(response.text(), signal);
  } catch (error) {
    response.discard?.();
    throw googleNetworkFailure(error, signal);
  }
  signal?.throwIfAborted();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = void 0;
  }
  if (response.status < 200 || response.status >= 300) {
    const candidate = typeof data?.error === "string" ? data.error : data?.error?.errors?.[0]?.reason;
    const reason = typeof candidate === "string" && /^[\w.-]{1,80}$/.test(candidate) ? candidate : void 0;
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500 || ["rateLimitExceeded", "userRateLimitExceeded"].includes(reason ?? "");
    const retry = response.headers["retry-after"];
    const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1e3 : retry ? Math.max(0, Date.parse(retry) - Date.now()) : 0;
    throw Object.assign(new SyncFault(
      reason === "invalid_grant" || response.status === 401 ? "auth-required" : reason ?? "google-api",
      `Google request failed: HTTP ${response.status}${reason ? ` (${reason})` : ""}`,
      "source",
      retryable
    ), { status: response.status, retryAt: retryable && Number.isFinite(delay) && delay > 0 ? Date.now() + delay : void 0 });
  }
  if (!data || typeof data !== "object") throw new SyncFault("response-format", "Invalid Google response", "source");
  return data;
}
function tokenRequest(client, fields2, signal) {
  return {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client.clientId, ...client.clientSecret ? { client_secret: client.clientSecret } : {}, ...fields2 }).toString()
  };
}
function validateToken(data) {
  if (typeof data.access_token !== "string" || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0)
    throw new SyncFault("response-format", "Invalid Google token response", "source");
}
async function exchangeGoogleCode(transport2, client, code, verifier, redirectUri, signal) {
  const data = await googleJson(transport2, TOKEN_URL, tokenRequest(client, {
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  }, signal));
  validateToken(data);
  const scopes = new Set(String(data.scope ?? "").split(" "));
  if (!GOOGLE_SCOPES.every((scope) => scopes.has(scope)) || typeof data.refresh_token !== "string" || !data.refresh_token)
    throw new SyncFault("auth-required", "Google did not grant offline read/write Drive access", "source");
  const user = await googleJson(
    transport2,
    "https://openidconnect.googleapis.com/v1/userinfo",
    { signal, headers: { Authorization: `Bearer ${data.access_token}` } }
  );
  if (typeof user.sub !== "string" || !user.sub) throw new SyncFault("response-format", "Google account identity is missing", "source");
  signal.throwIfAborted();
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in, subject: user.sub };
}
var GoogleTokenManager = class {
  constructor(client, secretRef, secrets, transport2, now = Date.now, expectedSubject, refreshTimeoutMs = 6e4) {
    this.client = client;
    this.secretRef = secretRef;
    this.secrets = secrets;
    this.transport = transport2;
    this.now = now;
    this.expectedSubject = expectedSubject;
    this.refreshTimeoutMs = refreshTimeoutMs;
  }
  token;
  expiresAt = 0;
  pending;
  controller = new AbortController();
  epoch = 0;
  disconnected = false;
  get generation() {
    return this.epoch;
  }
  setAccess(token, expiresIn) {
    this.token = token;
    this.expiresAt = this.now() + expiresIn * 1e3;
  }
  invalidateAccess(token) {
    if (this.token === token) this.expiresAt = 0;
  }
  disconnect() {
    this.disconnected = true;
    this.epoch++;
    this.controller.abort();
    this.token = void 0;
    this.expiresAt = 0;
  }
  async getToken(force = false, signal) {
    signal?.throwIfAborted();
    if (this.disconnected) throw new SyncFault("auth-required", "Google account disconnected", "source");
    if (!force && this.token && this.now() < this.expiresAt - 6e4) return this.token;
    if (!this.pending) {
      const epoch = this.epoch;
      const run = this.refresh(epoch);
      this.pending = run;
      void run.finally(() => {
        if (this.pending === run) this.pending = void 0;
      }).catch(() => {
      });
    }
    const token = await waitForToken(this.pending, signal);
    signal?.throwIfAborted();
    if (this.disconnected) throw new SyncFault("auth-required", "Google account disconnected", "source");
    return token;
  }
  async refresh(epoch) {
    return withGoogleTimeout(this.controller.signal, this.refreshTimeoutMs, new SyncFault("network", "Google token refresh timed out; retry required", "source", true), (signal) => this.refreshRequest(epoch, signal));
  }
  async refreshRequest(epoch, signal) {
    const refresh = this.secrets.getSecret(this.secretRef);
    if (!refresh) throw new SyncFault("auth-required", "Connect your Google account", "source");
    const data = await googleJson(this.transport, TOKEN_URL, tokenRequest(
      this.client,
      { refresh_token: refresh, grant_type: "refresh_token" },
      signal
    ));
    validateToken(data);
    if (data.scope !== void 0 && !GOOGLE_SCOPES.every((scope) => String(data.scope).split(" ").includes(scope)))
      throw new SyncFault("auth-required", "Reconnect Google with read/write Drive access", "source");
    if (this.expectedSubject) {
      const user = await googleJson(
        this.transport,
        "https://openidconnect.googleapis.com/v1/userinfo",
        { signal, headers: { Authorization: `Bearer ${data.access_token}` } }
      );
      if (user.sub !== this.expectedSubject) throw new SyncFault("auth-required", "Google account identity changed; reconnect", "source");
    }
    signal.throwIfAborted();
    if (epoch !== this.epoch || this.disconnected) throw new SyncFault("auth-required", "Google account disconnected", "source");
    if (data.refresh_token !== void 0) {
      if (typeof data.refresh_token !== "string" || !data.refresh_token) throw new SyncFault("response-format", "Invalid refresh token", "source");
      this.secrets.setSecret(this.secretRef, data.refresh_token);
    }
    this.setAccess(data.access_token, data.expires_in);
    return data.access_token;
  }
};
function waitForToken(pending, signal) {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(new DOMException("Request cancelled", "AbortError"));
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    pending.then((value) => {
      cleanup();
      resolve(value);
    }, (error) => {
      cleanup();
      reject(error);
    });
    if (signal.aborted) abort();
  });
}
var GoogleAuthorizedTransport = class {
  constructor(transport2, tokens) {
    this.transport = transport2;
    this.tokens = tokens;
  }
  accountsSendBudget = true;
  async fetch(url, options) {
    const parsed = new URL(url);
    if (parsed.origin !== "https://www.googleapis.com" || parsed.username || parsed.password || !/^\/(?:upload\/)?drive\/v3\//.test(parsed.pathname)) throw new SyncFault("redirect-policy", "Untrusted Google API endpoint", "source");
    const generation = this.tokens.generation;
    options = { ...options, sendBudget: options.sendBudget ?? new SendBudget() };
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.tokens.getToken(false, options.signal);
      let response;
      try {
        response = await waitForGoogle(sendWithBudget(this.transport, url, {
          ...options,
          redirect: "error",
          headers: { ...options.headers, Authorization: `Bearer ${token}` }
        }), options.signal, (response2) => response2.discard?.());
      } catch (error) {
        if (generation !== this.tokens.generation) throw new SyncFault("auth-required", "Google account disconnected", "source");
        options.signal?.throwIfAborted();
        if (error?.status === 401 && attempt === 0) {
          this.tokens.invalidateAccess(token);
          continue;
        }
        throw googleNetworkFailure(error, options.signal);
      }
      if (generation !== this.tokens.generation) {
        response.discard?.();
        throw new SyncFault("auth-required", "Google account disconnected", "source");
      }
      if (options.signal?.aborted) {
        response.discard?.();
        options.signal.throwIfAborted();
      }
      if (response.status !== 401 || attempt === 1) {
        const read = async (body) => {
          try {
            const result = await waitForGoogle(body(), options.signal);
            options.signal?.throwIfAborted();
            if (generation !== this.tokens.generation) throw new SyncFault("auth-required", "Google account disconnected", "source");
            return result;
          } catch (error) {
            throw googleNetworkFailure(error, options.signal);
          }
        };
        return { ...response, text: () => read(() => response.text()), arrayBuffer: () => read(() => response.arrayBuffer()), discard: () => response.discard?.() };
      }
      this.tokens.invalidateAccess(token);
      response.discard?.();
    }
    throw new SyncFault("auth-required", "Reconnect Google account", "source");
  }
};

// ../../src/adapters/google-desktop-oauth.ts
var base64url = (bytes2) => btoa(String.fromCharCode(...bytes2)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function authorizeGoogleDesktop(client, transport2, signal, openBrowser, options = 3e5) {
  const config = typeof options === "number" ? { timeoutMs: options } : options;
  return withGoogleTimeout(
    signal,
    config.timeoutMs ?? 3e5,
    new SyncFault("oauth-timeout", "Google sign-in did not return to Obsidian within five minutes; check the browser and retry", "source"),
    (attemptSignal) => authorizeAttempt(client, transport2, attemptSignal, openBrowser, config)
  );
}
async function authorizeAttempt(client, transport2, signal, openBrowser, options) {
  signal.throwIfAborted();
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  signal.throwIfAborted();
  const http = require("node:http");
  let redirectUri = "";
  const code = await new Promise((resolve, reject) => {
    let consumed = false, finished = false;
    const server = http.createServer((request, response) => {
      let url;
      try {
        url = new URL(request.url ?? "/", redirectUri);
      } catch {
        response.writeHead(400);
        response.end("Invalid callback URL");
        return;
      }
      if (request.method !== "GET" || url.origin !== new URL(redirectUri).origin || url.pathname !== "/" || request.headers.host !== new URL(redirectUri).host || url.searchParams.get("state") !== state || consumed) {
        response.writeHead(400);
        response.end("Invalid authorization response");
        return;
      }
      const code2 = url.searchParams.get("code"), error = url.searchParams.get("error");
      if (!code2 && !error) {
        response.writeHead(400);
        response.end("Missing authorization response");
        return;
      }
      consumed = true;
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'",
        "Referrer-Policy": "no-referrer",
        Connection: "close"
      });
      response.once("finish", () => server.closeAllConnections());
      response.end("Google returned the authorization response. Return to Obsidian to check that sign-in completed.");
      finish(error ? new SyncFault("auth-denied", "Google authorization was denied", "source") : void 0, code2 ?? void 0);
    });
    const abort = () => finish(signal.reason instanceof Error ? signal.reason : new DOMException("Google authorization cancelled", "AbortError"));
    function finish(error, value) {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", abort);
      server.close();
      if (error) server.closeAllConnections();
      else server.closeIdleConnections();
      if (error) reject(error);
      else resolve(value);
    }
    signal.addEventListener("abort", abort, { once: true });
    server.once("error", (error) => finish(error));
    server.listen(0, "127.0.0.1", () => {
      if (finished || signal.aborted) {
        server.close();
        server.closeAllConnections();
        abort();
        return;
      }
      const address = server.address();
      if (!address || typeof address === "string") {
        finish(new Error("OAuth callback unavailable"));
        return;
      }
      redirectUri = `http://127.0.0.1:${address.port}/`;
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      for (const [key, value] of Object.entries({
        client_id: client.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: GOOGLE_SCOPES.join(" "),
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        access_type: "offline",
        prompt: "consent select_account"
      })) url.searchParams.set(key, value);
      Promise.resolve().then(() => {
        signal.throwIfAborted();
        options.observe?.({ stage: "waiting-browser", authorizationUrl: url.href });
        return openBrowser(url.href);
      }).catch(() => finish(signal.aborted ? signal.reason : new SyncFault("oauth-browser", "Could not open the system browser; retry Google sign-in", "source")));
    });
    if (signal.aborted) abort();
  });
  signal.throwIfAborted();
  options.observe?.({ stage: "exchanging-code" });
  return withGoogleTimeout(
    signal,
    options.exchangeTimeoutMs ?? 6e4,
    new SyncFault("network", "Google token exchange timed out; check connectivity and retry sign-in", "source", true),
    (exchangeSignal) => exchangeGoogleCode(transport2, client, code, verifier, redirectUri, exchangeSignal)
  );
}

// src/cloud.js
var ENGINES = {
  webdav: "WebDAV",
  google: "Google Drive",
  googlePublic: "Google Drive · публичная папка",
  yandexPublic: "Яндекс Диск · публичная папка",
  git: "Git · публичный репозиторий",
  yandex: "Яндекс Диск"
};
function cloudRoot(engine, input) {
  if (engine === "google") return driveRoot(input);
  if (engine !== "yandex") throw Error("Неизвестный сервис");
  const folder = input.trim().replace(/^(?:disk:)?\//, "").replace(/\/$/, "");
  return "disk:/" + path(folder, true);
}
var transport = {
  async fetch(url, opts = {}) {
    opts.signal?.throwIfAborted();
    const body = opts.body instanceof Uint8Array ? Uint8Array.from(opts.body).buffer : opts.body;
    let r;
    try {
      r = await (0, import_obsidian2.requestUrl)({
        url,
        method: opts.method || "GET",
        headers: opts.headers,
        body,
        throw: false
      });
    } catch {
      throw Error("Не удалось получить ответ облачного сервиса.");
    }
    opts.signal?.throwIfAborted();
    if (opts.maxBytes && r.arrayBuffer.byteLength > opts.maxBytes)
      throw Error("Ответ превышает допустимый размер.");
    const headers = Object.fromEntries(
      Object.entries(r.headers).map(([k, v]) => [k.toLowerCase(), v])
    );
    return {
      status: r.status,
      headers,
      text: async () => r.text,
      arrayBuffer: async () => r.arrayBuffer
    };
  }
};
async function signInGoogle(clientJSON, signal, openBrowser) {
  const client = parseGoogleClient(clientJSON);
  const grant = await authorizeGoogleDesktop(
    client,
    transport,
    signal,
    openBrowser
  );
  return JSON.stringify({
    client,
    refresh: grant.refreshToken,
    subject: grant.subject
  });
}
function googleTransport(credential, rotate) {
  if (credential.startsWith("{")) {
    let data;
    try {
      data = JSON.parse(credential);
    } catch {
      throw Error("Некорректные данные входа Google.");
    }
    if (!data.client?.clientId || !data.refresh || !data.subject)
      throw Error("Повторите вход в Google.");
    const port = {
      getSecret: () => data.refresh,
      setSecret: (_, token) => {
        data.refresh = token;
        rotate(JSON.stringify(data));
      }
    };
    return new GoogleAuthorizedTransport(
      transport,
      new GoogleTokenManager(
        data.client,
        "refresh",
        port,
        transport,
        Date.now,
        data.subject
      )
    );
  }
  return {
    fetch(url, options) {
      const u = new URL(url);
      if (u.origin !== "https://www.googleapis.com" || !/^\/(?:upload\/)?drive\/v3\//.test(u.pathname))
        throw Error("Неизвестный адрес Google Drive.");
      return transport.fetch(url, {
        ...options,
        headers: { ...options.headers, Authorization: "Bearer " + credential }
      });
    }
  };
}
async function openCloud(settings, credential, included, signal, rotate) {
  if (publicSource(settings.engine)) return openPublic(settings, credential, included, signal, transport);
  credential = credential.trim();
  if (!credential) throw Error("Укажите OAuth-токен или подключите аккаунт.");
  const root = cloudRoot(settings.engine, settings.url);
  let store, account;
  const rules = { file: included, folder: included };
  if (settings.engine === "google") {
    const http = googleTransport(credential, rotate);
    const about = await json(
      http,
      "https://www.googleapis.com/drive/v3/about?fields=user(permissionId)",
      { signal }
    );
    account = about.user?.permissionId;
    store = new DriveStore(
      http,
      settings.url,
      Number.MAX_SAFE_INTEGER,
      void 0,
      account,
      rules
    );
  } else {
    const about = await json(
      transport,
      "https://cloud-api.yandex.net/v1/disk?fields=user.uid",
      {
        signal,
        headers: { Authorization: "OAuth " + credential }
      }
    );
    account = about.user?.uid;
    store = new YandexStore(
      transport,
      root,
      credential,
      Number.MAX_SAFE_INTEGER,
      rules
    );
  }
  if (!["number", "string"].includes(typeof account) || !String(account).trim())
    throw Error("Сервис не подтвердил идентификатор аккаунта.");
  const snapshot = await store.scan(signal);
  if (!snapshot.complete) throw Error("Получен неполный список файлов.");
  return {
    identity: [settings.engine, String(account), root],
    snapshot,
    async read(path2) {
      const bytes2 = await store.read(snapshot.files[path2], signal);
      return Uint8Array.from(bytes2).buffer;
    },
    async write(path2, bytes2, expected, mtime) {
      const result = await store.write(
        path2,
        new Uint8Array(bytes2),
        expected,
        mtime,
        signal
      );
      return result.version;
    },
    async remove(path2) {
      await store.delete(snapshot.files[path2], true, signal);
    },
    async confirmAbsent(path2) {
      await store.confirmAbsent(path2, signal);
    }
  };
}

// src/google-login.js
var import_obsidian3 = require("obsidian");
var GoogleLogin = class extends import_obsidian3.Modal {
  constructor(app, lifetime, onGrant) {
    super(app);
    this.onGrant = onGrant;
    this.lifetime = lifetime;
    this.controller = new AbortController();
    this.cancel = () => this.close();
  }
  onOpen() {
    this.lifetime.addEventListener("abort", this.cancel, { once: true });
    this.setTitle("Подключить Google Drive");
    const el = this.contentEl;
    el.createEl("p", {
      text: "Выберите JSON OAuth-клиента типа Desktop app или вставьте его содержимое. Вход выполняется в браузере."
    });
    let raw = "", busy = false;
    const file = el.createEl("input", {
      attr: {
        type: "file",
        accept: ".json,application/json",
        "aria-label": "Файл OAuth-клиента"
      }
    });
    const paste = el.createEl("textarea", {
      attr: {
        "aria-label": "JSON OAuth-клиента",
        placeholder: "Или вставьте JSON здесь",
        spellcheck: "false",
        autocomplete: "off"
      }
    });
    const status = el.createEl("p", {
      attr: { role: "status", "aria-live": "polite" }
    });
    const links = el.createDiv();
    const actions = new import_obsidian3.Setting(el);
    let start;
    const validate = (value) => {
      raw = "";
      try {
        if (!value.trim()) {
          status.setText("Выберите файл или вставьте JSON.");
          return;
        }
        parseGoogleClient(value.trim().replace(/^\uFEFF/, ""));
        raw = value.trim();
        status.setText("Клиент Desktop app готов к входу.");
      } catch {
        status.setText(
          "Нужен корректный JSON клиента Desktop app с полем installed.client_id."
        );
      } finally {
        start.setDisabled(!raw || busy);
      }
    };
    let edit = 0;
    file.onchange = async () => {
      const seq = ++edit;
      const selected = file.files?.[0];
      if (!selected) return;
      paste.value = "";
      validate("");
      try {
        const text = await selected.text();
        if (seq === edit) validate(text);
      } catch {
        status.setText("Файл не удалось прочитать. Вставьте содержимое JSON.");
      }
    };
    paste.oninput = () => {
      edit++;
      file.value = "";
      validate(paste.value);
    };
    actions.addButton((b) => {
      start = b;
      b.setButtonText("Открыть вход Google").setCta().setDisabled(true).onClick(async () => {
        if (!raw || busy) return;
        busy = true;
        start.setDisabled(true);
        file.disabled = paste.disabled = true;
        links.empty();
        status.setText("Подготовка входа…");
        try {
          const grant = await signInGoogle(
            raw,
            this.controller.signal,
            async (url) => {
              status.setText(
                "Завершите вход в браузере и вернитесь в Obsidian."
              );
              links.createEl("a", {
                text: "Открыть страницу Google",
                href: url,
                attr: { target: "_blank", rel: "noopener noreferrer" }
              });
              new import_obsidian3.Setting(links).addButton(
                (copy) => copy.setButtonText("Скопировать ссылку").onClick(async () => {
                  try {
                    await el.ownerDocument.defaultView.navigator.clipboard.writeText(
                      url
                    );
                    status.setText("Ссылка скопирована.");
                  } catch {
                    status.setText(
                      "Используйте ссылку «Открыть страницу Google»."
                    );
                  }
                })
              );
              try {
                await require("electron").shell.openExternal(url);
              } catch {
                status.setText("Откройте страницу Google по ссылке ниже.");
              }
            }
          );
          if (!this.controller.signal.aborted) {
            this.onGrant(grant);
            this.close();
          }
        } catch (e) {
          if (!this.controller.signal.aborted)
            status.setText("Вход не завершён. " + (e.message || String(e)));
        } finally {
          busy = false;
          links.empty();
          start.setDisabled(!raw);
          file.disabled = paste.disabled = false;
        }
      });
    });
    actions.addButton(
      (b) => b.setButtonText("Отмена").onClick(() => this.close())
    );
  }
  onClose() {
    this.lifetime.removeEventListener("abort", this.cancel);
    this.controller.abort();
    this.contentEl.empty();
  }
};

// src/plugin.js
var { Platform: Platform2, Plugin, PluginSettingTab, Setting: Setting2, Notice, Modal: Modal2, TFile, TFolder, requestUrl: requestUrl2 } = require("obsidian");
var DIRECTIONS = { both: "В обе стороны", upload: "Из Obsidian в WebDAV", download: "Из WebDAV в Obsidian" };
var DELETIONS = { restore: "Восстанавливать копию", ignore: "Оставлять удалённым", propagate: "Передавать удаление" };
var CONFLICTS = { skip: "Пропускать с записью в отчёт", local: "Предпочитать Obsidian", remote: "Предпочитать WebDAV", newer: "Предпочитать более новую версию" };
var DEFAULTS = {
  name: "Основная",
  engine: "webdav",
  gitRef: "",
  gitFolder: "",
  url: "",
  user: "",
  folder: "",
  secret: "",
  direction: "both",
  deletion: "restore",
  conflict: "skip",
  interval: 0,
  startup: false,
  onEdit: false,
  delay: 15,
  onReconnect: false
};
var EMPTY_STATE = () => ({ scope: "", files: {} });
var LABELS = {
  upload: "Локально → WebDAV",
  download: "WebDAV → локально",
  deleteRemote: "Удалить на WebDAV",
  deleteLocal: "Переместить в корзину Obsidian",
  conflict: "Конфликт, требуется решение",
  ignore: "Пропущено по правилам пары",
  editDelete: "Конфликт: файл удалён с одной стороны и изменён с другой",
  unguarded: "Пропущено: сервер не дал строгий ETag"
};
function decide(config, local, remote, base, localTime, remoteTime) {
  if (local === remote) return "equal";
  const canUpload = config.direction !== "download";
  const canDownload = config.direction !== "upload";
  if (!local || !remote) {
    const transfer = local ? "upload" : "download";
    const mayCopy = local ? canUpload : canDownload;
    const mayDelete = local ? canDownload : canUpload;
    if (base && config.deletion === "ignore") return "ignore";
    if (base && config.deletion === "propagate" && mayDelete) {
      if ((local || remote) !== base.hash) return "editDelete";
      return local ? "deleteLocal" : "deleteRemote";
    }
    return mayCopy ? transfer : "ignore";
  }
  if (base && remote === base.hash && canUpload) return "upload";
  if (base && local === base.hash && canDownload) return "download";
  let winner = config.conflict;
  if (winner === "newer") {
    const l = Math.floor(localTime / 1e3), r = Math.floor(remoteTime / 1e3);
    if (!Number.isFinite(l) || !Number.isFinite(r) || l === r) return "conflict";
    winner = l > r ? "local" : "remote";
  }
  if (winner === "local" && canUpload) return "upload";
  if (winner === "remote" && canDownload) return "download";
  return "conflict";
}
var DAV = "DAV:";
var xmlBody = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getetag/><d:getlastmodified/></d:prop></d:propfind>';
var child = (node, name) => Array.from(node.children).find((el) => el.localName === name && el.namespaceURI === DAV);
var statusOK = (text) => /^HTTP\/\S+ 2\d\d(?:\s|$)/i.test(text.trim());
var strong = (tag) => typeof tag === "string" && /^"[^"\r\n]*"$/.test(tag);
var message = (error) => error instanceof Error ? error.message : String(error);
var parts = (p) => p ? p.split("/") : [];
var prefix = (a, b) => a ? a + "/" + b : b;
function safePart(name) {
  return name.length > 0 && !/^[.]|[. ]$|[<>:"/\\|?*\x00-\x1f\x7f]/.test(name) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
}
function isExcluded(vault, p) {
  return p === vault.configDir || p.startsWith(vault.configDir + "/") || parts(p).some((x) => x.startsWith("."));
}
function localRoot(vault, value) {
  const root = value.trim().replace(/^\/+|\/+$/g, "");
  if (parts(root).some((x) => !safePart(x)) || isExcluded(vault, root)) throw new Error("Проверьте путь к локальной папке.");
  if (root && !(vault.getAbstractFileByPath(root) instanceof TFolder)) throw new Error("Локальная папка не найдена: " + root);
  return root;
}
function endpoint(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Введите полный HTTPS-адрес папки WebDAV.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    throw new Error("Нужен HTTPS-адрес папки без логина, пароля и параметров в URL.");
  url.pathname = url.pathname.replace(/\/*$/, "/");
  return url;
}
async function hash(buffer) {
  const bytes2 = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  return Array.from(bytes2, (b) => b.toString(16).padStart(2, "0")).join("");
}
var WebDav = class {
  constructor(url, user, password) {
    this.base = url;
    this.auth = "";
    if (user || password) {
      if (user.includes(":")) throw new Error("Логин WebDAV содержит двоеточие.");
      const bytes2 = new TextEncoder().encode(user + ":" + password);
      this.auth = "Basic " + btoa(Array.from(bytes2, (b) => String.fromCharCode(b)).join(""));
    }
  }
  url(path2) {
    return this.base.href + parts(path2).map(encodeURIComponent).join("/");
  }
  async request(method, path2, headers = {}, body, directory = false) {
    const url = this.url(path2) + (directory && path2 ? "/" : "");
    if (this.auth) headers.Authorization = this.auth;
    return await requestUrl2({ url, method, headers, body, throw: false });
  }
  check(response, codes, method, path2) {
    if (!codes.includes(response.status)) {
      const reason = response.status === 412 ? " — файл успел измениться. Повторите проверку." : response.status === 401 || response.status === 403 ? " — проверьте пароль приложения и права доступа." : "";
      throw new Error(method + " " + (path2 || "/") + " · HTTP " + response.status + reason);
    }
  }
  async list(path2) {
    const response = await this.request("PROPFIND", path2, { Depth: "1", "Content-Type": "application/xml; charset=utf-8" }, xmlBody, true);
    this.check(response, [207], "PROPFIND", path2);
    const doc = new DOMParser().parseFromString(response.text, "application/xml");
    if (doc.documentElement.localName !== "multistatus" || doc.documentElement.namespaceURI !== DAV)
      throw new Error("Сервер не вернул список WebDAV.");
    const folder = new URL(this.url(path2) + (path2 ? "/" : ""));
    const decode = (pathname) => pathname.replace(/\/$/, "").split("/").map(decodeURIComponent);
    const parent = decode(folder.pathname);
    const entries = [];
    let foundFolder = false;
    for (const item of Array.from(doc.documentElement.children).filter((el) => el.localName === "response" && el.namespaceURI === DAV)) {
      const href = child(item, "href")?.textContent;
      if (!href) throw new Error("В ответе WebDAV отсутствует href.");
      const target = new URL(href, folder);
      const segments = decode(target.pathname);
      if (target.origin !== folder.origin || !parent.every((s, i) => segments[i] === s) || segments.length > parent.length + 1)
        throw new Error("Сервер вернул путь за пределами запрошенной папки.");
      const props = Array.from(item.children).filter((el) => el.namespaceURI === DAV && el.localName === "propstat" && statusOK(child(el, "status")?.textContent || "")).map((el) => child(el, "prop")).filter(Boolean);
      const type = props.map((p) => child(p, "resourcetype")).find(Boolean);
      if (!type) throw new Error("Сервер не сообщил тип объекта: " + target.pathname);
      const directory = Boolean(child(type, "collection"));
      if (segments.length === parent.length) {
        foundFolder = directory;
        continue;
      }
      const name = segments.at(-1);
      if (name.startsWith(".")) continue;
      if (!safePart(name)) throw new Error("Неподдерживаемое имя в WebDAV: " + name);
      if (type.children.length && !directory) throw new Error("Неподдерживаемый тип WebDAV: " + name);
      const tag = props.map((p) => child(p, "getetag")?.textContent.trim()).find(Boolean) || "";
      const stamp = props.map((p) => child(p, "getlastmodified")?.textContent.trim()).find(Boolean);
      entries.push({ path: prefix(path2, name), directory, tag, mtime: Date.parse(stamp || "") });
    }
    if (!foundFolder) throw new Error("Укажите адрес существующей папки WebDAV.");
    return entries;
  }
  async read(path2, tag) {
    const response = await this.request("GET", path2, strong(tag) ? { "If-Match": tag } : {});
    this.check(response, [200], "GET", path2);
    return response.arrayBuffer;
  }
  async write(path2, bytes2, entry) {
    if (entry && !strong(entry.tag)) throw new Error("Для перезаписи сервер должен вернуть строгий ETag: " + path2);
    const condition = entry ? { "If-Match": entry.tag } : { "If-None-Match": "*" };
    const response = await this.request("PUT", path2, { ...condition, "Content-Type": "application/octet-stream" }, bytes2);
    this.check(response, [200, 201, 204], "PUT", path2);
    return Object.entries(response.headers).find(([name]) => name.toLowerCase() === "etag")?.[1] || "";
  }
  async remove(path2, tag) {
    if (!strong(tag)) throw new Error("Невозможно проверить версию перед удалением: " + path2);
    const response = await this.request("DELETE", path2, { "If-Match": tag });
    this.check(response, [200, 204], "DELETE", path2);
  }
  async confirmAbsent(path2) {
    const response = await this.request("PROPFIND", path2, { Depth: "0", "Content-Type": "application/xml" }, xmlBody);
    this.check(response, [404, 410], "Проверка удаления", path2);
  }
  async mkdir(path2) {
    const response = await this.request("MKCOL", path2, { "If-None-Match": "*" }, void 0, true);
    if ([405, 412].includes(response.status)) {
      await this.list(path2);
      return;
    }
    this.check(response, [201], "MKCOL", path2);
  }
};
var Report = class extends Modal2 {
  constructor(app, title, rows) {
    super(app);
    this.title = title;
    this.rows = rows;
  }
  onOpen() {
    this.contentEl.createEl("h2", { text: this.title });
    if (!this.rows.length) this.contentEl.createEl("p", { text: "Действий не требуется." });
    const list = this.contentEl.createEl("ul");
    for (const row of this.rows) list.createEl("li", { text: row });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var VaultFolderSync = class extends Plugin {
  async onload() {
    const saved = await this.loadData() || {};
    const pairs = Array.isArray(saved.pairs) && saved.pairs.length ? saved.pairs : [{ id: "main", settings: saved.settings, state: saved.state }];
    this.pairs = pairs.map((pair) => ({ id: pair.id, settings: { ...DEFAULTS, ...pair.settings }, state: pair.state || EMPTY_STATE() }));
    this.selected = this.pairs.find((pair) => pair.id === saved.selected)?.id || this.pairs[0].id;
    this.advanced = saved.advanced === true;
    this.passwords = /* @__PURE__ */ new Map();
    this.reports = /* @__PURE__ */ new Map();
    this.pending = /* @__PURE__ */ new Set();
    this.intervals = /* @__PURE__ */ new Map();
    this.timeouts = /* @__PURE__ */ new Map();
    this.active = true;
    this.lifetime = new AbortController();
    this.saves = Promise.resolve();
    this.settingsTab = new SettingsTab(this.app, this);
    this.addSettingTab(this.settingsTab);
    this.addRibbonIcon("refresh-cw", "Синхронизировать выбранную пару", () => this.run(false, true));
    this.addCommand({ id: "preview", name: "Предпросмотр выбранной пары", callback: () => this.run(true, true) });
    this.addCommand({ id: "sync", name: "Синхронизировать выбранную пару", callback: () => this.run(false, true) });
    this.addCommand({ id: "report", name: "Последний отчёт выбранной пары", callback: () => this.showReport(this.selected) });
    await this.persist();
    this.app.workspace.onLayoutReady(() => {
      if (!this.active) return;
      this.ready = true;
      for (const event of ["create", "modify", "delete", "rename"]) {
        this.registerEvent(this.app.vault.on(event, (file, oldPath) => this.localEvent(file.path, oldPath)));
      }
      this.registerDomEvent(window, "online", () => {
        for (const pair of this.pairs) if (pair.settings.onReconnect) this.enqueue(pair.id);
        this.drain();
      });
      for (const pair of this.pairs) {
        this.schedule(pair);
        if (pair.settings.startup) this.enqueue(pair.id);
      }
    });
  }
  pair(id = this.selected) {
    return this.pairs.find((pair) => pair.id === id);
  }
  onunload() {
    this.active = false;
    this.lifetime.abort();
    for (const timer of this.intervals.values()) clearInterval(timer);
    for (const timer of this.timeouts.values()) clearTimeout(timer);
    this.pending.clear();
    this.passwords.clear();
  }
  persist() {
    const snapshot = {
      version: 2,
      selected: this.selected,
      advanced: this.advanced,
      pairs: this.pairs.map(({ id, settings, state }) => ({ id, settings: { ...settings }, state }))
    };
    this.saves = this.saves.catch(() => {
    }).then(() => this.saveData(snapshot));
    return this.saves;
  }
  schedule(pair) {
    clearInterval(this.intervals.get(pair.id));
    clearTimeout(this.timeouts.get(pair.id));
    this.intervals.delete(pair.id);
    this.timeouts.delete(pair.id);
    if (this.ready && pair.settings.interval > 0) {
      this.intervals.set(pair.id, setInterval(() => this.enqueue(pair.id), pair.settings.interval * 6e4));
    }
  }
  localEvent(path2, oldPath) {
    const configDir = this.app.vault.configDir;
    for (const { id, settings } of this.pairs) {
      const root = settings.folder.trim().replace(/^\/+|\/+$/g, "");
      const relevant = (p) => typeof p === "string" && p !== configDir && !p.startsWith(configDir + "/") && !parts(p).some((x) => x.startsWith(".")) && (!root || p === root || p.startsWith(root + "/") || root.startsWith(p + "/"));
      if (!settings.onEdit || !(relevant(path2) || relevant(oldPath))) continue;
      clearTimeout(this.timeouts.get(id));
      this.timeouts.set(id, setTimeout(() => {
        this.timeouts.delete(id);
        this.enqueue(id);
      }, settings.delay * 1e3));
    }
  }
  password(pair) {
    const s = pair.settings;
    return this.passwords.get(pair.id) || s.secret && this.app.secretStorage?.getSecret(s.secret) || "";
  }
  enqueue(id) {
    this.pending.add(id);
    this.drain();
  }
  drain() {
    if (!this.active || this.busy || this.editingSettings || navigator.onLine === false) return;
    for (const id of this.pending) {
      const pair = this.pair(id);
      if (!pair || !pair.settings.url) {
        this.pending.delete(id);
        continue;
      }
      if (needsCredential(pair.settings) && !this.password(pair)) continue;
      this.pending.delete(id);
      void this.run(false, false, id);
      break;
    }
  }
  showReport(id) {
    const report = this.reports.get(id);
    if (!report) {
      new Notice("Проверка ещё не запускалась.");
      return;
    }
    new Report(this.app, report.title, report.rows).open();
  }
  async run(preview, manual, id = this.selected) {
    if (this.busy) {
      if (manual) new Notice("Другая синхронизация уже выполняется.");
      return;
    }
    const pair = this.pair(id);
    if (!pair || !this.active) return;
    this.busy = true;
    const rows = [];
    let title = preview ? "Предпросмотр" : "Результат синхронизации";
    try {
      const summary = await this.sync(pair, preview, rows);
      if (this.active && !manual && summary) new Notice(pair.settings.name + " · " + summary);
    } catch (error) {
      rows.push("Остановлено: " + message(error));
      title = "Синхронизация прервана";
      if (this.active && !manual) new Notice(pair.settings.name + " · " + rows.at(-1), 8e3);
    } finally {
      this.busy = false;
      this.reports.set(id, { title: title + " · " + pair.settings.name, rows });
      if (manual && this.active) this.showReport(id);
      queueMicrotask(() => this.drain());
    }
  }
  async sync(pair, preview, rows) {
    const config = { ...pair.settings };
    const webdav = config.engine === "webdav";
    if (publicSource(config.engine)) config.direction = "download";
    const vault = this.app.vault;
    const root = localRoot(vault, config.folder);
    const excluded = (p) => isExcluded(vault, p);
    const full = (p) => prefix(root, p);
    const credential = this.password(pair);
    const rotate = (value) => {
      if (this.passwords.get(pair.id)) {
        this.passwords.set(pair.id, value);
        if (this.settingsTab.draftId === pair.id && this.settingsTab.pass === credential) this.settingsTab.pass = value;
      } else if (config.secret) this.app.secretStorage.setSecret(config.secret, value);
    };
    const backend = webdav ? new WebDav(endpoint(config.url), config.user.trim(), credential) : await openCloud(config, credential, (path2) => !excluded(full(path2)), this.lifetime.signal, rotate);
    try {
      const scope = JSON.stringify(webdav ? [backend.base.href, config.user.trim(), root] : [...backend.identity, root]);
      return await this.syncFiles(pair, config, preview, rows, backend, scope, root);
    } finally {
      await backend.close?.();
    }
  }
  async syncFiles(pair, config, preview, rows, backend, scope, root) {
    const vault = this.app.vault;
    const full = (p) => prefix(root, p);
    const excluded = (p) => isExcluded(vault, p);
    const webdav = config.engine === "webdav";
    const label = (action) => LABELS[action].replace("WebDAV", ENGINES[config.engine]);
    const baseline = new Map(pair.state.scope === scope ? Object.entries(pair.state.files) : []);
    const next = new Map(baseline);
    const files = /* @__PURE__ */ new Map(), remote = /* @__PURE__ */ new Map(), dirs = /* @__PURE__ */ new Set([""]);
    const names = /* @__PURE__ */ new Map();
    const track = (p, directory) => {
      const key = p.normalize("NFC").toLowerCase();
      const other = names.get(key);
      if (other && (other.path !== p || other.directory !== directory))
        throw new Error("Несовместимые пути: " + other.path + " и " + p);
      names.set(key, { path: p, directory });
    };
    for (const file of vault.getAllLoadedFiles()) {
      if (file.path === "/" || !file.path || root && !file.path.startsWith(root + "/") || excluded(file.path)) continue;
      const path2 = root ? file.path.slice(root.length + 1) : file.path;
      if (parts(path2).some((x) => !safePart(x))) throw new Error("Неподдерживаемый локальный путь: " + path2);
      track(path2, file instanceof TFolder);
      if (file instanceof TFile) files.set(path2, file);
    }
    const ensureActive = () => {
      if (!this.active) throw new Error("Плагин выключен.");
    };
    const addEntry = (entry) => {
      if (excluded(full(entry.path))) return;
      if (parts(entry.path).some((part) => !safePart(part))) throw Error("Неподдерживаемый путь: " + entry.path);
      track(entry.path, Boolean(entry.directory));
      if (entry.directory) dirs.add(entry.path);
      else remote.set(entry.path, entry);
    };
    if (webdav) {
      const pending = [""];
      while (pending.length) {
        ensureActive();
        for (const entry of await backend.list(pending.pop())) {
          if (excluded(full(entry.path))) continue;
          if (entry.directory && !dirs.has(entry.path)) pending.push(entry.path);
          addEntry(entry);
        }
      }
    } else {
      for (const path2 of backend.snapshot.directories) addEntry({ path: path2, directory: true });
      for (const entry of Object.values(backend.snapshot.files)) addEntry(entry);
    }
    const getLocal = async (p, file) => {
      if (vault.getAbstractFileByPath(full(p)) !== file) throw new Error("Локальный путь изменился: " + p);
      return await vault.readBinary(file);
    };
    const parents = async (path2, onServer) => {
      let dir = "";
      for (const part of parts(path2).slice(0, -1)) {
        dir = prefix(dir, part);
        if (onServer) {
          if (!dirs.has(dir)) {
            await backend.mkdir(dir);
            dirs.add(dir);
          }
        } else if (!vault.getAbstractFileByPath(full(dir))) await vault.createFolder(full(dir));
      }
    };
    let changed = 0, conflicts = 0;
    try {
      for (const path2 of /* @__PURE__ */ new Set([...files.keys(), ...remote.keys()])) {
        ensureActive();
        const file = files.get(path2), entry = remote.get(path2), base = baseline.get(path2);
        if (entry?.hash?.startsWith("unsupported:")) {
          rows.push("Пропущен документ Google или ярлык · " + path2);
          next.delete(path2);
          continue;
        }
        const localBytes = file && await getLocal(path2, file);
        const localHash = file && await hash(localBytes);
        let remoteBytes, remoteHash;
        if (entry) {
          if (!webdav) remoteHash = entry.hash;
          else if (strong(entry.tag) && base?.tag === entry.tag) remoteHash = base.hash;
          else {
            remoteBytes = await backend.read(path2, entry.tag);
            remoteHash = await hash(remoteBytes);
          }
        }
        if (file && entry && localHash === remoteHash) {
          next.set(path2, { hash: localHash, tag: entry.tag });
          continue;
        }
        let action = decide(config, localHash, remoteHash, base, file?.stat?.mtime, entry?.mtime);
        if ((action === "upload" || action === "deleteRemote") && webdav && entry && !strong(entry.tag)) action = "unguarded";
        if (["ignore", "conflict", "editDelete", "unguarded"].includes(action)) {
          if (action !== "ignore") conflicts++;
          rows.push(label(action) + " · " + path2);
          continue;
        }
        if (!preview) {
          ensureActive();
          if (action === "deleteRemote") {
            if (root && !(vault.getAbstractFileByPath(root) instanceof TFolder) || await vault.adapter.exists(full(path2)))
              throw new Error("Локальный путь изменился: " + path2);
            await backend.remove(path2, entry.tag);
            next.delete(path2);
          } else if (action === "deleteLocal") {
            await backend.confirmAbsent(path2);
            if (await hash(await getLocal(path2, file)) !== localHash) throw new Error("Локальный файл изменился: " + path2);
            await vault.trash(file, false);
            next.delete(path2);
          } else if (action === "upload") {
            if (webdav) await parents(path2, true);
            const tag = await backend.write(path2, localBytes, entry, file.stat?.mtime);
            next.set(path2, { hash: localHash, tag });
          } else {
            if (!remoteBytes) remoteBytes = await backend.read(path2, entry.tag);
            if (!webdav && await hash(remoteBytes) !== remoteHash) throw Error("Содержимое облачного файла изменилось: " + path2);
            ensureActive();
            await parents(path2, false);
            if (file) {
              const changedDuringRead = () => new Error("Файл изменился во время загрузки: " + path2);
              if (/\.md$/i.test(path2)) {
                const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
                const expected = decoder.decode(localBytes);
                const incoming = decoder.decode(remoteBytes);
                await vault.process(file, (current) => {
                  if (current !== expected) throw changedDuringRead();
                  return incoming;
                });
              } else {
                if (await hash(await getLocal(path2, file)) !== localHash) throw changedDuringRead();
                await vault.modifyBinary(file, remoteBytes);
              }
            } else {
              if (vault.getAbstractFileByPath(full(path2))) throw new Error("Локальный файл уже появился: " + path2);
              await vault.createBinary(full(path2), remoteBytes);
            }
            next.set(path2, { hash: remoteHash, tag: entry.tag });
          }
        }
        changed++;
        rows.push(label(action) + " · " + path2);
      }
      for (const path2 of baseline.keys()) if (!files.has(path2) && !remote.has(path2)) next.delete(path2);
    } finally {
      if (!preview) {
        pair.state = { scope, files: Object.fromEntries(next) };
        await this.persist();
      }
    }
    return changed || conflicts ? "Выполнено: " + changed + ", требуют внимания: " + conflicts : "";
  }
};
var RemovePair = class extends Modal2 {
  constructor(app, name, remove) {
    super(app);
    this.name = name;
    this.remove = remove;
  }
  onOpen() {
    this.contentEl.createEl("h3", { text: "Убрать пару «" + this.name + "»?" });
    this.contentEl.createEl("p", { text: "Будут удалены настройки пары и история сравнения. Файлы останутся в обеих папках." });
    new Setting2(this.contentEl).addButton((b) => b.setButtonText("Отмена").onClick(() => this.close())).addButton((b) => b.setButtonText("Убрать пару").setWarning().onClick(async () => {
      this.close();
      await this.remove();
    }));
  }
};
var SettingsTab = class extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  hide() {
    this.plugin.editingSettings = false;
    this.draft = null;
    this.pass = "";
    this.keepSecret = false;
    this.plugin.drain();
  }
  display() {
    const plugin = this.plugin, pair = plugin.pair(), el = this.containerEl;
    plugin.editingSettings = true;
    if (!this.draft || this.draftId !== pair.id) {
      this.draft = { ...pair.settings };
      this.draftId = pair.id;
      this.keepSecret = false;
      this.pass = plugin.passwords.get(pair.id) || "";
    }
    const s = this.draft;
    el.empty();
    el.createEl("h2", { text: "Vault Folder Sync" });
    const unlocked = () => {
      if (plugin.busy) {
        new Notice("Дождитесь завершения синхронизации.");
        return false;
      }
      return true;
    };
    const select = async (id) => {
      plugin.selected = id;
      this.draft = null;
      await plugin.persist();
      this.display();
    };
    new Setting2(el).setName("Пара папок").setDesc("Команды и кнопка на ленте работают с выбранной парой.").addDropdown((d) => {
      for (const p of plugin.pairs) d.addOption(p.id, p.settings.name);
      d.setValue(pair.id).onChange(select);
    }).addButton((b) => b.setButtonText("Добавить").onClick(async () => {
      if (!unlocked()) return;
      const id = crypto.randomUUID();
      plugin.pairs.push({ id, settings: { ...DEFAULTS, name: "Пара " + (plugin.pairs.length + 1) }, state: EMPTY_STATE() });
      await select(id);
    })).addButton((b) => b.setButtonText("Убрать").setDisabled(plugin.pairs.length < 2).onClick(() => {
      if (!unlocked()) return;
      new RemovePair(this.app, pair.settings.name, async () => {
        if (!unlocked() || plugin.pairs.length < 2) return;
        clearInterval(plugin.intervals.get(pair.id));
        clearTimeout(plugin.timeouts.get(pair.id));
        plugin.intervals.delete(pair.id);
        plugin.timeouts.delete(pair.id);
        plugin.pending.delete(pair.id);
        plugin.passwords.delete(pair.id);
        plugin.reports.delete(pair.id);
        plugin.pairs = plugin.pairs.filter((p) => p.id !== pair.id);
        await select(plugin.pairs[0].id);
      }).open();
    }));
    new Setting2(el).setName("Режим настроек").addDropdown((d) => d.addOption("basic", "Основные").addOption("advanced", "Расширенные").setValue(plugin.advanced ? "advanced" : "basic").onChange(async (v) => {
      plugin.advanced = v === "advanced";
      await plugin.persist();
      this.display();
    }));
    let passwordText, secretText;
    const field = (key, label, desc, placeholder = "") => new Setting2(el).setName(label).setDesc(desc).addText((t) => {
      if (key === "secret") secretText = t;
      t.setValue(s[key]).setPlaceholder(placeholder).onChange((v) => {
        if (s.engine === "webdav" && (key === "url" || key === "user") && s[key] !== v) {
          this.pass = "";
          s.secret = "";
          passwordText?.setValue("");
          secretText?.setValue("");
        }
        s[key] = v;
      });
    });
    const choice = (key, label, desc, options) => new Setting2(el).setName(label).setDesc(desc).addDropdown((d) => {
      for (const [k, v] of Object.entries(options)) d.addOption(k, v);
      d.setValue(String(s[key])).onChange((v) => {
        s[key] = typeof DEFAULTS[key] === "number" ? Number(v) : v;
      });
    });
    const toggle = (key, label, desc) => new Setting2(el).setName(label).setDesc(desc).addToggle((t) => t.setValue(s[key]).onChange((v) => {
      s[key] = v;
    }));
    field("name", "Название пары", "Отображается в списке пар и в отчёте.");
    field("folder", "Папка в Obsidian", "Путь от корня хранилища. Пустое поле включает всё хранилище.", "Заметки/Работа");
    new Setting2(el).setName("Сервис").addDropdown((d) => {
      for (const [key, name] of Object.entries(ENGINES)) d.addOption(key, name);
      d.setValue(s.engine).onChange((engine) => {
        Object.assign(s, { engine, url: "", user: "", secret: "", gitRef: "", gitFolder: "" });
        if (publicSource(engine)) s.direction = "download";
        this.pass = "";
        this.keepSecret = false;
        this.display();
      });
    });
    if (s.engine === "webdav") {
      field("url", "Адрес папки WebDAV", "Полный HTTPS-адрес существующей папки.", "https://cloud.example/dav/Notes/");
      field("user", "Имя пользователя", "Логин WebDAV.");
    } else if (s.engine === "git") {
      field("url", "HTTPS URL репозитория", "Для GitHub можно использовать URL с окончаниями .git и без него.", "https://github.com/owner/repo");
      field("gitRef", "Ветка, тег или коммит", "Пустое поле означает HEAD.", "main");
      field("gitFolder", "Папка в репозитории", "Путь от корня. Пустое поле включает весь репозиторий.", "docs");
    } else if (s.engine === "yandexPublic") {
      field("url", "Публичная ссылка Яндекс Диска", "Ссылка общего доступа к папке.", "https://disk.yandex.ru/d/…");
    } else if (s.engine === "googlePublic") {
      field("url", "Публичная папка Google Drive", "Ссылка с доступом для всех, у кого она есть, или ID папки.", "https://drive.google.com/drive/folders/…");
    } else if (s.engine === "google") {
      field("url", "Папка Google Drive", "Ссылка или ID существующей папки. Для корня используйте root.", "https://drive.google.com/drive/folders/…");
    } else {
      field("url", "Папка Яндекс Диска", "Путь к существующей папке. Для корня используйте disk:/.", "disk:/Заметки");
    }
    const isCloud = s.engine !== "webdav";
    if (!["git", "yandexPublic"].includes(s.engine)) new Setting2(el).setName(s.engine === "googlePublic" ? "Google Drive API key" : isCloud ? "OAuth-токен" : "Пароль приложения").setDesc(s.engine === "googlePublic" ? "Ключ проекта с включённым Google Drive API. Вход в аккаунт не требуется." : isCloud ? "Токен аккаунта с доступом к выбранной папке." : "Хранится в памяти до выключения плагина.").addText((t) => {
      passwordText = t;
      t.inputEl.type = "password";
      t.inputEl.autocomplete = "off";
      t.setValue(this.pass).onChange((v) => {
        this.pass = v;
      });
    });
    if (s.engine === "google" && Platform2?.isDesktopApp) {
      new Setting2(el).setName("Подключить аккаунт Google").setDesc("Импортируйте JSON клиента Desktop app из файла или буфера обмена.").addButton((b) => b.setButtonText("Подключить через JSON").onClick(() => {
        new GoogleLogin(this.app, plugin.lifetime.signal, (grant) => {
          if (this.draft !== s || s.engine !== "google") return;
          this.pass = grant;
          this.display();
          new Notice("Аккаунт подключён. Сохраните настройки пары.");
        }).open();
      }));
    }
    if (s.engine === "google" && !Platform2?.isDesktopApp)
      el.createEl("p", { text: "На мобильном устройстве введите OAuth-токен. Для общедоступной папки выберите «Google Drive · публичная папка»." });
    if (isCloud && needsCredential(s) && this.app.secretStorage) {
      new Setting2(el).setName("Сохранить ключ или токен в связке ключей Obsidian").setDesc("Позволяет выполнять автообмен после перезапуска. Применяется при сохранении пары.").addToggle((t) => t.setValue(this.keepSecret).onChange((v) => {
        this.keepSecret = v;
      }));
    }
    if (publicSource(s.engine)) new Setting2(el).setName("Направление обмена").setDesc("Только получение в Obsidian.");
    else choice("direction", "Направление обмена", "Односторонний режим разрешает изменения только в папке назначения.", Object.fromEntries(Object.entries(DIRECTIONS).map(([k, v]) => [k, v.replace("WebDAV", ENGINES[s.engine])])));
    if (plugin.advanced) {
      if (this.app.secretStorage && !["git", "yandexPublic"].includes(s.engine)) field("secret", "Имя секрета Obsidian", "Для запуска после перезапуска укажите имя существующего секрета с паролем. Пароль сеанса имеет приоритет.");
      choice("deletion", "Удаление файлов", "Удаление передаётся только для ранее синхронизированного файла. Изменённая оставшаяся копия попадёт в отчёт.", DELETIONS);
      choice("conflict", "Разрешение конфликтов", "Применяется и при первом сравнении разных версий. Если выбор противоречит направлению обмена, файл будет пропущен.", { ...CONFLICTS, remote: "Предпочитать " + ENGINES[s.engine] });
      el.createEl("h3", { text: "Автосинхронизация" });
      toggle("startup", "При открытии хранилища", "После загрузки хранилища и получения доступа к сервису.");
      toggle("onEdit", "При изменении в Obsidian", "Создание, правка, перемещение или удаление внутри локальной папки.");
      choice("delay", "Пауза после правки", "Отсчитывается от последнего события.", { 5: "5 секунд", 15: "15 секунд", 30: "30 секунд", 60: "1 минута" });
      toggle("onReconnect", "При восстановлении сети", "Запуск при получении события подключения от системы.");
    } else {
      el.createEl("p", { text: "Удаления: " + DELETIONS[s.deletion] + ". Конфликты: " + CONFLICTS[s.conflict].replace("WebDAV", ENGINES[s.engine]) + "." });
    }
    choice("interval", "Повторять по таймеру", "Для автоматического обмена Obsidian должен быть запущен.", {
      0: "Выключено",
      5: "Каждые 5 минут",
      15: "Каждые 15 минут",
      30: "Каждые 30 минут",
      60: "Каждый час",
      360: "Каждые 6 часов",
      1440: "Каждые 24 часа"
    });
    const save = async () => {
      if (!unlocked()) return false;
      try {
        if (s.engine === "webdav") endpoint(s.url);
        else {
          if (!s.url.trim()) throw Error("Укажите удалённую папку.");
          if (publicSource(s.engine)) {
            publicRoot(s);
            s.direction = "download";
          } else cloudRoot(s.engine, s.url);
        }
        const folder = localRoot(this.app.vault, s.folder);
        if (!s.name.trim()) throw new Error("Введите название пары.");
        const old = pair.settings;
        if (this.keepSecret && this.pass && s.engine !== "webdav") {
          const ref = "vault-folder-sync-" + pair.id + "-" + s.engine;
          this.app.secretStorage.setSecret(ref, this.pass);
          s.secret = ref;
          this.pass = "";
          this.keepSecret = false;
          passwordText?.setValue("");
          secretText?.setValue(ref);
        }
        pair.settings = { ...s, name: s.name.trim(), folder, url: s.url.trim(), user: s.user.trim(), secret: s.secret.trim() };
        plugin.passwords.set(pair.id, this.pass);
        if (old.gitFolder !== s.gitFolder || old.gitRef !== s.gitRef || old.engine !== s.engine || old.url !== pair.settings.url || old.user !== pair.settings.user || old.folder !== folder) {
          pair.state = EMPTY_STATE();
          plugin.pending.delete(pair.id);
        }
        if (!pair.settings.onEdit && !pair.settings.interval && !pair.settings.onReconnect && !pair.settings.startup) plugin.pending.delete(pair.id);
        plugin.schedule(pair);
        await plugin.persist();
        return true;
      } catch (e) {
        new Notice(message(e), 8e3);
        return false;
      }
    };
    new Setting2(el).setName("Применить настройки пары").setDesc("Сохраните изменения перед переключением пары. Предпросмотр и запуск также сохраняют форму.").addButton((b) => b.setButtonText("Сохранить").onClick(async () => {
      if (await save()) {
        this.display();
        new Notice("Пара сохранена.");
      }
    })).addButton((b) => b.setButtonText("Предпросмотр").onClick(async () => {
      if (await save()) await plugin.run(true, true, pair.id);
    })).addButton((b) => b.setButtonText("Синхронизировать").setCta().onClick(async () => {
      if (await save()) await plugin.run(false, true, pair.id);
    }));
  }
};
module.exports = VaultFolderSync;
/*! Bundled license information:

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
