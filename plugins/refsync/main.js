"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/base64-js/index.js
var require_base64_js = __commonJS({
  "node_modules/base64-js/index.js"(exports) {
    "use strict";
    init_git_buffer();
    exports.byteLength = byteLength;
    exports.toByteArray = toByteArray;
    exports.fromByteArray = fromByteArray;
    var lookup = [];
    var revLookup = [];
    var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
    var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (i = 0, len = code.length; i < len; ++i) {
      lookup[i] = code[i];
      revLookup[code.charCodeAt(i)] = i;
    }
    var i;
    var len;
    revLookup["-".charCodeAt(0)] = 62;
    revLookup["_".charCodeAt(0)] = 63;
    function getLens(b64) {
      var len2 = b64.length;
      if (len2 % 4 > 0) {
        throw new Error("Invalid string. Length must be a multiple of 4");
      }
      var validLen = b64.indexOf("=");
      if (validLen === -1) validLen = len2;
      var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
      return [validLen, placeHoldersLen];
    }
    function byteLength(b64) {
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function _byteLength(b64, validLen, placeHoldersLen) {
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function toByteArray(b64) {
      var tmp;
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
      var curByte = 0;
      var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
      var i2;
      for (i2 = 0; i2 < len2; i2 += 4) {
        tmp = revLookup[b64.charCodeAt(i2)] << 18 | revLookup[b64.charCodeAt(i2 + 1)] << 12 | revLookup[b64.charCodeAt(i2 + 2)] << 6 | revLookup[b64.charCodeAt(i2 + 3)];
        arr[curByte++] = tmp >> 16 & 255;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 2) {
        tmp = revLookup[b64.charCodeAt(i2)] << 2 | revLookup[b64.charCodeAt(i2 + 1)] >> 4;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 1) {
        tmp = revLookup[b64.charCodeAt(i2)] << 10 | revLookup[b64.charCodeAt(i2 + 1)] << 4 | revLookup[b64.charCodeAt(i2 + 2)] >> 2;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      return arr;
    }
    function tripletToBase64(num2) {
      return lookup[num2 >> 18 & 63] + lookup[num2 >> 12 & 63] + lookup[num2 >> 6 & 63] + lookup[num2 & 63];
    }
    function encodeChunk(uint8, start, end) {
      var tmp;
      var output = [];
      for (var i2 = start; i2 < end; i2 += 3) {
        tmp = (uint8[i2] << 16 & 16711680) + (uint8[i2 + 1] << 8 & 65280) + (uint8[i2 + 2] & 255);
        output.push(tripletToBase64(tmp));
      }
      return output.join("");
    }
    function fromByteArray(uint8) {
      var tmp;
      var len2 = uint8.length;
      var extraBytes = len2 % 3;
      var parts = [];
      var maxChunkLength = 16383;
      for (var i2 = 0, len22 = len2 - extraBytes; i2 < len22; i2 += maxChunkLength) {
        parts.push(encodeChunk(uint8, i2, i2 + maxChunkLength > len22 ? len22 : i2 + maxChunkLength));
      }
      if (extraBytes === 1) {
        tmp = uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
        );
      } else if (extraBytes === 2) {
        tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
        );
      }
      return parts.join("");
    }
  }
});

// node_modules/ieee754/index.js
var require_ieee754 = __commonJS({
  "node_modules/ieee754/index.js"(exports) {
    init_git_buffer();
    exports.read = function(buffer, offset, isLE, mLen, nBytes) {
      var e, m;
      var eLen = nBytes * 8 - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var nBits = -7;
      var i = isLE ? nBytes - 1 : 0;
      var d = isLE ? -1 : 1;
      var s = buffer[offset + i];
      i += d;
      e = s & (1 << -nBits) - 1;
      s >>= -nBits;
      nBits += eLen;
      for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {
      }
      m = e & (1 << -nBits) - 1;
      e >>= -nBits;
      nBits += mLen;
      for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {
      }
      if (e === 0) {
        e = 1 - eBias;
      } else if (e === eMax) {
        return m ? NaN : (s ? -1 : 1) * Infinity;
      } else {
        m = m + Math.pow(2, mLen);
        e = e - eBias;
      }
      return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
    };
    exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
      var e, m, c;
      var eLen = nBytes * 8 - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
      var i = isLE ? 0 : nBytes - 1;
      var d = isLE ? 1 : -1;
      var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
      value = Math.abs(value);
      if (isNaN(value) || value === Infinity) {
        m = isNaN(value) ? 1 : 0;
        e = eMax;
      } else {
        e = Math.floor(Math.log(value) / Math.LN2);
        if (value * (c = Math.pow(2, -e)) < 1) {
          e--;
          c *= 2;
        }
        if (e + eBias >= 1) {
          value += rt / c;
        } else {
          value += rt * Math.pow(2, 1 - eBias);
        }
        if (value * c >= 2) {
          e++;
          c /= 2;
        }
        if (e + eBias >= eMax) {
          m = 0;
          e = eMax;
        } else if (e + eBias >= 1) {
          m = (value * c - 1) * Math.pow(2, mLen);
          e = e + eBias;
        } else {
          m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
          e = 0;
        }
      }
      for (; mLen >= 8; buffer[offset + i] = m & 255, i += d, m /= 256, mLen -= 8) {
      }
      e = e << mLen | m;
      eLen += mLen;
      for (; eLen > 0; buffer[offset + i] = e & 255, i += d, e /= 256, eLen -= 8) {
      }
      buffer[offset + i - d] |= s * 128;
    };
  }
});

// node_modules/buffer/index.js
var require_buffer = __commonJS({
  "node_modules/buffer/index.js"(exports) {
    "use strict";
    init_git_buffer();
    var base64 = require_base64_js();
    var ieee754 = require_ieee754();
    var customInspectSymbol = typeof Symbol === "function" && typeof Symbol["for"] === "function" ? Symbol["for"]("nodejs.util.inspect.custom") : null;
    exports.Buffer = Buffer3;
    exports.SlowBuffer = SlowBuffer;
    exports.INSPECT_MAX_BYTES = 50;
    var K_MAX_LENGTH = 2147483647;
    exports.kMaxLength = K_MAX_LENGTH;
    Buffer3.TYPED_ARRAY_SUPPORT = typedArraySupport();
    if (!Buffer3.TYPED_ARRAY_SUPPORT && typeof console !== "undefined" && typeof console.error === "function") {
      console.error(
        "This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support."
      );
    }
    function typedArraySupport() {
      try {
        const arr = new Uint8Array(1);
        const proto = { foo: function() {
          return 42;
        } };
        Object.setPrototypeOf(proto, Uint8Array.prototype);
        Object.setPrototypeOf(arr, proto);
        return arr.foo() === 42;
      } catch (e) {
        return false;
      }
    }
    Object.defineProperty(Buffer3.prototype, "parent", {
      enumerable: true,
      get: function() {
        if (!Buffer3.isBuffer(this)) return void 0;
        return this.buffer;
      }
    });
    Object.defineProperty(Buffer3.prototype, "offset", {
      enumerable: true,
      get: function() {
        if (!Buffer3.isBuffer(this)) return void 0;
        return this.byteOffset;
      }
    });
    function createBuffer(length) {
      if (length > K_MAX_LENGTH) {
        throw new RangeError('The value "' + length + '" is invalid for option "size"');
      }
      const buf = new Uint8Array(length);
      Object.setPrototypeOf(buf, Buffer3.prototype);
      return buf;
    }
    function Buffer3(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        if (typeof encodingOrOffset === "string") {
          throw new TypeError(
            'The "string" argument must be of type string. Received type number'
          );
        }
        return allocUnsafe(arg);
      }
      return from(arg, encodingOrOffset, length);
    }
    Buffer3.poolSize = 8192;
    function from(value, encodingOrOffset, length) {
      if (typeof value === "string") {
        return fromString(value, encodingOrOffset);
      }
      if (ArrayBuffer.isView(value)) {
        return fromArrayView(value);
      }
      if (value == null) {
        throw new TypeError(
          "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
        );
      }
      if (isInstance(value, ArrayBuffer) || value && isInstance(value.buffer, ArrayBuffer)) {
        return fromArrayBuffer(value, encodingOrOffset, length);
      }
      if (typeof SharedArrayBuffer !== "undefined" && (isInstance(value, SharedArrayBuffer) || value && isInstance(value.buffer, SharedArrayBuffer))) {
        return fromArrayBuffer(value, encodingOrOffset, length);
      }
      if (typeof value === "number") {
        throw new TypeError(
          'The "value" argument must not be of type number. Received type number'
        );
      }
      const valueOf = value.valueOf && value.valueOf();
      if (valueOf != null && valueOf !== value) {
        return Buffer3.from(valueOf, encodingOrOffset, length);
      }
      const b = fromObject(value);
      if (b) return b;
      if (typeof Symbol !== "undefined" && Symbol.toPrimitive != null && typeof value[Symbol.toPrimitive] === "function") {
        return Buffer3.from(value[Symbol.toPrimitive]("string"), encodingOrOffset, length);
      }
      throw new TypeError(
        "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
      );
    }
    Buffer3.from = function(value, encodingOrOffset, length) {
      return from(value, encodingOrOffset, length);
    };
    Object.setPrototypeOf(Buffer3.prototype, Uint8Array.prototype);
    Object.setPrototypeOf(Buffer3, Uint8Array);
    function assertSize(size) {
      if (typeof size !== "number") {
        throw new TypeError('"size" argument must be of type number');
      } else if (size < 0) {
        throw new RangeError('The value "' + size + '" is invalid for option "size"');
      }
    }
    function alloc(size, fill, encoding) {
      assertSize(size);
      if (size <= 0) {
        return createBuffer(size);
      }
      if (fill !== void 0) {
        return typeof encoding === "string" ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill);
      }
      return createBuffer(size);
    }
    Buffer3.alloc = function(size, fill, encoding) {
      return alloc(size, fill, encoding);
    };
    function allocUnsafe(size) {
      assertSize(size);
      return createBuffer(size < 0 ? 0 : checked2(size) | 0);
    }
    Buffer3.allocUnsafe = function(size) {
      return allocUnsafe(size);
    };
    Buffer3.allocUnsafeSlow = function(size) {
      return allocUnsafe(size);
    };
    function fromString(string, encoding) {
      if (typeof encoding !== "string" || encoding === "") {
        encoding = "utf8";
      }
      if (!Buffer3.isEncoding(encoding)) {
        throw new TypeError("Unknown encoding: " + encoding);
      }
      const length = byteLength(string, encoding) | 0;
      let buf = createBuffer(length);
      const actual = buf.write(string, encoding);
      if (actual !== length) {
        buf = buf.slice(0, actual);
      }
      return buf;
    }
    function fromArrayLike(array) {
      const length = array.length < 0 ? 0 : checked2(array.length) | 0;
      const buf = createBuffer(length);
      for (let i = 0; i < length; i += 1) {
        buf[i] = array[i] & 255;
      }
      return buf;
    }
    function fromArrayView(arrayView) {
      if (isInstance(arrayView, Uint8Array)) {
        const copy = new Uint8Array(arrayView);
        return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength);
      }
      return fromArrayLike(arrayView);
    }
    function fromArrayBuffer(array, byteOffset, length) {
      if (byteOffset < 0 || array.byteLength < byteOffset) {
        throw new RangeError('"offset" is outside of buffer bounds');
      }
      if (array.byteLength < byteOffset + (length || 0)) {
        throw new RangeError('"length" is outside of buffer bounds');
      }
      let buf;
      if (byteOffset === void 0 && length === void 0) {
        buf = new Uint8Array(array);
      } else if (length === void 0) {
        buf = new Uint8Array(array, byteOffset);
      } else {
        buf = new Uint8Array(array, byteOffset, length);
      }
      Object.setPrototypeOf(buf, Buffer3.prototype);
      return buf;
    }
    function fromObject(obj) {
      if (Buffer3.isBuffer(obj)) {
        const len = checked2(obj.length) | 0;
        const buf = createBuffer(len);
        if (buf.length === 0) {
          return buf;
        }
        obj.copy(buf, 0, 0, len);
        return buf;
      }
      if (obj.length !== void 0) {
        if (typeof obj.length !== "number" || numberIsNaN(obj.length)) {
          return createBuffer(0);
        }
        return fromArrayLike(obj);
      }
      if (obj.type === "Buffer" && Array.isArray(obj.data)) {
        return fromArrayLike(obj.data);
      }
    }
    function checked2(length) {
      if (length >= K_MAX_LENGTH) {
        throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + K_MAX_LENGTH.toString(16) + " bytes");
      }
      return length | 0;
    }
    function SlowBuffer(length) {
      if (+length != length) {
        length = 0;
      }
      return Buffer3.alloc(+length);
    }
    Buffer3.isBuffer = function isBuffer(b) {
      return b != null && b._isBuffer === true && b !== Buffer3.prototype;
    };
    Buffer3.compare = function compare(a, b) {
      if (isInstance(a, Uint8Array)) a = Buffer3.from(a, a.offset, a.byteLength);
      if (isInstance(b, Uint8Array)) b = Buffer3.from(b, b.offset, b.byteLength);
      if (!Buffer3.isBuffer(a) || !Buffer3.isBuffer(b)) {
        throw new TypeError(
          'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
        );
      }
      if (a === b) return 0;
      let x = a.length;
      let y = b.length;
      for (let i = 0, len = Math.min(x, y); i < len; ++i) {
        if (a[i] !== b[i]) {
          x = a[i];
          y = b[i];
          break;
        }
      }
      if (x < y) return -1;
      if (y < x) return 1;
      return 0;
    };
    Buffer3.isEncoding = function isEncoding(encoding) {
      switch (String(encoding).toLowerCase()) {
        case "hex":
        case "utf8":
        case "utf-8":
        case "ascii":
        case "latin1":
        case "binary":
        case "base64":
        case "ucs2":
        case "ucs-2":
        case "utf16le":
        case "utf-16le":
          return true;
        default:
          return false;
      }
    };
    Buffer3.concat = function concat(list, length) {
      if (!Array.isArray(list)) {
        throw new TypeError('"list" argument must be an Array of Buffers');
      }
      if (list.length === 0) {
        return Buffer3.alloc(0);
      }
      let i;
      if (length === void 0) {
        length = 0;
        for (i = 0; i < list.length; ++i) {
          length += list[i].length;
        }
      }
      const buffer = Buffer3.allocUnsafe(length);
      let pos = 0;
      for (i = 0; i < list.length; ++i) {
        let buf = list[i];
        if (isInstance(buf, Uint8Array)) {
          if (pos + buf.length > buffer.length) {
            if (!Buffer3.isBuffer(buf)) buf = Buffer3.from(buf);
            buf.copy(buffer, pos);
          } else {
            Uint8Array.prototype.set.call(
              buffer,
              buf,
              pos
            );
          }
        } else if (!Buffer3.isBuffer(buf)) {
          throw new TypeError('"list" argument must be an Array of Buffers');
        } else {
          buf.copy(buffer, pos);
        }
        pos += buf.length;
      }
      return buffer;
    };
    function byteLength(string, encoding) {
      if (Buffer3.isBuffer(string)) {
        return string.length;
      }
      if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
        return string.byteLength;
      }
      if (typeof string !== "string") {
        throw new TypeError(
          'The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' + typeof string
        );
      }
      const len = string.length;
      const mustMatch = arguments.length > 2 && arguments[2] === true;
      if (!mustMatch && len === 0) return 0;
      let loweredCase = false;
      for (; ; ) {
        switch (encoding) {
          case "ascii":
          case "latin1":
          case "binary":
            return len;
          case "utf8":
          case "utf-8":
            return utf8ToBytes2(string).length;
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return len * 2;
          case "hex":
            return len >>> 1;
          case "base64":
            return base64ToBytes(string).length;
          default:
            if (loweredCase) {
              return mustMatch ? -1 : utf8ToBytes2(string).length;
            }
            encoding = ("" + encoding).toLowerCase();
            loweredCase = true;
        }
      }
    }
    Buffer3.byteLength = byteLength;
    function slowToString(encoding, start, end) {
      let loweredCase = false;
      if (start === void 0 || start < 0) {
        start = 0;
      }
      if (start > this.length) {
        return "";
      }
      if (end === void 0 || end > this.length) {
        end = this.length;
      }
      if (end <= 0) {
        return "";
      }
      end >>>= 0;
      start >>>= 0;
      if (end <= start) {
        return "";
      }
      if (!encoding) encoding = "utf8";
      while (true) {
        switch (encoding) {
          case "hex":
            return hexSlice(this, start, end);
          case "utf8":
          case "utf-8":
            return utf8Slice(this, start, end);
          case "ascii":
            return asciiSlice(this, start, end);
          case "latin1":
          case "binary":
            return latin1Slice(this, start, end);
          case "base64":
            return base64Slice(this, start, end);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return utf16leSlice(this, start, end);
          default:
            if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
            encoding = (encoding + "").toLowerCase();
            loweredCase = true;
        }
      }
    }
    Buffer3.prototype._isBuffer = true;
    function swap(b, n, m) {
      const i = b[n];
      b[n] = b[m];
      b[m] = i;
    }
    Buffer3.prototype.swap16 = function swap16() {
      const len = this.length;
      if (len % 2 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 16-bits");
      }
      for (let i = 0; i < len; i += 2) {
        swap(this, i, i + 1);
      }
      return this;
    };
    Buffer3.prototype.swap32 = function swap32() {
      const len = this.length;
      if (len % 4 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 32-bits");
      }
      for (let i = 0; i < len; i += 4) {
        swap(this, i, i + 3);
        swap(this, i + 1, i + 2);
      }
      return this;
    };
    Buffer3.prototype.swap64 = function swap64() {
      const len = this.length;
      if (len % 8 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 64-bits");
      }
      for (let i = 0; i < len; i += 8) {
        swap(this, i, i + 7);
        swap(this, i + 1, i + 6);
        swap(this, i + 2, i + 5);
        swap(this, i + 3, i + 4);
      }
      return this;
    };
    Buffer3.prototype.toString = function toString() {
      const length = this.length;
      if (length === 0) return "";
      if (arguments.length === 0) return utf8Slice(this, 0, length);
      return slowToString.apply(this, arguments);
    };
    Buffer3.prototype.toLocaleString = Buffer3.prototype.toString;
    Buffer3.prototype.equals = function equals(b) {
      if (!Buffer3.isBuffer(b)) throw new TypeError("Argument must be a Buffer");
      if (this === b) return true;
      return Buffer3.compare(this, b) === 0;
    };
    Buffer3.prototype.inspect = function inspect() {
      let str = "";
      const max = exports.INSPECT_MAX_BYTES;
      str = this.toString("hex", 0, max).replace(/(.{2})/g, "$1 ").trim();
      if (this.length > max) str += " ... ";
      return "<Buffer " + str + ">";
    };
    if (customInspectSymbol) {
      Buffer3.prototype[customInspectSymbol] = Buffer3.prototype.inspect;
    }
    Buffer3.prototype.compare = function compare(target, start, end, thisStart, thisEnd) {
      if (isInstance(target, Uint8Array)) {
        target = Buffer3.from(target, target.offset, target.byteLength);
      }
      if (!Buffer3.isBuffer(target)) {
        throw new TypeError(
          'The "target" argument must be one of type Buffer or Uint8Array. Received type ' + typeof target
        );
      }
      if (start === void 0) {
        start = 0;
      }
      if (end === void 0) {
        end = target ? target.length : 0;
      }
      if (thisStart === void 0) {
        thisStart = 0;
      }
      if (thisEnd === void 0) {
        thisEnd = this.length;
      }
      if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
        throw new RangeError("out of range index");
      }
      if (thisStart >= thisEnd && start >= end) {
        return 0;
      }
      if (thisStart >= thisEnd) {
        return -1;
      }
      if (start >= end) {
        return 1;
      }
      start >>>= 0;
      end >>>= 0;
      thisStart >>>= 0;
      thisEnd >>>= 0;
      if (this === target) return 0;
      let x = thisEnd - thisStart;
      let y = end - start;
      const len = Math.min(x, y);
      const thisCopy = this.slice(thisStart, thisEnd);
      const targetCopy = target.slice(start, end);
      for (let i = 0; i < len; ++i) {
        if (thisCopy[i] !== targetCopy[i]) {
          x = thisCopy[i];
          y = targetCopy[i];
          break;
        }
      }
      if (x < y) return -1;
      if (y < x) return 1;
      return 0;
    };
    function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
      if (buffer.length === 0) return -1;
      if (typeof byteOffset === "string") {
        encoding = byteOffset;
        byteOffset = 0;
      } else if (byteOffset > 2147483647) {
        byteOffset = 2147483647;
      } else if (byteOffset < -2147483648) {
        byteOffset = -2147483648;
      }
      byteOffset = +byteOffset;
      if (numberIsNaN(byteOffset)) {
        byteOffset = dir ? 0 : buffer.length - 1;
      }
      if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
      if (byteOffset >= buffer.length) {
        if (dir) return -1;
        else byteOffset = buffer.length - 1;
      } else if (byteOffset < 0) {
        if (dir) byteOffset = 0;
        else return -1;
      }
      if (typeof val === "string") {
        val = Buffer3.from(val, encoding);
      }
      if (Buffer3.isBuffer(val)) {
        if (val.length === 0) {
          return -1;
        }
        return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
      } else if (typeof val === "number") {
        val = val & 255;
        if (typeof Uint8Array.prototype.indexOf === "function") {
          if (dir) {
            return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
          } else {
            return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
          }
        }
        return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
      }
      throw new TypeError("val must be string, number or Buffer");
    }
    function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
      let indexSize = 1;
      let arrLength = arr.length;
      let valLength = val.length;
      if (encoding !== void 0) {
        encoding = String(encoding).toLowerCase();
        if (encoding === "ucs2" || encoding === "ucs-2" || encoding === "utf16le" || encoding === "utf-16le") {
          if (arr.length < 2 || val.length < 2) {
            return -1;
          }
          indexSize = 2;
          arrLength /= 2;
          valLength /= 2;
          byteOffset /= 2;
        }
      }
      function read(buf, i2) {
        if (indexSize === 1) {
          return buf[i2];
        } else {
          return buf.readUInt16BE(i2 * indexSize);
        }
      }
      let i;
      if (dir) {
        let foundIndex = -1;
        for (i = byteOffset; i < arrLength; i++) {
          if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
            if (foundIndex === -1) foundIndex = i;
            if (i - foundIndex + 1 === valLength) return foundIndex * indexSize;
          } else {
            if (foundIndex !== -1) i -= i - foundIndex;
            foundIndex = -1;
          }
        }
      } else {
        if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
        for (i = byteOffset; i >= 0; i--) {
          let found = true;
          for (let j = 0; j < valLength; j++) {
            if (read(arr, i + j) !== read(val, j)) {
              found = false;
              break;
            }
          }
          if (found) return i;
        }
      }
      return -1;
    }
    Buffer3.prototype.includes = function includes(val, byteOffset, encoding) {
      return this.indexOf(val, byteOffset, encoding) !== -1;
    };
    Buffer3.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
      return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
    };
    Buffer3.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
      return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
    };
    function hexWrite(buf, string, offset, length) {
      offset = Number(offset) || 0;
      const remaining = buf.length - offset;
      if (!length) {
        length = remaining;
      } else {
        length = Number(length);
        if (length > remaining) {
          length = remaining;
        }
      }
      const strLen = string.length;
      if (length > strLen / 2) {
        length = strLen / 2;
      }
      let i;
      for (i = 0; i < length; ++i) {
        const parsed = parseInt(string.substr(i * 2, 2), 16);
        if (numberIsNaN(parsed)) return i;
        buf[offset + i] = parsed;
      }
      return i;
    }
    function utf8Write(buf, string, offset, length) {
      return blitBuffer(utf8ToBytes2(string, buf.length - offset), buf, offset, length);
    }
    function asciiWrite(buf, string, offset, length) {
      return blitBuffer(asciiToBytes(string), buf, offset, length);
    }
    function base64Write(buf, string, offset, length) {
      return blitBuffer(base64ToBytes(string), buf, offset, length);
    }
    function ucs2Write(buf, string, offset, length) {
      return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
    }
    Buffer3.prototype.write = function write(string, offset, length, encoding) {
      if (offset === void 0) {
        encoding = "utf8";
        length = this.length;
        offset = 0;
      } else if (length === void 0 && typeof offset === "string") {
        encoding = offset;
        length = this.length;
        offset = 0;
      } else if (isFinite(offset)) {
        offset = offset >>> 0;
        if (isFinite(length)) {
          length = length >>> 0;
          if (encoding === void 0) encoding = "utf8";
        } else {
          encoding = length;
          length = void 0;
        }
      } else {
        throw new Error(
          "Buffer.write(string, encoding, offset[, length]) is no longer supported"
        );
      }
      const remaining = this.length - offset;
      if (length === void 0 || length > remaining) length = remaining;
      if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
        throw new RangeError("Attempt to write outside buffer bounds");
      }
      if (!encoding) encoding = "utf8";
      let loweredCase = false;
      for (; ; ) {
        switch (encoding) {
          case "hex":
            return hexWrite(this, string, offset, length);
          case "utf8":
          case "utf-8":
            return utf8Write(this, string, offset, length);
          case "ascii":
          case "latin1":
          case "binary":
            return asciiWrite(this, string, offset, length);
          case "base64":
            return base64Write(this, string, offset, length);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return ucs2Write(this, string, offset, length);
          default:
            if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
            encoding = ("" + encoding).toLowerCase();
            loweredCase = true;
        }
      }
    };
    Buffer3.prototype.toJSON = function toJSON() {
      return {
        type: "Buffer",
        data: Array.prototype.slice.call(this._arr || this, 0)
      };
    };
    function base64Slice(buf, start, end) {
      if (start === 0 && end === buf.length) {
        return base64.fromByteArray(buf);
      } else {
        return base64.fromByteArray(buf.slice(start, end));
      }
    }
    function utf8Slice(buf, start, end) {
      end = Math.min(buf.length, end);
      const res = [];
      let i = start;
      while (i < end) {
        const firstByte = buf[i];
        let codePoint = null;
        let bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
        if (i + bytesPerSequence <= end) {
          let secondByte, thirdByte, fourthByte, tempCodePoint;
          switch (bytesPerSequence) {
            case 1:
              if (firstByte < 128) {
                codePoint = firstByte;
              }
              break;
            case 2:
              secondByte = buf[i + 1];
              if ((secondByte & 192) === 128) {
                tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
                if (tempCodePoint > 127) {
                  codePoint = tempCodePoint;
                }
              }
              break;
            case 3:
              secondByte = buf[i + 1];
              thirdByte = buf[i + 2];
              if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
                tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
                if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
                  codePoint = tempCodePoint;
                }
              }
              break;
            case 4:
              secondByte = buf[i + 1];
              thirdByte = buf[i + 2];
              fourthByte = buf[i + 3];
              if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
                tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
                if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
                  codePoint = tempCodePoint;
                }
              }
          }
        }
        if (codePoint === null) {
          codePoint = 65533;
          bytesPerSequence = 1;
        } else if (codePoint > 65535) {
          codePoint -= 65536;
          res.push(codePoint >>> 10 & 1023 | 55296);
          codePoint = 56320 | codePoint & 1023;
        }
        res.push(codePoint);
        i += bytesPerSequence;
      }
      return decodeCodePointsArray(res);
    }
    var MAX_ARGUMENTS_LENGTH = 4096;
    function decodeCodePointsArray(codePoints) {
      const len = codePoints.length;
      if (len <= MAX_ARGUMENTS_LENGTH) {
        return String.fromCharCode.apply(String, codePoints);
      }
      let res = "";
      let i = 0;
      while (i < len) {
        res += String.fromCharCode.apply(
          String,
          codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
        );
      }
      return res;
    }
    function asciiSlice(buf, start, end) {
      let ret = "";
      end = Math.min(buf.length, end);
      for (let i = start; i < end; ++i) {
        ret += String.fromCharCode(buf[i] & 127);
      }
      return ret;
    }
    function latin1Slice(buf, start, end) {
      let ret = "";
      end = Math.min(buf.length, end);
      for (let i = start; i < end; ++i) {
        ret += String.fromCharCode(buf[i]);
      }
      return ret;
    }
    function hexSlice(buf, start, end) {
      const len = buf.length;
      if (!start || start < 0) start = 0;
      if (!end || end < 0 || end > len) end = len;
      let out = "";
      for (let i = start; i < end; ++i) {
        out += hexSliceLookupTable[buf[i]];
      }
      return out;
    }
    function utf16leSlice(buf, start, end) {
      const bytes = buf.slice(start, end);
      let res = "";
      for (let i = 0; i < bytes.length - 1; i += 2) {
        res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
      }
      return res;
    }
    Buffer3.prototype.slice = function slice(start, end) {
      const len = this.length;
      start = ~~start;
      end = end === void 0 ? len : ~~end;
      if (start < 0) {
        start += len;
        if (start < 0) start = 0;
      } else if (start > len) {
        start = len;
      }
      if (end < 0) {
        end += len;
        if (end < 0) end = 0;
      } else if (end > len) {
        end = len;
      }
      if (end < start) end = start;
      const newBuf = this.subarray(start, end);
      Object.setPrototypeOf(newBuf, Buffer3.prototype);
      return newBuf;
    };
    function checkOffset(offset, ext, length) {
      if (offset % 1 !== 0 || offset < 0) throw new RangeError("offset is not uint");
      if (offset + ext > length) throw new RangeError("Trying to access beyond buffer length");
    }
    Buffer3.prototype.readUintLE = Buffer3.prototype.readUIntLE = function readUIntLE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      let val = this[offset];
      let mul = 1;
      let i = 0;
      while (++i < byteLength2 && (mul *= 256)) {
        val += this[offset + i] * mul;
      }
      return val;
    };
    Buffer3.prototype.readUintBE = Buffer3.prototype.readUIntBE = function readUIntBE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        checkOffset(offset, byteLength2, this.length);
      }
      let val = this[offset + --byteLength2];
      let mul = 1;
      while (byteLength2 > 0 && (mul *= 256)) {
        val += this[offset + --byteLength2] * mul;
      }
      return val;
    };
    Buffer3.prototype.readUint8 = Buffer3.prototype.readUInt8 = function readUInt8(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 1, this.length);
      return this[offset];
    };
    Buffer3.prototype.readUint16LE = Buffer3.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      return this[offset] | this[offset + 1] << 8;
    };
    Buffer3.prototype.readUint16BE = Buffer3.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      return this[offset] << 8 | this[offset + 1];
    };
    Buffer3.prototype.readUint32LE = Buffer3.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 16777216;
    };
    Buffer3.prototype.readUint32BE = Buffer3.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
    };
    Buffer3.prototype.readBigUInt64LE = defineBigIntMethod(function readBigUInt64LE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const lo = first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24;
      const hi = this[++offset] + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + last * 2 ** 24;
      return BigInt(lo) + (BigInt(hi) << BigInt(32));
    });
    Buffer3.prototype.readBigUInt64BE = defineBigIntMethod(function readBigUInt64BE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const hi = first * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
      const lo = this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last;
      return (BigInt(hi) << BigInt(32)) + BigInt(lo);
    });
    Buffer3.prototype.readIntLE = function readIntLE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      let val = this[offset];
      let mul = 1;
      let i = 0;
      while (++i < byteLength2 && (mul *= 256)) {
        val += this[offset + i] * mul;
      }
      mul *= 128;
      if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
      return val;
    };
    Buffer3.prototype.readIntBE = function readIntBE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      let i = byteLength2;
      let mul = 1;
      let val = this[offset + --i];
      while (i > 0 && (mul *= 256)) {
        val += this[offset + --i] * mul;
      }
      mul *= 128;
      if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
      return val;
    };
    Buffer3.prototype.readInt8 = function readInt8(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 1, this.length);
      if (!(this[offset] & 128)) return this[offset];
      return (255 - this[offset] + 1) * -1;
    };
    Buffer3.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      const val = this[offset] | this[offset + 1] << 8;
      return val & 32768 ? val | 4294901760 : val;
    };
    Buffer3.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      const val = this[offset + 1] | this[offset] << 8;
      return val & 32768 ? val | 4294901760 : val;
    };
    Buffer3.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
    };
    Buffer3.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
    };
    Buffer3.prototype.readBigInt64LE = defineBigIntMethod(function readBigInt64LE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const val = this[offset + 4] + this[offset + 5] * 2 ** 8 + this[offset + 6] * 2 ** 16 + (last << 24);
      return (BigInt(val) << BigInt(32)) + BigInt(first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24);
    });
    Buffer3.prototype.readBigInt64BE = defineBigIntMethod(function readBigInt64BE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const val = (first << 24) + // Overflow
      this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
      return (BigInt(val) << BigInt(32)) + BigInt(this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last);
    });
    Buffer3.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return ieee754.read(this, offset, true, 23, 4);
    };
    Buffer3.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return ieee754.read(this, offset, false, 23, 4);
    };
    Buffer3.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 8, this.length);
      return ieee754.read(this, offset, true, 52, 8);
    };
    Buffer3.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 8, this.length);
      return ieee754.read(this, offset, false, 52, 8);
    };
    function checkInt(buf, value, offset, ext, max, min) {
      if (!Buffer3.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance');
      if (value > max || value < min) throw new RangeError('"value" argument is out of bounds');
      if (offset + ext > buf.length) throw new RangeError("Index out of range");
    }
    Buffer3.prototype.writeUintLE = Buffer3.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
        checkInt(this, value, offset, byteLength2, maxBytes, 0);
      }
      let mul = 1;
      let i = 0;
      this[offset] = value & 255;
      while (++i < byteLength2 && (mul *= 256)) {
        this[offset + i] = value / mul & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeUintBE = Buffer3.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
        checkInt(this, value, offset, byteLength2, maxBytes, 0);
      }
      let i = byteLength2 - 1;
      let mul = 1;
      this[offset + i] = value & 255;
      while (--i >= 0 && (mul *= 256)) {
        this[offset + i] = value / mul & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeUint8 = Buffer3.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 1, 255, 0);
      this[offset] = value & 255;
      return offset + 1;
    };
    Buffer3.prototype.writeUint16LE = Buffer3.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      return offset + 2;
    };
    Buffer3.prototype.writeUint16BE = Buffer3.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
      this[offset] = value >>> 8;
      this[offset + 1] = value & 255;
      return offset + 2;
    };
    Buffer3.prototype.writeUint32LE = Buffer3.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
      this[offset + 3] = value >>> 24;
      this[offset + 2] = value >>> 16;
      this[offset + 1] = value >>> 8;
      this[offset] = value & 255;
      return offset + 4;
    };
    Buffer3.prototype.writeUint32BE = Buffer3.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
      this[offset] = value >>> 24;
      this[offset + 1] = value >>> 16;
      this[offset + 2] = value >>> 8;
      this[offset + 3] = value & 255;
      return offset + 4;
    };
    function wrtBigUInt64LE(buf, value, offset, min, max) {
      checkIntBI(value, min, max, buf, offset, 7);
      let lo = Number(value & BigInt(4294967295));
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      let hi = Number(value >> BigInt(32) & BigInt(4294967295));
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      return offset;
    }
    function wrtBigUInt64BE(buf, value, offset, min, max) {
      checkIntBI(value, min, max, buf, offset, 7);
      let lo = Number(value & BigInt(4294967295));
      buf[offset + 7] = lo;
      lo = lo >> 8;
      buf[offset + 6] = lo;
      lo = lo >> 8;
      buf[offset + 5] = lo;
      lo = lo >> 8;
      buf[offset + 4] = lo;
      let hi = Number(value >> BigInt(32) & BigInt(4294967295));
      buf[offset + 3] = hi;
      hi = hi >> 8;
      buf[offset + 2] = hi;
      hi = hi >> 8;
      buf[offset + 1] = hi;
      hi = hi >> 8;
      buf[offset] = hi;
      return offset + 8;
    }
    Buffer3.prototype.writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE(value, offset = 0) {
      return wrtBigUInt64LE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
    });
    Buffer3.prototype.writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE(value, offset = 0) {
      return wrtBigUInt64BE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
    });
    Buffer3.prototype.writeIntLE = function writeIntLE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        const limit = Math.pow(2, 8 * byteLength2 - 1);
        checkInt(this, value, offset, byteLength2, limit - 1, -limit);
      }
      let i = 0;
      let mul = 1;
      let sub = 0;
      this[offset] = value & 255;
      while (++i < byteLength2 && (mul *= 256)) {
        if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
          sub = 1;
        }
        this[offset + i] = (value / mul >> 0) - sub & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeIntBE = function writeIntBE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        const limit = Math.pow(2, 8 * byteLength2 - 1);
        checkInt(this, value, offset, byteLength2, limit - 1, -limit);
      }
      let i = byteLength2 - 1;
      let mul = 1;
      let sub = 0;
      this[offset + i] = value & 255;
      while (--i >= 0 && (mul *= 256)) {
        if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
          sub = 1;
        }
        this[offset + i] = (value / mul >> 0) - sub & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 1, 127, -128);
      if (value < 0) value = 255 + value + 1;
      this[offset] = value & 255;
      return offset + 1;
    };
    Buffer3.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      return offset + 2;
    };
    Buffer3.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
      this[offset] = value >>> 8;
      this[offset + 1] = value & 255;
      return offset + 2;
    };
    Buffer3.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      this[offset + 2] = value >>> 16;
      this[offset + 3] = value >>> 24;
      return offset + 4;
    };
    Buffer3.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
      if (value < 0) value = 4294967295 + value + 1;
      this[offset] = value >>> 24;
      this[offset + 1] = value >>> 16;
      this[offset + 2] = value >>> 8;
      this[offset + 3] = value & 255;
      return offset + 4;
    };
    Buffer3.prototype.writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE(value, offset = 0) {
      return wrtBigUInt64LE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
    });
    Buffer3.prototype.writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE(value, offset = 0) {
      return wrtBigUInt64BE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
    });
    function checkIEEE754(buf, value, offset, ext, max, min) {
      if (offset + ext > buf.length) throw new RangeError("Index out of range");
      if (offset < 0) throw new RangeError("Index out of range");
    }
    function writeFloat(buf, value, offset, littleEndian, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        checkIEEE754(buf, value, offset, 4, 34028234663852886e22, -34028234663852886e22);
      }
      ieee754.write(buf, value, offset, littleEndian, 23, 4);
      return offset + 4;
    }
    Buffer3.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
      return writeFloat(this, value, offset, true, noAssert);
    };
    Buffer3.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
      return writeFloat(this, value, offset, false, noAssert);
    };
    function writeDouble(buf, value, offset, littleEndian, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        checkIEEE754(buf, value, offset, 8, 17976931348623157e292, -17976931348623157e292);
      }
      ieee754.write(buf, value, offset, littleEndian, 52, 8);
      return offset + 8;
    }
    Buffer3.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
      return writeDouble(this, value, offset, true, noAssert);
    };
    Buffer3.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
      return writeDouble(this, value, offset, false, noAssert);
    };
    Buffer3.prototype.copy = function copy(target, targetStart, start, end) {
      if (!Buffer3.isBuffer(target)) throw new TypeError("argument should be a Buffer");
      if (!start) start = 0;
      if (!end && end !== 0) end = this.length;
      if (targetStart >= target.length) targetStart = target.length;
      if (!targetStart) targetStart = 0;
      if (end > 0 && end < start) end = start;
      if (end === start) return 0;
      if (target.length === 0 || this.length === 0) return 0;
      if (targetStart < 0) {
        throw new RangeError("targetStart out of bounds");
      }
      if (start < 0 || start >= this.length) throw new RangeError("Index out of range");
      if (end < 0) throw new RangeError("sourceEnd out of bounds");
      if (end > this.length) end = this.length;
      if (target.length - targetStart < end - start) {
        end = target.length - targetStart + start;
      }
      const len = end - start;
      if (this === target && typeof Uint8Array.prototype.copyWithin === "function") {
        this.copyWithin(targetStart, start, end);
      } else {
        Uint8Array.prototype.set.call(
          target,
          this.subarray(start, end),
          targetStart
        );
      }
      return len;
    };
    Buffer3.prototype.fill = function fill(val, start, end, encoding) {
      if (typeof val === "string") {
        if (typeof start === "string") {
          encoding = start;
          start = 0;
          end = this.length;
        } else if (typeof end === "string") {
          encoding = end;
          end = this.length;
        }
        if (encoding !== void 0 && typeof encoding !== "string") {
          throw new TypeError("encoding must be a string");
        }
        if (typeof encoding === "string" && !Buffer3.isEncoding(encoding)) {
          throw new TypeError("Unknown encoding: " + encoding);
        }
        if (val.length === 1) {
          const code = val.charCodeAt(0);
          if (encoding === "utf8" && code < 128 || encoding === "latin1") {
            val = code;
          }
        }
      } else if (typeof val === "number") {
        val = val & 255;
      } else if (typeof val === "boolean") {
        val = Number(val);
      }
      if (start < 0 || this.length < start || this.length < end) {
        throw new RangeError("Out of range index");
      }
      if (end <= start) {
        return this;
      }
      start = start >>> 0;
      end = end === void 0 ? this.length : end >>> 0;
      if (!val) val = 0;
      let i;
      if (typeof val === "number") {
        for (i = start; i < end; ++i) {
          this[i] = val;
        }
      } else {
        const bytes = Buffer3.isBuffer(val) ? val : Buffer3.from(val, encoding);
        const len = bytes.length;
        if (len === 0) {
          throw new TypeError('The value "' + val + '" is invalid for argument "value"');
        }
        for (i = 0; i < end - start; ++i) {
          this[i + start] = bytes[i % len];
        }
      }
      return this;
    };
    var errors = {};
    function E(sym, getMessage, Base) {
      errors[sym] = class NodeError extends Base {
        constructor() {
          super();
          Object.defineProperty(this, "message", {
            value: getMessage.apply(this, arguments),
            writable: true,
            configurable: true
          });
          this.name = `${this.name} [${sym}]`;
          this.stack;
          delete this.name;
        }
        get code() {
          return sym;
        }
        set code(value) {
          Object.defineProperty(this, "code", {
            configurable: true,
            enumerable: true,
            value,
            writable: true
          });
        }
        toString() {
          return `${this.name} [${sym}]: ${this.message}`;
        }
      };
    }
    E(
      "ERR_BUFFER_OUT_OF_BOUNDS",
      function(name) {
        if (name) {
          return `${name} is outside of buffer bounds`;
        }
        return "Attempt to access memory outside buffer bounds";
      },
      RangeError
    );
    E(
      "ERR_INVALID_ARG_TYPE",
      function(name, actual) {
        return `The "${name}" argument must be of type number. Received type ${typeof actual}`;
      },
      TypeError
    );
    E(
      "ERR_OUT_OF_RANGE",
      function(str, range, input) {
        let msg = `The value of "${str}" is out of range.`;
        let received = input;
        if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
          received = addNumericalSeparator(String(input));
        } else if (typeof input === "bigint") {
          received = String(input);
          if (input > BigInt(2) ** BigInt(32) || input < -(BigInt(2) ** BigInt(32))) {
            received = addNumericalSeparator(received);
          }
          received += "n";
        }
        msg += ` It must be ${range}. Received ${received}`;
        return msg;
      },
      RangeError
    );
    function addNumericalSeparator(val) {
      let res = "";
      let i = val.length;
      const start = val[0] === "-" ? 1 : 0;
      for (; i >= start + 4; i -= 3) {
        res = `_${val.slice(i - 3, i)}${res}`;
      }
      return `${val.slice(0, i)}${res}`;
    }
    function checkBounds(buf, offset, byteLength2) {
      validateNumber(offset, "offset");
      if (buf[offset] === void 0 || buf[offset + byteLength2] === void 0) {
        boundsError(offset, buf.length - (byteLength2 + 1));
      }
    }
    function checkIntBI(value, min, max, buf, offset, byteLength2) {
      if (value > max || value < min) {
        const n = typeof min === "bigint" ? "n" : "";
        let range;
        if (byteLength2 > 3) {
          if (min === 0 || min === BigInt(0)) {
            range = `>= 0${n} and < 2${n} ** ${(byteLength2 + 1) * 8}${n}`;
          } else {
            range = `>= -(2${n} ** ${(byteLength2 + 1) * 8 - 1}${n}) and < 2 ** ${(byteLength2 + 1) * 8 - 1}${n}`;
          }
        } else {
          range = `>= ${min}${n} and <= ${max}${n}`;
        }
        throw new errors.ERR_OUT_OF_RANGE("value", range, value);
      }
      checkBounds(buf, offset, byteLength2);
    }
    function validateNumber(value, name) {
      if (typeof value !== "number") {
        throw new errors.ERR_INVALID_ARG_TYPE(name, "number", value);
      }
    }
    function boundsError(value, length, type) {
      if (Math.floor(value) !== value) {
        validateNumber(value, type);
        throw new errors.ERR_OUT_OF_RANGE(type || "offset", "an integer", value);
      }
      if (length < 0) {
        throw new errors.ERR_BUFFER_OUT_OF_BOUNDS();
      }
      throw new errors.ERR_OUT_OF_RANGE(
        type || "offset",
        `>= ${type ? 1 : 0} and <= ${length}`,
        value
      );
    }
    var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;
    function base64clean(str) {
      str = str.split("=")[0];
      str = str.trim().replace(INVALID_BASE64_RE, "");
      if (str.length < 2) return "";
      while (str.length % 4 !== 0) {
        str = str + "=";
      }
      return str;
    }
    function utf8ToBytes2(string, units) {
      units = units || Infinity;
      let codePoint;
      const length = string.length;
      let leadSurrogate = null;
      const bytes = [];
      for (let i = 0; i < length; ++i) {
        codePoint = string.charCodeAt(i);
        if (codePoint > 55295 && codePoint < 57344) {
          if (!leadSurrogate) {
            if (codePoint > 56319) {
              if ((units -= 3) > -1) bytes.push(239, 191, 189);
              continue;
            } else if (i + 1 === length) {
              if ((units -= 3) > -1) bytes.push(239, 191, 189);
              continue;
            }
            leadSurrogate = codePoint;
            continue;
          }
          if (codePoint < 56320) {
            if ((units -= 3) > -1) bytes.push(239, 191, 189);
            leadSurrogate = codePoint;
            continue;
          }
          codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536;
        } else if (leadSurrogate) {
          if ((units -= 3) > -1) bytes.push(239, 191, 189);
        }
        leadSurrogate = null;
        if (codePoint < 128) {
          if ((units -= 1) < 0) break;
          bytes.push(codePoint);
        } else if (codePoint < 2048) {
          if ((units -= 2) < 0) break;
          bytes.push(
            codePoint >> 6 | 192,
            codePoint & 63 | 128
          );
        } else if (codePoint < 65536) {
          if ((units -= 3) < 0) break;
          bytes.push(
            codePoint >> 12 | 224,
            codePoint >> 6 & 63 | 128,
            codePoint & 63 | 128
          );
        } else if (codePoint < 1114112) {
          if ((units -= 4) < 0) break;
          bytes.push(
            codePoint >> 18 | 240,
            codePoint >> 12 & 63 | 128,
            codePoint >> 6 & 63 | 128,
            codePoint & 63 | 128
          );
        } else {
          throw new Error("Invalid code point");
        }
      }
      return bytes;
    }
    function asciiToBytes(str) {
      const byteArray = [];
      for (let i = 0; i < str.length; ++i) {
        byteArray.push(str.charCodeAt(i) & 255);
      }
      return byteArray;
    }
    function utf16leToBytes(str, units) {
      let c, hi, lo;
      const byteArray = [];
      for (let i = 0; i < str.length; ++i) {
        if ((units -= 2) < 0) break;
        c = str.charCodeAt(i);
        hi = c >> 8;
        lo = c % 256;
        byteArray.push(lo);
        byteArray.push(hi);
      }
      return byteArray;
    }
    function base64ToBytes(str) {
      return base64.toByteArray(base64clean(str));
    }
    function blitBuffer(src, dst, offset, length) {
      let i;
      for (i = 0; i < length; ++i) {
        if (i + offset >= dst.length || i >= src.length) break;
        dst[i + offset] = src[i];
      }
      return i;
    }
    function isInstance(obj, type) {
      return obj instanceof type || obj != null && obj.constructor != null && obj.constructor.name != null && obj.constructor.name === type.name;
    }
    function numberIsNaN(obj) {
      return obj !== obj;
    }
    var hexSliceLookupTable = (function() {
      const alphabet = "0123456789abcdef";
      const table = new Array(256);
      for (let i = 0; i < 16; ++i) {
        const i16 = i * 16;
        for (let j = 0; j < 16; ++j) {
          table[i16 + j] = alphabet[i] + alphabet[j];
        }
      }
      return table;
    })();
    function defineBigIntMethod(fn) {
      return typeof BigInt === "undefined" ? BufferBigIntNotDefined : fn;
    }
    function BufferBigIntNotDefined() {
      throw new Error("BigInt not supported");
    }
  }
});

// src/git-buffer.ts
var import_buffer;
var init_git_buffer = __esm({
  "src/git-buffer.ts"() {
    "use strict";
    import_buffer = __toESM(require_buffer());
  }
});

// node_modules/picomatch/lib/constants.js
var require_constants = __commonJS({
  "node_modules/picomatch/lib/constants.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var WIN_SLASH = "\\\\/";
    var WIN_NO_SLASH = `[^${WIN_SLASH}]`;
    var DEFAULT_MAX_EXTGLOB_RECURSION = 0;
    var DOT_LITERAL = "\\.";
    var PLUS_LITERAL = "\\+";
    var QMARK_LITERAL = "\\?";
    var SLASH_LITERAL = "\\/";
    var ONE_CHAR = "(?=.)";
    var QMARK = "[^/]";
    var END_ANCHOR = `(?:${SLASH_LITERAL}|$)`;
    var START_ANCHOR = `(?:^|${SLASH_LITERAL})`;
    var DOTS_SLASH = `${DOT_LITERAL}{1,2}${END_ANCHOR}`;
    var NO_DOT = `(?!${DOT_LITERAL})`;
    var NO_DOTS = `(?!${START_ANCHOR}${DOTS_SLASH})`;
    var NO_DOT_SLASH = `(?!${DOT_LITERAL}{0,1}${END_ANCHOR})`;
    var NO_DOTS_SLASH = `(?!${DOTS_SLASH})`;
    var QMARK_NO_DOT = `[^.${SLASH_LITERAL}]`;
    var STAR = `${QMARK}*?`;
    var SEP = "/";
    var POSIX_CHARS = {
      DOT_LITERAL,
      PLUS_LITERAL,
      QMARK_LITERAL,
      SLASH_LITERAL,
      ONE_CHAR,
      QMARK,
      END_ANCHOR,
      DOTS_SLASH,
      NO_DOT,
      NO_DOTS,
      NO_DOT_SLASH,
      NO_DOTS_SLASH,
      QMARK_NO_DOT,
      STAR,
      START_ANCHOR,
      SEP
    };
    var WINDOWS_CHARS = {
      ...POSIX_CHARS,
      SLASH_LITERAL: `[${WIN_SLASH}]`,
      QMARK: WIN_NO_SLASH,
      STAR: `${WIN_NO_SLASH}*?`,
      DOTS_SLASH: `${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$)`,
      NO_DOT: `(?!${DOT_LITERAL})`,
      NO_DOTS: `(?!(?:^|[${WIN_SLASH}])${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      NO_DOT_SLASH: `(?!${DOT_LITERAL}{0,1}(?:[${WIN_SLASH}]|$))`,
      NO_DOTS_SLASH: `(?!${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      QMARK_NO_DOT: `[^.${WIN_SLASH}]`,
      START_ANCHOR: `(?:^|[${WIN_SLASH}])`,
      END_ANCHOR: `(?:[${WIN_SLASH}]|$)`,
      SEP: "\\"
    };
    var POSIX_REGEX_SOURCE = {
      __proto__: null,
      alnum: "a-zA-Z0-9",
      alpha: "a-zA-Z",
      ascii: "\\x00-\\x7F",
      blank: " \\t",
      cntrl: "\\x00-\\x1F\\x7F",
      digit: "0-9",
      graph: "\\x21-\\x7E",
      lower: "a-z",
      print: "\\x20-\\x7E ",
      punct: "\\-!\"#$%&'()\\*+,./:;<=>?@[\\]^_`{|}~",
      space: " \\t\\r\\n\\v\\f",
      upper: "A-Z",
      word: "A-Za-z0-9_",
      xdigit: "A-Fa-f0-9"
    };
    module2.exports = {
      DEFAULT_MAX_EXTGLOB_RECURSION,
      MAX_LENGTH: 1024 * 64,
      POSIX_REGEX_SOURCE,
      // regular expressions
      REGEX_BACKSLASH: /\\(?![*+?^${}(|)[\]])/g,
      REGEX_NON_SPECIAL_CHARS: /^[^@![\].,$*+?^{}()|\\/]+/,
      REGEX_SPECIAL_CHARS: /[-*+?.^${}(|)[\]]/,
      REGEX_SPECIAL_CHARS_BACKREF: /(\\?)((\W)(\3*))/g,
      REGEX_SPECIAL_CHARS_GLOBAL: /([-*+?.^${}(|)[\]])/g,
      REGEX_REMOVE_BACKSLASH: /(?:\[.*?[^\\]\]|\\(?=.))/g,
      // Replace globs with equivalent patterns to reduce parsing time.
      REPLACEMENTS: {
        __proto__: null,
        "***": "*",
        "**/**": "**",
        "**/**/**": "**"
      },
      // Digits
      CHAR_0: 48,
      /* 0 */
      CHAR_9: 57,
      /* 9 */
      // Alphabet chars.
      CHAR_UPPERCASE_A: 65,
      /* A */
      CHAR_LOWERCASE_A: 97,
      /* a */
      CHAR_UPPERCASE_Z: 90,
      /* Z */
      CHAR_LOWERCASE_Z: 122,
      /* z */
      CHAR_LEFT_PARENTHESES: 40,
      /* ( */
      CHAR_RIGHT_PARENTHESES: 41,
      /* ) */
      CHAR_ASTERISK: 42,
      /* * */
      // Non-alphabetic chars.
      CHAR_AMPERSAND: 38,
      /* & */
      CHAR_AT: 64,
      /* @ */
      CHAR_BACKWARD_SLASH: 92,
      /* \ */
      CHAR_CARRIAGE_RETURN: 13,
      /* \r */
      CHAR_CIRCUMFLEX_ACCENT: 94,
      /* ^ */
      CHAR_COLON: 58,
      /* : */
      CHAR_COMMA: 44,
      /* , */
      CHAR_DOT: 46,
      /* . */
      CHAR_DOUBLE_QUOTE: 34,
      /* " */
      CHAR_EQUAL: 61,
      /* = */
      CHAR_EXCLAMATION_MARK: 33,
      /* ! */
      CHAR_FORM_FEED: 12,
      /* \f */
      CHAR_FORWARD_SLASH: 47,
      /* / */
      CHAR_GRAVE_ACCENT: 96,
      /* ` */
      CHAR_HASH: 35,
      /* # */
      CHAR_HYPHEN_MINUS: 45,
      /* - */
      CHAR_LEFT_ANGLE_BRACKET: 60,
      /* < */
      CHAR_LEFT_CURLY_BRACE: 123,
      /* { */
      CHAR_LEFT_SQUARE_BRACKET: 91,
      /* [ */
      CHAR_LINE_FEED: 10,
      /* \n */
      CHAR_NO_BREAK_SPACE: 160,
      /* \u00A0 */
      CHAR_PERCENT: 37,
      /* % */
      CHAR_PLUS: 43,
      /* + */
      CHAR_QUESTION_MARK: 63,
      /* ? */
      CHAR_RIGHT_ANGLE_BRACKET: 62,
      /* > */
      CHAR_RIGHT_CURLY_BRACE: 125,
      /* } */
      CHAR_RIGHT_SQUARE_BRACKET: 93,
      /* ] */
      CHAR_SEMICOLON: 59,
      /* ; */
      CHAR_SINGLE_QUOTE: 39,
      /* ' */
      CHAR_SPACE: 32,
      /*   */
      CHAR_TAB: 9,
      /* \t */
      CHAR_UNDERSCORE: 95,
      /* _ */
      CHAR_VERTICAL_LINE: 124,
      /* | */
      CHAR_ZERO_WIDTH_NOBREAK_SPACE: 65279,
      /* \uFEFF */
      /**
       * Create EXTGLOB_CHARS
       */
      extglobChars(chars) {
        return {
          "!": { type: "negate", open: "(?:(?!(?:", close: `))${chars.STAR})` },
          "?": { type: "qmark", open: "(?:", close: ")?" },
          "+": { type: "plus", open: "(?:", close: ")+" },
          "*": { type: "star", open: "(?:", close: ")*" },
          "@": { type: "at", open: "(?:", close: ")" }
        };
      },
      /**
       * Create GLOB_CHARS
       */
      globChars(win32) {
        return win32 === true ? WINDOWS_CHARS : POSIX_CHARS;
      }
    };
  }
});

// node_modules/picomatch/lib/utils.js
var require_utils = __commonJS({
  "node_modules/picomatch/lib/utils.js"(exports) {
    "use strict";
    init_git_buffer();
    var {
      REGEX_BACKSLASH,
      REGEX_REMOVE_BACKSLASH,
      REGEX_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_GLOBAL
    } = require_constants();
    exports.isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
    exports.hasRegexChars = (str) => REGEX_SPECIAL_CHARS.test(str);
    exports.isRegexChar = (str) => str.length === 1 && exports.hasRegexChars(str);
    exports.escapeRegex = (str) => str.replace(REGEX_SPECIAL_CHARS_GLOBAL, "\\$1");
    exports.toPosixSlashes = (str) => str.replace(REGEX_BACKSLASH, "/");
    exports.isWindows = () => {
      if (typeof navigator !== "undefined" && navigator.platform) {
        const platform = navigator.platform.toLowerCase();
        return platform === "win32" || platform === "windows";
      }
      if (typeof process !== "undefined" && process.platform) {
        return process.platform === "win32";
      }
      return false;
    };
    exports.removeBackslashes = (str) => {
      return str.replace(REGEX_REMOVE_BACKSLASH, (match) => {
        return match === "\\" ? "" : match;
      });
    };
    exports.escapeLast = (input, char, lastIdx) => {
      const idx = input.lastIndexOf(char, lastIdx);
      if (idx === -1) return input;
      if (input[idx - 1] === "\\") return exports.escapeLast(input, char, idx - 1);
      return `${input.slice(0, idx)}\\${input.slice(idx)}`;
    };
    exports.removePrefix = (input, state = {}) => {
      let output = input;
      if (output.startsWith("./")) {
        output = output.slice(2);
        state.prefix = "./";
      }
      return output;
    };
    exports.wrapOutput = (input, state = {}, options = {}) => {
      const prepend = options.contains ? "" : "^";
      const append = options.contains ? "" : "$";
      let output = `${prepend}(?:${input})${append}`;
      if (state.negated === true) {
        output = `(?:^(?!${output}).*$)`;
      }
      return output;
    };
    exports.basename = (path, { windows } = {}) => {
      const segs = path.split(windows ? /[\\/]/ : "/");
      const last = segs[segs.length - 1];
      if (last === "") {
        return segs[segs.length - 2];
      }
      return last;
    };
  }
});

// node_modules/picomatch/lib/scan.js
var require_scan = __commonJS({
  "node_modules/picomatch/lib/scan.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var utils = require_utils();
    var {
      CHAR_ASTERISK,
      /* * */
      CHAR_AT,
      /* @ */
      CHAR_BACKWARD_SLASH,
      /* \ */
      CHAR_COMMA,
      /* , */
      CHAR_DOT,
      /* . */
      CHAR_EXCLAMATION_MARK,
      /* ! */
      CHAR_FORWARD_SLASH,
      /* / */
      CHAR_LEFT_CURLY_BRACE,
      /* { */
      CHAR_LEFT_PARENTHESES,
      /* ( */
      CHAR_LEFT_SQUARE_BRACKET,
      /* [ */
      CHAR_PLUS,
      /* + */
      CHAR_QUESTION_MARK,
      /* ? */
      CHAR_RIGHT_CURLY_BRACE,
      /* } */
      CHAR_RIGHT_PARENTHESES,
      /* ) */
      CHAR_RIGHT_SQUARE_BRACKET
      /* ] */
    } = require_constants();
    var isPathSeparator = (code) => {
      return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
    };
    var depth = (token) => {
      if (token.isPrefix !== true) {
        token.depth = token.isGlobstar ? Infinity : 1;
      }
    };
    var scan2 = (input, options) => {
      const opts = options || {};
      const length = input.length - 1;
      const scanToEnd = opts.parts === true || opts.tokens === true || opts.scanToEnd === true;
      const slashes = [];
      const tokens = [];
      const parts = [];
      let str = input;
      let index = -1;
      let start = 0;
      let lastIndex = 0;
      let isBrace = false;
      let isBracket = false;
      let isGlob = false;
      let isExtglob = false;
      let isGlobstar = false;
      let braceEscaped = false;
      let backslashes = false;
      let negated = false;
      let negatedExtglob = false;
      let finished = false;
      let braces = 0;
      let prev;
      let code;
      let token = { value: "", depth: 0, isGlob: false };
      const eos = () => index >= length;
      const peek = () => str.charCodeAt(index + 1);
      const advance = () => {
        prev = code;
        return str.charCodeAt(++index);
      };
      while (index < length) {
        code = advance();
        let next;
        if (code === CHAR_BACKWARD_SLASH) {
          backslashes = token.backslashes = true;
          code = advance();
          if (code === CHAR_LEFT_CURLY_BRACE) {
            braceEscaped = true;
          }
          continue;
        }
        if (braceEscaped === true || code === CHAR_LEFT_CURLY_BRACE) {
          braces++;
          while (eos() !== true && (code = advance())) {
            if (code === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (code === CHAR_LEFT_CURLY_BRACE) {
              braces++;
              continue;
            }
            if (braceEscaped !== true && code === CHAR_DOT && (code = advance()) === CHAR_DOT) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) {
                continue;
              }
              break;
            }
            if (braceEscaped !== true && code === CHAR_COMMA) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) {
                continue;
              }
              break;
            }
            if (code === CHAR_RIGHT_CURLY_BRACE) {
              braces--;
              if (braces === 0) {
                braceEscaped = false;
                isBrace = token.isBrace = true;
                finished = true;
                break;
              }
            }
          }
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_FORWARD_SLASH) {
          slashes.push(index);
          tokens.push(token);
          token = { value: "", depth: 0, isGlob: false };
          if (finished === true) continue;
          if (prev === CHAR_DOT && index === start + 1) {
            start += 2;
            continue;
          }
          lastIndex = index + 1;
          continue;
        }
        if (opts.noext !== true) {
          const isExtglobChar = code === CHAR_PLUS || code === CHAR_AT || code === CHAR_ASTERISK || code === CHAR_QUESTION_MARK || code === CHAR_EXCLAMATION_MARK;
          if (isExtglobChar === true && peek() === CHAR_LEFT_PARENTHESES) {
            isGlob = token.isGlob = true;
            isExtglob = token.isExtglob = true;
            finished = true;
            if (code === CHAR_EXCLAMATION_MARK && index === start) {
              negatedExtglob = true;
            }
            if (scanToEnd === true) {
              let parens = 0;
              while (eos() !== true && (code = advance())) {
                if (code === CHAR_BACKWARD_SLASH) {
                  backslashes = token.backslashes = true;
                  advance();
                  continue;
                }
                if (code === CHAR_LEFT_PARENTHESES) {
                  parens++;
                  continue;
                }
                if (code === CHAR_RIGHT_PARENTHESES && --parens === 0) {
                  finished = true;
                  break;
                }
              }
              continue;
            }
            break;
          }
        }
        if (code === CHAR_ASTERISK) {
          if (prev === CHAR_ASTERISK) isGlobstar = token.isGlobstar = true;
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_QUESTION_MARK) {
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_LEFT_SQUARE_BRACKET) {
          while (eos() !== true && (next = advance())) {
            if (next === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (next === CHAR_RIGHT_SQUARE_BRACKET) {
              isBracket = token.isBracket = true;
              isGlob = token.isGlob = true;
              finished = true;
              break;
            }
          }
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (opts.nonegate !== true && code === CHAR_EXCLAMATION_MARK && index === start) {
          negated = token.negated = true;
          start++;
          continue;
        }
        if (opts.noparen !== true && code === CHAR_LEFT_PARENTHESES) {
          isGlob = token.isGlob = true;
          if (scanToEnd === true) {
            let parens = 1;
            while (eos() !== true && (code = advance())) {
              if (code === CHAR_BACKWARD_SLASH) {
                backslashes = token.backslashes = true;
                advance();
                continue;
              }
              if (code === CHAR_LEFT_PARENTHESES) {
                parens++;
                continue;
              }
              if (code === CHAR_RIGHT_PARENTHESES && --parens === 0) {
                finished = true;
                break;
              }
            }
            continue;
          }
          break;
        }
        if (isGlob === true) {
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
      }
      if (opts.noext === true) {
        isExtglob = false;
        isGlob = false;
      }
      let base = str;
      let prefix = "";
      let glob = "";
      if (start > 0) {
        prefix = str.slice(0, start);
        str = str.slice(start);
        lastIndex -= start;
      }
      if (base && isGlob === true && lastIndex > 0) {
        base = str.slice(0, lastIndex);
        glob = str.slice(lastIndex);
      } else if (isGlob === true) {
        base = "";
        glob = str;
      } else {
        base = str;
      }
      if (base && base !== "" && base !== "/" && base !== str) {
        if (isPathSeparator(base.charCodeAt(base.length - 1))) {
          base = base.slice(0, -1);
        }
      }
      if (opts.unescape === true) {
        if (glob) glob = utils.removeBackslashes(glob);
        if (base && backslashes === true) {
          base = utils.removeBackslashes(base);
        }
      }
      const state = {
        prefix,
        input,
        start,
        base,
        glob,
        isBrace,
        isBracket,
        isGlob,
        isExtglob,
        isGlobstar,
        negated,
        negatedExtglob
      };
      if (opts.tokens === true) {
        state.maxDepth = 0;
        if (!isPathSeparator(code)) {
          tokens.push(token);
        }
        state.tokens = tokens;
      }
      if (opts.parts === true || opts.tokens === true) {
        let prevIndex;
        for (let idx = 0; idx < slashes.length; idx++) {
          const n2 = prevIndex !== void 0 ? prevIndex + 1 : start;
          const i = slashes[idx];
          const value2 = input.slice(n2, i);
          if (opts.tokens) {
            if (idx === 0 && start !== 0) {
              tokens[idx].isPrefix = true;
              tokens[idx].value = prefix;
            } else {
              tokens[idx].value = value2;
            }
            depth(tokens[idx]);
            state.maxDepth += tokens[idx].depth;
          }
          if (i >= start) {
            parts.push(value2);
            prevIndex = i;
          }
        }
        const n = prevIndex !== void 0 ? prevIndex + 1 : start;
        const value = input.slice(n);
        parts.push(value);
        if (opts.tokens && prevIndex && prevIndex + 1 < input.length) {
          tokens[tokens.length - 1].value = value;
          depth(tokens[tokens.length - 1]);
          state.maxDepth += tokens[tokens.length - 1].depth;
        }
        state.slashes = slashes;
        state.parts = parts;
      }
      return state;
    };
    module2.exports = scan2;
  }
});

// node_modules/picomatch/lib/parse.js
var require_parse = __commonJS({
  "node_modules/picomatch/lib/parse.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var constants = require_constants();
    var utils = require_utils();
    var {
      MAX_LENGTH,
      POSIX_REGEX_SOURCE,
      REGEX_NON_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_BACKREF,
      REPLACEMENTS
    } = constants;
    var expandRange = (args, options) => {
      if (typeof options.expandRange === "function") {
        return options.expandRange(...args, options);
      }
      args.sort();
      const value = `[${args.join("-")}]`;
      try {
        new RegExp(value);
      } catch (ex) {
        return args.map((v) => utils.escapeRegex(v)).join("..");
      }
      return value;
    };
    var syntaxError = (type, char) => {
      return `Missing ${type}: "${char}" - use "\\\\${char}" to match literal characters`;
    };
    var splitTopLevel = (input) => {
      const parts = [];
      let bracket = 0;
      let paren = 0;
      let quote = 0;
      let value = "";
      let escaped = false;
      for (const ch of input) {
        if (escaped === true) {
          value += ch;
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          value += ch;
          escaped = true;
          continue;
        }
        if (ch === '"') {
          quote = quote === 1 ? 0 : 1;
          value += ch;
          continue;
        }
        if (quote === 0) {
          if (ch === "[") {
            bracket++;
          } else if (ch === "]" && bracket > 0) {
            bracket--;
          } else if (bracket === 0) {
            if (ch === "(") {
              paren++;
            } else if (ch === ")" && paren > 0) {
              paren--;
            } else if (ch === "|" && paren === 0) {
              parts.push(value);
              value = "";
              continue;
            }
          }
        }
        value += ch;
      }
      parts.push(value);
      return parts;
    };
    var isPlainBranch = (branch) => {
      let escaped = false;
      for (const ch of branch) {
        if (escaped === true) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (/[?*+@!()[\]{}]/.test(ch)) {
          return false;
        }
      }
      return true;
    };
    var normalizeSimpleBranch = (branch) => {
      let value = branch.trim();
      let changed = true;
      while (changed === true) {
        changed = false;
        if (/^@\([^\\()[\]{}|]+\)$/.test(value)) {
          value = value.slice(2, -1);
          changed = true;
        }
      }
      if (!isPlainBranch(value)) {
        return;
      }
      return value.replace(/\\(.)/g, "$1");
    };
    var hasRepeatedCharPrefixOverlap = (branches) => {
      const values = branches.map(normalizeSimpleBranch).filter(Boolean);
      for (let i = 0; i < values.length; i++) {
        for (let j = i + 1; j < values.length; j++) {
          const a = values[i];
          const b = values[j];
          const char = a[0];
          if (!char || a !== char.repeat(a.length) || b !== char.repeat(b.length)) {
            continue;
          }
          if (a === b || a.startsWith(b) || b.startsWith(a)) {
            return true;
          }
        }
      }
      return false;
    };
    var parseRepeatedExtglob = (pattern, requireEnd = true) => {
      if (pattern[0] !== "+" && pattern[0] !== "*" || pattern[1] !== "(") {
        return;
      }
      let bracket = 0;
      let paren = 0;
      let quote = 0;
      let escaped = false;
      for (let i = 1; i < pattern.length; i++) {
        const ch = pattern[i];
        if (escaped === true) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          quote = quote === 1 ? 0 : 1;
          continue;
        }
        if (quote === 1) {
          continue;
        }
        if (ch === "[") {
          bracket++;
          continue;
        }
        if (ch === "]" && bracket > 0) {
          bracket--;
          continue;
        }
        if (bracket > 0) {
          continue;
        }
        if (ch === "(") {
          paren++;
          continue;
        }
        if (ch === ")") {
          paren--;
          if (paren === 0) {
            if (requireEnd === true && i !== pattern.length - 1) {
              return;
            }
            return {
              type: pattern[0],
              body: pattern.slice(2, i),
              end: i
            };
          }
        }
      }
    };
    var buildCharClassStar = (chars) => {
      const source = chars.length === 1 ? utils.escapeRegex(chars[0]) : `[${chars.map((ch) => utils.escapeRegex(ch)).join("")}]`;
      return `${source}*`;
    };
    var getStarExtglobSequenceChars = (pattern) => {
      let index = 0;
      const chars = [];
      while (index < pattern.length) {
        const match = parseRepeatedExtglob(pattern.slice(index), false);
        if (!match || match.type !== "*") {
          return;
        }
        const branches = splitTopLevel(match.body).map((branch2) => branch2.trim());
        if (branches.length !== 1) {
          return;
        }
        const branch = normalizeSimpleBranch(branches[0]);
        if (!branch || branch.length !== 1) {
          return;
        }
        chars.push(branch);
        index += match.end + 1;
      }
      if (chars.length < 1) {
        return;
      }
      return chars;
    };
    var repeatedExtglobRecursion = (pattern) => {
      let depth = 0;
      let value = pattern.trim();
      let match = parseRepeatedExtglob(value);
      while (match) {
        depth++;
        value = match.body.trim();
        match = parseRepeatedExtglob(value);
      }
      return depth;
    };
    var analyzeRepeatedExtglob = (body, options) => {
      if (options.maxExtglobRecursion === false) {
        return { risky: false };
      }
      const max = typeof options.maxExtglobRecursion === "number" ? options.maxExtglobRecursion : constants.DEFAULT_MAX_EXTGLOB_RECURSION;
      const branches = splitTopLevel(body).map((branch) => branch.trim());
      if (branches.length > 1) {
        if (branches.some((branch) => branch === "") || branches.some((branch) => /^[*?]+$/.test(branch)) || hasRepeatedCharPrefixOverlap(branches)) {
          return { risky: true };
        }
      }
      const safeChars = [];
      let sawStarSequence = false;
      let combinable = true;
      for (const branch of branches) {
        const chars = getStarExtglobSequenceChars(branch);
        if (chars) {
          sawStarSequence = true;
          safeChars.push(...chars);
          continue;
        }
        const literal = normalizeSimpleBranch(branch);
        if (literal && literal.length === 1) {
          safeChars.push(literal);
          continue;
        }
        combinable = false;
        if (repeatedExtglobRecursion(branch) > max) {
          return { risky: true };
        }
      }
      if (sawStarSequence) {
        return combinable ? { risky: true, safeOutput: buildCharClassStar([...new Set(safeChars)]) } : { risky: true };
      }
      return { risky: false };
    };
    var parse = (input, options) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected a string");
      }
      input = REPLACEMENTS[input] || input;
      const opts = { ...options };
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      let len = input.length;
      if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
      }
      const bos = { type: "bos", value: "", output: opts.prepend || "" };
      const tokens = [bos];
      const capture = opts.capture ? "" : "?:";
      const PLATFORM_CHARS = constants.globChars(opts.windows);
      const EXTGLOB_CHARS = constants.extglobChars(PLATFORM_CHARS);
      const {
        DOT_LITERAL,
        PLUS_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOT_SLASH,
        NO_DOTS_SLASH,
        QMARK,
        QMARK_NO_DOT,
        STAR,
        START_ANCHOR
      } = PLATFORM_CHARS;
      const globstar = (opts2) => {
        return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const nodot = opts.dot ? "" : NO_DOT;
      const qmarkNoDot = opts.dot ? QMARK : QMARK_NO_DOT;
      let star = opts.bash === true ? globstar(opts) : STAR;
      if (opts.capture) {
        star = `(${star})`;
      }
      if (typeof opts.noext === "boolean") {
        opts.noextglob = opts.noext;
      }
      const state = {
        input,
        index: -1,
        start: 0,
        dot: opts.dot === true,
        consumed: "",
        output: "",
        prefix: "",
        backtrack: false,
        negated: false,
        brackets: 0,
        braces: 0,
        parens: 0,
        quotes: 0,
        globstar: false,
        tokens
      };
      input = utils.removePrefix(input, state);
      len = input.length;
      const extglobs = [];
      const braces = [];
      const stack = [];
      let prev = bos;
      let value;
      const eos = () => state.index === len - 1;
      const peek = state.peek = (n = 1) => input[state.index + n];
      const advance = state.advance = () => input[++state.index] || "";
      const remaining = () => input.slice(state.index + 1);
      const consume = (value2 = "", num2 = 0) => {
        state.consumed += value2;
        state.index += num2;
      };
      const append = (token) => {
        state.output += token.output != null ? token.output : token.value;
        consume(token.value);
      };
      const negate = () => {
        let count = 1;
        while (peek() === "!" && (peek(2) !== "(" || peek(3) === "?")) {
          advance();
          state.start++;
          count++;
        }
        if (count % 2 === 0) {
          return false;
        }
        state.negated = true;
        state.start++;
        return true;
      };
      const increment = (type) => {
        state[type]++;
        stack.push(type);
      };
      const decrement = (type) => {
        state[type]--;
        stack.pop();
      };
      const push = (tok) => {
        if (prev.type === "globstar") {
          const isBrace = state.braces > 0 && (tok.type === "comma" || tok.type === "brace");
          const isExtglob = tok.extglob === true || extglobs.length && (tok.type === "pipe" || tok.type === "paren");
          if (tok.type !== "slash" && tok.type !== "paren" && !isBrace && !isExtglob) {
            state.output = state.output.slice(0, -prev.output.length);
            prev.type = "star";
            prev.value = "*";
            prev.output = star;
            state.output += prev.output;
          }
        }
        if (extglobs.length && tok.type !== "paren") {
          extglobs[extglobs.length - 1].inner += tok.value;
        }
        if (tok.value || tok.output) append(tok);
        if (prev && prev.type === "text" && tok.type === "text") {
          prev.output = (prev.output || prev.value) + tok.value;
          prev.value += tok.value;
          return;
        }
        tok.prev = prev;
        tokens.push(tok);
        prev = tok;
      };
      const extglobOpen = (type, value2) => {
        const token = { ...EXTGLOB_CHARS[value2], conditions: 1, inner: "" };
        token.prev = prev;
        token.parens = state.parens;
        token.output = state.output;
        token.startIndex = state.index;
        token.tokensIndex = tokens.length;
        const output = (opts.capture ? "(" : "") + token.open;
        increment("parens");
        push({ type, value: value2, output: state.output ? "" : ONE_CHAR });
        push({ type: "paren", extglob: true, value: advance(), output });
        extglobs.push(token);
      };
      const extglobClose = (token) => {
        const literal = input.slice(token.startIndex, state.index + 1);
        const body = input.slice(token.startIndex + 2, state.index);
        const analysis = analyzeRepeatedExtglob(body, opts);
        if ((token.type === "plus" || token.type === "star") && analysis.risky) {
          const safeOutput = analysis.safeOutput ? (token.output ? "" : ONE_CHAR) + (opts.capture ? `(${analysis.safeOutput})` : analysis.safeOutput) : void 0;
          const open = tokens[token.tokensIndex];
          open.type = "text";
          open.value = literal;
          open.output = safeOutput || utils.escapeRegex(literal);
          for (let i = token.tokensIndex + 1; i < tokens.length; i++) {
            tokens[i].value = "";
            tokens[i].output = "";
            delete tokens[i].suffix;
          }
          state.output = token.output + open.output;
          state.backtrack = true;
          push({ type: "paren", extglob: true, value, output: "" });
          decrement("parens");
          return;
        }
        let output = token.close + (opts.capture ? ")" : "");
        let rest;
        if (token.type === "negate") {
          let extglobStar = star;
          if (token.inner && token.inner.length > 1 && token.inner.includes("/")) {
            extglobStar = globstar(opts);
          }
          if (extglobStar !== star || eos() || /^\)+$/.test(remaining())) {
            output = token.close = `)$))${extglobStar}`;
          }
          if (token.inner.includes("*") && (rest = remaining()) && /^\.[^\\/.]+$/.test(rest)) {
            const expression = parse(rest, { ...options, fastpaths: false }).output;
            output = token.close = `)${expression})${extglobStar})`;
          }
          if (token.prev.type === "bos") {
            state.negatedExtglob = true;
          }
        }
        push({ type: "paren", extglob: true, value, output });
        decrement("parens");
      };
      if (opts.fastpaths !== false && !/(^[*!]|[/()[\]{}"])/.test(input)) {
        let backslashes = false;
        let output = input.replace(REGEX_SPECIAL_CHARS_BACKREF, (m, esc, chars, first, rest, index) => {
          if (first === "\\") {
            backslashes = true;
            return m;
          }
          if (first === "?") {
            if (esc) {
              return esc + first + (rest ? QMARK.repeat(rest.length) : "");
            }
            if (index === 0) {
              return qmarkNoDot + (rest ? QMARK.repeat(rest.length) : "");
            }
            return QMARK.repeat(chars.length);
          }
          if (first === ".") {
            return DOT_LITERAL.repeat(chars.length);
          }
          if (first === "*") {
            if (esc) {
              return esc + first + (rest ? star : "");
            }
            return star;
          }
          return esc ? m : `\\${m}`;
        });
        if (backslashes === true) {
          if (opts.unescape === true) {
            output = output.replace(/\\/g, "");
          } else {
            output = output.replace(/\\+/g, (m) => {
              return m.length % 2 === 0 ? "\\\\" : m ? "\\" : "";
            });
          }
        }
        if (output === input && opts.contains === true) {
          state.output = input;
          return state;
        }
        state.output = utils.wrapOutput(output, state, options);
        return state;
      }
      while (!eos()) {
        value = advance();
        if (value === "\0") {
          continue;
        }
        if (value === "\\") {
          const next = peek();
          if (next === "/" && opts.bash !== true) {
            continue;
          }
          if (next === "." || next === ";") {
            continue;
          }
          if (!next) {
            value += "\\";
            push({ type: "text", value });
            continue;
          }
          const match = /^\\+/.exec(remaining());
          let slashes = 0;
          if (match && match[0].length > 2) {
            slashes = match[0].length;
            state.index += slashes;
            if (slashes % 2 !== 0) {
              value += "\\";
            }
          }
          if (opts.unescape === true) {
            value = advance();
          } else {
            value += advance();
          }
          if (state.brackets === 0) {
            push({ type: "text", value });
            continue;
          }
        }
        if (state.brackets > 0 && (value !== "]" || prev.value === "[" || prev.value === "[^")) {
          if (opts.posix !== false && value === ":") {
            const inner = prev.value.slice(1);
            if (inner.includes("[")) {
              prev.posix = true;
              if (inner.includes(":")) {
                const idx = prev.value.lastIndexOf("[");
                const pre = prev.value.slice(0, idx);
                const rest2 = prev.value.slice(idx + 2);
                const posix = POSIX_REGEX_SOURCE[rest2];
                if (posix) {
                  prev.value = pre + posix;
                  state.backtrack = true;
                  advance();
                  if (!bos.output && tokens.indexOf(prev) === 1) {
                    bos.output = ONE_CHAR;
                  }
                  continue;
                }
              }
            }
          }
          if (value === "[" && peek() !== ":" || value === "-" && peek() === "]") {
            value = `\\${value}`;
          }
          if (value === "]" && (prev.value === "[" || prev.value === "[^")) {
            value = `\\${value}`;
          }
          if (opts.posix === true && value === "!" && prev.value === "[") {
            value = "^";
          }
          prev.value += value;
          append({ value });
          continue;
        }
        if (state.quotes === 1 && value !== '"') {
          value = utils.escapeRegex(value);
          prev.value += value;
          append({ value });
          continue;
        }
        if (value === '"') {
          state.quotes = state.quotes === 1 ? 0 : 1;
          if (opts.keepQuotes === true) {
            push({ type: "text", value });
          }
          continue;
        }
        if (value === "(") {
          increment("parens");
          push({ type: "paren", value });
          continue;
        }
        if (value === ")") {
          if (state.parens === 0 && opts.strictBrackets === true) {
            throw new SyntaxError(syntaxError("opening", "("));
          }
          const extglob = extglobs[extglobs.length - 1];
          if (extglob && state.parens === extglob.parens + 1) {
            extglobClose(extglobs.pop());
            continue;
          }
          push({ type: "paren", value, output: state.parens ? ")" : "\\)" });
          decrement("parens");
          continue;
        }
        if (value === "[") {
          if (opts.nobracket === true || !remaining().includes("]")) {
            if (opts.nobracket !== true && opts.strictBrackets === true) {
              throw new SyntaxError(syntaxError("closing", "]"));
            }
            value = `\\${value}`;
          } else {
            increment("brackets");
          }
          push({ type: "bracket", value });
          continue;
        }
        if (value === "]") {
          if (opts.nobracket === true || prev && prev.type === "bracket" && prev.value.length === 1) {
            push({ type: "text", value, output: `\\${value}` });
            continue;
          }
          if (state.brackets === 0) {
            if (opts.strictBrackets === true) {
              throw new SyntaxError(syntaxError("opening", "["));
            }
            push({ type: "text", value, output: `\\${value}` });
            continue;
          }
          decrement("brackets");
          const prevValue = prev.value.slice(1);
          if (prev.posix !== true && prevValue[0] === "^" && !prevValue.includes("/")) {
            value = `/${value}`;
          }
          prev.value += value;
          append({ value });
          if (opts.literalBrackets === false || utils.hasRegexChars(prevValue)) {
            continue;
          }
          const escaped = utils.escapeRegex(prev.value);
          state.output = state.output.slice(0, -prev.value.length);
          if (opts.literalBrackets === true) {
            state.output += escaped;
            prev.value = escaped;
            continue;
          }
          prev.value = `(${capture}${escaped}|${prev.value})`;
          state.output += prev.value;
          continue;
        }
        if (value === "{" && opts.nobrace !== true) {
          increment("braces");
          const open = {
            type: "brace",
            value,
            output: "(",
            outputIndex: state.output.length,
            tokensIndex: state.tokens.length
          };
          braces.push(open);
          push(open);
          continue;
        }
        if (value === "}") {
          const brace = braces[braces.length - 1];
          if (opts.nobrace === true || !brace) {
            push({ type: "text", value, output: value });
            continue;
          }
          let output = ")";
          if (brace.dots === true) {
            const arr = tokens.slice();
            const range = [];
            for (let i = arr.length - 1; i >= 0; i--) {
              tokens.pop();
              if (arr[i].type === "brace") {
                break;
              }
              if (arr[i].type !== "dots") {
                range.unshift(arr[i].value);
              }
            }
            output = expandRange(range, opts);
            state.backtrack = true;
          }
          if (brace.comma !== true && brace.dots !== true) {
            const out = state.output.slice(0, brace.outputIndex);
            const toks = state.tokens.slice(brace.tokensIndex);
            brace.value = brace.output = "\\{";
            value = output = "\\}";
            state.output = out;
            for (const t of toks) {
              state.output += t.output || t.value;
            }
          }
          push({ type: "brace", value, output });
          decrement("braces");
          braces.pop();
          continue;
        }
        if (value === "|") {
          if (extglobs.length > 0) {
            extglobs[extglobs.length - 1].conditions++;
          }
          push({ type: "text", value });
          continue;
        }
        if (value === ",") {
          let output = value;
          const brace = braces[braces.length - 1];
          if (brace && stack[stack.length - 1] === "braces") {
            brace.comma = true;
            output = "|";
          }
          push({ type: "comma", value, output });
          continue;
        }
        if (value === "/") {
          if (prev.type === "dot" && state.index === state.start + 1) {
            state.start = state.index + 1;
            state.consumed = "";
            state.output = "";
            tokens.pop();
            prev = bos;
            continue;
          }
          push({ type: "slash", value, output: SLASH_LITERAL });
          continue;
        }
        if (value === ".") {
          if (state.braces > 0 && prev.type === "dot") {
            if (prev.value === ".") prev.output = DOT_LITERAL;
            const brace = braces[braces.length - 1];
            prev.type = "dots";
            prev.output += value;
            prev.value += value;
            brace.dots = true;
            continue;
          }
          if (state.braces + state.parens === 0 && prev.type !== "bos" && prev.type !== "slash") {
            push({ type: "text", value, output: DOT_LITERAL });
            continue;
          }
          push({ type: "dot", value, output: DOT_LITERAL });
          continue;
        }
        if (value === "?") {
          const isGroup = prev && prev.value === "(";
          if (!isGroup && opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            extglobOpen("qmark", value);
            continue;
          }
          if (prev && prev.type === "paren") {
            const next = peek();
            let output = value;
            if (prev.value === "(" && !/[!=<:]/.test(next) || next === "<" && !/<([!=]|\w+>)/.test(remaining())) {
              output = `\\${value}`;
            }
            push({ type: "text", value, output });
            continue;
          }
          if (opts.dot !== true && (prev.type === "slash" || prev.type === "bos")) {
            push({ type: "qmark", value, output: QMARK_NO_DOT });
            continue;
          }
          push({ type: "qmark", value, output: QMARK });
          continue;
        }
        if (value === "!") {
          if (opts.noextglob !== true && peek() === "(") {
            if (peek(2) !== "?" || !/[!=<:]/.test(peek(3))) {
              extglobOpen("negate", value);
              continue;
            }
          }
          if (opts.nonegate !== true && state.index === 0) {
            negate();
            continue;
          }
        }
        if (value === "+") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            extglobOpen("plus", value);
            continue;
          }
          if (prev && prev.value === "(" || opts.regex === false) {
            push({ type: "plus", value, output: PLUS_LITERAL });
            continue;
          }
          if (prev && (prev.type === "bracket" || prev.type === "paren" || prev.type === "brace") || state.parens > 0) {
            push({ type: "plus", value });
            continue;
          }
          push({ type: "plus", value: PLUS_LITERAL });
          continue;
        }
        if (value === "@") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            push({ type: "at", extglob: true, value, output: "" });
            continue;
          }
          push({ type: "text", value });
          continue;
        }
        if (value !== "*") {
          if (value === "$" || value === "^") {
            value = `\\${value}`;
          }
          const match = REGEX_NON_SPECIAL_CHARS.exec(remaining());
          if (match) {
            value += match[0];
            state.index += match[0].length;
          }
          push({ type: "text", value });
          continue;
        }
        if (prev && (prev.type === "globstar" || prev.star === true)) {
          prev.type = "star";
          prev.star = true;
          prev.value += value;
          prev.output = star;
          state.backtrack = true;
          state.globstar = true;
          consume(value);
          continue;
        }
        let rest = remaining();
        if (opts.noextglob !== true && /^\([^?]/.test(rest)) {
          extglobOpen("star", value);
          continue;
        }
        if (prev.type === "star") {
          if (opts.noglobstar === true) {
            consume(value);
            continue;
          }
          const prior = prev.prev;
          const before = prior.prev;
          const isStart = prior.type === "slash" || prior.type === "bos";
          const afterStar = before && (before.type === "star" || before.type === "globstar");
          if (opts.bash === true && (!isStart || rest[0] && rest[0] !== "/")) {
            push({ type: "star", value, output: "" });
            continue;
          }
          const isBrace = state.braces > 0 && (prior.type === "comma" || prior.type === "brace");
          const isExtglob = extglobs.length && (prior.type === "pipe" || prior.type === "paren");
          if (!isStart && prior.type !== "paren" && !isBrace && !isExtglob) {
            push({ type: "star", value, output: "" });
            continue;
          }
          while (rest.slice(0, 3) === "/**") {
            const after = input[state.index + 4];
            if (after && after !== "/") {
              break;
            }
            rest = rest.slice(3);
            consume("/**", 3);
          }
          const isEnd = eos() || state.parens > 0 && rest === ")".repeat(state.parens) && !extglobs.some((extglob) => extglob.type === "negate");
          if (prior.type === "bos" && eos()) {
            prev.type = "globstar";
            prev.value += value;
            prev.output = globstar(opts);
            state.output = prev.output;
            state.globstar = true;
            consume(value);
            continue;
          }
          if (prior.type === "slash" && prior.prev.type !== "bos" && !afterStar && isEnd) {
            state.output = state.output.slice(0, -(prior.output + prev.output).length);
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = globstar(opts) + (opts.strictSlashes ? ")" : "|$)");
            prev.value += value;
            state.globstar = true;
            state.output += prior.output + prev.output;
            consume(value);
            continue;
          }
          if (prior.type === "slash" && prior.prev.type !== "bos" && rest[0] === "/") {
            const end = rest[1] !== void 0 ? "|$" : "";
            state.output = state.output.slice(0, -(prior.output + prev.output).length);
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = `${globstar(opts)}${SLASH_LITERAL}|${SLASH_LITERAL}${end})`;
            prev.value += value;
            state.output += prior.output + prev.output;
            state.globstar = true;
            consume(value + advance());
            push({ type: "slash", value: "/", output: "" });
            continue;
          }
          if (prior.type === "bos" && rest[0] === "/") {
            prev.type = "globstar";
            prev.value += value;
            prev.output = `(?:^|${SLASH_LITERAL}|${globstar(opts)}${SLASH_LITERAL})`;
            state.output = prev.output;
            state.globstar = true;
            consume(value + advance());
            push({ type: "slash", value: "/", output: "" });
            continue;
          }
          state.output = state.output.slice(0, -prev.output.length);
          prev.type = "globstar";
          prev.output = globstar(opts);
          prev.value += value;
          state.output += prev.output;
          state.globstar = true;
          consume(value);
          continue;
        }
        const token = { type: "star", value, output: star };
        if (opts.bash === true) {
          token.output = ".*?";
          if (prev.type === "bos" || prev.type === "slash") {
            token.output = nodot + token.output;
          }
          push(token);
          continue;
        }
        if (prev && (prev.type === "bracket" || prev.type === "paren") && opts.regex === true) {
          token.output = value;
          push(token);
          continue;
        }
        if (state.index === state.start || prev.type === "slash" || prev.type === "dot") {
          if (prev.type === "dot") {
            state.output += NO_DOT_SLASH;
            prev.output += NO_DOT_SLASH;
          } else if (opts.dot === true) {
            state.output += NO_DOTS_SLASH;
            prev.output += NO_DOTS_SLASH;
          } else {
            state.output += nodot;
            prev.output += nodot;
          }
          if (peek() !== "*") {
            state.output += ONE_CHAR;
            prev.output += ONE_CHAR;
          }
        }
        push(token);
      }
      while (state.brackets > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "]"));
        state.output = utils.escapeLast(state.output, "[");
        decrement("brackets");
      }
      while (state.parens > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", ")"));
        state.output = utils.escapeLast(state.output, "(");
        decrement("parens");
      }
      while (state.braces > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "}"));
        state.output = utils.escapeLast(state.output, "{");
        decrement("braces");
      }
      if (opts.strictSlashes !== true && (prev.type === "star" || prev.type === "bracket")) {
        push({ type: "maybe_slash", value: "", output: `${SLASH_LITERAL}?` });
      }
      if (state.backtrack === true) {
        state.output = "";
        for (const token of state.tokens) {
          state.output += token.output != null ? token.output : token.value;
          if (token.suffix) {
            state.output += token.suffix;
          }
        }
      }
      return state;
    };
    parse.fastpaths = (input, options) => {
      const opts = { ...options };
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      const len = input.length;
      if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
      }
      input = REPLACEMENTS[input] || input;
      const {
        DOT_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOTS,
        NO_DOTS_SLASH,
        STAR,
        START_ANCHOR
      } = constants.globChars(opts.windows);
      const nodot = opts.dot ? NO_DOTS : NO_DOT;
      const slashDot = opts.dot ? NO_DOTS_SLASH : NO_DOT;
      const capture = opts.capture ? "" : "?:";
      const state = { negated: false, prefix: "" };
      let star = opts.bash === true ? ".*?" : STAR;
      if (opts.capture) {
        star = `(${star})`;
      }
      const globstar = (opts2) => {
        if (opts2.noglobstar === true) return star;
        return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const create = (str) => {
        switch (str) {
          case "*":
            return `${nodot}${ONE_CHAR}${star}`;
          case ".*":
            return `${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*.*":
            return `${nodot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*/*":
            return `${nodot}${star}${SLASH_LITERAL}${ONE_CHAR}${slashDot}${star}`;
          case "**":
            return nodot + globstar(opts);
          case "**/*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${ONE_CHAR}${star}`;
          case "**/*.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "**/.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${DOT_LITERAL}${ONE_CHAR}${star}`;
          default: {
            const match = /^(.*?)\.(\w+)$/.exec(str);
            if (!match) return;
            const source2 = create(match[1]);
            if (!source2) return;
            return source2 + DOT_LITERAL + match[2];
          }
        }
      };
      const output = utils.removePrefix(input, state);
      let source = create(output);
      if (source && opts.strictSlashes !== true) {
        source += `${SLASH_LITERAL}?`;
      }
      return source;
    };
    module2.exports = parse;
  }
});

// node_modules/picomatch/lib/picomatch.js
var require_picomatch = __commonJS({
  "node_modules/picomatch/lib/picomatch.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var scan2 = require_scan();
    var parse = require_parse();
    var utils = require_utils();
    var constants = require_constants();
    var isObject2 = (val) => val && typeof val === "object" && !Array.isArray(val);
    var picomatch4 = (glob, options, returnState = false) => {
      if (Array.isArray(glob)) {
        const fns = glob.map((input) => picomatch4(input, options, returnState));
        const arrayMatcher = (str) => {
          for (const isMatch of fns) {
            const state2 = isMatch(str);
            if (state2) return state2;
          }
          return false;
        };
        return arrayMatcher;
      }
      const isState = isObject2(glob) && glob.tokens && glob.input;
      if (glob === "" || typeof glob !== "string" && !isState) {
        throw new TypeError("Expected pattern to be a non-empty string");
      }
      const opts = options || {};
      const posix = opts.windows;
      const regex = isState ? picomatch4.compileRe(glob, options) : picomatch4.makeRe(glob, options, false, true);
      const state = regex.state;
      delete regex.state;
      let isIgnored = () => false;
      if (opts.ignore) {
        const ignoreOpts = { ...options, ignore: null, onMatch: null, onResult: null };
        isIgnored = picomatch4(opts.ignore, ignoreOpts, returnState);
      }
      const matcher = (input, returnObject = false) => {
        const { isMatch, match, output } = picomatch4.test(input, regex, options, { glob, posix });
        const result = { glob, state, regex, posix, input, output, match, isMatch };
        if (typeof opts.onResult === "function") {
          opts.onResult(result);
        }
        if (isMatch === false) {
          result.isMatch = false;
          return returnObject ? result : false;
        }
        if (isIgnored(input)) {
          if (typeof opts.onIgnore === "function") {
            opts.onIgnore(result);
          }
          result.isMatch = false;
          return returnObject ? result : false;
        }
        if (typeof opts.onMatch === "function") {
          opts.onMatch(result);
        }
        return returnObject ? result : true;
      };
      if (returnState) {
        matcher.state = state;
      }
      return matcher;
    };
    picomatch4.test = (input, regex, options, { glob, posix } = {}) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected input to be a string");
      }
      if (input === "") {
        return { isMatch: false, output: "" };
      }
      const opts = options || {};
      const format = opts.format || (posix ? utils.toPosixSlashes : null);
      let match = input === glob;
      let output = match && format ? format(input) : input;
      if (match === false) {
        output = format ? format(input) : input;
        match = output === glob;
      }
      if (match === false || opts.capture === true) {
        if (opts.matchBase === true || opts.basename === true) {
          match = picomatch4.matchBase(input, regex, options, posix);
        } else {
          match = regex.exec(output);
        }
      }
      return { isMatch: Boolean(match), match, output };
    };
    picomatch4.matchBase = (input, glob, options, posix = options && options.windows) => {
      const regex = glob instanceof RegExp ? glob : picomatch4.makeRe(glob, options);
      return regex.test(utils.basename(input, { windows: posix }));
    };
    picomatch4.isMatch = (str, patterns, options) => picomatch4(patterns, options)(str);
    picomatch4.parse = (pattern, options) => {
      if (Array.isArray(pattern)) return pattern.map((p) => picomatch4.parse(p, options));
      return parse(pattern, { ...options, fastpaths: false });
    };
    picomatch4.scan = (input, options) => scan2(input, options);
    picomatch4.compileRe = (state, options, returnOutput = false, returnState = false) => {
      if (returnOutput === true) {
        return state.output;
      }
      const opts = options || {};
      const prepend = opts.contains ? "" : "^";
      const append = opts.contains ? "" : "$";
      let source = `${prepend}(?:${state.output})${append}`;
      if (state && state.negated === true) {
        source = `^(?!${source}).*$`;
      }
      const regex = picomatch4.toRegex(source, options);
      if (returnState === true) {
        regex.state = state;
      }
      return regex;
    };
    picomatch4.makeRe = (input, options = {}, returnOutput = false, returnState = false) => {
      if (!input || typeof input !== "string") {
        throw new TypeError("Expected a non-empty string");
      }
      let parsed = { negated: false, fastpaths: true };
      if (options.fastpaths !== false && (input[0] === "." || input[0] === "*")) {
        parsed.output = parse.fastpaths(input, options);
      }
      if (!parsed.output) {
        parsed = parse(input, options);
      }
      return picomatch4.compileRe(parsed, options, returnOutput, returnState);
    };
    picomatch4.toRegex = (source, options) => {
      try {
        const opts = options || {};
        return new RegExp(source, opts.flags || (opts.nocase ? "i" : ""));
      } catch (err) {
        if (options && options.debug === true) throw err;
        return /$^/;
      }
    };
    picomatch4.constants = constants;
    module2.exports = picomatch4;
  }
});

// node_modules/picomatch/posix.js
var require_posix = __commonJS({
  "node_modules/picomatch/posix.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = require_picomatch();
  }
});

// node_modules/inherits/inherits_browser.js
var require_inherits_browser = __commonJS({
  "node_modules/inherits/inherits_browser.js"(exports, module2) {
    init_git_buffer();
    if (typeof Object.create === "function") {
      module2.exports = function inherits(ctor, superCtor) {
        if (superCtor) {
          ctor.super_ = superCtor;
          ctor.prototype = Object.create(superCtor.prototype, {
            constructor: {
              value: ctor,
              enumerable: false,
              writable: true,
              configurable: true
            }
          });
        }
      };
    } else {
      module2.exports = function inherits(ctor, superCtor) {
        if (superCtor) {
          ctor.super_ = superCtor;
          var TempCtor = function() {
          };
          TempCtor.prototype = superCtor.prototype;
          ctor.prototype = new TempCtor();
          ctor.prototype.constructor = ctor;
        }
      };
    }
  }
});

// node_modules/safe-buffer/index.js
var require_safe_buffer = __commonJS({
  "node_modules/safe-buffer/index.js"(exports, module2) {
    init_git_buffer();
    var buffer = require_buffer();
    var Buffer3 = buffer.Buffer;
    function copyProps(src, dst) {
      for (var key in src) {
        dst[key] = src[key];
      }
    }
    if (Buffer3.from && Buffer3.alloc && Buffer3.allocUnsafe && Buffer3.allocUnsafeSlow) {
      module2.exports = buffer;
    } else {
      copyProps(buffer, exports);
      exports.Buffer = SafeBuffer;
    }
    function SafeBuffer(arg, encodingOrOffset, length) {
      return Buffer3(arg, encodingOrOffset, length);
    }
    SafeBuffer.prototype = Object.create(Buffer3.prototype);
    copyProps(Buffer3, SafeBuffer);
    SafeBuffer.from = function(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        throw new TypeError("Argument must not be a number");
      }
      return Buffer3(arg, encodingOrOffset, length);
    };
    SafeBuffer.alloc = function(size, fill, encoding) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      var buf = Buffer3(size);
      if (fill !== void 0) {
        if (typeof encoding === "string") {
          buf.fill(fill, encoding);
        } else {
          buf.fill(fill);
        }
      } else {
        buf.fill(0);
      }
      return buf;
    };
    SafeBuffer.allocUnsafe = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return Buffer3(size);
    };
    SafeBuffer.allocUnsafeSlow = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return buffer.SlowBuffer(size);
    };
  }
});

// node_modules/isarray/index.js
var require_isarray = __commonJS({
  "node_modules/isarray/index.js"(exports, module2) {
    init_git_buffer();
    var toString = {}.toString;
    module2.exports = Array.isArray || function(arr) {
      return toString.call(arr) == "[object Array]";
    };
  }
});

// node_modules/es-errors/type.js
var require_type = __commonJS({
  "node_modules/es-errors/type.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = TypeError;
  }
});

// node_modules/es-object-atoms/index.js
var require_es_object_atoms = __commonJS({
  "node_modules/es-object-atoms/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = Object;
  }
});

// node_modules/es-errors/index.js
var require_es_errors = __commonJS({
  "node_modules/es-errors/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = Error;
  }
});

// node_modules/es-errors/eval.js
var require_eval = __commonJS({
  "node_modules/es-errors/eval.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = EvalError;
  }
});

// node_modules/es-errors/range.js
var require_range = __commonJS({
  "node_modules/es-errors/range.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = RangeError;
  }
});

// node_modules/es-errors/ref.js
var require_ref = __commonJS({
  "node_modules/es-errors/ref.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = ReferenceError;
  }
});

// node_modules/es-errors/syntax.js
var require_syntax = __commonJS({
  "node_modules/es-errors/syntax.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = SyntaxError;
  }
});

// node_modules/es-errors/uri.js
var require_uri = __commonJS({
  "node_modules/es-errors/uri.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = URIError;
  }
});

// node_modules/math-intrinsics/abs.js
var require_abs = __commonJS({
  "node_modules/math-intrinsics/abs.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = Math.abs;
  }
});

// node_modules/math-intrinsics/floor.js
var require_floor = __commonJS({
  "node_modules/math-intrinsics/floor.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = Math.floor;
  }
});

// node_modules/math-intrinsics/max.js
var require_max = __commonJS({
  "node_modules/math-intrinsics/max.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = Math.max;
  }
});

// node_modules/math-intrinsics/min.js
var require_min = __commonJS({
  "node_modules/math-intrinsics/min.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = Math.min;
  }
});

// node_modules/math-intrinsics/pow.js
var require_pow = __commonJS({
  "node_modules/math-intrinsics/pow.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = Math.pow;
  }
});

// node_modules/math-intrinsics/round.js
var require_round = __commonJS({
  "node_modules/math-intrinsics/round.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = Math.round;
  }
});

// node_modules/math-intrinsics/isNaN.js
var require_isNaN = __commonJS({
  "node_modules/math-intrinsics/isNaN.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = Number.isNaN || function isNaN2(a) {
      return a !== a;
    };
  }
});

// node_modules/math-intrinsics/sign.js
var require_sign = __commonJS({
  "node_modules/math-intrinsics/sign.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var $isNaN = require_isNaN();
    module2.exports = function sign(number) {
      if ($isNaN(number) || number === 0) {
        return number;
      }
      return number < 0 ? -1 : 1;
    };
  }
});

// node_modules/gopd/gOPD.js
var require_gOPD = __commonJS({
  "node_modules/gopd/gOPD.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = Object.getOwnPropertyDescriptor;
  }
});

// node_modules/gopd/index.js
var require_gopd = __commonJS({
  "node_modules/gopd/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var $gOPD = require_gOPD();
    if ($gOPD) {
      try {
        $gOPD([], "length");
      } catch (e) {
        $gOPD = null;
      }
    }
    module2.exports = $gOPD;
  }
});

// node_modules/es-define-property/index.js
var require_es_define_property = __commonJS({
  "node_modules/es-define-property/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var $defineProperty = Object.defineProperty || false;
    if ($defineProperty) {
      try {
        $defineProperty({}, "a", { value: 1 });
      } catch (e) {
        $defineProperty = false;
      }
    }
    module2.exports = $defineProperty;
  }
});

// node_modules/has-symbols/shams.js
var require_shams = __commonJS({
  "node_modules/has-symbols/shams.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = function hasSymbols() {
      if (typeof Symbol !== "function" || typeof Object.getOwnPropertySymbols !== "function") {
        return false;
      }
      if (typeof Symbol.iterator === "symbol") {
        return true;
      }
      var obj = {};
      var sym = Symbol("test");
      var symObj = Object(sym);
      if (typeof sym === "string") {
        return false;
      }
      if (Object.prototype.toString.call(sym) !== "[object Symbol]") {
        return false;
      }
      if (Object.prototype.toString.call(symObj) !== "[object Symbol]") {
        return false;
      }
      var symVal = 42;
      obj[sym] = symVal;
      for (var _ in obj) {
        return false;
      }
      if (typeof Object.keys === "function" && Object.keys(obj).length !== 0) {
        return false;
      }
      if (typeof Object.getOwnPropertyNames === "function" && Object.getOwnPropertyNames(obj).length !== 0) {
        return false;
      }
      var syms = Object.getOwnPropertySymbols(obj);
      if (syms.length !== 1 || syms[0] !== sym) {
        return false;
      }
      if (!Object.prototype.propertyIsEnumerable.call(obj, sym)) {
        return false;
      }
      if (typeof Object.getOwnPropertyDescriptor === "function") {
        var descriptor = (
          /** @type {PropertyDescriptor} */
          Object.getOwnPropertyDescriptor(obj, sym)
        );
        if (descriptor.value !== symVal || descriptor.enumerable !== true) {
          return false;
        }
      }
      return true;
    };
  }
});

// node_modules/has-symbols/index.js
var require_has_symbols = __commonJS({
  "node_modules/has-symbols/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var origSymbol = typeof Symbol !== "undefined" && Symbol;
    var hasSymbolSham = require_shams();
    module2.exports = function hasNativeSymbols() {
      if (typeof origSymbol !== "function") {
        return false;
      }
      if (typeof Symbol !== "function") {
        return false;
      }
      if (typeof origSymbol("foo") !== "symbol") {
        return false;
      }
      if (typeof Symbol("bar") !== "symbol") {
        return false;
      }
      return hasSymbolSham();
    };
  }
});

// node_modules/get-proto/Reflect.getPrototypeOf.js
var require_Reflect_getPrototypeOf = __commonJS({
  "node_modules/get-proto/Reflect.getPrototypeOf.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = typeof Reflect !== "undefined" && Reflect.getPrototypeOf || null;
  }
});

// node_modules/get-proto/Object.getPrototypeOf.js
var require_Object_getPrototypeOf = __commonJS({
  "node_modules/get-proto/Object.getPrototypeOf.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var $Object = require_es_object_atoms();
    module2.exports = $Object.getPrototypeOf || null;
  }
});

// node_modules/function-bind/implementation.js
var require_implementation = __commonJS({
  "node_modules/function-bind/implementation.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var ERROR_MESSAGE = "Function.prototype.bind called on incompatible ";
    var toStr = Object.prototype.toString;
    var max = Math.max;
    var funcType = "[object Function]";
    var concatty = function concatty2(a, b) {
      var arr = [];
      for (var i = 0; i < a.length; i += 1) {
        arr[i] = a[i];
      }
      for (var j = 0; j < b.length; j += 1) {
        arr[j + a.length] = b[j];
      }
      return arr;
    };
    var slicy = function slicy2(arrLike, offset) {
      var arr = [];
      for (var i = offset || 0, j = 0; i < arrLike.length; i += 1, j += 1) {
        arr[j] = arrLike[i];
      }
      return arr;
    };
    var joiny = function(arr, joiner) {
      var str = "";
      for (var i = 0; i < arr.length; i += 1) {
        str += arr[i];
        if (i + 1 < arr.length) {
          str += joiner;
        }
      }
      return str;
    };
    module2.exports = function bind(that) {
      var target = this;
      if (typeof target !== "function" || toStr.apply(target) !== funcType) {
        throw new TypeError(ERROR_MESSAGE + target);
      }
      var args = slicy(arguments, 1);
      var bound;
      var binder = function() {
        if (this instanceof bound) {
          var result = target.apply(
            this,
            concatty(args, arguments)
          );
          if (Object(result) === result) {
            return result;
          }
          return this;
        }
        return target.apply(
          that,
          concatty(args, arguments)
        );
      };
      var boundLength = max(0, target.length - args.length);
      var boundArgs = [];
      for (var i = 0; i < boundLength; i++) {
        boundArgs[i] = "$" + i;
      }
      bound = Function("binder", "return function (" + joiny(boundArgs, ",") + "){ return binder.apply(this,arguments); }")(binder);
      if (target.prototype) {
        var Empty = function Empty2() {
        };
        Empty.prototype = target.prototype;
        bound.prototype = new Empty();
        Empty.prototype = null;
      }
      return bound;
    };
  }
});

// node_modules/function-bind/index.js
var require_function_bind = __commonJS({
  "node_modules/function-bind/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var implementation = require_implementation();
    module2.exports = Function.prototype.bind || implementation;
  }
});

// node_modules/call-bind-apply-helpers/functionCall.js
var require_functionCall = __commonJS({
  "node_modules/call-bind-apply-helpers/functionCall.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = Function.prototype.call;
  }
});

// node_modules/call-bind-apply-helpers/functionApply.js
var require_functionApply = __commonJS({
  "node_modules/call-bind-apply-helpers/functionApply.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = Function.prototype.apply;
  }
});

// node_modules/call-bind-apply-helpers/reflectApply.js
var require_reflectApply = __commonJS({
  "node_modules/call-bind-apply-helpers/reflectApply.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = typeof Reflect !== "undefined" && Reflect && Reflect.apply;
  }
});

// node_modules/call-bind-apply-helpers/actualApply.js
var require_actualApply = __commonJS({
  "node_modules/call-bind-apply-helpers/actualApply.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var bind = require_function_bind();
    var $apply = require_functionApply();
    var $call = require_functionCall();
    var $reflectApply = require_reflectApply();
    module2.exports = $reflectApply || bind.call($call, $apply);
  }
});

// node_modules/call-bind-apply-helpers/index.js
var require_call_bind_apply_helpers = __commonJS({
  "node_modules/call-bind-apply-helpers/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var bind = require_function_bind();
    var $TypeError = require_type();
    var $call = require_functionCall();
    var $actualApply = require_actualApply();
    module2.exports = function callBindBasic(args) {
      if (args.length < 1 || typeof args[0] !== "function") {
        throw new $TypeError("a function is required");
      }
      return $actualApply(bind, $call, args);
    };
  }
});

// node_modules/dunder-proto/get.js
var require_get = __commonJS({
  "node_modules/dunder-proto/get.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var callBind = require_call_bind_apply_helpers();
    var gOPD = require_gopd();
    var hasProtoAccessor;
    try {
      hasProtoAccessor = /** @type {{ __proto__?: typeof Array.prototype }} */
      [].__proto__ === Array.prototype;
    } catch (e) {
      if (!e || typeof e !== "object" || !("code" in e) || e.code !== "ERR_PROTO_ACCESS") {
        throw e;
      }
    }
    var desc = !!hasProtoAccessor && gOPD && gOPD(
      Object.prototype,
      /** @type {keyof typeof Object.prototype} */
      "__proto__"
    );
    var $Object = Object;
    var $getPrototypeOf = $Object.getPrototypeOf;
    module2.exports = desc && typeof desc.get === "function" ? callBind([desc.get]) : typeof $getPrototypeOf === "function" ? (
      /** @type {import('./get')} */
      function getDunder(value) {
        return $getPrototypeOf(value == null ? value : $Object(value));
      }
    ) : false;
  }
});

// node_modules/get-proto/index.js
var require_get_proto = __commonJS({
  "node_modules/get-proto/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var reflectGetProto = require_Reflect_getPrototypeOf();
    var originalGetProto = require_Object_getPrototypeOf();
    var getDunderProto = require_get();
    module2.exports = reflectGetProto ? function getProto(O) {
      return reflectGetProto(O);
    } : originalGetProto ? function getProto(O) {
      if (!O || typeof O !== "object" && typeof O !== "function") {
        throw new TypeError("getProto: not an object");
      }
      return originalGetProto(O);
    } : getDunderProto ? function getProto(O) {
      return getDunderProto(O);
    } : null;
  }
});

// node_modules/hasown/index.js
var require_hasown = __commonJS({
  "node_modules/hasown/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var call = Function.prototype.call;
    var $hasOwn = Object.prototype.hasOwnProperty;
    var bind = require_function_bind();
    module2.exports = bind.call(call, $hasOwn);
  }
});

// node_modules/get-intrinsic/index.js
var require_get_intrinsic = __commonJS({
  "node_modules/get-intrinsic/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var undefined2;
    var $Object = require_es_object_atoms();
    var $Error = require_es_errors();
    var $EvalError = require_eval();
    var $RangeError = require_range();
    var $ReferenceError = require_ref();
    var $SyntaxError = require_syntax();
    var $TypeError = require_type();
    var $URIError = require_uri();
    var abs = require_abs();
    var floor = require_floor();
    var max = require_max();
    var min = require_min();
    var pow = require_pow();
    var round = require_round();
    var sign = require_sign();
    var $Function = Function;
    var getEvalledConstructor = function(expressionSyntax) {
      try {
        return $Function('"use strict"; return (' + expressionSyntax + ").constructor;")();
      } catch (e) {
      }
    };
    var $gOPD = require_gopd();
    var $defineProperty = require_es_define_property();
    var throwTypeError = function() {
      throw new $TypeError();
    };
    var ThrowTypeError = $gOPD ? (function() {
      try {
        arguments.callee;
        return throwTypeError;
      } catch (calleeThrows) {
        try {
          return $gOPD(arguments, "callee").get;
        } catch (gOPDthrows) {
          return throwTypeError;
        }
      }
    })() : throwTypeError;
    var hasSymbols = require_has_symbols()();
    var getProto = require_get_proto();
    var $ObjectGPO = require_Object_getPrototypeOf();
    var $ReflectGPO = require_Reflect_getPrototypeOf();
    var $apply = require_functionApply();
    var $call = require_functionCall();
    var needsEval = {};
    var TypedArray = typeof Uint8Array === "undefined" || !getProto ? undefined2 : getProto(Uint8Array);
    var INTRINSICS = {
      __proto__: null,
      "%AggregateError%": typeof AggregateError === "undefined" ? undefined2 : AggregateError,
      "%Array%": Array,
      "%ArrayBuffer%": typeof ArrayBuffer === "undefined" ? undefined2 : ArrayBuffer,
      "%ArrayIteratorPrototype%": hasSymbols && getProto ? getProto([][Symbol.iterator]()) : undefined2,
      "%AsyncFromSyncIteratorPrototype%": undefined2,
      "%AsyncFunction%": needsEval,
      "%AsyncGenerator%": needsEval,
      "%AsyncGeneratorFunction%": needsEval,
      "%AsyncIteratorPrototype%": needsEval,
      "%Atomics%": typeof Atomics === "undefined" ? undefined2 : Atomics,
      "%BigInt%": typeof BigInt === "undefined" ? undefined2 : BigInt,
      "%BigInt64Array%": typeof BigInt64Array === "undefined" ? undefined2 : BigInt64Array,
      "%BigUint64Array%": typeof BigUint64Array === "undefined" ? undefined2 : BigUint64Array,
      "%Boolean%": Boolean,
      "%DataView%": typeof DataView === "undefined" ? undefined2 : DataView,
      "%Date%": Date,
      "%decodeURI%": decodeURI,
      "%decodeURIComponent%": decodeURIComponent,
      "%encodeURI%": encodeURI,
      "%encodeURIComponent%": encodeURIComponent,
      "%Error%": $Error,
      "%eval%": eval,
      // eslint-disable-line no-eval
      "%EvalError%": $EvalError,
      "%Float16Array%": typeof Float16Array === "undefined" ? undefined2 : Float16Array,
      "%Float32Array%": typeof Float32Array === "undefined" ? undefined2 : Float32Array,
      "%Float64Array%": typeof Float64Array === "undefined" ? undefined2 : Float64Array,
      "%FinalizationRegistry%": typeof FinalizationRegistry === "undefined" ? undefined2 : FinalizationRegistry,
      "%Function%": $Function,
      "%GeneratorFunction%": needsEval,
      "%Int8Array%": typeof Int8Array === "undefined" ? undefined2 : Int8Array,
      "%Int16Array%": typeof Int16Array === "undefined" ? undefined2 : Int16Array,
      "%Int32Array%": typeof Int32Array === "undefined" ? undefined2 : Int32Array,
      "%isFinite%": isFinite,
      "%isNaN%": isNaN,
      "%IteratorPrototype%": hasSymbols && getProto ? getProto(getProto([][Symbol.iterator]())) : undefined2,
      "%JSON%": typeof JSON === "object" ? JSON : undefined2,
      "%Map%": typeof Map === "undefined" ? undefined2 : Map,
      "%MapIteratorPrototype%": typeof Map === "undefined" || !hasSymbols || !getProto ? undefined2 : getProto((/* @__PURE__ */ new Map())[Symbol.iterator]()),
      "%Math%": Math,
      "%Number%": Number,
      "%Object%": $Object,
      "%Object.getOwnPropertyDescriptor%": $gOPD,
      "%parseFloat%": parseFloat,
      "%parseInt%": parseInt,
      "%Promise%": typeof Promise === "undefined" ? undefined2 : Promise,
      "%Proxy%": typeof Proxy === "undefined" ? undefined2 : Proxy,
      "%RangeError%": $RangeError,
      "%ReferenceError%": $ReferenceError,
      "%Reflect%": typeof Reflect === "undefined" ? undefined2 : Reflect,
      "%RegExp%": RegExp,
      "%Set%": typeof Set === "undefined" ? undefined2 : Set,
      "%SetIteratorPrototype%": typeof Set === "undefined" || !hasSymbols || !getProto ? undefined2 : getProto((/* @__PURE__ */ new Set())[Symbol.iterator]()),
      "%SharedArrayBuffer%": typeof SharedArrayBuffer === "undefined" ? undefined2 : SharedArrayBuffer,
      "%String%": String,
      "%StringIteratorPrototype%": hasSymbols && getProto ? getProto(""[Symbol.iterator]()) : undefined2,
      "%Symbol%": hasSymbols ? Symbol : undefined2,
      "%SyntaxError%": $SyntaxError,
      "%ThrowTypeError%": ThrowTypeError,
      "%TypedArray%": TypedArray,
      "%TypeError%": $TypeError,
      "%Uint8Array%": typeof Uint8Array === "undefined" ? undefined2 : Uint8Array,
      "%Uint8ClampedArray%": typeof Uint8ClampedArray === "undefined" ? undefined2 : Uint8ClampedArray,
      "%Uint16Array%": typeof Uint16Array === "undefined" ? undefined2 : Uint16Array,
      "%Uint32Array%": typeof Uint32Array === "undefined" ? undefined2 : Uint32Array,
      "%URIError%": $URIError,
      "%WeakMap%": typeof WeakMap === "undefined" ? undefined2 : WeakMap,
      "%WeakRef%": typeof WeakRef === "undefined" ? undefined2 : WeakRef,
      "%WeakSet%": typeof WeakSet === "undefined" ? undefined2 : WeakSet,
      "%Function.prototype.call%": $call,
      "%Function.prototype.apply%": $apply,
      "%Object.defineProperty%": $defineProperty,
      "%Object.getPrototypeOf%": $ObjectGPO,
      "%Math.abs%": abs,
      "%Math.floor%": floor,
      "%Math.max%": max,
      "%Math.min%": min,
      "%Math.pow%": pow,
      "%Math.round%": round,
      "%Math.sign%": sign,
      "%Reflect.getPrototypeOf%": $ReflectGPO
    };
    if (getProto) {
      try {
        null.error;
      } catch (e) {
        errorProto = getProto(getProto(e));
        INTRINSICS["%Error.prototype%"] = errorProto;
      }
    }
    var errorProto;
    var doEval = function doEval2(name) {
      var value;
      if (name === "%AsyncFunction%") {
        value = getEvalledConstructor("async function () {}");
      } else if (name === "%GeneratorFunction%") {
        value = getEvalledConstructor("function* () {}");
      } else if (name === "%AsyncGeneratorFunction%") {
        value = getEvalledConstructor("async function* () {}");
      } else if (name === "%AsyncGenerator%") {
        var fn = doEval2("%AsyncGeneratorFunction%");
        if (fn) {
          value = fn.prototype;
        }
      } else if (name === "%AsyncIteratorPrototype%") {
        var gen = doEval2("%AsyncGenerator%");
        if (gen && getProto) {
          value = getProto(gen.prototype);
        }
      }
      INTRINSICS[name] = value;
      return value;
    };
    var LEGACY_ALIASES = {
      __proto__: null,
      "%ArrayBufferPrototype%": ["ArrayBuffer", "prototype"],
      "%ArrayPrototype%": ["Array", "prototype"],
      "%ArrayProto_entries%": ["Array", "prototype", "entries"],
      "%ArrayProto_forEach%": ["Array", "prototype", "forEach"],
      "%ArrayProto_keys%": ["Array", "prototype", "keys"],
      "%ArrayProto_values%": ["Array", "prototype", "values"],
      "%AsyncFunctionPrototype%": ["AsyncFunction", "prototype"],
      "%AsyncGenerator%": ["AsyncGeneratorFunction", "prototype"],
      "%AsyncGeneratorPrototype%": ["AsyncGeneratorFunction", "prototype", "prototype"],
      "%BooleanPrototype%": ["Boolean", "prototype"],
      "%DataViewPrototype%": ["DataView", "prototype"],
      "%DatePrototype%": ["Date", "prototype"],
      "%ErrorPrototype%": ["Error", "prototype"],
      "%EvalErrorPrototype%": ["EvalError", "prototype"],
      "%Float32ArrayPrototype%": ["Float32Array", "prototype"],
      "%Float64ArrayPrototype%": ["Float64Array", "prototype"],
      "%FunctionPrototype%": ["Function", "prototype"],
      "%Generator%": ["GeneratorFunction", "prototype"],
      "%GeneratorPrototype%": ["GeneratorFunction", "prototype", "prototype"],
      "%Int8ArrayPrototype%": ["Int8Array", "prototype"],
      "%Int16ArrayPrototype%": ["Int16Array", "prototype"],
      "%Int32ArrayPrototype%": ["Int32Array", "prototype"],
      "%JSONParse%": ["JSON", "parse"],
      "%JSONStringify%": ["JSON", "stringify"],
      "%MapPrototype%": ["Map", "prototype"],
      "%NumberPrototype%": ["Number", "prototype"],
      "%ObjectPrototype%": ["Object", "prototype"],
      "%ObjProto_toString%": ["Object", "prototype", "toString"],
      "%ObjProto_valueOf%": ["Object", "prototype", "valueOf"],
      "%PromisePrototype%": ["Promise", "prototype"],
      "%PromiseProto_then%": ["Promise", "prototype", "then"],
      "%Promise_all%": ["Promise", "all"],
      "%Promise_reject%": ["Promise", "reject"],
      "%Promise_resolve%": ["Promise", "resolve"],
      "%RangeErrorPrototype%": ["RangeError", "prototype"],
      "%ReferenceErrorPrototype%": ["ReferenceError", "prototype"],
      "%RegExpPrototype%": ["RegExp", "prototype"],
      "%SetPrototype%": ["Set", "prototype"],
      "%SharedArrayBufferPrototype%": ["SharedArrayBuffer", "prototype"],
      "%StringPrototype%": ["String", "prototype"],
      "%SymbolPrototype%": ["Symbol", "prototype"],
      "%SyntaxErrorPrototype%": ["SyntaxError", "prototype"],
      "%TypedArrayPrototype%": ["TypedArray", "prototype"],
      "%TypeErrorPrototype%": ["TypeError", "prototype"],
      "%Uint8ArrayPrototype%": ["Uint8Array", "prototype"],
      "%Uint8ClampedArrayPrototype%": ["Uint8ClampedArray", "prototype"],
      "%Uint16ArrayPrototype%": ["Uint16Array", "prototype"],
      "%Uint32ArrayPrototype%": ["Uint32Array", "prototype"],
      "%URIErrorPrototype%": ["URIError", "prototype"],
      "%WeakMapPrototype%": ["WeakMap", "prototype"],
      "%WeakSetPrototype%": ["WeakSet", "prototype"]
    };
    var bind = require_function_bind();
    var hasOwn = require_hasown();
    var $concat = bind.call($call, Array.prototype.concat);
    var $spliceApply = bind.call($apply, Array.prototype.splice);
    var $replace = bind.call($call, String.prototype.replace);
    var $strSlice = bind.call($call, String.prototype.slice);
    var $exec = bind.call($call, RegExp.prototype.exec);
    var rePropName = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g;
    var reEscapeChar = /\\(\\)?/g;
    var stringToPath = function stringToPath2(string) {
      var first = $strSlice(string, 0, 1);
      var last = $strSlice(string, -1);
      if (first === "%" && last !== "%") {
        throw new $SyntaxError("invalid intrinsic syntax, expected closing `%`");
      } else if (last === "%" && first !== "%") {
        throw new $SyntaxError("invalid intrinsic syntax, expected opening `%`");
      }
      var result = [];
      $replace(string, rePropName, function(match, number, quote, subString) {
        result[result.length] = quote ? $replace(subString, reEscapeChar, "$1") : number || match;
      });
      return result;
    };
    var getBaseIntrinsic = function getBaseIntrinsic2(name, allowMissing) {
      var intrinsicName = name;
      var alias;
      if (hasOwn(LEGACY_ALIASES, intrinsicName)) {
        alias = LEGACY_ALIASES[intrinsicName];
        intrinsicName = "%" + alias[0] + "%";
      }
      if (hasOwn(INTRINSICS, intrinsicName)) {
        var value = INTRINSICS[intrinsicName];
        if (value === needsEval) {
          value = doEval(intrinsicName);
        }
        if (typeof value === "undefined" && !allowMissing) {
          throw new $TypeError("intrinsic " + name + " exists, but is not available. Please file an issue!");
        }
        return {
          alias,
          name: intrinsicName,
          value
        };
      }
      throw new $SyntaxError("intrinsic " + name + " does not exist!");
    };
    module2.exports = function GetIntrinsic(name, allowMissing) {
      if (typeof name !== "string" || name.length === 0) {
        throw new $TypeError("intrinsic name must be a non-empty string");
      }
      if (arguments.length > 1 && typeof allowMissing !== "boolean") {
        throw new $TypeError('"allowMissing" argument must be a boolean');
      }
      if ($exec(/^%?[^%]*%?$/, name) === null) {
        throw new $SyntaxError("`%` may not be present anywhere but at the beginning and end of the intrinsic name");
      }
      var parts = stringToPath(name);
      var intrinsicBaseName = parts.length > 0 ? parts[0] : "";
      var intrinsic = getBaseIntrinsic("%" + intrinsicBaseName + "%", allowMissing);
      var intrinsicRealName = intrinsic.name;
      var value = intrinsic.value;
      var skipFurtherCaching = false;
      var alias = intrinsic.alias;
      if (alias) {
        intrinsicBaseName = alias[0];
        $spliceApply(parts, $concat([0, 1], alias));
      }
      for (var i = 1, isOwn = true; i < parts.length; i += 1) {
        var part = parts[i];
        var first = $strSlice(part, 0, 1);
        var last = $strSlice(part, -1);
        if ((first === '"' || first === "'" || first === "`" || (last === '"' || last === "'" || last === "`")) && first !== last) {
          throw new $SyntaxError("property names with quotes must have matching quotes");
        }
        if (part === "constructor" || !isOwn) {
          skipFurtherCaching = true;
        }
        intrinsicBaseName += "." + part;
        intrinsicRealName = "%" + intrinsicBaseName + "%";
        if (hasOwn(INTRINSICS, intrinsicRealName)) {
          value = INTRINSICS[intrinsicRealName];
        } else if (value != null) {
          if (!(part in value)) {
            if (!allowMissing) {
              throw new $TypeError("base intrinsic for " + name + " exists, but the property is not available.");
            }
            return void undefined2;
          }
          if ($gOPD && i + 1 >= parts.length) {
            var desc = $gOPD(value, part);
            isOwn = !!desc;
            if (isOwn && "get" in desc && !("originalValue" in desc.get)) {
              value = desc.get;
            } else {
              value = value[part];
            }
          } else {
            isOwn = hasOwn(value, part);
            value = value[part];
          }
          if (isOwn && !skipFurtherCaching) {
            INTRINSICS[intrinsicRealName] = value;
          }
        }
      }
      return value;
    };
  }
});

// node_modules/call-bound/index.js
var require_call_bound = __commonJS({
  "node_modules/call-bound/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var GetIntrinsic = require_get_intrinsic();
    var callBindBasic = require_call_bind_apply_helpers();
    var $indexOf = callBindBasic([GetIntrinsic("%String.prototype.indexOf%")]);
    module2.exports = function callBoundIntrinsic(name, allowMissing) {
      var intrinsic = (
        /** @type {(this: unknown, ...args: unknown[]) => unknown} */
        GetIntrinsic(name, !!allowMissing)
      );
      if (typeof intrinsic === "function" && $indexOf(name, ".prototype.") > -1) {
        return callBindBasic(
          /** @type {const} */
          [intrinsic]
        );
      }
      return intrinsic;
    };
  }
});

// node_modules/is-callable/index.js
var require_is_callable = __commonJS({
  "node_modules/is-callable/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var fnToStr = Function.prototype.toString;
    var reflectApply = typeof Reflect === "object" && Reflect !== null && Reflect.apply;
    var badArrayLike;
    var isCallableMarker;
    if (typeof reflectApply === "function" && typeof Object.defineProperty === "function") {
      try {
        badArrayLike = Object.defineProperty({}, "length", {
          get: function() {
            throw isCallableMarker;
          }
        });
        isCallableMarker = {};
        reflectApply(function() {
          throw 42;
        }, null, badArrayLike);
      } catch (_) {
        if (_ !== isCallableMarker) {
          reflectApply = null;
        }
      }
    } else {
      reflectApply = null;
    }
    var constructorRegex = /^\s*class\b/;
    var isES6ClassFn = function isES6ClassFunction(value) {
      try {
        var fnStr = fnToStr.call(value);
        return constructorRegex.test(fnStr);
      } catch (e) {
        return false;
      }
    };
    var tryFunctionObject = function tryFunctionToStr(value) {
      try {
        if (isES6ClassFn(value)) {
          return false;
        }
        fnToStr.call(value);
        return true;
      } catch (e) {
        return false;
      }
    };
    var toStr = Object.prototype.toString;
    var objectClass = "[object Object]";
    var fnClass = "[object Function]";
    var genClass = "[object GeneratorFunction]";
    var ddaClass = "[object HTMLAllCollection]";
    var ddaClass2 = "[object HTML document.all class]";
    var ddaClass3 = "[object HTMLCollection]";
    var hasToStringTag = typeof Symbol === "function" && !!Symbol.toStringTag;
    var isIE68 = !(0 in [,]);
    var isDDA = function isDocumentDotAll() {
      return false;
    };
    if (typeof document === "object") {
      all = document.all;
      if (toStr.call(all) === toStr.call(document.all)) {
        isDDA = function isDocumentDotAll(value) {
          if ((isIE68 || !value) && (typeof value === "undefined" || typeof value === "object")) {
            try {
              var str = toStr.call(value);
              return (str === ddaClass || str === ddaClass2 || str === ddaClass3 || str === objectClass) && value("") == null;
            } catch (e) {
            }
          }
          return false;
        };
      }
    }
    var all;
    module2.exports = reflectApply ? function isCallable(value) {
      if (isDDA(value)) {
        return true;
      }
      if (!value) {
        return false;
      }
      if (typeof value !== "function" && typeof value !== "object") {
        return false;
      }
      try {
        reflectApply(value, null, badArrayLike);
      } catch (e) {
        if (e !== isCallableMarker) {
          return false;
        }
      }
      return !isES6ClassFn(value) && tryFunctionObject(value);
    } : function isCallable(value) {
      if (isDDA(value)) {
        return true;
      }
      if (!value) {
        return false;
      }
      if (typeof value !== "function" && typeof value !== "object") {
        return false;
      }
      if (hasToStringTag) {
        return tryFunctionObject(value);
      }
      if (isES6ClassFn(value)) {
        return false;
      }
      var strClass = toStr.call(value);
      if (strClass !== fnClass && strClass !== genClass && !/^\[object HTML/.test(strClass)) {
        return false;
      }
      return tryFunctionObject(value);
    };
  }
});

// node_modules/for-each/index.js
var require_for_each = __commonJS({
  "node_modules/for-each/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var isCallable = require_is_callable();
    var toStr = Object.prototype.toString;
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    var forEachArray = function forEachArray2(array, iterator, receiver) {
      for (var i = 0, len = array.length; i < len; i++) {
        if (hasOwnProperty.call(array, i)) {
          if (receiver == null) {
            iterator(array[i], i, array);
          } else {
            iterator.call(receiver, array[i], i, array);
          }
        }
      }
    };
    var forEachString = function forEachString2(string, iterator, receiver) {
      for (var i = 0, len = string.length; i < len; i++) {
        if (receiver == null) {
          iterator(string.charAt(i), i, string);
        } else {
          iterator.call(receiver, string.charAt(i), i, string);
        }
      }
    };
    var forEachObject = function forEachObject2(object2, iterator, receiver) {
      for (var k in object2) {
        if (hasOwnProperty.call(object2, k)) {
          if (receiver == null) {
            iterator(object2[k], k, object2);
          } else {
            iterator.call(receiver, object2[k], k, object2);
          }
        }
      }
    };
    function isArray(x) {
      return toStr.call(x) === "[object Array]";
    }
    module2.exports = function forEach(list, iterator, thisArg) {
      if (!isCallable(iterator)) {
        throw new TypeError("iterator must be a function");
      }
      var receiver;
      if (arguments.length >= 3) {
        receiver = thisArg;
      }
      if (isArray(list)) {
        forEachArray(list, iterator, receiver);
      } else if (typeof list === "string") {
        forEachString(list, iterator, receiver);
      } else {
        forEachObject(list, iterator, receiver);
      }
    };
  }
});

// node_modules/possible-typed-array-names/index.js
var require_possible_typed_array_names = __commonJS({
  "node_modules/possible-typed-array-names/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = [
      "Float16Array",
      "Float32Array",
      "Float64Array",
      "Int8Array",
      "Int16Array",
      "Int32Array",
      "Uint8Array",
      "Uint8ClampedArray",
      "Uint16Array",
      "Uint32Array",
      "BigInt64Array",
      "BigUint64Array"
    ];
  }
});

// node_modules/available-typed-arrays/index.js
var require_available_typed_arrays = __commonJS({
  "node_modules/available-typed-arrays/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var possibleNames = require_possible_typed_array_names();
    var g = typeof globalThis === "undefined" ? global : globalThis;
    module2.exports = function availableTypedArrays() {
      var out = [];
      for (var i = 0; i < possibleNames.length; i++) {
        if (typeof g[possibleNames[i]] === "function") {
          out[out.length] = possibleNames[i];
        }
      }
      return out;
    };
  }
});

// node_modules/define-data-property/index.js
var require_define_data_property = __commonJS({
  "node_modules/define-data-property/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var $defineProperty = require_es_define_property();
    var $SyntaxError = require_syntax();
    var $TypeError = require_type();
    var gopd = require_gopd();
    module2.exports = function defineDataProperty(obj, property, value) {
      if (!obj || typeof obj !== "object" && typeof obj !== "function") {
        throw new $TypeError("`obj` must be an object or a function`");
      }
      if (typeof property !== "string" && typeof property !== "symbol") {
        throw new $TypeError("`property` must be a string or a symbol`");
      }
      if (arguments.length > 3 && typeof arguments[3] !== "boolean" && arguments[3] !== null) {
        throw new $TypeError("`nonEnumerable`, if provided, must be a boolean or null");
      }
      if (arguments.length > 4 && typeof arguments[4] !== "boolean" && arguments[4] !== null) {
        throw new $TypeError("`nonWritable`, if provided, must be a boolean or null");
      }
      if (arguments.length > 5 && typeof arguments[5] !== "boolean" && arguments[5] !== null) {
        throw new $TypeError("`nonConfigurable`, if provided, must be a boolean or null");
      }
      if (arguments.length > 6 && typeof arguments[6] !== "boolean") {
        throw new $TypeError("`loose`, if provided, must be a boolean");
      }
      var nonEnumerable = arguments.length > 3 ? arguments[3] : null;
      var nonWritable = arguments.length > 4 ? arguments[4] : null;
      var nonConfigurable = arguments.length > 5 ? arguments[5] : null;
      var loose = arguments.length > 6 ? arguments[6] : false;
      var desc = !!gopd && gopd(obj, property);
      if ($defineProperty) {
        $defineProperty(obj, property, {
          configurable: nonConfigurable === null && desc ? desc.configurable : !nonConfigurable,
          enumerable: nonEnumerable === null && desc ? desc.enumerable : !nonEnumerable,
          value,
          writable: nonWritable === null && desc ? desc.writable : !nonWritable
        });
      } else if (loose || !nonEnumerable && !nonWritable && !nonConfigurable) {
        obj[property] = value;
      } else {
        throw new $SyntaxError("This environment does not support defining a property as non-configurable, non-writable, or non-enumerable.");
      }
    };
  }
});

// node_modules/has-property-descriptors/index.js
var require_has_property_descriptors = __commonJS({
  "node_modules/has-property-descriptors/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var $defineProperty = require_es_define_property();
    var hasPropertyDescriptors = function hasPropertyDescriptors2() {
      return !!$defineProperty;
    };
    hasPropertyDescriptors.hasArrayLengthDefineBug = function hasArrayLengthDefineBug() {
      if (!$defineProperty) {
        return null;
      }
      try {
        return $defineProperty([], "length", { value: 1 }).length !== 1;
      } catch (e) {
        return true;
      }
    };
    module2.exports = hasPropertyDescriptors;
  }
});

// node_modules/set-function-length/index.js
var require_set_function_length = __commonJS({
  "node_modules/set-function-length/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var GetIntrinsic = require_get_intrinsic();
    var define2 = require_define_data_property();
    var hasDescriptors = require_has_property_descriptors()();
    var gOPD = require_gopd();
    var $TypeError = require_type();
    var $floor = GetIntrinsic("%Math.floor%");
    module2.exports = function setFunctionLength(fn, length) {
      if (typeof fn !== "function") {
        throw new $TypeError("`fn` is not a function");
      }
      if (typeof length !== "number" || length < 0 || length > 4294967295 || $floor(length) !== length) {
        throw new $TypeError("`length` must be a positive 32-bit integer");
      }
      var loose = arguments.length > 2 && !!arguments[2];
      var functionLengthIsConfigurable = true;
      var functionLengthIsWritable = true;
      if ("length" in fn && gOPD) {
        var desc = gOPD(fn, "length");
        if (desc && !desc.configurable) {
          functionLengthIsConfigurable = false;
        }
        if (desc && !desc.writable) {
          functionLengthIsWritable = false;
        }
      }
      if (functionLengthIsConfigurable || functionLengthIsWritable || !loose) {
        if (hasDescriptors) {
          define2(
            /** @type {Parameters<define>[0]} */
            fn,
            "length",
            length,
            true,
            true
          );
        } else {
          define2(
            /** @type {Parameters<define>[0]} */
            fn,
            "length",
            length
          );
        }
      }
      return fn;
    };
  }
});

// node_modules/call-bind-apply-helpers/applyBind.js
var require_applyBind = __commonJS({
  "node_modules/call-bind-apply-helpers/applyBind.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var bind = require_function_bind();
    var $apply = require_functionApply();
    var actualApply = require_actualApply();
    module2.exports = function applyBind() {
      return actualApply(bind, $apply, arguments);
    };
  }
});

// node_modules/call-bind/index.js
var require_call_bind = __commonJS({
  "node_modules/call-bind/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var setFunctionLength = require_set_function_length();
    var $defineProperty = require_es_define_property();
    var callBindBasic = require_call_bind_apply_helpers();
    var applyBind = require_applyBind();
    module2.exports = function callBind(originalFunction) {
      var func = callBindBasic(arguments);
      var adjustedLength = 1 + originalFunction.length - (arguments.length - 1);
      return setFunctionLength(
        func,
        adjustedLength > 0 ? adjustedLength : 0,
        true
      );
    };
    if ($defineProperty) {
      $defineProperty(module2.exports, "apply", { value: applyBind });
    } else {
      module2.exports.apply = applyBind;
    }
  }
});

// node_modules/has-tostringtag/shams.js
var require_shams2 = __commonJS({
  "node_modules/has-tostringtag/shams.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var hasSymbols = require_shams();
    module2.exports = function hasToStringTagShams() {
      return hasSymbols() && !!Symbol.toStringTag;
    };
  }
});

// node_modules/which-typed-array/index.js
var require_which_typed_array = __commonJS({
  "node_modules/which-typed-array/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var forEach = require_for_each();
    var availableTypedArrays = require_available_typed_arrays();
    var callBind = require_call_bind();
    var callBound = require_call_bound();
    var gOPD = require_gopd();
    var getProto = require_get_proto();
    var $toString = callBound("Object.prototype.toString");
    var hasToStringTag = require_shams2()();
    var g = typeof globalThis === "undefined" ? global : globalThis;
    var typedArrays = availableTypedArrays();
    var $slice = callBound("String.prototype.slice");
    var $indexOf = callBound("Array.prototype.indexOf", true) || function indexOf(array, value) {
      for (var i = 0; i < array.length; i += 1) {
        if (array[i] === value) {
          return i;
        }
      }
      return -1;
    };
    var cache = { __proto__: null };
    if (hasToStringTag && gOPD && getProto) {
      forEach(typedArrays, function(typedArray) {
        var arr = new g[typedArray]();
        if (Symbol.toStringTag in arr && getProto) {
          var proto = getProto(arr);
          var descriptor = gOPD(proto, Symbol.toStringTag);
          if (!descriptor && proto) {
            var superProto = getProto(proto);
            descriptor = gOPD(superProto, Symbol.toStringTag);
          }
          if (descriptor && descriptor.get) {
            var bound = callBind(descriptor.get);
            cache[
              /** @type {`$${TypedArrayName}`} */
              "$" + typedArray
            ] = bound;
          }
        }
      });
    } else {
      forEach(typedArrays, function(typedArray) {
        var arr = new g[typedArray]();
        var fn = arr.slice || arr.set;
        if (fn) {
          var bound = (
            /** @type {typeof BoundSlice | typeof BoundSet} */
            // @ts-expect-error TODO FIXME
            callBind(fn)
          );
          cache[
            /** @type {`$${TypedArrayName}`} */
            "$" + typedArray
          ] = bound;
        }
      });
    }
    function tryTypedArrays(value) {
      var found = false;
      forEach(
        /** @type {Record<`$${TypedArrayName}`, Getter>} */
        cache,
        /** @param {Getter} getter @param {`$${TypedArrayName}`} typedArray */
        function(getter, typedArray) {
          if (!found) {
            try {
              if ("$" + getter(value) === typedArray) {
                found = /** @type {TypedArrayName} */
                $slice(typedArray, 1);
              }
            } catch (e) {
            }
          }
        }
      );
      return found;
    }
    function trySlices(value) {
      var found = false;
      forEach(
        /** @type {Record<`$${TypedArrayName}`, Getter>} */
        cache,
        /** @param {Getter} getter @param {`$${TypedArrayName}`} name */
        function(getter, name) {
          if (!found) {
            try {
              getter(value);
              found = /** @type {TypedArrayName} */
              $slice(name, 1);
            } catch (e) {
            }
          }
        }
      );
      return found;
    }
    function isTATag(tag) {
      return $indexOf(typedArrays, tag) > -1;
    }
    function whichTypedArray(value) {
      if (!value || typeof value !== "object") {
        return false;
      }
      if (!hasToStringTag) {
        var tag = $slice($toString(value), 8, -1);
        if (isTATag(tag)) {
          return tag;
        }
        if (tag !== "Object") {
          return false;
        }
        return trySlices(value);
      }
      if (!gOPD) {
        return null;
      }
      return tryTypedArrays(value);
    }
    module2.exports = whichTypedArray;
  }
});

// node_modules/is-typed-array/index.js
var require_is_typed_array = __commonJS({
  "node_modules/is-typed-array/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var whichTypedArray = require_which_typed_array();
    module2.exports = function isTypedArray(value) {
      return !!whichTypedArray(value);
    };
  }
});

// node_modules/typed-array-buffer/index.js
var require_typed_array_buffer = __commonJS({
  "node_modules/typed-array-buffer/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var $TypeError = require_type();
    var callBound = require_call_bound();
    var $typedArrayBuffer = callBound("TypedArray.prototype.buffer", true);
    var isTypedArray = require_is_typed_array();
    module2.exports = $typedArrayBuffer || function typedArrayBuffer(x) {
      if (!isTypedArray(x)) {
        throw new $TypeError("Not a Typed Array");
      }
      return x.buffer;
    };
  }
});

// node_modules/to-buffer/index.js
var require_to_buffer = __commonJS({
  "node_modules/to-buffer/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var Buffer3 = require_safe_buffer().Buffer;
    var isArray = require_isarray();
    var typedArrayBuffer = require_typed_array_buffer();
    var isView = ArrayBuffer.isView || function isView2(obj) {
      try {
        typedArrayBuffer(obj);
        return true;
      } catch (e) {
        return false;
      }
    };
    var useUint8Array = typeof Uint8Array !== "undefined";
    var useArrayBuffer = typeof ArrayBuffer !== "undefined" && typeof Uint8Array !== "undefined";
    var useFromArrayBuffer = useArrayBuffer && (Buffer3.prototype instanceof Uint8Array || Buffer3.TYPED_ARRAY_SUPPORT);
    module2.exports = function toBuffer(data, encoding) {
      if (Buffer3.isBuffer(data)) {
        if (data.constructor && !("isBuffer" in data)) {
          return Buffer3.from(data);
        }
        return data;
      }
      if (typeof data === "string") {
        return Buffer3.from(data, encoding);
      }
      if (useArrayBuffer && isView(data)) {
        if (data.byteLength === 0) {
          return Buffer3.alloc(0);
        }
        if (useFromArrayBuffer) {
          var res = Buffer3.from(data.buffer, data.byteOffset, data.byteLength);
          if (res.byteLength === data.byteLength) {
            return res;
          }
        }
        var uint8 = data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        var result = Buffer3.from(uint8);
        if (result.length === data.byteLength) {
          return result;
        }
      }
      if (useUint8Array && data instanceof Uint8Array) {
        return Buffer3.from(data);
      }
      var isArr = isArray(data);
      if (isArr) {
        for (var i = 0; i < data.length; i += 1) {
          var x = data[i];
          if (typeof x !== "number" || x < 0 || x > 255 || ~~x !== x) {
            throw new RangeError("Array items must be numbers in the range 0-255.");
          }
        }
      }
      if (isArr || Buffer3.isBuffer(data) && data.constructor && typeof data.constructor.isBuffer === "function" && data.constructor.isBuffer(data)) {
        return Buffer3.from(data);
      }
      throw new TypeError('The "data" argument must be a string, an Array, a Buffer, a Uint8Array, or a DataView.');
    };
  }
});

// node_modules/sha.js/hash.js
var require_hash = __commonJS({
  "node_modules/sha.js/hash.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var Buffer3 = require_safe_buffer().Buffer;
    var toBuffer = require_to_buffer();
    function Hash3(blockSize, finalSize) {
      this._block = Buffer3.alloc(blockSize);
      this._finalSize = finalSize;
      this._blockSize = blockSize;
      this._len = 0;
    }
    Hash3.prototype.update = function(data, enc2) {
      data = toBuffer(data, enc2 || "utf8");
      var block = this._block;
      var blockSize = this._blockSize;
      var length = data.length;
      var accum = this._len;
      for (var offset = 0; offset < length; ) {
        var assigned = accum % blockSize;
        var remainder = Math.min(length - offset, blockSize - assigned);
        for (var i = 0; i < remainder; i++) {
          block[assigned + i] = data[offset + i];
        }
        accum += remainder;
        offset += remainder;
        if (accum % blockSize === 0) {
          this._update(block);
        }
      }
      this._len += length;
      return this;
    };
    Hash3.prototype.digest = function(enc2) {
      var rem = this._len % this._blockSize;
      this._block[rem] = 128;
      this._block.fill(0, rem + 1);
      if (rem >= this._finalSize) {
        this._update(this._block);
        this._block.fill(0);
      }
      var bits = this._len * 8;
      if (bits <= 4294967295) {
        this._block.writeUInt32BE(bits, this._blockSize - 4);
      } else {
        var lowBits = (bits & 4294967295) >>> 0;
        var highBits = (bits - lowBits) / 4294967296;
        this._block.writeUInt32BE(highBits, this._blockSize - 8);
        this._block.writeUInt32BE(lowBits, this._blockSize - 4);
      }
      this._update(this._block);
      var hash2 = this._hash();
      return enc2 ? hash2.toString(enc2) : hash2;
    };
    Hash3.prototype._update = function() {
      throw new Error("_update must be implemented by subclass");
    };
    module2.exports = Hash3;
  }
});

// node_modules/sha.js/sha1.js
var require_sha1 = __commonJS({
  "node_modules/sha.js/sha1.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var inherits = require_inherits_browser();
    var Hash3 = require_hash();
    var Buffer3 = require_safe_buffer().Buffer;
    var K2 = [
      1518500249,
      1859775393,
      2400959708 | 0,
      3395469782 | 0
    ];
    var W = new Array(80);
    function Sha1() {
      this.init();
      this._w = W;
      Hash3.call(this, 64, 56);
    }
    inherits(Sha1, Hash3);
    Sha1.prototype.init = function() {
      this._a = 1732584193;
      this._b = 4023233417;
      this._c = 2562383102;
      this._d = 271733878;
      this._e = 3285377520;
      return this;
    };
    function rotl1(num2) {
      return num2 << 1 | num2 >>> 31;
    }
    function rotl5(num2) {
      return num2 << 5 | num2 >>> 27;
    }
    function rotl30(num2) {
      return num2 << 30 | num2 >>> 2;
    }
    function ft(s, b, c, d) {
      if (s === 0) {
        return b & c | ~b & d;
      }
      if (s === 2) {
        return b & c | b & d | c & d;
      }
      return b ^ c ^ d;
    }
    Sha1.prototype._update = function(M) {
      var w = this._w;
      var a = this._a | 0;
      var b = this._b | 0;
      var c = this._c | 0;
      var d = this._d | 0;
      var e = this._e | 0;
      for (var i = 0; i < 16; ++i) {
        w[i] = M.readInt32BE(i * 4);
      }
      for (; i < 80; ++i) {
        w[i] = rotl1(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]);
      }
      for (var j = 0; j < 80; ++j) {
        var s = ~~(j / 20);
        var t = rotl5(a) + ft(s, b, c, d) + e + w[j] + K2[s] | 0;
        e = d;
        d = c;
        c = rotl30(b);
        b = a;
        a = t;
      }
      this._a = a + this._a | 0;
      this._b = b + this._b | 0;
      this._c = c + this._c | 0;
      this._d = d + this._d | 0;
      this._e = e + this._e | 0;
    };
    Sha1.prototype._hash = function() {
      var H = Buffer3.allocUnsafe(20);
      H.writeInt32BE(this._a | 0, 0);
      H.writeInt32BE(this._b | 0, 4);
      H.writeInt32BE(this._c | 0, 8);
      H.writeInt32BE(this._d | 0, 12);
      H.writeInt32BE(this._e | 0, 16);
      return H;
    };
    module2.exports = Sha1;
  }
});

// node_modules/async-lock/lib/index.js
var require_lib = __commonJS({
  "node_modules/async-lock/lib/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var AsyncLock2 = function(opts) {
      opts = opts || {};
      this.Promise = opts.Promise || Promise;
      this.queues = /* @__PURE__ */ Object.create(null);
      this.domainReentrant = opts.domainReentrant || false;
      if (this.domainReentrant) {
        if (typeof process === "undefined" || typeof process.domain === "undefined") {
          throw new Error(
            "Domain-reentrant locks require `process.domain` to exist. Please flip `opts.domainReentrant = false`, use a NodeJS version that still implements Domain, or install a browser polyfill."
          );
        }
        this.domains = /* @__PURE__ */ Object.create(null);
      }
      this.timeout = opts.timeout || AsyncLock2.DEFAULT_TIMEOUT;
      this.maxOccupationTime = opts.maxOccupationTime || AsyncLock2.DEFAULT_MAX_OCCUPATION_TIME;
      this.maxExecutionTime = opts.maxExecutionTime || AsyncLock2.DEFAULT_MAX_EXECUTION_TIME;
      if (opts.maxPending === Infinity || Number.isInteger(opts.maxPending) && opts.maxPending >= 0) {
        this.maxPending = opts.maxPending;
      } else {
        this.maxPending = AsyncLock2.DEFAULT_MAX_PENDING;
      }
    };
    AsyncLock2.DEFAULT_TIMEOUT = 0;
    AsyncLock2.DEFAULT_MAX_OCCUPATION_TIME = 0;
    AsyncLock2.DEFAULT_MAX_EXECUTION_TIME = 0;
    AsyncLock2.DEFAULT_MAX_PENDING = 1e3;
    AsyncLock2.prototype.acquire = function(key, fn, cb, opts) {
      if (Array.isArray(key)) {
        return this._acquireBatch(key, fn, cb, opts);
      }
      if (typeof fn !== "function") {
        throw new Error("You must pass a function to execute");
      }
      var deferredResolve = null;
      var deferredReject = null;
      var deferred = null;
      if (typeof cb !== "function") {
        opts = cb;
        cb = null;
        deferred = new this.Promise(function(resolve, reject) {
          deferredResolve = resolve;
          deferredReject = reject;
        });
      }
      opts = opts || {};
      var resolved = false;
      var timer = null;
      var occupationTimer = null;
      var executionTimer = null;
      var self = this;
      var done = function(locked, err, ret) {
        if (occupationTimer) {
          clearTimeout(occupationTimer);
          occupationTimer = null;
        }
        if (executionTimer) {
          clearTimeout(executionTimer);
          executionTimer = null;
        }
        if (locked) {
          if (!!self.queues[key] && self.queues[key].length === 0) {
            delete self.queues[key];
          }
          if (self.domainReentrant) {
            delete self.domains[key];
          }
        }
        if (!resolved) {
          if (!deferred) {
            if (typeof cb === "function") {
              cb(err, ret);
            }
          } else {
            if (err) {
              deferredReject(err);
            } else {
              deferredResolve(ret);
            }
          }
          resolved = true;
        }
        if (locked) {
          if (!!self.queues[key] && self.queues[key].length > 0) {
            self.queues[key].shift()();
          }
        }
      };
      var exec = function(locked) {
        if (resolved) {
          return done(locked);
        }
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (self.domainReentrant && locked) {
          self.domains[key] = process.domain;
        }
        var maxExecutionTime = opts.maxExecutionTime || self.maxExecutionTime;
        if (maxExecutionTime) {
          executionTimer = setTimeout(function() {
            if (!!self.queues[key]) {
              done(locked, new Error("Maximum execution time is exceeded " + key));
            }
          }, maxExecutionTime);
        }
        if (fn.length === 1) {
          var called = false;
          try {
            fn(function(err, ret) {
              if (!called) {
                called = true;
                done(locked, err, ret);
              }
            });
          } catch (err) {
            if (!called) {
              called = true;
              done(locked, err);
            }
          }
        } else {
          self._promiseTry(function() {
            return fn();
          }).then(function(ret) {
            done(locked, void 0, ret);
          }, function(error) {
            done(locked, error);
          });
        }
      };
      if (self.domainReentrant && !!process.domain) {
        exec = process.domain.bind(exec);
      }
      var maxPending = opts.maxPending || self.maxPending;
      if (!self.queues[key]) {
        self.queues[key] = [];
        exec(true);
      } else if (self.domainReentrant && !!process.domain && process.domain === self.domains[key]) {
        exec(false);
      } else if (self.queues[key].length >= maxPending) {
        done(false, new Error("Too many pending tasks in queue " + key));
      } else {
        var taskFn = function() {
          exec(true);
        };
        if (opts.skipQueue) {
          self.queues[key].unshift(taskFn);
        } else {
          self.queues[key].push(taskFn);
        }
        var timeout = opts.timeout || self.timeout;
        if (timeout) {
          timer = setTimeout(function() {
            timer = null;
            done(false, new Error("async-lock timed out in queue " + key));
          }, timeout);
        }
      }
      var maxOccupationTime = opts.maxOccupationTime || self.maxOccupationTime;
      if (maxOccupationTime) {
        occupationTimer = setTimeout(function() {
          if (!!self.queues[key]) {
            done(false, new Error("Maximum occupation time is exceeded in queue " + key));
          }
        }, maxOccupationTime);
      }
      if (deferred) {
        return deferred;
      }
    };
    AsyncLock2.prototype._acquireBatch = function(keys, fn, cb, opts) {
      var seen = /* @__PURE__ */ Object.create(null);
      keys = keys.filter(function(key) {
        if (seen[key]) {
          return false;
        }
        seen[key] = true;
        return true;
      });
      if (typeof cb !== "function") {
        opts = cb;
        cb = null;
      }
      var self = this;
      var getFn = function(key, fn2) {
        return function(cb2) {
          self.acquire(key, fn2, cb2, opts);
        };
      };
      var fnx = keys.reduceRight(function(prev, key) {
        return getFn(key, prev);
      }, fn);
      if (typeof cb === "function") {
        fnx(cb);
      } else {
        return new this.Promise(function(resolve, reject) {
          if (fnx.length === 1) {
            fnx(function(err, ret) {
              if (err) {
                reject(err);
              } else {
                resolve(ret);
              }
            });
          } else {
            resolve(fnx());
          }
        });
      }
    };
    AsyncLock2.prototype.isBusy = function(key) {
      if (!key) {
        return Object.keys(this.queues).length > 0;
      } else {
        return !!this.queues[key];
      }
    };
    AsyncLock2.prototype._promiseTry = function(fn) {
      try {
        return this.Promise.resolve(fn());
      } catch (e) {
        return this.Promise.reject(e);
      }
    };
    module2.exports = AsyncLock2;
  }
});

// node_modules/async-lock/index.js
var require_async_lock = __commonJS({
  "node_modules/async-lock/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = require_lib();
  }
});

// node_modules/clean-git-ref/lib/index.js
var require_lib2 = __commonJS({
  "node_modules/clean-git-ref/lib/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    function escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    function replaceAll(str, search, replacement) {
      search = search instanceof RegExp ? search : new RegExp(escapeRegExp(search), "g");
      return str.replace(search, replacement);
    }
    var CleanGitRef = {
      clean: function clean2(value) {
        if (typeof value !== "string") {
          throw new Error("Expected a string, received: " + value);
        }
        value = replaceAll(value, "./", "/");
        value = replaceAll(value, "..", ".");
        value = replaceAll(value, " ", "-");
        value = replaceAll(value, /^[~^:?*\\\-]/g, "");
        value = replaceAll(value, /[~^:?*\\]/g, "-");
        value = replaceAll(value, /[~^:?*\\\-]$/g, "");
        value = replaceAll(value, "@{", "-");
        value = replaceAll(value, /\.$/g, "");
        value = replaceAll(value, /\/$/g, "");
        value = replaceAll(value, /\.lock$/g, "");
        return value;
      }
    };
    module2.exports = CleanGitRef;
  }
});

// node_modules/crc-32/crc32.js
var require_crc32 = __commonJS({
  "node_modules/crc-32/crc32.js"(exports) {
    init_git_buffer();
    var CRC32;
    (function(factory) {
      if (typeof DO_NOT_EXPORT_CRC === "undefined") {
        if ("object" === typeof exports) {
          factory(exports);
        } else if ("function" === typeof define && define.amd) {
          define(function() {
            var module3 = {};
            factory(module3);
            return module3;
          });
        } else {
          factory(CRC32 = {});
        }
      } else {
        factory(CRC32 = {});
      }
    })(function(CRC322) {
      CRC322.version = "1.2.2";
      function signed_crc_table() {
        var c = 0, table = new Array(256);
        for (var n = 0; n != 256; ++n) {
          c = n;
          c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
          c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
          c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
          c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
          c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
          c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
          c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
          c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
          table[n] = c;
        }
        return typeof Int32Array !== "undefined" ? new Int32Array(table) : table;
      }
      var T0 = signed_crc_table();
      function slice_by_16_tables(T) {
        var c = 0, v = 0, n = 0, table = typeof Int32Array !== "undefined" ? new Int32Array(4096) : new Array(4096);
        for (n = 0; n != 256; ++n) table[n] = T[n];
        for (n = 0; n != 256; ++n) {
          v = T[n];
          for (c = 256 + n; c < 4096; c += 256) v = table[c] = v >>> 8 ^ T[v & 255];
        }
        var out = [];
        for (n = 1; n != 16; ++n) out[n - 1] = typeof Int32Array !== "undefined" ? table.subarray(n * 256, n * 256 + 256) : table.slice(n * 256, n * 256 + 256);
        return out;
      }
      var TT = slice_by_16_tables(T0);
      var T1 = TT[0], T2 = TT[1], T3 = TT[2], T4 = TT[3], T5 = TT[4];
      var T6 = TT[5], T7 = TT[6], T8 = TT[7], T9 = TT[8], Ta = TT[9];
      var Tb = TT[10], Tc = TT[11], Td = TT[12], Te = TT[13], Tf = TT[14];
      function crc32_bstr(bstr, seed) {
        var C = seed ^ -1;
        for (var i = 0, L = bstr.length; i < L; ) C = C >>> 8 ^ T0[(C ^ bstr.charCodeAt(i++)) & 255];
        return ~C;
      }
      function crc32_buf(B, seed) {
        var C = seed ^ -1, L = B.length - 15, i = 0;
        for (; i < L; ) C = Tf[B[i++] ^ C & 255] ^ Te[B[i++] ^ C >> 8 & 255] ^ Td[B[i++] ^ C >> 16 & 255] ^ Tc[B[i++] ^ C >>> 24] ^ Tb[B[i++]] ^ Ta[B[i++]] ^ T9[B[i++]] ^ T8[B[i++]] ^ T7[B[i++]] ^ T6[B[i++]] ^ T5[B[i++]] ^ T4[B[i++]] ^ T3[B[i++]] ^ T2[B[i++]] ^ T1[B[i++]] ^ T0[B[i++]];
        L += 15;
        while (i < L) C = C >>> 8 ^ T0[(C ^ B[i++]) & 255];
        return ~C;
      }
      function crc32_str(str, seed) {
        var C = seed ^ -1;
        for (var i = 0, L = str.length, c = 0, d = 0; i < L; ) {
          c = str.charCodeAt(i++);
          if (c < 128) {
            C = C >>> 8 ^ T0[(C ^ c) & 255];
          } else if (c < 2048) {
            C = C >>> 8 ^ T0[(C ^ (192 | c >> 6 & 31)) & 255];
            C = C >>> 8 ^ T0[(C ^ (128 | c & 63)) & 255];
          } else if (c >= 55296 && c < 57344) {
            c = (c & 1023) + 64;
            d = str.charCodeAt(i++) & 1023;
            C = C >>> 8 ^ T0[(C ^ (240 | c >> 8 & 7)) & 255];
            C = C >>> 8 ^ T0[(C ^ (128 | c >> 2 & 63)) & 255];
            C = C >>> 8 ^ T0[(C ^ (128 | d >> 6 & 15 | (c & 3) << 4)) & 255];
            C = C >>> 8 ^ T0[(C ^ (128 | d & 63)) & 255];
          } else {
            C = C >>> 8 ^ T0[(C ^ (224 | c >> 12 & 15)) & 255];
            C = C >>> 8 ^ T0[(C ^ (128 | c >> 6 & 63)) & 255];
            C = C >>> 8 ^ T0[(C ^ (128 | c & 63)) & 255];
          }
        }
        return ~C;
      }
      CRC322.table = T0;
      CRC322.bstr = crc32_bstr;
      CRC322.buf = crc32_buf;
      CRC322.str = crc32_str;
    });
  }
});

// node_modules/pako/lib/utils/common.js
var require_common = __commonJS({
  "node_modules/pako/lib/utils/common.js"(exports) {
    "use strict";
    init_git_buffer();
    var TYPED_OK = typeof Uint8Array !== "undefined" && typeof Uint16Array !== "undefined" && typeof Int32Array !== "undefined";
    function _has(obj, key) {
      return Object.prototype.hasOwnProperty.call(obj, key);
    }
    exports.assign = function(obj) {
      var sources = Array.prototype.slice.call(arguments, 1);
      while (sources.length) {
        var source = sources.shift();
        if (!source) {
          continue;
        }
        if (typeof source !== "object") {
          throw new TypeError(source + "must be non-object");
        }
        for (var p in source) {
          if (_has(source, p)) {
            obj[p] = source[p];
          }
        }
      }
      return obj;
    };
    exports.shrinkBuf = function(buf, size) {
      if (buf.length === size) {
        return buf;
      }
      if (buf.subarray) {
        return buf.subarray(0, size);
      }
      buf.length = size;
      return buf;
    };
    var fnTyped = {
      arraySet: function(dest, src, src_offs, len, dest_offs) {
        if (src.subarray && dest.subarray) {
          dest.set(src.subarray(src_offs, src_offs + len), dest_offs);
          return;
        }
        for (var i = 0; i < len; i++) {
          dest[dest_offs + i] = src[src_offs + i];
        }
      },
      // Join array of chunks to single array.
      flattenChunks: function(chunks) {
        var i, l, len, pos, chunk, result;
        len = 0;
        for (i = 0, l = chunks.length; i < l; i++) {
          len += chunks[i].length;
        }
        result = new Uint8Array(len);
        pos = 0;
        for (i = 0, l = chunks.length; i < l; i++) {
          chunk = chunks[i];
          result.set(chunk, pos);
          pos += chunk.length;
        }
        return result;
      }
    };
    var fnUntyped = {
      arraySet: function(dest, src, src_offs, len, dest_offs) {
        for (var i = 0; i < len; i++) {
          dest[dest_offs + i] = src[src_offs + i];
        }
      },
      // Join array of chunks to single array.
      flattenChunks: function(chunks) {
        return [].concat.apply([], chunks);
      }
    };
    exports.setTyped = function(on) {
      if (on) {
        exports.Buf8 = Uint8Array;
        exports.Buf16 = Uint16Array;
        exports.Buf32 = Int32Array;
        exports.assign(exports, fnTyped);
      } else {
        exports.Buf8 = Array;
        exports.Buf16 = Array;
        exports.Buf32 = Array;
        exports.assign(exports, fnUntyped);
      }
    };
    exports.setTyped(TYPED_OK);
  }
});

// node_modules/pako/lib/zlib/trees.js
var require_trees = __commonJS({
  "node_modules/pako/lib/zlib/trees.js"(exports) {
    "use strict";
    init_git_buffer();
    var utils = require_common();
    var Z_FIXED = 4;
    var Z_BINARY = 0;
    var Z_TEXT = 1;
    var Z_UNKNOWN = 2;
    function zero(buf) {
      var len = buf.length;
      while (--len >= 0) {
        buf[len] = 0;
      }
    }
    var STORED_BLOCK = 0;
    var STATIC_TREES = 1;
    var DYN_TREES = 2;
    var MIN_MATCH = 3;
    var MAX_MATCH = 258;
    var LENGTH_CODES = 29;
    var LITERALS = 256;
    var L_CODES = LITERALS + 1 + LENGTH_CODES;
    var D_CODES = 30;
    var BL_CODES = 19;
    var HEAP_SIZE = 2 * L_CODES + 1;
    var MAX_BITS = 15;
    var Buf_size = 16;
    var MAX_BL_BITS = 7;
    var END_BLOCK = 256;
    var REP_3_6 = 16;
    var REPZ_3_10 = 17;
    var REPZ_11_138 = 18;
    var extra_lbits = (
      /* extra bits for each length code */
      [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
    );
    var extra_dbits = (
      /* extra bits for each distance code */
      [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
    );
    var extra_blbits = (
      /* extra bits for each bit length code */
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7]
    );
    var bl_order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
    var DIST_CODE_LEN = 512;
    var static_ltree = new Array((L_CODES + 2) * 2);
    zero(static_ltree);
    var static_dtree = new Array(D_CODES * 2);
    zero(static_dtree);
    var _dist_code = new Array(DIST_CODE_LEN);
    zero(_dist_code);
    var _length_code = new Array(MAX_MATCH - MIN_MATCH + 1);
    zero(_length_code);
    var base_length = new Array(LENGTH_CODES);
    zero(base_length);
    var base_dist = new Array(D_CODES);
    zero(base_dist);
    function StaticTreeDesc(static_tree, extra_bits, extra_base, elems, max_length) {
      this.static_tree = static_tree;
      this.extra_bits = extra_bits;
      this.extra_base = extra_base;
      this.elems = elems;
      this.max_length = max_length;
      this.has_stree = static_tree && static_tree.length;
    }
    var static_l_desc;
    var static_d_desc;
    var static_bl_desc;
    function TreeDesc(dyn_tree, stat_desc) {
      this.dyn_tree = dyn_tree;
      this.max_code = 0;
      this.stat_desc = stat_desc;
    }
    function d_code(dist) {
      return dist < 256 ? _dist_code[dist] : _dist_code[256 + (dist >>> 7)];
    }
    function put_short(s, w) {
      s.pending_buf[s.pending++] = w & 255;
      s.pending_buf[s.pending++] = w >>> 8 & 255;
    }
    function send_bits(s, value, length) {
      if (s.bi_valid > Buf_size - length) {
        s.bi_buf |= value << s.bi_valid & 65535;
        put_short(s, s.bi_buf);
        s.bi_buf = value >> Buf_size - s.bi_valid;
        s.bi_valid += length - Buf_size;
      } else {
        s.bi_buf |= value << s.bi_valid & 65535;
        s.bi_valid += length;
      }
    }
    function send_code(s, c, tree) {
      send_bits(
        s,
        tree[c * 2],
        tree[c * 2 + 1]
        /*.Len*/
      );
    }
    function bi_reverse(code, len) {
      var res = 0;
      do {
        res |= code & 1;
        code >>>= 1;
        res <<= 1;
      } while (--len > 0);
      return res >>> 1;
    }
    function bi_flush(s) {
      if (s.bi_valid === 16) {
        put_short(s, s.bi_buf);
        s.bi_buf = 0;
        s.bi_valid = 0;
      } else if (s.bi_valid >= 8) {
        s.pending_buf[s.pending++] = s.bi_buf & 255;
        s.bi_buf >>= 8;
        s.bi_valid -= 8;
      }
    }
    function gen_bitlen(s, desc) {
      var tree = desc.dyn_tree;
      var max_code = desc.max_code;
      var stree = desc.stat_desc.static_tree;
      var has_stree = desc.stat_desc.has_stree;
      var extra = desc.stat_desc.extra_bits;
      var base = desc.stat_desc.extra_base;
      var max_length = desc.stat_desc.max_length;
      var h;
      var n, m;
      var bits;
      var xbits;
      var f;
      var overflow = 0;
      for (bits = 0; bits <= MAX_BITS; bits++) {
        s.bl_count[bits] = 0;
      }
      tree[s.heap[s.heap_max] * 2 + 1] = 0;
      for (h = s.heap_max + 1; h < HEAP_SIZE; h++) {
        n = s.heap[h];
        bits = tree[tree[n * 2 + 1] * 2 + 1] + 1;
        if (bits > max_length) {
          bits = max_length;
          overflow++;
        }
        tree[n * 2 + 1] = bits;
        if (n > max_code) {
          continue;
        }
        s.bl_count[bits]++;
        xbits = 0;
        if (n >= base) {
          xbits = extra[n - base];
        }
        f = tree[n * 2];
        s.opt_len += f * (bits + xbits);
        if (has_stree) {
          s.static_len += f * (stree[n * 2 + 1] + xbits);
        }
      }
      if (overflow === 0) {
        return;
      }
      do {
        bits = max_length - 1;
        while (s.bl_count[bits] === 0) {
          bits--;
        }
        s.bl_count[bits]--;
        s.bl_count[bits + 1] += 2;
        s.bl_count[max_length]--;
        overflow -= 2;
      } while (overflow > 0);
      for (bits = max_length; bits !== 0; bits--) {
        n = s.bl_count[bits];
        while (n !== 0) {
          m = s.heap[--h];
          if (m > max_code) {
            continue;
          }
          if (tree[m * 2 + 1] !== bits) {
            s.opt_len += (bits - tree[m * 2 + 1]) * tree[m * 2];
            tree[m * 2 + 1] = bits;
          }
          n--;
        }
      }
    }
    function gen_codes(tree, max_code, bl_count) {
      var next_code = new Array(MAX_BITS + 1);
      var code = 0;
      var bits;
      var n;
      for (bits = 1; bits <= MAX_BITS; bits++) {
        next_code[bits] = code = code + bl_count[bits - 1] << 1;
      }
      for (n = 0; n <= max_code; n++) {
        var len = tree[n * 2 + 1];
        if (len === 0) {
          continue;
        }
        tree[n * 2] = bi_reverse(next_code[len]++, len);
      }
    }
    function tr_static_init() {
      var n;
      var bits;
      var length;
      var code;
      var dist;
      var bl_count = new Array(MAX_BITS + 1);
      length = 0;
      for (code = 0; code < LENGTH_CODES - 1; code++) {
        base_length[code] = length;
        for (n = 0; n < 1 << extra_lbits[code]; n++) {
          _length_code[length++] = code;
        }
      }
      _length_code[length - 1] = code;
      dist = 0;
      for (code = 0; code < 16; code++) {
        base_dist[code] = dist;
        for (n = 0; n < 1 << extra_dbits[code]; n++) {
          _dist_code[dist++] = code;
        }
      }
      dist >>= 7;
      for (; code < D_CODES; code++) {
        base_dist[code] = dist << 7;
        for (n = 0; n < 1 << extra_dbits[code] - 7; n++) {
          _dist_code[256 + dist++] = code;
        }
      }
      for (bits = 0; bits <= MAX_BITS; bits++) {
        bl_count[bits] = 0;
      }
      n = 0;
      while (n <= 143) {
        static_ltree[n * 2 + 1] = 8;
        n++;
        bl_count[8]++;
      }
      while (n <= 255) {
        static_ltree[n * 2 + 1] = 9;
        n++;
        bl_count[9]++;
      }
      while (n <= 279) {
        static_ltree[n * 2 + 1] = 7;
        n++;
        bl_count[7]++;
      }
      while (n <= 287) {
        static_ltree[n * 2 + 1] = 8;
        n++;
        bl_count[8]++;
      }
      gen_codes(static_ltree, L_CODES + 1, bl_count);
      for (n = 0; n < D_CODES; n++) {
        static_dtree[n * 2 + 1] = 5;
        static_dtree[n * 2] = bi_reverse(n, 5);
      }
      static_l_desc = new StaticTreeDesc(static_ltree, extra_lbits, LITERALS + 1, L_CODES, MAX_BITS);
      static_d_desc = new StaticTreeDesc(static_dtree, extra_dbits, 0, D_CODES, MAX_BITS);
      static_bl_desc = new StaticTreeDesc(new Array(0), extra_blbits, 0, BL_CODES, MAX_BL_BITS);
    }
    function init_block(s) {
      var n;
      for (n = 0; n < L_CODES; n++) {
        s.dyn_ltree[n * 2] = 0;
      }
      for (n = 0; n < D_CODES; n++) {
        s.dyn_dtree[n * 2] = 0;
      }
      for (n = 0; n < BL_CODES; n++) {
        s.bl_tree[n * 2] = 0;
      }
      s.dyn_ltree[END_BLOCK * 2] = 1;
      s.opt_len = s.static_len = 0;
      s.last_lit = s.matches = 0;
    }
    function bi_windup(s) {
      if (s.bi_valid > 8) {
        put_short(s, s.bi_buf);
      } else if (s.bi_valid > 0) {
        s.pending_buf[s.pending++] = s.bi_buf;
      }
      s.bi_buf = 0;
      s.bi_valid = 0;
    }
    function copy_block(s, buf, len, header) {
      bi_windup(s);
      if (header) {
        put_short(s, len);
        put_short(s, ~len);
      }
      utils.arraySet(s.pending_buf, s.window, buf, len, s.pending);
      s.pending += len;
    }
    function smaller(tree, n, m, depth) {
      var _n2 = n * 2;
      var _m2 = m * 2;
      return tree[_n2] < tree[_m2] || tree[_n2] === tree[_m2] && depth[n] <= depth[m];
    }
    function pqdownheap(s, tree, k) {
      var v = s.heap[k];
      var j = k << 1;
      while (j <= s.heap_len) {
        if (j < s.heap_len && smaller(tree, s.heap[j + 1], s.heap[j], s.depth)) {
          j++;
        }
        if (smaller(tree, v, s.heap[j], s.depth)) {
          break;
        }
        s.heap[k] = s.heap[j];
        k = j;
        j <<= 1;
      }
      s.heap[k] = v;
    }
    function compress_block(s, ltree, dtree) {
      var dist;
      var lc;
      var lx = 0;
      var code;
      var extra;
      if (s.last_lit !== 0) {
        do {
          dist = s.pending_buf[s.d_buf + lx * 2] << 8 | s.pending_buf[s.d_buf + lx * 2 + 1];
          lc = s.pending_buf[s.l_buf + lx];
          lx++;
          if (dist === 0) {
            send_code(s, lc, ltree);
          } else {
            code = _length_code[lc];
            send_code(s, code + LITERALS + 1, ltree);
            extra = extra_lbits[code];
            if (extra !== 0) {
              lc -= base_length[code];
              send_bits(s, lc, extra);
            }
            dist--;
            code = d_code(dist);
            send_code(s, code, dtree);
            extra = extra_dbits[code];
            if (extra !== 0) {
              dist -= base_dist[code];
              send_bits(s, dist, extra);
            }
          }
        } while (lx < s.last_lit);
      }
      send_code(s, END_BLOCK, ltree);
    }
    function build_tree(s, desc) {
      var tree = desc.dyn_tree;
      var stree = desc.stat_desc.static_tree;
      var has_stree = desc.stat_desc.has_stree;
      var elems = desc.stat_desc.elems;
      var n, m;
      var max_code = -1;
      var node;
      s.heap_len = 0;
      s.heap_max = HEAP_SIZE;
      for (n = 0; n < elems; n++) {
        if (tree[n * 2] !== 0) {
          s.heap[++s.heap_len] = max_code = n;
          s.depth[n] = 0;
        } else {
          tree[n * 2 + 1] = 0;
        }
      }
      while (s.heap_len < 2) {
        node = s.heap[++s.heap_len] = max_code < 2 ? ++max_code : 0;
        tree[node * 2] = 1;
        s.depth[node] = 0;
        s.opt_len--;
        if (has_stree) {
          s.static_len -= stree[node * 2 + 1];
        }
      }
      desc.max_code = max_code;
      for (n = s.heap_len >> 1; n >= 1; n--) {
        pqdownheap(s, tree, n);
      }
      node = elems;
      do {
        n = s.heap[
          1
          /*SMALLEST*/
        ];
        s.heap[
          1
          /*SMALLEST*/
        ] = s.heap[s.heap_len--];
        pqdownheap(
          s,
          tree,
          1
          /*SMALLEST*/
        );
        m = s.heap[
          1
          /*SMALLEST*/
        ];
        s.heap[--s.heap_max] = n;
        s.heap[--s.heap_max] = m;
        tree[node * 2] = tree[n * 2] + tree[m * 2];
        s.depth[node] = (s.depth[n] >= s.depth[m] ? s.depth[n] : s.depth[m]) + 1;
        tree[n * 2 + 1] = tree[m * 2 + 1] = node;
        s.heap[
          1
          /*SMALLEST*/
        ] = node++;
        pqdownheap(
          s,
          tree,
          1
          /*SMALLEST*/
        );
      } while (s.heap_len >= 2);
      s.heap[--s.heap_max] = s.heap[
        1
        /*SMALLEST*/
      ];
      gen_bitlen(s, desc);
      gen_codes(tree, max_code, s.bl_count);
    }
    function scan_tree(s, tree, max_code) {
      var n;
      var prevlen = -1;
      var curlen;
      var nextlen = tree[0 * 2 + 1];
      var count = 0;
      var max_count = 7;
      var min_count = 4;
      if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
      }
      tree[(max_code + 1) * 2 + 1] = 65535;
      for (n = 0; n <= max_code; n++) {
        curlen = nextlen;
        nextlen = tree[(n + 1) * 2 + 1];
        if (++count < max_count && curlen === nextlen) {
          continue;
        } else if (count < min_count) {
          s.bl_tree[curlen * 2] += count;
        } else if (curlen !== 0) {
          if (curlen !== prevlen) {
            s.bl_tree[curlen * 2]++;
          }
          s.bl_tree[REP_3_6 * 2]++;
        } else if (count <= 10) {
          s.bl_tree[REPZ_3_10 * 2]++;
        } else {
          s.bl_tree[REPZ_11_138 * 2]++;
        }
        count = 0;
        prevlen = curlen;
        if (nextlen === 0) {
          max_count = 138;
          min_count = 3;
        } else if (curlen === nextlen) {
          max_count = 6;
          min_count = 3;
        } else {
          max_count = 7;
          min_count = 4;
        }
      }
    }
    function send_tree(s, tree, max_code) {
      var n;
      var prevlen = -1;
      var curlen;
      var nextlen = tree[0 * 2 + 1];
      var count = 0;
      var max_count = 7;
      var min_count = 4;
      if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
      }
      for (n = 0; n <= max_code; n++) {
        curlen = nextlen;
        nextlen = tree[(n + 1) * 2 + 1];
        if (++count < max_count && curlen === nextlen) {
          continue;
        } else if (count < min_count) {
          do {
            send_code(s, curlen, s.bl_tree);
          } while (--count !== 0);
        } else if (curlen !== 0) {
          if (curlen !== prevlen) {
            send_code(s, curlen, s.bl_tree);
            count--;
          }
          send_code(s, REP_3_6, s.bl_tree);
          send_bits(s, count - 3, 2);
        } else if (count <= 10) {
          send_code(s, REPZ_3_10, s.bl_tree);
          send_bits(s, count - 3, 3);
        } else {
          send_code(s, REPZ_11_138, s.bl_tree);
          send_bits(s, count - 11, 7);
        }
        count = 0;
        prevlen = curlen;
        if (nextlen === 0) {
          max_count = 138;
          min_count = 3;
        } else if (curlen === nextlen) {
          max_count = 6;
          min_count = 3;
        } else {
          max_count = 7;
          min_count = 4;
        }
      }
    }
    function build_bl_tree(s) {
      var max_blindex;
      scan_tree(s, s.dyn_ltree, s.l_desc.max_code);
      scan_tree(s, s.dyn_dtree, s.d_desc.max_code);
      build_tree(s, s.bl_desc);
      for (max_blindex = BL_CODES - 1; max_blindex >= 3; max_blindex--) {
        if (s.bl_tree[bl_order[max_blindex] * 2 + 1] !== 0) {
          break;
        }
      }
      s.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;
      return max_blindex;
    }
    function send_all_trees(s, lcodes, dcodes, blcodes) {
      var rank;
      send_bits(s, lcodes - 257, 5);
      send_bits(s, dcodes - 1, 5);
      send_bits(s, blcodes - 4, 4);
      for (rank = 0; rank < blcodes; rank++) {
        send_bits(s, s.bl_tree[bl_order[rank] * 2 + 1], 3);
      }
      send_tree(s, s.dyn_ltree, lcodes - 1);
      send_tree(s, s.dyn_dtree, dcodes - 1);
    }
    function detect_data_type(s) {
      var black_mask = 4093624447;
      var n;
      for (n = 0; n <= 31; n++, black_mask >>>= 1) {
        if (black_mask & 1 && s.dyn_ltree[n * 2] !== 0) {
          return Z_BINARY;
        }
      }
      if (s.dyn_ltree[9 * 2] !== 0 || s.dyn_ltree[10 * 2] !== 0 || s.dyn_ltree[13 * 2] !== 0) {
        return Z_TEXT;
      }
      for (n = 32; n < LITERALS; n++) {
        if (s.dyn_ltree[n * 2] !== 0) {
          return Z_TEXT;
        }
      }
      return Z_BINARY;
    }
    var static_init_done = false;
    function _tr_init(s) {
      if (!static_init_done) {
        tr_static_init();
        static_init_done = true;
      }
      s.l_desc = new TreeDesc(s.dyn_ltree, static_l_desc);
      s.d_desc = new TreeDesc(s.dyn_dtree, static_d_desc);
      s.bl_desc = new TreeDesc(s.bl_tree, static_bl_desc);
      s.bi_buf = 0;
      s.bi_valid = 0;
      init_block(s);
    }
    function _tr_stored_block(s, buf, stored_len, last) {
      send_bits(s, (STORED_BLOCK << 1) + (last ? 1 : 0), 3);
      copy_block(s, buf, stored_len, true);
    }
    function _tr_align(s) {
      send_bits(s, STATIC_TREES << 1, 3);
      send_code(s, END_BLOCK, static_ltree);
      bi_flush(s);
    }
    function _tr_flush_block(s, buf, stored_len, last) {
      var opt_lenb, static_lenb;
      var max_blindex = 0;
      if (s.level > 0) {
        if (s.strm.data_type === Z_UNKNOWN) {
          s.strm.data_type = detect_data_type(s);
        }
        build_tree(s, s.l_desc);
        build_tree(s, s.d_desc);
        max_blindex = build_bl_tree(s);
        opt_lenb = s.opt_len + 3 + 7 >>> 3;
        static_lenb = s.static_len + 3 + 7 >>> 3;
        if (static_lenb <= opt_lenb) {
          opt_lenb = static_lenb;
        }
      } else {
        opt_lenb = static_lenb = stored_len + 5;
      }
      if (stored_len + 4 <= opt_lenb && buf !== -1) {
        _tr_stored_block(s, buf, stored_len, last);
      } else if (s.strategy === Z_FIXED || static_lenb === opt_lenb) {
        send_bits(s, (STATIC_TREES << 1) + (last ? 1 : 0), 3);
        compress_block(s, static_ltree, static_dtree);
      } else {
        send_bits(s, (DYN_TREES << 1) + (last ? 1 : 0), 3);
        send_all_trees(s, s.l_desc.max_code + 1, s.d_desc.max_code + 1, max_blindex + 1);
        compress_block(s, s.dyn_ltree, s.dyn_dtree);
      }
      init_block(s);
      if (last) {
        bi_windup(s);
      }
    }
    function _tr_tally(s, dist, lc) {
      s.pending_buf[s.d_buf + s.last_lit * 2] = dist >>> 8 & 255;
      s.pending_buf[s.d_buf + s.last_lit * 2 + 1] = dist & 255;
      s.pending_buf[s.l_buf + s.last_lit] = lc & 255;
      s.last_lit++;
      if (dist === 0) {
        s.dyn_ltree[lc * 2]++;
      } else {
        s.matches++;
        dist--;
        s.dyn_ltree[(_length_code[lc] + LITERALS + 1) * 2]++;
        s.dyn_dtree[d_code(dist) * 2]++;
      }
      return s.last_lit === s.lit_bufsize - 1;
    }
    exports._tr_init = _tr_init;
    exports._tr_stored_block = _tr_stored_block;
    exports._tr_flush_block = _tr_flush_block;
    exports._tr_tally = _tr_tally;
    exports._tr_align = _tr_align;
  }
});

// node_modules/pako/lib/zlib/adler32.js
var require_adler32 = __commonJS({
  "node_modules/pako/lib/zlib/adler32.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    function adler32(adler, buf, len, pos) {
      var s1 = adler & 65535 | 0, s2 = adler >>> 16 & 65535 | 0, n = 0;
      while (len !== 0) {
        n = len > 2e3 ? 2e3 : len;
        len -= n;
        do {
          s1 = s1 + buf[pos++] | 0;
          s2 = s2 + s1 | 0;
        } while (--n);
        s1 %= 65521;
        s2 %= 65521;
      }
      return s1 | s2 << 16 | 0;
    }
    module2.exports = adler32;
  }
});

// node_modules/pako/lib/zlib/crc32.js
var require_crc322 = __commonJS({
  "node_modules/pako/lib/zlib/crc32.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    function makeTable() {
      var c, table = [];
      for (var n = 0; n < 256; n++) {
        c = n;
        for (var k = 0; k < 8; k++) {
          c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
        }
        table[n] = c;
      }
      return table;
    }
    var crcTable = makeTable();
    function crc322(crc, buf, len, pos) {
      var t = crcTable, end = pos + len;
      crc ^= -1;
      for (var i = pos; i < end; i++) {
        crc = crc >>> 8 ^ t[(crc ^ buf[i]) & 255];
      }
      return crc ^ -1;
    }
    module2.exports = crc322;
  }
});

// node_modules/pako/lib/zlib/messages.js
var require_messages = __commonJS({
  "node_modules/pako/lib/zlib/messages.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = {
      2: "need dictionary",
      /* Z_NEED_DICT       2  */
      1: "stream end",
      /* Z_STREAM_END      1  */
      0: "",
      /* Z_OK              0  */
      "-1": "file error",
      /* Z_ERRNO         (-1) */
      "-2": "stream error",
      /* Z_STREAM_ERROR  (-2) */
      "-3": "data error",
      /* Z_DATA_ERROR    (-3) */
      "-4": "insufficient memory",
      /* Z_MEM_ERROR     (-4) */
      "-5": "buffer error",
      /* Z_BUF_ERROR     (-5) */
      "-6": "incompatible version"
      /* Z_VERSION_ERROR (-6) */
    };
  }
});

// node_modules/pako/lib/zlib/deflate.js
var require_deflate = __commonJS({
  "node_modules/pako/lib/zlib/deflate.js"(exports) {
    "use strict";
    init_git_buffer();
    var utils = require_common();
    var trees = require_trees();
    var adler32 = require_adler32();
    var crc322 = require_crc322();
    var msg = require_messages();
    var Z_NO_FLUSH = 0;
    var Z_PARTIAL_FLUSH = 1;
    var Z_FULL_FLUSH = 3;
    var Z_FINISH = 4;
    var Z_BLOCK = 5;
    var Z_OK = 0;
    var Z_STREAM_END = 1;
    var Z_STREAM_ERROR = -2;
    var Z_DATA_ERROR = -3;
    var Z_BUF_ERROR = -5;
    var Z_DEFAULT_COMPRESSION = -1;
    var Z_FILTERED = 1;
    var Z_HUFFMAN_ONLY = 2;
    var Z_RLE = 3;
    var Z_FIXED = 4;
    var Z_DEFAULT_STRATEGY = 0;
    var Z_UNKNOWN = 2;
    var Z_DEFLATED = 8;
    var MAX_MEM_LEVEL = 9;
    var MAX_WBITS = 15;
    var DEF_MEM_LEVEL = 8;
    var LENGTH_CODES = 29;
    var LITERALS = 256;
    var L_CODES = LITERALS + 1 + LENGTH_CODES;
    var D_CODES = 30;
    var BL_CODES = 19;
    var HEAP_SIZE = 2 * L_CODES + 1;
    var MAX_BITS = 15;
    var MIN_MATCH = 3;
    var MAX_MATCH = 258;
    var MIN_LOOKAHEAD = MAX_MATCH + MIN_MATCH + 1;
    var PRESET_DICT = 32;
    var INIT_STATE = 42;
    var EXTRA_STATE = 69;
    var NAME_STATE = 73;
    var COMMENT_STATE = 91;
    var HCRC_STATE = 103;
    var BUSY_STATE = 113;
    var FINISH_STATE = 666;
    var BS_NEED_MORE = 1;
    var BS_BLOCK_DONE = 2;
    var BS_FINISH_STARTED = 3;
    var BS_FINISH_DONE = 4;
    var OS_CODE = 3;
    function err(strm, errorCode) {
      strm.msg = msg[errorCode];
      return errorCode;
    }
    function rank(f) {
      return (f << 1) - (f > 4 ? 9 : 0);
    }
    function zero(buf) {
      var len = buf.length;
      while (--len >= 0) {
        buf[len] = 0;
      }
    }
    function flush_pending(strm) {
      var s = strm.state;
      var len = s.pending;
      if (len > strm.avail_out) {
        len = strm.avail_out;
      }
      if (len === 0) {
        return;
      }
      utils.arraySet(strm.output, s.pending_buf, s.pending_out, len, strm.next_out);
      strm.next_out += len;
      s.pending_out += len;
      strm.total_out += len;
      strm.avail_out -= len;
      s.pending -= len;
      if (s.pending === 0) {
        s.pending_out = 0;
      }
    }
    function flush_block_only(s, last) {
      trees._tr_flush_block(s, s.block_start >= 0 ? s.block_start : -1, s.strstart - s.block_start, last);
      s.block_start = s.strstart;
      flush_pending(s.strm);
    }
    function put_byte(s, b) {
      s.pending_buf[s.pending++] = b;
    }
    function putShortMSB(s, b) {
      s.pending_buf[s.pending++] = b >>> 8 & 255;
      s.pending_buf[s.pending++] = b & 255;
    }
    function read_buf(strm, buf, start, size) {
      var len = strm.avail_in;
      if (len > size) {
        len = size;
      }
      if (len === 0) {
        return 0;
      }
      strm.avail_in -= len;
      utils.arraySet(buf, strm.input, strm.next_in, len, start);
      if (strm.state.wrap === 1) {
        strm.adler = adler32(strm.adler, buf, len, start);
      } else if (strm.state.wrap === 2) {
        strm.adler = crc322(strm.adler, buf, len, start);
      }
      strm.next_in += len;
      strm.total_in += len;
      return len;
    }
    function longest_match(s, cur_match) {
      var chain_length = s.max_chain_length;
      var scan2 = s.strstart;
      var match;
      var len;
      var best_len = s.prev_length;
      var nice_match = s.nice_match;
      var limit = s.strstart > s.w_size - MIN_LOOKAHEAD ? s.strstart - (s.w_size - MIN_LOOKAHEAD) : 0;
      var _win = s.window;
      var wmask = s.w_mask;
      var prev = s.prev;
      var strend = s.strstart + MAX_MATCH;
      var scan_end1 = _win[scan2 + best_len - 1];
      var scan_end = _win[scan2 + best_len];
      if (s.prev_length >= s.good_match) {
        chain_length >>= 2;
      }
      if (nice_match > s.lookahead) {
        nice_match = s.lookahead;
      }
      do {
        match = cur_match;
        if (_win[match + best_len] !== scan_end || _win[match + best_len - 1] !== scan_end1 || _win[match] !== _win[scan2] || _win[++match] !== _win[scan2 + 1]) {
          continue;
        }
        scan2 += 2;
        match++;
        do {
        } while (_win[++scan2] === _win[++match] && _win[++scan2] === _win[++match] && _win[++scan2] === _win[++match] && _win[++scan2] === _win[++match] && _win[++scan2] === _win[++match] && _win[++scan2] === _win[++match] && _win[++scan2] === _win[++match] && _win[++scan2] === _win[++match] && scan2 < strend);
        len = MAX_MATCH - (strend - scan2);
        scan2 = strend - MAX_MATCH;
        if (len > best_len) {
          s.match_start = cur_match;
          best_len = len;
          if (len >= nice_match) {
            break;
          }
          scan_end1 = _win[scan2 + best_len - 1];
          scan_end = _win[scan2 + best_len];
        }
      } while ((cur_match = prev[cur_match & wmask]) > limit && --chain_length !== 0);
      if (best_len <= s.lookahead) {
        return best_len;
      }
      return s.lookahead;
    }
    function fill_window(s) {
      var _w_size = s.w_size;
      var p, n, m, more, str;
      do {
        more = s.window_size - s.lookahead - s.strstart;
        if (s.strstart >= _w_size + (_w_size - MIN_LOOKAHEAD)) {
          utils.arraySet(s.window, s.window, _w_size, _w_size, 0);
          s.match_start -= _w_size;
          s.strstart -= _w_size;
          s.block_start -= _w_size;
          n = s.hash_size;
          p = n;
          do {
            m = s.head[--p];
            s.head[p] = m >= _w_size ? m - _w_size : 0;
          } while (--n);
          n = _w_size;
          p = n;
          do {
            m = s.prev[--p];
            s.prev[p] = m >= _w_size ? m - _w_size : 0;
          } while (--n);
          more += _w_size;
        }
        if (s.strm.avail_in === 0) {
          break;
        }
        n = read_buf(s.strm, s.window, s.strstart + s.lookahead, more);
        s.lookahead += n;
        if (s.lookahead + s.insert >= MIN_MATCH) {
          str = s.strstart - s.insert;
          s.ins_h = s.window[str];
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + 1]) & s.hash_mask;
          while (s.insert) {
            s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + MIN_MATCH - 1]) & s.hash_mask;
            s.prev[str & s.w_mask] = s.head[s.ins_h];
            s.head[s.ins_h] = str;
            str++;
            s.insert--;
            if (s.lookahead + s.insert < MIN_MATCH) {
              break;
            }
          }
        }
      } while (s.lookahead < MIN_LOOKAHEAD && s.strm.avail_in !== 0);
    }
    function deflate_stored(s, flush) {
      var max_block_size = 65535;
      if (max_block_size > s.pending_buf_size - 5) {
        max_block_size = s.pending_buf_size - 5;
      }
      for (; ; ) {
        if (s.lookahead <= 1) {
          fill_window(s);
          if (s.lookahead === 0 && flush === Z_NO_FLUSH) {
            return BS_NEED_MORE;
          }
          if (s.lookahead === 0) {
            break;
          }
        }
        s.strstart += s.lookahead;
        s.lookahead = 0;
        var max_start = s.block_start + max_block_size;
        if (s.strstart === 0 || s.strstart >= max_start) {
          s.lookahead = s.strstart - max_start;
          s.strstart = max_start;
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        }
        if (s.strstart - s.block_start >= s.w_size - MIN_LOOKAHEAD) {
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        }
      }
      s.insert = 0;
      if (flush === Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
          return BS_FINISH_STARTED;
        }
        return BS_FINISH_DONE;
      }
      if (s.strstart > s.block_start) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
      return BS_NEED_MORE;
    }
    function deflate_fast(s, flush) {
      var hash_head;
      var bflush;
      for (; ; ) {
        if (s.lookahead < MIN_LOOKAHEAD) {
          fill_window(s);
          if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH) {
            return BS_NEED_MORE;
          }
          if (s.lookahead === 0) {
            break;
          }
        }
        hash_head = 0;
        if (s.lookahead >= MIN_MATCH) {
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
          hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = s.strstart;
        }
        if (hash_head !== 0 && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
          s.match_length = longest_match(s, hash_head);
        }
        if (s.match_length >= MIN_MATCH) {
          bflush = trees._tr_tally(s, s.strstart - s.match_start, s.match_length - MIN_MATCH);
          s.lookahead -= s.match_length;
          if (s.match_length <= s.max_lazy_match && s.lookahead >= MIN_MATCH) {
            s.match_length--;
            do {
              s.strstart++;
              s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
              hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
              s.head[s.ins_h] = s.strstart;
            } while (--s.match_length !== 0);
            s.strstart++;
          } else {
            s.strstart += s.match_length;
            s.match_length = 0;
            s.ins_h = s.window[s.strstart];
            s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + 1]) & s.hash_mask;
          }
        } else {
          bflush = trees._tr_tally(s, 0, s.window[s.strstart]);
          s.lookahead--;
          s.strstart++;
        }
        if (bflush) {
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        }
      }
      s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
      if (flush === Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
          return BS_FINISH_STARTED;
        }
        return BS_FINISH_DONE;
      }
      if (s.last_lit) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
      return BS_BLOCK_DONE;
    }
    function deflate_slow(s, flush) {
      var hash_head;
      var bflush;
      var max_insert;
      for (; ; ) {
        if (s.lookahead < MIN_LOOKAHEAD) {
          fill_window(s);
          if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH) {
            return BS_NEED_MORE;
          }
          if (s.lookahead === 0) {
            break;
          }
        }
        hash_head = 0;
        if (s.lookahead >= MIN_MATCH) {
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
          hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = s.strstart;
        }
        s.prev_length = s.match_length;
        s.prev_match = s.match_start;
        s.match_length = MIN_MATCH - 1;
        if (hash_head !== 0 && s.prev_length < s.max_lazy_match && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
          s.match_length = longest_match(s, hash_head);
          if (s.match_length <= 5 && (s.strategy === Z_FILTERED || s.match_length === MIN_MATCH && s.strstart - s.match_start > 4096)) {
            s.match_length = MIN_MATCH - 1;
          }
        }
        if (s.prev_length >= MIN_MATCH && s.match_length <= s.prev_length) {
          max_insert = s.strstart + s.lookahead - MIN_MATCH;
          bflush = trees._tr_tally(s, s.strstart - 1 - s.prev_match, s.prev_length - MIN_MATCH);
          s.lookahead -= s.prev_length - 1;
          s.prev_length -= 2;
          do {
            if (++s.strstart <= max_insert) {
              s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
              hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
              s.head[s.ins_h] = s.strstart;
            }
          } while (--s.prev_length !== 0);
          s.match_available = 0;
          s.match_length = MIN_MATCH - 1;
          s.strstart++;
          if (bflush) {
            flush_block_only(s, false);
            if (s.strm.avail_out === 0) {
              return BS_NEED_MORE;
            }
          }
        } else if (s.match_available) {
          bflush = trees._tr_tally(s, 0, s.window[s.strstart - 1]);
          if (bflush) {
            flush_block_only(s, false);
          }
          s.strstart++;
          s.lookahead--;
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        } else {
          s.match_available = 1;
          s.strstart++;
          s.lookahead--;
        }
      }
      if (s.match_available) {
        bflush = trees._tr_tally(s, 0, s.window[s.strstart - 1]);
        s.match_available = 0;
      }
      s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
      if (flush === Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
          return BS_FINISH_STARTED;
        }
        return BS_FINISH_DONE;
      }
      if (s.last_lit) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
      return BS_BLOCK_DONE;
    }
    function deflate_rle(s, flush) {
      var bflush;
      var prev;
      var scan2, strend;
      var _win = s.window;
      for (; ; ) {
        if (s.lookahead <= MAX_MATCH) {
          fill_window(s);
          if (s.lookahead <= MAX_MATCH && flush === Z_NO_FLUSH) {
            return BS_NEED_MORE;
          }
          if (s.lookahead === 0) {
            break;
          }
        }
        s.match_length = 0;
        if (s.lookahead >= MIN_MATCH && s.strstart > 0) {
          scan2 = s.strstart - 1;
          prev = _win[scan2];
          if (prev === _win[++scan2] && prev === _win[++scan2] && prev === _win[++scan2]) {
            strend = s.strstart + MAX_MATCH;
            do {
            } while (prev === _win[++scan2] && prev === _win[++scan2] && prev === _win[++scan2] && prev === _win[++scan2] && prev === _win[++scan2] && prev === _win[++scan2] && prev === _win[++scan2] && prev === _win[++scan2] && scan2 < strend);
            s.match_length = MAX_MATCH - (strend - scan2);
            if (s.match_length > s.lookahead) {
              s.match_length = s.lookahead;
            }
          }
        }
        if (s.match_length >= MIN_MATCH) {
          bflush = trees._tr_tally(s, 1, s.match_length - MIN_MATCH);
          s.lookahead -= s.match_length;
          s.strstart += s.match_length;
          s.match_length = 0;
        } else {
          bflush = trees._tr_tally(s, 0, s.window[s.strstart]);
          s.lookahead--;
          s.strstart++;
        }
        if (bflush) {
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        }
      }
      s.insert = 0;
      if (flush === Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
          return BS_FINISH_STARTED;
        }
        return BS_FINISH_DONE;
      }
      if (s.last_lit) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
      return BS_BLOCK_DONE;
    }
    function deflate_huff(s, flush) {
      var bflush;
      for (; ; ) {
        if (s.lookahead === 0) {
          fill_window(s);
          if (s.lookahead === 0) {
            if (flush === Z_NO_FLUSH) {
              return BS_NEED_MORE;
            }
            break;
          }
        }
        s.match_length = 0;
        bflush = trees._tr_tally(s, 0, s.window[s.strstart]);
        s.lookahead--;
        s.strstart++;
        if (bflush) {
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        }
      }
      s.insert = 0;
      if (flush === Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
          return BS_FINISH_STARTED;
        }
        return BS_FINISH_DONE;
      }
      if (s.last_lit) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
      return BS_BLOCK_DONE;
    }
    function Config(good_length, max_lazy, nice_length, max_chain, func) {
      this.good_length = good_length;
      this.max_lazy = max_lazy;
      this.nice_length = nice_length;
      this.max_chain = max_chain;
      this.func = func;
    }
    var configuration_table;
    configuration_table = [
      /*      good lazy nice chain */
      new Config(0, 0, 0, 0, deflate_stored),
      /* 0 store only */
      new Config(4, 4, 8, 4, deflate_fast),
      /* 1 max speed, no lazy matches */
      new Config(4, 5, 16, 8, deflate_fast),
      /* 2 */
      new Config(4, 6, 32, 32, deflate_fast),
      /* 3 */
      new Config(4, 4, 16, 16, deflate_slow),
      /* 4 lazy matches */
      new Config(8, 16, 32, 32, deflate_slow),
      /* 5 */
      new Config(8, 16, 128, 128, deflate_slow),
      /* 6 */
      new Config(8, 32, 128, 256, deflate_slow),
      /* 7 */
      new Config(32, 128, 258, 1024, deflate_slow),
      /* 8 */
      new Config(32, 258, 258, 4096, deflate_slow)
      /* 9 max compression */
    ];
    function lm_init(s) {
      s.window_size = 2 * s.w_size;
      zero(s.head);
      s.max_lazy_match = configuration_table[s.level].max_lazy;
      s.good_match = configuration_table[s.level].good_length;
      s.nice_match = configuration_table[s.level].nice_length;
      s.max_chain_length = configuration_table[s.level].max_chain;
      s.strstart = 0;
      s.block_start = 0;
      s.lookahead = 0;
      s.insert = 0;
      s.match_length = s.prev_length = MIN_MATCH - 1;
      s.match_available = 0;
      s.ins_h = 0;
    }
    function DeflateState() {
      this.strm = null;
      this.status = 0;
      this.pending_buf = null;
      this.pending_buf_size = 0;
      this.pending_out = 0;
      this.pending = 0;
      this.wrap = 0;
      this.gzhead = null;
      this.gzindex = 0;
      this.method = Z_DEFLATED;
      this.last_flush = -1;
      this.w_size = 0;
      this.w_bits = 0;
      this.w_mask = 0;
      this.window = null;
      this.window_size = 0;
      this.prev = null;
      this.head = null;
      this.ins_h = 0;
      this.hash_size = 0;
      this.hash_bits = 0;
      this.hash_mask = 0;
      this.hash_shift = 0;
      this.block_start = 0;
      this.match_length = 0;
      this.prev_match = 0;
      this.match_available = 0;
      this.strstart = 0;
      this.match_start = 0;
      this.lookahead = 0;
      this.prev_length = 0;
      this.max_chain_length = 0;
      this.max_lazy_match = 0;
      this.level = 0;
      this.strategy = 0;
      this.good_match = 0;
      this.nice_match = 0;
      this.dyn_ltree = new utils.Buf16(HEAP_SIZE * 2);
      this.dyn_dtree = new utils.Buf16((2 * D_CODES + 1) * 2);
      this.bl_tree = new utils.Buf16((2 * BL_CODES + 1) * 2);
      zero(this.dyn_ltree);
      zero(this.dyn_dtree);
      zero(this.bl_tree);
      this.l_desc = null;
      this.d_desc = null;
      this.bl_desc = null;
      this.bl_count = new utils.Buf16(MAX_BITS + 1);
      this.heap = new utils.Buf16(2 * L_CODES + 1);
      zero(this.heap);
      this.heap_len = 0;
      this.heap_max = 0;
      this.depth = new utils.Buf16(2 * L_CODES + 1);
      zero(this.depth);
      this.l_buf = 0;
      this.lit_bufsize = 0;
      this.last_lit = 0;
      this.d_buf = 0;
      this.opt_len = 0;
      this.static_len = 0;
      this.matches = 0;
      this.insert = 0;
      this.bi_buf = 0;
      this.bi_valid = 0;
    }
    function deflateResetKeep(strm) {
      var s;
      if (!strm || !strm.state) {
        return err(strm, Z_STREAM_ERROR);
      }
      strm.total_in = strm.total_out = 0;
      strm.data_type = Z_UNKNOWN;
      s = strm.state;
      s.pending = 0;
      s.pending_out = 0;
      if (s.wrap < 0) {
        s.wrap = -s.wrap;
      }
      s.status = s.wrap ? INIT_STATE : BUSY_STATE;
      strm.adler = s.wrap === 2 ? 0 : 1;
      s.last_flush = Z_NO_FLUSH;
      trees._tr_init(s);
      return Z_OK;
    }
    function deflateReset(strm) {
      var ret = deflateResetKeep(strm);
      if (ret === Z_OK) {
        lm_init(strm.state);
      }
      return ret;
    }
    function deflateSetHeader(strm, head) {
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      if (strm.state.wrap !== 2) {
        return Z_STREAM_ERROR;
      }
      strm.state.gzhead = head;
      return Z_OK;
    }
    function deflateInit2(strm, level, method, windowBits, memLevel, strategy) {
      if (!strm) {
        return Z_STREAM_ERROR;
      }
      var wrap = 1;
      if (level === Z_DEFAULT_COMPRESSION) {
        level = 6;
      }
      if (windowBits < 0) {
        wrap = 0;
        windowBits = -windowBits;
      } else if (windowBits > 15) {
        wrap = 2;
        windowBits -= 16;
      }
      if (memLevel < 1 || memLevel > MAX_MEM_LEVEL || method !== Z_DEFLATED || windowBits < 8 || windowBits > 15 || level < 0 || level > 9 || strategy < 0 || strategy > Z_FIXED) {
        return err(strm, Z_STREAM_ERROR);
      }
      if (windowBits === 8) {
        windowBits = 9;
      }
      var s = new DeflateState();
      strm.state = s;
      s.strm = strm;
      s.wrap = wrap;
      s.gzhead = null;
      s.w_bits = windowBits;
      s.w_size = 1 << s.w_bits;
      s.w_mask = s.w_size - 1;
      s.hash_bits = memLevel + 7;
      s.hash_size = 1 << s.hash_bits;
      s.hash_mask = s.hash_size - 1;
      s.hash_shift = ~~((s.hash_bits + MIN_MATCH - 1) / MIN_MATCH);
      s.window = new utils.Buf8(s.w_size * 2);
      s.head = new utils.Buf16(s.hash_size);
      s.prev = new utils.Buf16(s.w_size);
      s.lit_bufsize = 1 << memLevel + 6;
      s.pending_buf_size = s.lit_bufsize * 4;
      s.pending_buf = new utils.Buf8(s.pending_buf_size);
      s.d_buf = 1 * s.lit_bufsize;
      s.l_buf = (1 + 2) * s.lit_bufsize;
      s.level = level;
      s.strategy = strategy;
      s.method = method;
      return deflateReset(strm);
    }
    function deflateInit(strm, level) {
      return deflateInit2(strm, level, Z_DEFLATED, MAX_WBITS, DEF_MEM_LEVEL, Z_DEFAULT_STRATEGY);
    }
    function deflate(strm, flush) {
      var old_flush, s;
      var beg, val;
      if (!strm || !strm.state || flush > Z_BLOCK || flush < 0) {
        return strm ? err(strm, Z_STREAM_ERROR) : Z_STREAM_ERROR;
      }
      s = strm.state;
      if (!strm.output || !strm.input && strm.avail_in !== 0 || s.status === FINISH_STATE && flush !== Z_FINISH) {
        return err(strm, strm.avail_out === 0 ? Z_BUF_ERROR : Z_STREAM_ERROR);
      }
      s.strm = strm;
      old_flush = s.last_flush;
      s.last_flush = flush;
      if (s.status === INIT_STATE) {
        if (s.wrap === 2) {
          strm.adler = 0;
          put_byte(s, 31);
          put_byte(s, 139);
          put_byte(s, 8);
          if (!s.gzhead) {
            put_byte(s, 0);
            put_byte(s, 0);
            put_byte(s, 0);
            put_byte(s, 0);
            put_byte(s, 0);
            put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ? 4 : 0);
            put_byte(s, OS_CODE);
            s.status = BUSY_STATE;
          } else {
            put_byte(
              s,
              (s.gzhead.text ? 1 : 0) + (s.gzhead.hcrc ? 2 : 0) + (!s.gzhead.extra ? 0 : 4) + (!s.gzhead.name ? 0 : 8) + (!s.gzhead.comment ? 0 : 16)
            );
            put_byte(s, s.gzhead.time & 255);
            put_byte(s, s.gzhead.time >> 8 & 255);
            put_byte(s, s.gzhead.time >> 16 & 255);
            put_byte(s, s.gzhead.time >> 24 & 255);
            put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ? 4 : 0);
            put_byte(s, s.gzhead.os & 255);
            if (s.gzhead.extra && s.gzhead.extra.length) {
              put_byte(s, s.gzhead.extra.length & 255);
              put_byte(s, s.gzhead.extra.length >> 8 & 255);
            }
            if (s.gzhead.hcrc) {
              strm.adler = crc322(strm.adler, s.pending_buf, s.pending, 0);
            }
            s.gzindex = 0;
            s.status = EXTRA_STATE;
          }
        } else {
          var header = Z_DEFLATED + (s.w_bits - 8 << 4) << 8;
          var level_flags = -1;
          if (s.strategy >= Z_HUFFMAN_ONLY || s.level < 2) {
            level_flags = 0;
          } else if (s.level < 6) {
            level_flags = 1;
          } else if (s.level === 6) {
            level_flags = 2;
          } else {
            level_flags = 3;
          }
          header |= level_flags << 6;
          if (s.strstart !== 0) {
            header |= PRESET_DICT;
          }
          header += 31 - header % 31;
          s.status = BUSY_STATE;
          putShortMSB(s, header);
          if (s.strstart !== 0) {
            putShortMSB(s, strm.adler >>> 16);
            putShortMSB(s, strm.adler & 65535);
          }
          strm.adler = 1;
        }
      }
      if (s.status === EXTRA_STATE) {
        if (s.gzhead.extra) {
          beg = s.pending;
          while (s.gzindex < (s.gzhead.extra.length & 65535)) {
            if (s.pending === s.pending_buf_size) {
              if (s.gzhead.hcrc && s.pending > beg) {
                strm.adler = crc322(strm.adler, s.pending_buf, s.pending - beg, beg);
              }
              flush_pending(strm);
              beg = s.pending;
              if (s.pending === s.pending_buf_size) {
                break;
              }
            }
            put_byte(s, s.gzhead.extra[s.gzindex] & 255);
            s.gzindex++;
          }
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc322(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          if (s.gzindex === s.gzhead.extra.length) {
            s.gzindex = 0;
            s.status = NAME_STATE;
          }
        } else {
          s.status = NAME_STATE;
        }
      }
      if (s.status === NAME_STATE) {
        if (s.gzhead.name) {
          beg = s.pending;
          do {
            if (s.pending === s.pending_buf_size) {
              if (s.gzhead.hcrc && s.pending > beg) {
                strm.adler = crc322(strm.adler, s.pending_buf, s.pending - beg, beg);
              }
              flush_pending(strm);
              beg = s.pending;
              if (s.pending === s.pending_buf_size) {
                val = 1;
                break;
              }
            }
            if (s.gzindex < s.gzhead.name.length) {
              val = s.gzhead.name.charCodeAt(s.gzindex++) & 255;
            } else {
              val = 0;
            }
            put_byte(s, val);
          } while (val !== 0);
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc322(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          if (val === 0) {
            s.gzindex = 0;
            s.status = COMMENT_STATE;
          }
        } else {
          s.status = COMMENT_STATE;
        }
      }
      if (s.status === COMMENT_STATE) {
        if (s.gzhead.comment) {
          beg = s.pending;
          do {
            if (s.pending === s.pending_buf_size) {
              if (s.gzhead.hcrc && s.pending > beg) {
                strm.adler = crc322(strm.adler, s.pending_buf, s.pending - beg, beg);
              }
              flush_pending(strm);
              beg = s.pending;
              if (s.pending === s.pending_buf_size) {
                val = 1;
                break;
              }
            }
            if (s.gzindex < s.gzhead.comment.length) {
              val = s.gzhead.comment.charCodeAt(s.gzindex++) & 255;
            } else {
              val = 0;
            }
            put_byte(s, val);
          } while (val !== 0);
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc322(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          if (val === 0) {
            s.status = HCRC_STATE;
          }
        } else {
          s.status = HCRC_STATE;
        }
      }
      if (s.status === HCRC_STATE) {
        if (s.gzhead.hcrc) {
          if (s.pending + 2 > s.pending_buf_size) {
            flush_pending(strm);
          }
          if (s.pending + 2 <= s.pending_buf_size) {
            put_byte(s, strm.adler & 255);
            put_byte(s, strm.adler >> 8 & 255);
            strm.adler = 0;
            s.status = BUSY_STATE;
          }
        } else {
          s.status = BUSY_STATE;
        }
      }
      if (s.pending !== 0) {
        flush_pending(strm);
        if (strm.avail_out === 0) {
          s.last_flush = -1;
          return Z_OK;
        }
      } else if (strm.avail_in === 0 && rank(flush) <= rank(old_flush) && flush !== Z_FINISH) {
        return err(strm, Z_BUF_ERROR);
      }
      if (s.status === FINISH_STATE && strm.avail_in !== 0) {
        return err(strm, Z_BUF_ERROR);
      }
      if (strm.avail_in !== 0 || s.lookahead !== 0 || flush !== Z_NO_FLUSH && s.status !== FINISH_STATE) {
        var bstate = s.strategy === Z_HUFFMAN_ONLY ? deflate_huff(s, flush) : s.strategy === Z_RLE ? deflate_rle(s, flush) : configuration_table[s.level].func(s, flush);
        if (bstate === BS_FINISH_STARTED || bstate === BS_FINISH_DONE) {
          s.status = FINISH_STATE;
        }
        if (bstate === BS_NEED_MORE || bstate === BS_FINISH_STARTED) {
          if (strm.avail_out === 0) {
            s.last_flush = -1;
          }
          return Z_OK;
        }
        if (bstate === BS_BLOCK_DONE) {
          if (flush === Z_PARTIAL_FLUSH) {
            trees._tr_align(s);
          } else if (flush !== Z_BLOCK) {
            trees._tr_stored_block(s, 0, 0, false);
            if (flush === Z_FULL_FLUSH) {
              zero(s.head);
              if (s.lookahead === 0) {
                s.strstart = 0;
                s.block_start = 0;
                s.insert = 0;
              }
            }
          }
          flush_pending(strm);
          if (strm.avail_out === 0) {
            s.last_flush = -1;
            return Z_OK;
          }
        }
      }
      if (flush !== Z_FINISH) {
        return Z_OK;
      }
      if (s.wrap <= 0) {
        return Z_STREAM_END;
      }
      if (s.wrap === 2) {
        put_byte(s, strm.adler & 255);
        put_byte(s, strm.adler >> 8 & 255);
        put_byte(s, strm.adler >> 16 & 255);
        put_byte(s, strm.adler >> 24 & 255);
        put_byte(s, strm.total_in & 255);
        put_byte(s, strm.total_in >> 8 & 255);
        put_byte(s, strm.total_in >> 16 & 255);
        put_byte(s, strm.total_in >> 24 & 255);
      } else {
        putShortMSB(s, strm.adler >>> 16);
        putShortMSB(s, strm.adler & 65535);
      }
      flush_pending(strm);
      if (s.wrap > 0) {
        s.wrap = -s.wrap;
      }
      return s.pending !== 0 ? Z_OK : Z_STREAM_END;
    }
    function deflateEnd(strm) {
      var status;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      status = strm.state.status;
      if (status !== INIT_STATE && status !== EXTRA_STATE && status !== NAME_STATE && status !== COMMENT_STATE && status !== HCRC_STATE && status !== BUSY_STATE && status !== FINISH_STATE) {
        return err(strm, Z_STREAM_ERROR);
      }
      strm.state = null;
      return status === BUSY_STATE ? err(strm, Z_DATA_ERROR) : Z_OK;
    }
    function deflateSetDictionary(strm, dictionary) {
      var dictLength = dictionary.length;
      var s;
      var str, n;
      var wrap;
      var avail;
      var next;
      var input;
      var tmpDict;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      s = strm.state;
      wrap = s.wrap;
      if (wrap === 2 || wrap === 1 && s.status !== INIT_STATE || s.lookahead) {
        return Z_STREAM_ERROR;
      }
      if (wrap === 1) {
        strm.adler = adler32(strm.adler, dictionary, dictLength, 0);
      }
      s.wrap = 0;
      if (dictLength >= s.w_size) {
        if (wrap === 0) {
          zero(s.head);
          s.strstart = 0;
          s.block_start = 0;
          s.insert = 0;
        }
        tmpDict = new utils.Buf8(s.w_size);
        utils.arraySet(tmpDict, dictionary, dictLength - s.w_size, s.w_size, 0);
        dictionary = tmpDict;
        dictLength = s.w_size;
      }
      avail = strm.avail_in;
      next = strm.next_in;
      input = strm.input;
      strm.avail_in = dictLength;
      strm.next_in = 0;
      strm.input = dictionary;
      fill_window(s);
      while (s.lookahead >= MIN_MATCH) {
        str = s.strstart;
        n = s.lookahead - (MIN_MATCH - 1);
        do {
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + MIN_MATCH - 1]) & s.hash_mask;
          s.prev[str & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = str;
          str++;
        } while (--n);
        s.strstart = str;
        s.lookahead = MIN_MATCH - 1;
        fill_window(s);
      }
      s.strstart += s.lookahead;
      s.block_start = s.strstart;
      s.insert = s.lookahead;
      s.lookahead = 0;
      s.match_length = s.prev_length = MIN_MATCH - 1;
      s.match_available = 0;
      strm.next_in = next;
      strm.input = input;
      strm.avail_in = avail;
      s.wrap = wrap;
      return Z_OK;
    }
    exports.deflateInit = deflateInit;
    exports.deflateInit2 = deflateInit2;
    exports.deflateReset = deflateReset;
    exports.deflateResetKeep = deflateResetKeep;
    exports.deflateSetHeader = deflateSetHeader;
    exports.deflate = deflate;
    exports.deflateEnd = deflateEnd;
    exports.deflateSetDictionary = deflateSetDictionary;
    exports.deflateInfo = "pako deflate (from Nodeca project)";
  }
});

// node_modules/pako/lib/utils/strings.js
var require_strings = __commonJS({
  "node_modules/pako/lib/utils/strings.js"(exports) {
    "use strict";
    init_git_buffer();
    var utils = require_common();
    var STR_APPLY_OK = true;
    var STR_APPLY_UIA_OK = true;
    try {
      String.fromCharCode.apply(null, [0]);
    } catch (__) {
      STR_APPLY_OK = false;
    }
    try {
      String.fromCharCode.apply(null, new Uint8Array(1));
    } catch (__) {
      STR_APPLY_UIA_OK = false;
    }
    var _utf8len = new utils.Buf8(256);
    for (q = 0; q < 256; q++) {
      _utf8len[q] = q >= 252 ? 6 : q >= 248 ? 5 : q >= 240 ? 4 : q >= 224 ? 3 : q >= 192 ? 2 : 1;
    }
    var q;
    _utf8len[254] = _utf8len[254] = 1;
    exports.string2buf = function(str) {
      var buf, c, c2, m_pos, i, str_len = str.length, buf_len = 0;
      for (m_pos = 0; m_pos < str_len; m_pos++) {
        c = str.charCodeAt(m_pos);
        if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
          c2 = str.charCodeAt(m_pos + 1);
          if ((c2 & 64512) === 56320) {
            c = 65536 + (c - 55296 << 10) + (c2 - 56320);
            m_pos++;
          }
        }
        buf_len += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4;
      }
      buf = new utils.Buf8(buf_len);
      for (i = 0, m_pos = 0; i < buf_len; m_pos++) {
        c = str.charCodeAt(m_pos);
        if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
          c2 = str.charCodeAt(m_pos + 1);
          if ((c2 & 64512) === 56320) {
            c = 65536 + (c - 55296 << 10) + (c2 - 56320);
            m_pos++;
          }
        }
        if (c < 128) {
          buf[i++] = c;
        } else if (c < 2048) {
          buf[i++] = 192 | c >>> 6;
          buf[i++] = 128 | c & 63;
        } else if (c < 65536) {
          buf[i++] = 224 | c >>> 12;
          buf[i++] = 128 | c >>> 6 & 63;
          buf[i++] = 128 | c & 63;
        } else {
          buf[i++] = 240 | c >>> 18;
          buf[i++] = 128 | c >>> 12 & 63;
          buf[i++] = 128 | c >>> 6 & 63;
          buf[i++] = 128 | c & 63;
        }
      }
      return buf;
    };
    function buf2binstring(buf, len) {
      if (len < 65534) {
        if (buf.subarray && STR_APPLY_UIA_OK || !buf.subarray && STR_APPLY_OK) {
          return String.fromCharCode.apply(null, utils.shrinkBuf(buf, len));
        }
      }
      var result = "";
      for (var i = 0; i < len; i++) {
        result += String.fromCharCode(buf[i]);
      }
      return result;
    }
    exports.buf2binstring = function(buf) {
      return buf2binstring(buf, buf.length);
    };
    exports.binstring2buf = function(str) {
      var buf = new utils.Buf8(str.length);
      for (var i = 0, len = buf.length; i < len; i++) {
        buf[i] = str.charCodeAt(i);
      }
      return buf;
    };
    exports.buf2string = function(buf, max) {
      var i, out, c, c_len;
      var len = max || buf.length;
      var utf16buf = new Array(len * 2);
      for (out = 0, i = 0; i < len; ) {
        c = buf[i++];
        if (c < 128) {
          utf16buf[out++] = c;
          continue;
        }
        c_len = _utf8len[c];
        if (c_len > 4) {
          utf16buf[out++] = 65533;
          i += c_len - 1;
          continue;
        }
        c &= c_len === 2 ? 31 : c_len === 3 ? 15 : 7;
        while (c_len > 1 && i < len) {
          c = c << 6 | buf[i++] & 63;
          c_len--;
        }
        if (c_len > 1) {
          utf16buf[out++] = 65533;
          continue;
        }
        if (c < 65536) {
          utf16buf[out++] = c;
        } else {
          c -= 65536;
          utf16buf[out++] = 55296 | c >> 10 & 1023;
          utf16buf[out++] = 56320 | c & 1023;
        }
      }
      return buf2binstring(utf16buf, out);
    };
    exports.utf8border = function(buf, max) {
      var pos;
      max = max || buf.length;
      if (max > buf.length) {
        max = buf.length;
      }
      pos = max - 1;
      while (pos >= 0 && (buf[pos] & 192) === 128) {
        pos--;
      }
      if (pos < 0) {
        return max;
      }
      if (pos === 0) {
        return max;
      }
      return pos + _utf8len[buf[pos]] > max ? pos : max;
    };
  }
});

// node_modules/pako/lib/zlib/zstream.js
var require_zstream = __commonJS({
  "node_modules/pako/lib/zlib/zstream.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    function ZStream() {
      this.input = null;
      this.next_in = 0;
      this.avail_in = 0;
      this.total_in = 0;
      this.output = null;
      this.next_out = 0;
      this.avail_out = 0;
      this.total_out = 0;
      this.msg = "";
      this.state = null;
      this.data_type = 2;
      this.adler = 0;
    }
    module2.exports = ZStream;
  }
});

// node_modules/pako/lib/deflate.js
var require_deflate2 = __commonJS({
  "node_modules/pako/lib/deflate.js"(exports) {
    "use strict";
    init_git_buffer();
    var zlib_deflate = require_deflate();
    var utils = require_common();
    var strings = require_strings();
    var msg = require_messages();
    var ZStream = require_zstream();
    var toString = Object.prototype.toString;
    var Z_NO_FLUSH = 0;
    var Z_FINISH = 4;
    var Z_OK = 0;
    var Z_STREAM_END = 1;
    var Z_SYNC_FLUSH = 2;
    var Z_DEFAULT_COMPRESSION = -1;
    var Z_DEFAULT_STRATEGY = 0;
    var Z_DEFLATED = 8;
    function Deflate(options) {
      if (!(this instanceof Deflate)) return new Deflate(options);
      this.options = utils.assign({
        level: Z_DEFAULT_COMPRESSION,
        method: Z_DEFLATED,
        chunkSize: 16384,
        windowBits: 15,
        memLevel: 8,
        strategy: Z_DEFAULT_STRATEGY,
        to: ""
      }, options || {});
      var opt = this.options;
      if (opt.raw && opt.windowBits > 0) {
        opt.windowBits = -opt.windowBits;
      } else if (opt.gzip && opt.windowBits > 0 && opt.windowBits < 16) {
        opt.windowBits += 16;
      }
      this.err = 0;
      this.msg = "";
      this.ended = false;
      this.chunks = [];
      this.strm = new ZStream();
      this.strm.avail_out = 0;
      var status = zlib_deflate.deflateInit2(
        this.strm,
        opt.level,
        opt.method,
        opt.windowBits,
        opt.memLevel,
        opt.strategy
      );
      if (status !== Z_OK) {
        throw new Error(msg[status]);
      }
      if (opt.header) {
        zlib_deflate.deflateSetHeader(this.strm, opt.header);
      }
      if (opt.dictionary) {
        var dict;
        if (typeof opt.dictionary === "string") {
          dict = strings.string2buf(opt.dictionary);
        } else if (toString.call(opt.dictionary) === "[object ArrayBuffer]") {
          dict = new Uint8Array(opt.dictionary);
        } else {
          dict = opt.dictionary;
        }
        status = zlib_deflate.deflateSetDictionary(this.strm, dict);
        if (status !== Z_OK) {
          throw new Error(msg[status]);
        }
        this._dict_set = true;
      }
    }
    Deflate.prototype.push = function(data, mode) {
      var strm = this.strm;
      var chunkSize = this.options.chunkSize;
      var status, _mode;
      if (this.ended) {
        return false;
      }
      _mode = mode === ~~mode ? mode : mode === true ? Z_FINISH : Z_NO_FLUSH;
      if (typeof data === "string") {
        strm.input = strings.string2buf(data);
      } else if (toString.call(data) === "[object ArrayBuffer]") {
        strm.input = new Uint8Array(data);
      } else {
        strm.input = data;
      }
      strm.next_in = 0;
      strm.avail_in = strm.input.length;
      do {
        if (strm.avail_out === 0) {
          strm.output = new utils.Buf8(chunkSize);
          strm.next_out = 0;
          strm.avail_out = chunkSize;
        }
        status = zlib_deflate.deflate(strm, _mode);
        if (status !== Z_STREAM_END && status !== Z_OK) {
          this.onEnd(status);
          this.ended = true;
          return false;
        }
        if (strm.avail_out === 0 || strm.avail_in === 0 && (_mode === Z_FINISH || _mode === Z_SYNC_FLUSH)) {
          if (this.options.to === "string") {
            this.onData(strings.buf2binstring(utils.shrinkBuf(strm.output, strm.next_out)));
          } else {
            this.onData(utils.shrinkBuf(strm.output, strm.next_out));
          }
        }
      } while ((strm.avail_in > 0 || strm.avail_out === 0) && status !== Z_STREAM_END);
      if (_mode === Z_FINISH) {
        status = zlib_deflate.deflateEnd(this.strm);
        this.onEnd(status);
        this.ended = true;
        return status === Z_OK;
      }
      if (_mode === Z_SYNC_FLUSH) {
        this.onEnd(Z_OK);
        strm.avail_out = 0;
        return true;
      }
      return true;
    };
    Deflate.prototype.onData = function(chunk) {
      this.chunks.push(chunk);
    };
    Deflate.prototype.onEnd = function(status) {
      if (status === Z_OK) {
        if (this.options.to === "string") {
          this.result = this.chunks.join("");
        } else {
          this.result = utils.flattenChunks(this.chunks);
        }
      }
      this.chunks = [];
      this.err = status;
      this.msg = this.strm.msg;
    };
    function deflate(input, options) {
      var deflator = new Deflate(options);
      deflator.push(input, true);
      if (deflator.err) {
        throw deflator.msg || msg[deflator.err];
      }
      return deflator.result;
    }
    function deflateRaw(input, options) {
      options = options || {};
      options.raw = true;
      return deflate(input, options);
    }
    function gzip(input, options) {
      options = options || {};
      options.gzip = true;
      return deflate(input, options);
    }
    exports.Deflate = Deflate;
    exports.deflate = deflate;
    exports.deflateRaw = deflateRaw;
    exports.gzip = gzip;
  }
});

// node_modules/pako/lib/zlib/inffast.js
var require_inffast = __commonJS({
  "node_modules/pako/lib/zlib/inffast.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var BAD = 30;
    var TYPE = 12;
    module2.exports = function inflate_fast(strm, start) {
      var state;
      var _in;
      var last;
      var _out;
      var beg;
      var end;
      var dmax;
      var wsize;
      var whave;
      var wnext;
      var s_window;
      var hold;
      var bits;
      var lcode;
      var dcode;
      var lmask;
      var dmask;
      var here;
      var op;
      var len;
      var dist;
      var from;
      var from_source;
      var input, output;
      state = strm.state;
      _in = strm.next_in;
      input = strm.input;
      last = _in + (strm.avail_in - 5);
      _out = strm.next_out;
      output = strm.output;
      beg = _out - (start - strm.avail_out);
      end = _out + (strm.avail_out - 257);
      dmax = state.dmax;
      wsize = state.wsize;
      whave = state.whave;
      wnext = state.wnext;
      s_window = state.window;
      hold = state.hold;
      bits = state.bits;
      lcode = state.lencode;
      dcode = state.distcode;
      lmask = (1 << state.lenbits) - 1;
      dmask = (1 << state.distbits) - 1;
      top:
        do {
          if (bits < 15) {
            hold += input[_in++] << bits;
            bits += 8;
            hold += input[_in++] << bits;
            bits += 8;
          }
          here = lcode[hold & lmask];
          dolen:
            for (; ; ) {
              op = here >>> 24;
              hold >>>= op;
              bits -= op;
              op = here >>> 16 & 255;
              if (op === 0) {
                output[_out++] = here & 65535;
              } else if (op & 16) {
                len = here & 65535;
                op &= 15;
                if (op) {
                  if (bits < op) {
                    hold += input[_in++] << bits;
                    bits += 8;
                  }
                  len += hold & (1 << op) - 1;
                  hold >>>= op;
                  bits -= op;
                }
                if (bits < 15) {
                  hold += input[_in++] << bits;
                  bits += 8;
                  hold += input[_in++] << bits;
                  bits += 8;
                }
                here = dcode[hold & dmask];
                dodist:
                  for (; ; ) {
                    op = here >>> 24;
                    hold >>>= op;
                    bits -= op;
                    op = here >>> 16 & 255;
                    if (op & 16) {
                      dist = here & 65535;
                      op &= 15;
                      if (bits < op) {
                        hold += input[_in++] << bits;
                        bits += 8;
                        if (bits < op) {
                          hold += input[_in++] << bits;
                          bits += 8;
                        }
                      }
                      dist += hold & (1 << op) - 1;
                      if (dist > dmax) {
                        strm.msg = "invalid distance too far back";
                        state.mode = BAD;
                        break top;
                      }
                      hold >>>= op;
                      bits -= op;
                      op = _out - beg;
                      if (dist > op) {
                        op = dist - op;
                        if (op > whave) {
                          if (state.sane) {
                            strm.msg = "invalid distance too far back";
                            state.mode = BAD;
                            break top;
                          }
                        }
                        from = 0;
                        from_source = s_window;
                        if (wnext === 0) {
                          from += wsize - op;
                          if (op < len) {
                            len -= op;
                            do {
                              output[_out++] = s_window[from++];
                            } while (--op);
                            from = _out - dist;
                            from_source = output;
                          }
                        } else if (wnext < op) {
                          from += wsize + wnext - op;
                          op -= wnext;
                          if (op < len) {
                            len -= op;
                            do {
                              output[_out++] = s_window[from++];
                            } while (--op);
                            from = 0;
                            if (wnext < len) {
                              op = wnext;
                              len -= op;
                              do {
                                output[_out++] = s_window[from++];
                              } while (--op);
                              from = _out - dist;
                              from_source = output;
                            }
                          }
                        } else {
                          from += wnext - op;
                          if (op < len) {
                            len -= op;
                            do {
                              output[_out++] = s_window[from++];
                            } while (--op);
                            from = _out - dist;
                            from_source = output;
                          }
                        }
                        while (len > 2) {
                          output[_out++] = from_source[from++];
                          output[_out++] = from_source[from++];
                          output[_out++] = from_source[from++];
                          len -= 3;
                        }
                        if (len) {
                          output[_out++] = from_source[from++];
                          if (len > 1) {
                            output[_out++] = from_source[from++];
                          }
                        }
                      } else {
                        from = _out - dist;
                        do {
                          output[_out++] = output[from++];
                          output[_out++] = output[from++];
                          output[_out++] = output[from++];
                          len -= 3;
                        } while (len > 2);
                        if (len) {
                          output[_out++] = output[from++];
                          if (len > 1) {
                            output[_out++] = output[from++];
                          }
                        }
                      }
                    } else if ((op & 64) === 0) {
                      here = dcode[(here & 65535) + (hold & (1 << op) - 1)];
                      continue dodist;
                    } else {
                      strm.msg = "invalid distance code";
                      state.mode = BAD;
                      break top;
                    }
                    break;
                  }
              } else if ((op & 64) === 0) {
                here = lcode[(here & 65535) + (hold & (1 << op) - 1)];
                continue dolen;
              } else if (op & 32) {
                state.mode = TYPE;
                break top;
              } else {
                strm.msg = "invalid literal/length code";
                state.mode = BAD;
                break top;
              }
              break;
            }
        } while (_in < last && _out < end);
      len = bits >> 3;
      _in -= len;
      bits -= len << 3;
      hold &= (1 << bits) - 1;
      strm.next_in = _in;
      strm.next_out = _out;
      strm.avail_in = _in < last ? 5 + (last - _in) : 5 - (_in - last);
      strm.avail_out = _out < end ? 257 + (end - _out) : 257 - (_out - end);
      state.hold = hold;
      state.bits = bits;
      return;
    };
  }
});

// node_modules/pako/lib/zlib/inftrees.js
var require_inftrees = __commonJS({
  "node_modules/pako/lib/zlib/inftrees.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var utils = require_common();
    var MAXBITS = 15;
    var ENOUGH_LENS = 852;
    var ENOUGH_DISTS = 592;
    var CODES = 0;
    var LENS = 1;
    var DISTS = 2;
    var lbase = [
      /* Length codes 257..285 base */
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      13,
      15,
      17,
      19,
      23,
      27,
      31,
      35,
      43,
      51,
      59,
      67,
      83,
      99,
      115,
      131,
      163,
      195,
      227,
      258,
      0,
      0
    ];
    var lext = [
      /* Length codes 257..285 extra */
      16,
      16,
      16,
      16,
      16,
      16,
      16,
      16,
      17,
      17,
      17,
      17,
      18,
      18,
      18,
      18,
      19,
      19,
      19,
      19,
      20,
      20,
      20,
      20,
      21,
      21,
      21,
      21,
      16,
      72,
      78
    ];
    var dbase = [
      /* Distance codes 0..29 base */
      1,
      2,
      3,
      4,
      5,
      7,
      9,
      13,
      17,
      25,
      33,
      49,
      65,
      97,
      129,
      193,
      257,
      385,
      513,
      769,
      1025,
      1537,
      2049,
      3073,
      4097,
      6145,
      8193,
      12289,
      16385,
      24577,
      0,
      0
    ];
    var dext = [
      /* Distance codes 0..29 extra */
      16,
      16,
      16,
      16,
      17,
      17,
      18,
      18,
      19,
      19,
      20,
      20,
      21,
      21,
      22,
      22,
      23,
      23,
      24,
      24,
      25,
      25,
      26,
      26,
      27,
      27,
      28,
      28,
      29,
      29,
      64,
      64
    ];
    module2.exports = function inflate_table(type, lens, lens_index, codes, table, table_index, work, opts) {
      var bits = opts.bits;
      var len = 0;
      var sym = 0;
      var min = 0, max = 0;
      var root = 0;
      var curr = 0;
      var drop = 0;
      var left = 0;
      var used = 0;
      var huff = 0;
      var incr;
      var fill;
      var low;
      var mask;
      var next;
      var base = null;
      var base_index = 0;
      var end;
      var count = new utils.Buf16(MAXBITS + 1);
      var offs = new utils.Buf16(MAXBITS + 1);
      var extra = null;
      var extra_index = 0;
      var here_bits, here_op, here_val;
      for (len = 0; len <= MAXBITS; len++) {
        count[len] = 0;
      }
      for (sym = 0; sym < codes; sym++) {
        count[lens[lens_index + sym]]++;
      }
      root = bits;
      for (max = MAXBITS; max >= 1; max--) {
        if (count[max] !== 0) {
          break;
        }
      }
      if (root > max) {
        root = max;
      }
      if (max === 0) {
        table[table_index++] = 1 << 24 | 64 << 16 | 0;
        table[table_index++] = 1 << 24 | 64 << 16 | 0;
        opts.bits = 1;
        return 0;
      }
      for (min = 1; min < max; min++) {
        if (count[min] !== 0) {
          break;
        }
      }
      if (root < min) {
        root = min;
      }
      left = 1;
      for (len = 1; len <= MAXBITS; len++) {
        left <<= 1;
        left -= count[len];
        if (left < 0) {
          return -1;
        }
      }
      if (left > 0 && (type === CODES || max !== 1)) {
        return -1;
      }
      offs[1] = 0;
      for (len = 1; len < MAXBITS; len++) {
        offs[len + 1] = offs[len] + count[len];
      }
      for (sym = 0; sym < codes; sym++) {
        if (lens[lens_index + sym] !== 0) {
          work[offs[lens[lens_index + sym]]++] = sym;
        }
      }
      if (type === CODES) {
        base = extra = work;
        end = 19;
      } else if (type === LENS) {
        base = lbase;
        base_index -= 257;
        extra = lext;
        extra_index -= 257;
        end = 256;
      } else {
        base = dbase;
        extra = dext;
        end = -1;
      }
      huff = 0;
      sym = 0;
      len = min;
      next = table_index;
      curr = root;
      drop = 0;
      low = -1;
      used = 1 << root;
      mask = used - 1;
      if (type === LENS && used > ENOUGH_LENS || type === DISTS && used > ENOUGH_DISTS) {
        return 1;
      }
      for (; ; ) {
        here_bits = len - drop;
        if (work[sym] < end) {
          here_op = 0;
          here_val = work[sym];
        } else if (work[sym] > end) {
          here_op = extra[extra_index + work[sym]];
          here_val = base[base_index + work[sym]];
        } else {
          here_op = 32 + 64;
          here_val = 0;
        }
        incr = 1 << len - drop;
        fill = 1 << curr;
        min = fill;
        do {
          fill -= incr;
          table[next + (huff >> drop) + fill] = here_bits << 24 | here_op << 16 | here_val | 0;
        } while (fill !== 0);
        incr = 1 << len - 1;
        while (huff & incr) {
          incr >>= 1;
        }
        if (incr !== 0) {
          huff &= incr - 1;
          huff += incr;
        } else {
          huff = 0;
        }
        sym++;
        if (--count[len] === 0) {
          if (len === max) {
            break;
          }
          len = lens[lens_index + work[sym]];
        }
        if (len > root && (huff & mask) !== low) {
          if (drop === 0) {
            drop = root;
          }
          next += min;
          curr = len - drop;
          left = 1 << curr;
          while (curr + drop < max) {
            left -= count[curr + drop];
            if (left <= 0) {
              break;
            }
            curr++;
            left <<= 1;
          }
          used += 1 << curr;
          if (type === LENS && used > ENOUGH_LENS || type === DISTS && used > ENOUGH_DISTS) {
            return 1;
          }
          low = huff & mask;
          table[low] = root << 24 | curr << 16 | next - table_index | 0;
        }
      }
      if (huff !== 0) {
        table[next + huff] = len - drop << 24 | 64 << 16 | 0;
      }
      opts.bits = root;
      return 0;
    };
  }
});

// node_modules/pako/lib/zlib/inflate.js
var require_inflate = __commonJS({
  "node_modules/pako/lib/zlib/inflate.js"(exports) {
    "use strict";
    init_git_buffer();
    var utils = require_common();
    var adler32 = require_adler32();
    var crc322 = require_crc322();
    var inflate_fast = require_inffast();
    var inflate_table = require_inftrees();
    var CODES = 0;
    var LENS = 1;
    var DISTS = 2;
    var Z_FINISH = 4;
    var Z_BLOCK = 5;
    var Z_TREES = 6;
    var Z_OK = 0;
    var Z_STREAM_END = 1;
    var Z_NEED_DICT = 2;
    var Z_STREAM_ERROR = -2;
    var Z_DATA_ERROR = -3;
    var Z_MEM_ERROR = -4;
    var Z_BUF_ERROR = -5;
    var Z_DEFLATED = 8;
    var HEAD = 1;
    var FLAGS = 2;
    var TIME = 3;
    var OS = 4;
    var EXLEN = 5;
    var EXTRA = 6;
    var NAME = 7;
    var COMMENT = 8;
    var HCRC = 9;
    var DICTID = 10;
    var DICT = 11;
    var TYPE = 12;
    var TYPEDO = 13;
    var STORED = 14;
    var COPY_ = 15;
    var COPY = 16;
    var TABLE = 17;
    var LENLENS = 18;
    var CODELENS = 19;
    var LEN_ = 20;
    var LEN = 21;
    var LENEXT = 22;
    var DIST = 23;
    var DISTEXT = 24;
    var MATCH = 25;
    var LIT = 26;
    var CHECK = 27;
    var LENGTH = 28;
    var DONE = 29;
    var BAD = 30;
    var MEM = 31;
    var SYNC = 32;
    var ENOUGH_LENS = 852;
    var ENOUGH_DISTS = 592;
    var MAX_WBITS = 15;
    var DEF_WBITS = MAX_WBITS;
    function zswap32(q) {
      return (q >>> 24 & 255) + (q >>> 8 & 65280) + ((q & 65280) << 8) + ((q & 255) << 24);
    }
    function InflateState() {
      this.mode = 0;
      this.last = false;
      this.wrap = 0;
      this.havedict = false;
      this.flags = 0;
      this.dmax = 0;
      this.check = 0;
      this.total = 0;
      this.head = null;
      this.wbits = 0;
      this.wsize = 0;
      this.whave = 0;
      this.wnext = 0;
      this.window = null;
      this.hold = 0;
      this.bits = 0;
      this.length = 0;
      this.offset = 0;
      this.extra = 0;
      this.lencode = null;
      this.distcode = null;
      this.lenbits = 0;
      this.distbits = 0;
      this.ncode = 0;
      this.nlen = 0;
      this.ndist = 0;
      this.have = 0;
      this.next = null;
      this.lens = new utils.Buf16(320);
      this.work = new utils.Buf16(288);
      this.lendyn = null;
      this.distdyn = null;
      this.sane = 0;
      this.back = 0;
      this.was = 0;
    }
    function inflateResetKeep(strm) {
      var state;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      strm.total_in = strm.total_out = state.total = 0;
      strm.msg = "";
      if (state.wrap) {
        strm.adler = state.wrap & 1;
      }
      state.mode = HEAD;
      state.last = 0;
      state.havedict = 0;
      state.dmax = 32768;
      state.head = null;
      state.hold = 0;
      state.bits = 0;
      state.lencode = state.lendyn = new utils.Buf32(ENOUGH_LENS);
      state.distcode = state.distdyn = new utils.Buf32(ENOUGH_DISTS);
      state.sane = 1;
      state.back = -1;
      return Z_OK;
    }
    function inflateReset(strm) {
      var state;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      state.wsize = 0;
      state.whave = 0;
      state.wnext = 0;
      return inflateResetKeep(strm);
    }
    function inflateReset2(strm, windowBits) {
      var wrap;
      var state;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      if (windowBits < 0) {
        wrap = 0;
        windowBits = -windowBits;
      } else {
        wrap = (windowBits >> 4) + 1;
        if (windowBits < 48) {
          windowBits &= 15;
        }
      }
      if (windowBits && (windowBits < 8 || windowBits > 15)) {
        return Z_STREAM_ERROR;
      }
      if (state.window !== null && state.wbits !== windowBits) {
        state.window = null;
      }
      state.wrap = wrap;
      state.wbits = windowBits;
      return inflateReset(strm);
    }
    function inflateInit2(strm, windowBits) {
      var ret;
      var state;
      if (!strm) {
        return Z_STREAM_ERROR;
      }
      state = new InflateState();
      strm.state = state;
      state.window = null;
      ret = inflateReset2(strm, windowBits);
      if (ret !== Z_OK) {
        strm.state = null;
      }
      return ret;
    }
    function inflateInit(strm) {
      return inflateInit2(strm, DEF_WBITS);
    }
    var virgin = true;
    var lenfix;
    var distfix;
    function fixedtables(state) {
      if (virgin) {
        var sym;
        lenfix = new utils.Buf32(512);
        distfix = new utils.Buf32(32);
        sym = 0;
        while (sym < 144) {
          state.lens[sym++] = 8;
        }
        while (sym < 256) {
          state.lens[sym++] = 9;
        }
        while (sym < 280) {
          state.lens[sym++] = 7;
        }
        while (sym < 288) {
          state.lens[sym++] = 8;
        }
        inflate_table(LENS, state.lens, 0, 288, lenfix, 0, state.work, { bits: 9 });
        sym = 0;
        while (sym < 32) {
          state.lens[sym++] = 5;
        }
        inflate_table(DISTS, state.lens, 0, 32, distfix, 0, state.work, { bits: 5 });
        virgin = false;
      }
      state.lencode = lenfix;
      state.lenbits = 9;
      state.distcode = distfix;
      state.distbits = 5;
    }
    function updatewindow(strm, src, end, copy) {
      var dist;
      var state = strm.state;
      if (state.window === null) {
        state.wsize = 1 << state.wbits;
        state.wnext = 0;
        state.whave = 0;
        state.window = new utils.Buf8(state.wsize);
      }
      if (copy >= state.wsize) {
        utils.arraySet(state.window, src, end - state.wsize, state.wsize, 0);
        state.wnext = 0;
        state.whave = state.wsize;
      } else {
        dist = state.wsize - state.wnext;
        if (dist > copy) {
          dist = copy;
        }
        utils.arraySet(state.window, src, end - copy, dist, state.wnext);
        copy -= dist;
        if (copy) {
          utils.arraySet(state.window, src, end - copy, copy, 0);
          state.wnext = copy;
          state.whave = state.wsize;
        } else {
          state.wnext += dist;
          if (state.wnext === state.wsize) {
            state.wnext = 0;
          }
          if (state.whave < state.wsize) {
            state.whave += dist;
          }
        }
      }
      return 0;
    }
    function inflate2(strm, flush) {
      var state;
      var input, output;
      var next;
      var put;
      var have, left;
      var hold;
      var bits;
      var _in, _out;
      var copy;
      var from;
      var from_source;
      var here = 0;
      var here_bits, here_op, here_val;
      var last_bits, last_op, last_val;
      var len;
      var ret;
      var hbuf = new utils.Buf8(4);
      var opts;
      var n;
      var order = (
        /* permutation of code lengths */
        [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
      );
      if (!strm || !strm.state || !strm.output || !strm.input && strm.avail_in !== 0) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      if (state.mode === TYPE) {
        state.mode = TYPEDO;
      }
      put = strm.next_out;
      output = strm.output;
      left = strm.avail_out;
      next = strm.next_in;
      input = strm.input;
      have = strm.avail_in;
      hold = state.hold;
      bits = state.bits;
      _in = have;
      _out = left;
      ret = Z_OK;
      inf_leave:
        for (; ; ) {
          switch (state.mode) {
            case HEAD:
              if (state.wrap === 0) {
                state.mode = TYPEDO;
                break;
              }
              while (bits < 16) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if (state.wrap & 2 && hold === 35615) {
                state.check = 0;
                hbuf[0] = hold & 255;
                hbuf[1] = hold >>> 8 & 255;
                state.check = crc322(state.check, hbuf, 2, 0);
                hold = 0;
                bits = 0;
                state.mode = FLAGS;
                break;
              }
              state.flags = 0;
              if (state.head) {
                state.head.done = false;
              }
              if (!(state.wrap & 1) || /* check if zlib header allowed */
              (((hold & 255) << 8) + (hold >> 8)) % 31) {
                strm.msg = "incorrect header check";
                state.mode = BAD;
                break;
              }
              if ((hold & 15) !== Z_DEFLATED) {
                strm.msg = "unknown compression method";
                state.mode = BAD;
                break;
              }
              hold >>>= 4;
              bits -= 4;
              len = (hold & 15) + 8;
              if (state.wbits === 0) {
                state.wbits = len;
              } else if (len > state.wbits) {
                strm.msg = "invalid window size";
                state.mode = BAD;
                break;
              }
              state.dmax = 1 << len;
              strm.adler = state.check = 1;
              state.mode = hold & 512 ? DICTID : TYPE;
              hold = 0;
              bits = 0;
              break;
            case FLAGS:
              while (bits < 16) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              state.flags = hold;
              if ((state.flags & 255) !== Z_DEFLATED) {
                strm.msg = "unknown compression method";
                state.mode = BAD;
                break;
              }
              if (state.flags & 57344) {
                strm.msg = "unknown header flags set";
                state.mode = BAD;
                break;
              }
              if (state.head) {
                state.head.text = hold >> 8 & 1;
              }
              if (state.flags & 512) {
                hbuf[0] = hold & 255;
                hbuf[1] = hold >>> 8 & 255;
                state.check = crc322(state.check, hbuf, 2, 0);
              }
              hold = 0;
              bits = 0;
              state.mode = TIME;
            /* falls through */
            case TIME:
              while (bits < 32) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if (state.head) {
                state.head.time = hold;
              }
              if (state.flags & 512) {
                hbuf[0] = hold & 255;
                hbuf[1] = hold >>> 8 & 255;
                hbuf[2] = hold >>> 16 & 255;
                hbuf[3] = hold >>> 24 & 255;
                state.check = crc322(state.check, hbuf, 4, 0);
              }
              hold = 0;
              bits = 0;
              state.mode = OS;
            /* falls through */
            case OS:
              while (bits < 16) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if (state.head) {
                state.head.xflags = hold & 255;
                state.head.os = hold >> 8;
              }
              if (state.flags & 512) {
                hbuf[0] = hold & 255;
                hbuf[1] = hold >>> 8 & 255;
                state.check = crc322(state.check, hbuf, 2, 0);
              }
              hold = 0;
              bits = 0;
              state.mode = EXLEN;
            /* falls through */
            case EXLEN:
              if (state.flags & 1024) {
                while (bits < 16) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                state.length = hold;
                if (state.head) {
                  state.head.extra_len = hold;
                }
                if (state.flags & 512) {
                  hbuf[0] = hold & 255;
                  hbuf[1] = hold >>> 8 & 255;
                  state.check = crc322(state.check, hbuf, 2, 0);
                }
                hold = 0;
                bits = 0;
              } else if (state.head) {
                state.head.extra = null;
              }
              state.mode = EXTRA;
            /* falls through */
            case EXTRA:
              if (state.flags & 1024) {
                copy = state.length;
                if (copy > have) {
                  copy = have;
                }
                if (copy) {
                  if (state.head) {
                    len = state.head.extra_len - state.length;
                    if (!state.head.extra) {
                      state.head.extra = new Array(state.head.extra_len);
                    }
                    utils.arraySet(
                      state.head.extra,
                      input,
                      next,
                      // extra field is limited to 65536 bytes
                      // - no need for additional size check
                      copy,
                      /*len + copy > state.head.extra_max - len ? state.head.extra_max : copy,*/
                      len
                    );
                  }
                  if (state.flags & 512) {
                    state.check = crc322(state.check, input, copy, next);
                  }
                  have -= copy;
                  next += copy;
                  state.length -= copy;
                }
                if (state.length) {
                  break inf_leave;
                }
              }
              state.length = 0;
              state.mode = NAME;
            /* falls through */
            case NAME:
              if (state.flags & 2048) {
                if (have === 0) {
                  break inf_leave;
                }
                copy = 0;
                do {
                  len = input[next + copy++];
                  if (state.head && len && state.length < 65536) {
                    state.head.name += String.fromCharCode(len);
                  }
                } while (len && copy < have);
                if (state.flags & 512) {
                  state.check = crc322(state.check, input, copy, next);
                }
                have -= copy;
                next += copy;
                if (len) {
                  break inf_leave;
                }
              } else if (state.head) {
                state.head.name = null;
              }
              state.length = 0;
              state.mode = COMMENT;
            /* falls through */
            case COMMENT:
              if (state.flags & 4096) {
                if (have === 0) {
                  break inf_leave;
                }
                copy = 0;
                do {
                  len = input[next + copy++];
                  if (state.head && len && state.length < 65536) {
                    state.head.comment += String.fromCharCode(len);
                  }
                } while (len && copy < have);
                if (state.flags & 512) {
                  state.check = crc322(state.check, input, copy, next);
                }
                have -= copy;
                next += copy;
                if (len) {
                  break inf_leave;
                }
              } else if (state.head) {
                state.head.comment = null;
              }
              state.mode = HCRC;
            /* falls through */
            case HCRC:
              if (state.flags & 512) {
                while (bits < 16) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                if (hold !== (state.check & 65535)) {
                  strm.msg = "header crc mismatch";
                  state.mode = BAD;
                  break;
                }
                hold = 0;
                bits = 0;
              }
              if (state.head) {
                state.head.hcrc = state.flags >> 9 & 1;
                state.head.done = true;
              }
              strm.adler = state.check = 0;
              state.mode = TYPE;
              break;
            case DICTID:
              while (bits < 32) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              strm.adler = state.check = zswap32(hold);
              hold = 0;
              bits = 0;
              state.mode = DICT;
            /* falls through */
            case DICT:
              if (state.havedict === 0) {
                strm.next_out = put;
                strm.avail_out = left;
                strm.next_in = next;
                strm.avail_in = have;
                state.hold = hold;
                state.bits = bits;
                return Z_NEED_DICT;
              }
              strm.adler = state.check = 1;
              state.mode = TYPE;
            /* falls through */
            case TYPE:
              if (flush === Z_BLOCK || flush === Z_TREES) {
                break inf_leave;
              }
            /* falls through */
            case TYPEDO:
              if (state.last) {
                hold >>>= bits & 7;
                bits -= bits & 7;
                state.mode = CHECK;
                break;
              }
              while (bits < 3) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              state.last = hold & 1;
              hold >>>= 1;
              bits -= 1;
              switch (hold & 3) {
                case 0:
                  state.mode = STORED;
                  break;
                case 1:
                  fixedtables(state);
                  state.mode = LEN_;
                  if (flush === Z_TREES) {
                    hold >>>= 2;
                    bits -= 2;
                    break inf_leave;
                  }
                  break;
                case 2:
                  state.mode = TABLE;
                  break;
                case 3:
                  strm.msg = "invalid block type";
                  state.mode = BAD;
              }
              hold >>>= 2;
              bits -= 2;
              break;
            case STORED:
              hold >>>= bits & 7;
              bits -= bits & 7;
              while (bits < 32) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if ((hold & 65535) !== (hold >>> 16 ^ 65535)) {
                strm.msg = "invalid stored block lengths";
                state.mode = BAD;
                break;
              }
              state.length = hold & 65535;
              hold = 0;
              bits = 0;
              state.mode = COPY_;
              if (flush === Z_TREES) {
                break inf_leave;
              }
            /* falls through */
            case COPY_:
              state.mode = COPY;
            /* falls through */
            case COPY:
              copy = state.length;
              if (copy) {
                if (copy > have) {
                  copy = have;
                }
                if (copy > left) {
                  copy = left;
                }
                if (copy === 0) {
                  break inf_leave;
                }
                utils.arraySet(output, input, next, copy, put);
                have -= copy;
                next += copy;
                left -= copy;
                put += copy;
                state.length -= copy;
                break;
              }
              state.mode = TYPE;
              break;
            case TABLE:
              while (bits < 14) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              state.nlen = (hold & 31) + 257;
              hold >>>= 5;
              bits -= 5;
              state.ndist = (hold & 31) + 1;
              hold >>>= 5;
              bits -= 5;
              state.ncode = (hold & 15) + 4;
              hold >>>= 4;
              bits -= 4;
              if (state.nlen > 286 || state.ndist > 30) {
                strm.msg = "too many length or distance symbols";
                state.mode = BAD;
                break;
              }
              state.have = 0;
              state.mode = LENLENS;
            /* falls through */
            case LENLENS:
              while (state.have < state.ncode) {
                while (bits < 3) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                state.lens[order[state.have++]] = hold & 7;
                hold >>>= 3;
                bits -= 3;
              }
              while (state.have < 19) {
                state.lens[order[state.have++]] = 0;
              }
              state.lencode = state.lendyn;
              state.lenbits = 7;
              opts = { bits: state.lenbits };
              ret = inflate_table(CODES, state.lens, 0, 19, state.lencode, 0, state.work, opts);
              state.lenbits = opts.bits;
              if (ret) {
                strm.msg = "invalid code lengths set";
                state.mode = BAD;
                break;
              }
              state.have = 0;
              state.mode = CODELENS;
            /* falls through */
            case CODELENS:
              while (state.have < state.nlen + state.ndist) {
                for (; ; ) {
                  here = state.lencode[hold & (1 << state.lenbits) - 1];
                  here_bits = here >>> 24;
                  here_op = here >>> 16 & 255;
                  here_val = here & 65535;
                  if (here_bits <= bits) {
                    break;
                  }
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                if (here_val < 16) {
                  hold >>>= here_bits;
                  bits -= here_bits;
                  state.lens[state.have++] = here_val;
                } else {
                  if (here_val === 16) {
                    n = here_bits + 2;
                    while (bits < n) {
                      if (have === 0) {
                        break inf_leave;
                      }
                      have--;
                      hold += input[next++] << bits;
                      bits += 8;
                    }
                    hold >>>= here_bits;
                    bits -= here_bits;
                    if (state.have === 0) {
                      strm.msg = "invalid bit length repeat";
                      state.mode = BAD;
                      break;
                    }
                    len = state.lens[state.have - 1];
                    copy = 3 + (hold & 3);
                    hold >>>= 2;
                    bits -= 2;
                  } else if (here_val === 17) {
                    n = here_bits + 3;
                    while (bits < n) {
                      if (have === 0) {
                        break inf_leave;
                      }
                      have--;
                      hold += input[next++] << bits;
                      bits += 8;
                    }
                    hold >>>= here_bits;
                    bits -= here_bits;
                    len = 0;
                    copy = 3 + (hold & 7);
                    hold >>>= 3;
                    bits -= 3;
                  } else {
                    n = here_bits + 7;
                    while (bits < n) {
                      if (have === 0) {
                        break inf_leave;
                      }
                      have--;
                      hold += input[next++] << bits;
                      bits += 8;
                    }
                    hold >>>= here_bits;
                    bits -= here_bits;
                    len = 0;
                    copy = 11 + (hold & 127);
                    hold >>>= 7;
                    bits -= 7;
                  }
                  if (state.have + copy > state.nlen + state.ndist) {
                    strm.msg = "invalid bit length repeat";
                    state.mode = BAD;
                    break;
                  }
                  while (copy--) {
                    state.lens[state.have++] = len;
                  }
                }
              }
              if (state.mode === BAD) {
                break;
              }
              if (state.lens[256] === 0) {
                strm.msg = "invalid code -- missing end-of-block";
                state.mode = BAD;
                break;
              }
              state.lenbits = 9;
              opts = { bits: state.lenbits };
              ret = inflate_table(LENS, state.lens, 0, state.nlen, state.lencode, 0, state.work, opts);
              state.lenbits = opts.bits;
              if (ret) {
                strm.msg = "invalid literal/lengths set";
                state.mode = BAD;
                break;
              }
              state.distbits = 6;
              state.distcode = state.distdyn;
              opts = { bits: state.distbits };
              ret = inflate_table(DISTS, state.lens, state.nlen, state.ndist, state.distcode, 0, state.work, opts);
              state.distbits = opts.bits;
              if (ret) {
                strm.msg = "invalid distances set";
                state.mode = BAD;
                break;
              }
              state.mode = LEN_;
              if (flush === Z_TREES) {
                break inf_leave;
              }
            /* falls through */
            case LEN_:
              state.mode = LEN;
            /* falls through */
            case LEN:
              if (have >= 6 && left >= 258) {
                strm.next_out = put;
                strm.avail_out = left;
                strm.next_in = next;
                strm.avail_in = have;
                state.hold = hold;
                state.bits = bits;
                inflate_fast(strm, _out);
                put = strm.next_out;
                output = strm.output;
                left = strm.avail_out;
                next = strm.next_in;
                input = strm.input;
                have = strm.avail_in;
                hold = state.hold;
                bits = state.bits;
                if (state.mode === TYPE) {
                  state.back = -1;
                }
                break;
              }
              state.back = 0;
              for (; ; ) {
                here = state.lencode[hold & (1 << state.lenbits) - 1];
                here_bits = here >>> 24;
                here_op = here >>> 16 & 255;
                here_val = here & 65535;
                if (here_bits <= bits) {
                  break;
                }
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if (here_op && (here_op & 240) === 0) {
                last_bits = here_bits;
                last_op = here_op;
                last_val = here_val;
                for (; ; ) {
                  here = state.lencode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
                  here_bits = here >>> 24;
                  here_op = here >>> 16 & 255;
                  here_val = here & 65535;
                  if (last_bits + here_bits <= bits) {
                    break;
                  }
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                hold >>>= last_bits;
                bits -= last_bits;
                state.back += last_bits;
              }
              hold >>>= here_bits;
              bits -= here_bits;
              state.back += here_bits;
              state.length = here_val;
              if (here_op === 0) {
                state.mode = LIT;
                break;
              }
              if (here_op & 32) {
                state.back = -1;
                state.mode = TYPE;
                break;
              }
              if (here_op & 64) {
                strm.msg = "invalid literal/length code";
                state.mode = BAD;
                break;
              }
              state.extra = here_op & 15;
              state.mode = LENEXT;
            /* falls through */
            case LENEXT:
              if (state.extra) {
                n = state.extra;
                while (bits < n) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                state.length += hold & (1 << state.extra) - 1;
                hold >>>= state.extra;
                bits -= state.extra;
                state.back += state.extra;
              }
              state.was = state.length;
              state.mode = DIST;
            /* falls through */
            case DIST:
              for (; ; ) {
                here = state.distcode[hold & (1 << state.distbits) - 1];
                here_bits = here >>> 24;
                here_op = here >>> 16 & 255;
                here_val = here & 65535;
                if (here_bits <= bits) {
                  break;
                }
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if ((here_op & 240) === 0) {
                last_bits = here_bits;
                last_op = here_op;
                last_val = here_val;
                for (; ; ) {
                  here = state.distcode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
                  here_bits = here >>> 24;
                  here_op = here >>> 16 & 255;
                  here_val = here & 65535;
                  if (last_bits + here_bits <= bits) {
                    break;
                  }
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                hold >>>= last_bits;
                bits -= last_bits;
                state.back += last_bits;
              }
              hold >>>= here_bits;
              bits -= here_bits;
              state.back += here_bits;
              if (here_op & 64) {
                strm.msg = "invalid distance code";
                state.mode = BAD;
                break;
              }
              state.offset = here_val;
              state.extra = here_op & 15;
              state.mode = DISTEXT;
            /* falls through */
            case DISTEXT:
              if (state.extra) {
                n = state.extra;
                while (bits < n) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                state.offset += hold & (1 << state.extra) - 1;
                hold >>>= state.extra;
                bits -= state.extra;
                state.back += state.extra;
              }
              if (state.offset > state.dmax) {
                strm.msg = "invalid distance too far back";
                state.mode = BAD;
                break;
              }
              state.mode = MATCH;
            /* falls through */
            case MATCH:
              if (left === 0) {
                break inf_leave;
              }
              copy = _out - left;
              if (state.offset > copy) {
                copy = state.offset - copy;
                if (copy > state.whave) {
                  if (state.sane) {
                    strm.msg = "invalid distance too far back";
                    state.mode = BAD;
                    break;
                  }
                }
                if (copy > state.wnext) {
                  copy -= state.wnext;
                  from = state.wsize - copy;
                } else {
                  from = state.wnext - copy;
                }
                if (copy > state.length) {
                  copy = state.length;
                }
                from_source = state.window;
              } else {
                from_source = output;
                from = put - state.offset;
                copy = state.length;
              }
              if (copy > left) {
                copy = left;
              }
              left -= copy;
              state.length -= copy;
              do {
                output[put++] = from_source[from++];
              } while (--copy);
              if (state.length === 0) {
                state.mode = LEN;
              }
              break;
            case LIT:
              if (left === 0) {
                break inf_leave;
              }
              output[put++] = state.length;
              left--;
              state.mode = LEN;
              break;
            case CHECK:
              if (state.wrap) {
                while (bits < 32) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold |= input[next++] << bits;
                  bits += 8;
                }
                _out -= left;
                strm.total_out += _out;
                state.total += _out;
                if (_out) {
                  strm.adler = state.check = /*UPDATE(state.check, put - _out, _out);*/
                  state.flags ? crc322(state.check, output, _out, put - _out) : adler32(state.check, output, _out, put - _out);
                }
                _out = left;
                if ((state.flags ? hold : zswap32(hold)) !== state.check) {
                  strm.msg = "incorrect data check";
                  state.mode = BAD;
                  break;
                }
                hold = 0;
                bits = 0;
              }
              state.mode = LENGTH;
            /* falls through */
            case LENGTH:
              if (state.wrap && state.flags) {
                while (bits < 32) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                if (hold !== (state.total & 4294967295)) {
                  strm.msg = "incorrect length check";
                  state.mode = BAD;
                  break;
                }
                hold = 0;
                bits = 0;
              }
              state.mode = DONE;
            /* falls through */
            case DONE:
              ret = Z_STREAM_END;
              break inf_leave;
            case BAD:
              ret = Z_DATA_ERROR;
              break inf_leave;
            case MEM:
              return Z_MEM_ERROR;
            case SYNC:
            /* falls through */
            default:
              return Z_STREAM_ERROR;
          }
        }
      strm.next_out = put;
      strm.avail_out = left;
      strm.next_in = next;
      strm.avail_in = have;
      state.hold = hold;
      state.bits = bits;
      if (state.wsize || _out !== strm.avail_out && state.mode < BAD && (state.mode < CHECK || flush !== Z_FINISH)) {
        if (updatewindow(strm, strm.output, strm.next_out, _out - strm.avail_out)) {
          state.mode = MEM;
          return Z_MEM_ERROR;
        }
      }
      _in -= strm.avail_in;
      _out -= strm.avail_out;
      strm.total_in += _in;
      strm.total_out += _out;
      state.total += _out;
      if (state.wrap && _out) {
        strm.adler = state.check = /*UPDATE(state.check, strm.next_out - _out, _out);*/
        state.flags ? crc322(state.check, output, _out, strm.next_out - _out) : adler32(state.check, output, _out, strm.next_out - _out);
      }
      strm.data_type = state.bits + (state.last ? 64 : 0) + (state.mode === TYPE ? 128 : 0) + (state.mode === LEN_ || state.mode === COPY_ ? 256 : 0);
      if ((_in === 0 && _out === 0 || flush === Z_FINISH) && ret === Z_OK) {
        ret = Z_BUF_ERROR;
      }
      return ret;
    }
    function inflateEnd(strm) {
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      var state = strm.state;
      if (state.window) {
        state.window = null;
      }
      strm.state = null;
      return Z_OK;
    }
    function inflateGetHeader(strm, head) {
      var state;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      if ((state.wrap & 2) === 0) {
        return Z_STREAM_ERROR;
      }
      state.head = head;
      head.done = false;
      return Z_OK;
    }
    function inflateSetDictionary(strm, dictionary) {
      var dictLength = dictionary.length;
      var state;
      var dictid;
      var ret;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      if (state.wrap !== 0 && state.mode !== DICT) {
        return Z_STREAM_ERROR;
      }
      if (state.mode === DICT) {
        dictid = 1;
        dictid = adler32(dictid, dictionary, dictLength, 0);
        if (dictid !== state.check) {
          return Z_DATA_ERROR;
        }
      }
      ret = updatewindow(strm, dictionary, dictLength, dictLength);
      if (ret) {
        state.mode = MEM;
        return Z_MEM_ERROR;
      }
      state.havedict = 1;
      return Z_OK;
    }
    exports.inflateReset = inflateReset;
    exports.inflateReset2 = inflateReset2;
    exports.inflateResetKeep = inflateResetKeep;
    exports.inflateInit = inflateInit;
    exports.inflateInit2 = inflateInit2;
    exports.inflate = inflate2;
    exports.inflateEnd = inflateEnd;
    exports.inflateGetHeader = inflateGetHeader;
    exports.inflateSetDictionary = inflateSetDictionary;
    exports.inflateInfo = "pako inflate (from Nodeca project)";
  }
});

// node_modules/pako/lib/zlib/constants.js
var require_constants2 = __commonJS({
  "node_modules/pako/lib/zlib/constants.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    module2.exports = {
      /* Allowed flush values; see deflate() and inflate() below for details */
      Z_NO_FLUSH: 0,
      Z_PARTIAL_FLUSH: 1,
      Z_SYNC_FLUSH: 2,
      Z_FULL_FLUSH: 3,
      Z_FINISH: 4,
      Z_BLOCK: 5,
      Z_TREES: 6,
      /* Return codes for the compression/decompression functions. Negative values
      * are errors, positive values are used for special but normal events.
      */
      Z_OK: 0,
      Z_STREAM_END: 1,
      Z_NEED_DICT: 2,
      Z_ERRNO: -1,
      Z_STREAM_ERROR: -2,
      Z_DATA_ERROR: -3,
      //Z_MEM_ERROR:     -4,
      Z_BUF_ERROR: -5,
      //Z_VERSION_ERROR: -6,
      /* compression levels */
      Z_NO_COMPRESSION: 0,
      Z_BEST_SPEED: 1,
      Z_BEST_COMPRESSION: 9,
      Z_DEFAULT_COMPRESSION: -1,
      Z_FILTERED: 1,
      Z_HUFFMAN_ONLY: 2,
      Z_RLE: 3,
      Z_FIXED: 4,
      Z_DEFAULT_STRATEGY: 0,
      /* Possible values of the data_type field (though see inflate()) */
      Z_BINARY: 0,
      Z_TEXT: 1,
      //Z_ASCII:                1, // = Z_TEXT (deprecated)
      Z_UNKNOWN: 2,
      /* The deflate compression method */
      Z_DEFLATED: 8
      //Z_NULL:                 null // Use -1 or null inline, depending on var type
    };
  }
});

// node_modules/pako/lib/zlib/gzheader.js
var require_gzheader = __commonJS({
  "node_modules/pako/lib/zlib/gzheader.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    function GZheader() {
      this.text = 0;
      this.time = 0;
      this.xflags = 0;
      this.os = 0;
      this.extra = null;
      this.extra_len = 0;
      this.name = "";
      this.comment = "";
      this.hcrc = 0;
      this.done = false;
    }
    module2.exports = GZheader;
  }
});

// node_modules/pako/lib/inflate.js
var require_inflate2 = __commonJS({
  "node_modules/pako/lib/inflate.js"(exports) {
    "use strict";
    init_git_buffer();
    var zlib_inflate = require_inflate();
    var utils = require_common();
    var strings = require_strings();
    var c = require_constants2();
    var msg = require_messages();
    var ZStream = require_zstream();
    var GZheader = require_gzheader();
    var toString = Object.prototype.toString;
    function Inflate(options) {
      if (!(this instanceof Inflate)) return new Inflate(options);
      this.options = utils.assign({
        chunkSize: 16384,
        windowBits: 0,
        to: ""
      }, options || {});
      var opt = this.options;
      if (opt.raw && opt.windowBits >= 0 && opt.windowBits < 16) {
        opt.windowBits = -opt.windowBits;
        if (opt.windowBits === 0) {
          opt.windowBits = -15;
        }
      }
      if (opt.windowBits >= 0 && opt.windowBits < 16 && !(options && options.windowBits)) {
        opt.windowBits += 32;
      }
      if (opt.windowBits > 15 && opt.windowBits < 48) {
        if ((opt.windowBits & 15) === 0) {
          opt.windowBits |= 15;
        }
      }
      this.err = 0;
      this.msg = "";
      this.ended = false;
      this.chunks = [];
      this.strm = new ZStream();
      this.strm.avail_out = 0;
      var status = zlib_inflate.inflateInit2(
        this.strm,
        opt.windowBits
      );
      if (status !== c.Z_OK) {
        throw new Error(msg[status]);
      }
      this.header = new GZheader();
      zlib_inflate.inflateGetHeader(this.strm, this.header);
      if (opt.dictionary) {
        if (typeof opt.dictionary === "string") {
          opt.dictionary = strings.string2buf(opt.dictionary);
        } else if (toString.call(opt.dictionary) === "[object ArrayBuffer]") {
          opt.dictionary = new Uint8Array(opt.dictionary);
        }
        if (opt.raw) {
          status = zlib_inflate.inflateSetDictionary(this.strm, opt.dictionary);
          if (status !== c.Z_OK) {
            throw new Error(msg[status]);
          }
        }
      }
    }
    Inflate.prototype.push = function(data, mode) {
      var strm = this.strm;
      var chunkSize = this.options.chunkSize;
      var dictionary = this.options.dictionary;
      var status, _mode;
      var next_out_utf8, tail, utf8str;
      var allowBufError = false;
      if (this.ended) {
        return false;
      }
      _mode = mode === ~~mode ? mode : mode === true ? c.Z_FINISH : c.Z_NO_FLUSH;
      if (typeof data === "string") {
        strm.input = strings.binstring2buf(data);
      } else if (toString.call(data) === "[object ArrayBuffer]") {
        strm.input = new Uint8Array(data);
      } else {
        strm.input = data;
      }
      strm.next_in = 0;
      strm.avail_in = strm.input.length;
      do {
        if (strm.avail_out === 0) {
          strm.output = new utils.Buf8(chunkSize);
          strm.next_out = 0;
          strm.avail_out = chunkSize;
        }
        status = zlib_inflate.inflate(strm, c.Z_NO_FLUSH);
        if (status === c.Z_NEED_DICT && dictionary) {
          status = zlib_inflate.inflateSetDictionary(this.strm, dictionary);
        }
        if (status === c.Z_BUF_ERROR && allowBufError === true) {
          status = c.Z_OK;
          allowBufError = false;
        }
        if (status !== c.Z_STREAM_END && status !== c.Z_OK) {
          this.onEnd(status);
          this.ended = true;
          return false;
        }
        if (strm.next_out) {
          if (strm.avail_out === 0 || status === c.Z_STREAM_END || strm.avail_in === 0 && (_mode === c.Z_FINISH || _mode === c.Z_SYNC_FLUSH)) {
            if (this.options.to === "string") {
              next_out_utf8 = strings.utf8border(strm.output, strm.next_out);
              tail = strm.next_out - next_out_utf8;
              utf8str = strings.buf2string(strm.output, next_out_utf8);
              strm.next_out = tail;
              strm.avail_out = chunkSize - tail;
              if (tail) {
                utils.arraySet(strm.output, strm.output, next_out_utf8, tail, 0);
              }
              this.onData(utf8str);
            } else {
              this.onData(utils.shrinkBuf(strm.output, strm.next_out));
            }
          }
        }
        if (strm.avail_in === 0 && strm.avail_out === 0) {
          allowBufError = true;
        }
      } while ((strm.avail_in > 0 || strm.avail_out === 0) && status !== c.Z_STREAM_END);
      if (status === c.Z_STREAM_END) {
        _mode = c.Z_FINISH;
      }
      if (_mode === c.Z_FINISH) {
        status = zlib_inflate.inflateEnd(this.strm);
        this.onEnd(status);
        this.ended = true;
        return status === c.Z_OK;
      }
      if (_mode === c.Z_SYNC_FLUSH) {
        this.onEnd(c.Z_OK);
        strm.avail_out = 0;
        return true;
      }
      return true;
    };
    Inflate.prototype.onData = function(chunk) {
      this.chunks.push(chunk);
    };
    Inflate.prototype.onEnd = function(status) {
      if (status === c.Z_OK) {
        if (this.options.to === "string") {
          this.result = this.chunks.join("");
        } else {
          this.result = utils.flattenChunks(this.chunks);
        }
      }
      this.chunks = [];
      this.err = status;
      this.msg = this.strm.msg;
    };
    function inflate2(input, options) {
      var inflator = new Inflate(options);
      inflator.push(input, true);
      if (inflator.err) {
        throw inflator.msg || msg[inflator.err];
      }
      return inflator.result;
    }
    function inflateRaw(input, options) {
      options = options || {};
      options.raw = true;
      return inflate2(input, options);
    }
    exports.Inflate = Inflate;
    exports.inflate = inflate2;
    exports.inflateRaw = inflateRaw;
    exports.ungzip = inflate2;
  }
});

// node_modules/pako/index.js
var require_pako = __commonJS({
  "node_modules/pako/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var assign = require_common().assign;
    var deflate = require_deflate2();
    var inflate2 = require_inflate2();
    var constants = require_constants2();
    var pako2 = {};
    assign(pako2, deflate, inflate2, constants);
    module2.exports = pako2;
  }
});

// node_modules/pify/index.js
var require_pify = __commonJS({
  "node_modules/pify/index.js"(exports, module2) {
    "use strict";
    init_git_buffer();
    var processFn = (fn, options) => function(...args) {
      const P = options.promiseModule;
      return new P((resolve, reject) => {
        if (options.multiArgs) {
          args.push((...result) => {
            if (options.errorFirst) {
              if (result[0]) {
                reject(result);
              } else {
                result.shift();
                resolve(result);
              }
            } else {
              resolve(result);
            }
          });
        } else if (options.errorFirst) {
          args.push((error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          });
        } else {
          args.push(resolve);
        }
        fn.apply(this, args);
      });
    };
    module2.exports = (input, options) => {
      options = Object.assign({
        exclude: [/.+(Sync|Stream)$/],
        errorFirst: true,
        promiseModule: Promise
      }, options);
      const objType = typeof input;
      if (!(input !== null && (objType === "object" || objType === "function"))) {
        throw new TypeError(`Expected \`input\` to be a \`Function\` or \`Object\`, got \`${input === null ? "null" : objType}\``);
      }
      const filter = (key) => {
        const match = (pattern) => typeof pattern === "string" ? key === pattern : pattern.test(key);
        return options.include ? options.include.some(match) : !options.exclude.some(match);
      };
      let ret;
      if (objType === "function") {
        ret = function(...args) {
          return options.excludeMain ? input(...args) : processFn(input, options).apply(this, args);
        };
      } else {
        ret = Object.create(Object.getPrototypeOf(input));
      }
      for (const key in input) {
        const property = input[key];
        ret[key] = typeof property === "function" && filter(key) ? processFn(property, options) : property;
      }
      return ret;
    };
  }
});

// node_modules/ignore/index.js
var require_ignore = __commonJS({
  "node_modules/ignore/index.js"(exports, module2) {
    init_git_buffer();
    function makeArray(subject) {
      return Array.isArray(subject) ? subject : [subject];
    }
    var EMPTY = "";
    var SPACE = " ";
    var ESCAPE = "\\";
    var REGEX_TEST_BLANK_LINE = /^\s+$/;
    var REGEX_INVALID_TRAILING_BACKSLASH = /(?:[^\\]|^)\\$/;
    var REGEX_REPLACE_LEADING_EXCAPED_EXCLAMATION = /^\\!/;
    var REGEX_REPLACE_LEADING_EXCAPED_HASH = /^\\#/;
    var REGEX_SPLITALL_CRLF = /\r?\n/g;
    var REGEX_TEST_INVALID_PATH = /^\.*\/|^\.+$/;
    var SLASH = "/";
    var TMP_KEY_IGNORE = "node-ignore";
    if (typeof Symbol !== "undefined") {
      TMP_KEY_IGNORE = Symbol.for("node-ignore");
    }
    var KEY_IGNORE = TMP_KEY_IGNORE;
    var define2 = (object2, key, value) => Object.defineProperty(object2, key, { value });
    var REGEX_REGEXP_RANGE = /([0-z])-([0-z])/g;
    var RETURN_FALSE = () => false;
    var sanitizeRange = (range) => range.replace(
      REGEX_REGEXP_RANGE,
      (match, from, to) => from.charCodeAt(0) <= to.charCodeAt(0) ? match : EMPTY
    );
    var cleanRangeBackSlash = (slashes) => {
      const { length } = slashes;
      return slashes.slice(0, length - length % 2);
    };
    var REPLACERS = [
      [
        // remove BOM
        // TODO:
        // Other similar zero-width characters?
        /^\uFEFF/,
        () => EMPTY
      ],
      // > Trailing spaces are ignored unless they are quoted with backslash ("\")
      [
        // (a\ ) -> (a )
        // (a  ) -> (a)
        // (a ) -> (a)
        // (a \ ) -> (a  )
        /((?:\\\\)*?)(\\?\s+)$/,
        (_, m1, m2) => m1 + (m2.indexOf("\\") === 0 ? SPACE : EMPTY)
      ],
      // replace (\ ) with ' '
      // (\ ) -> ' '
      // (\\ ) -> '\\ '
      // (\\\ ) -> '\\ '
      [
        /(\\+?)\s/g,
        (_, m1) => {
          const { length } = m1;
          return m1.slice(0, length - length % 2) + SPACE;
        }
      ],
      // Escape metacharacters
      // which is written down by users but means special for regular expressions.
      // > There are 12 characters with special meanings:
      // > - the backslash \,
      // > - the caret ^,
      // > - the dollar sign $,
      // > - the period or dot .,
      // > - the vertical bar or pipe symbol |,
      // > - the question mark ?,
      // > - the asterisk or star *,
      // > - the plus sign +,
      // > - the opening parenthesis (,
      // > - the closing parenthesis ),
      // > - and the opening square bracket [,
      // > - the opening curly brace {,
      // > These special characters are often called "metacharacters".
      [
        /[\\$.|*+(){^]/g,
        (match) => `\\${match}`
      ],
      [
        // > a question mark (?) matches a single character
        /(?!\\)\?/g,
        () => "[^/]"
      ],
      // leading slash
      [
        // > A leading slash matches the beginning of the pathname.
        // > For example, "/*.c" matches "cat-file.c" but not "mozilla-sha1/sha1.c".
        // A leading slash matches the beginning of the pathname
        /^\//,
        () => "^"
      ],
      // replace special metacharacter slash after the leading slash
      [
        /\//g,
        () => "\\/"
      ],
      [
        // > A leading "**" followed by a slash means match in all directories.
        // > For example, "**/foo" matches file or directory "foo" anywhere,
        // > the same as pattern "foo".
        // > "**/foo/bar" matches file or directory "bar" anywhere that is directly
        // >   under directory "foo".
        // Notice that the '*'s have been replaced as '\\*'
        /^\^*\\\*\\\*\\\//,
        // '**/foo' <-> 'foo'
        () => "^(?:.*\\/)?"
      ],
      // starting
      [
        // there will be no leading '/'
        //   (which has been replaced by section "leading slash")
        // If starts with '**', adding a '^' to the regular expression also works
        /^(?=[^^])/,
        function startingReplacer() {
          return !/\/(?!$)/.test(this) ? "(?:^|\\/)" : "^";
        }
      ],
      // two globstars
      [
        // Use lookahead assertions so that we could match more than one `'/**'`
        /\\\/\\\*\\\*(?=\\\/|$)/g,
        // Zero, one or several directories
        // should not use '*', or it will be replaced by the next replacer
        // Check if it is not the last `'/**'`
        (_, index, str) => index + 6 < str.length ? "(?:\\/[^\\/]+)*" : "\\/.+"
      ],
      // normal intermediate wildcards
      [
        // Never replace escaped '*'
        // ignore rule '\*' will match the path '*'
        // 'abc.*/' -> go
        // 'abc.*'  -> skip this rule,
        //    coz trailing single wildcard will be handed by [trailing wildcard]
        /(^|[^\\]+)(\\\*)+(?=.+)/g,
        // '*.js' matches '.js'
        // '*.js' doesn't match 'abc'
        (_, p1, p2) => {
          const unescaped = p2.replace(/\\\*/g, "[^\\/]*");
          return p1 + unescaped;
        }
      ],
      [
        // unescape, revert step 3 except for back slash
        // For example, if a user escape a '\\*',
        // after step 3, the result will be '\\\\\\*'
        /\\\\\\(?=[$.|*+(){^])/g,
        () => ESCAPE
      ],
      [
        // '\\\\' -> '\\'
        /\\\\/g,
        () => ESCAPE
      ],
      [
        // > The range notation, e.g. [a-zA-Z],
        // > can be used to match one of the characters in a range.
        // `\` is escaped by step 3
        /(\\)?\[([^\]/]*?)(\\*)($|\])/g,
        (match, leadEscape, range, endEscape, close) => leadEscape === ESCAPE ? `\\[${range}${cleanRangeBackSlash(endEscape)}${close}` : close === "]" ? endEscape.length % 2 === 0 ? `[${sanitizeRange(range)}${endEscape}]` : "[]" : "[]"
      ],
      // ending
      [
        // 'js' will not match 'js.'
        // 'ab' will not match 'abc'
        /(?:[^*])$/,
        // WTF!
        // https://git-scm.com/docs/gitignore
        // changes in [2.22.1](https://git-scm.com/docs/gitignore/2.22.1)
        // which re-fixes #24, #38
        // > If there is a separator at the end of the pattern then the pattern
        // > will only match directories, otherwise the pattern can match both
        // > files and directories.
        // 'js*' will not match 'a.js'
        // 'js/' will not match 'a.js'
        // 'js' will match 'a.js' and 'a.js/'
        (match) => /\/$/.test(match) ? `${match}$` : `${match}(?=$|\\/$)`
      ],
      // trailing wildcard
      [
        /(\^|\\\/)?\\\*$/,
        (_, p1) => {
          const prefix = p1 ? `${p1}[^/]+` : "[^/]*";
          return `${prefix}(?=$|\\/$)`;
        }
      ]
    ];
    var regexCache = /* @__PURE__ */ Object.create(null);
    var makeRegex = (pattern, ignoreCase) => {
      let source = regexCache[pattern];
      if (!source) {
        source = REPLACERS.reduce(
          (prev, [matcher, replacer]) => prev.replace(matcher, replacer.bind(pattern)),
          pattern
        );
        regexCache[pattern] = source;
      }
      return ignoreCase ? new RegExp(source, "i") : new RegExp(source);
    };
    var isString = (subject) => typeof subject === "string";
    var checkPattern = (pattern) => pattern && isString(pattern) && !REGEX_TEST_BLANK_LINE.test(pattern) && !REGEX_INVALID_TRAILING_BACKSLASH.test(pattern) && pattern.indexOf("#") !== 0;
    var splitPattern = (pattern) => pattern.split(REGEX_SPLITALL_CRLF);
    var IgnoreRule = class {
      constructor(origin, pattern, negative, regex) {
        this.origin = origin;
        this.pattern = pattern;
        this.negative = negative;
        this.regex = regex;
      }
    };
    var createRule = (pattern, ignoreCase) => {
      const origin = pattern;
      let negative = false;
      if (pattern.indexOf("!") === 0) {
        negative = true;
        pattern = pattern.substr(1);
      }
      pattern = pattern.replace(REGEX_REPLACE_LEADING_EXCAPED_EXCLAMATION, "!").replace(REGEX_REPLACE_LEADING_EXCAPED_HASH, "#");
      const regex = makeRegex(pattern, ignoreCase);
      return new IgnoreRule(
        origin,
        pattern,
        negative,
        regex
      );
    };
    var throwError = (message, Ctor) => {
      throw new Ctor(message);
    };
    var checkPath = (path, originalPath, doThrow) => {
      if (!isString(path)) {
        return doThrow(
          `path must be a string, but got \`${originalPath}\``,
          TypeError
        );
      }
      if (!path) {
        return doThrow(`path must not be empty`, TypeError);
      }
      if (checkPath.isNotRelative(path)) {
        const r = "`path.relative()`d";
        return doThrow(
          `path should be a ${r} string, but got "${originalPath}"`,
          RangeError
        );
      }
      return true;
    };
    var isNotRelative = (path) => REGEX_TEST_INVALID_PATH.test(path);
    checkPath.isNotRelative = isNotRelative;
    checkPath.convert = (p) => p;
    var Ignore = class {
      constructor({
        ignorecase = true,
        ignoreCase = ignorecase,
        allowRelativePaths = false
      } = {}) {
        define2(this, KEY_IGNORE, true);
        this._rules = [];
        this._ignoreCase = ignoreCase;
        this._allowRelativePaths = allowRelativePaths;
        this._initCache();
      }
      _initCache() {
        this._ignoreCache = /* @__PURE__ */ Object.create(null);
        this._testCache = /* @__PURE__ */ Object.create(null);
      }
      _addPattern(pattern) {
        if (pattern && pattern[KEY_IGNORE]) {
          this._rules = this._rules.concat(pattern._rules);
          this._added = true;
          return;
        }
        if (checkPattern(pattern)) {
          const rule = createRule(pattern, this._ignoreCase);
          this._added = true;
          this._rules.push(rule);
        }
      }
      // @param {Array<string> | string | Ignore} pattern
      add(pattern) {
        this._added = false;
        makeArray(
          isString(pattern) ? splitPattern(pattern) : pattern
        ).forEach(this._addPattern, this);
        if (this._added) {
          this._initCache();
        }
        return this;
      }
      // legacy
      addPattern(pattern) {
        return this.add(pattern);
      }
      //          |           ignored : unignored
      // negative |   0:0   |   0:1   |   1:0   |   1:1
      // -------- | ------- | ------- | ------- | --------
      //     0    |  TEST   |  TEST   |  SKIP   |    X
      //     1    |  TESTIF |  SKIP   |  TEST   |    X
      // - SKIP: always skip
      // - TEST: always test
      // - TESTIF: only test if checkUnignored
      // - X: that never happen
      // @param {boolean} whether should check if the path is unignored,
      //   setting `checkUnignored` to `false` could reduce additional
      //   path matching.
      // @returns {TestResult} true if a file is ignored
      _testOne(path, checkUnignored) {
        let ignored = false;
        let unignored = false;
        this._rules.forEach((rule) => {
          const { negative } = rule;
          if (unignored === negative && ignored !== unignored || negative && !ignored && !unignored && !checkUnignored) {
            return;
          }
          const matched = rule.regex.test(path);
          if (matched) {
            ignored = !negative;
            unignored = negative;
          }
        });
        return {
          ignored,
          unignored
        };
      }
      // @returns {TestResult}
      _test(originalPath, cache, checkUnignored, slices) {
        const path = originalPath && checkPath.convert(originalPath);
        checkPath(
          path,
          originalPath,
          this._allowRelativePaths ? RETURN_FALSE : throwError
        );
        return this._t(path, cache, checkUnignored, slices);
      }
      _t(path, cache, checkUnignored, slices) {
        if (path in cache) {
          return cache[path];
        }
        if (!slices) {
          slices = path.split(SLASH);
        }
        slices.pop();
        if (!slices.length) {
          return cache[path] = this._testOne(path, checkUnignored);
        }
        const parent2 = this._t(
          slices.join(SLASH) + SLASH,
          cache,
          checkUnignored,
          slices
        );
        return cache[path] = parent2.ignored ? parent2 : this._testOne(path, checkUnignored);
      }
      ignores(path) {
        return this._test(path, this._ignoreCache, false).ignored;
      }
      createFilter() {
        return (path) => !this.ignores(path);
      }
      filter(paths) {
        return makeArray(paths).filter(this.createFilter());
      }
      // @returns {TestResult}
      test(path) {
        return this._test(path, this._testCache, true);
      }
    };
    var factory = (options) => new Ignore(options);
    var isPathValid = (path) => checkPath(path && checkPath.convert(path), path, RETURN_FALSE);
    factory.isPathValid = isPathValid;
    factory.default = factory;
    module2.exports = factory;
    if (
      // Detect `process` so that it can run in browsers.
      typeof process !== "undefined" && (process.env && process.env.IGNORE_TEST_WIN32 || process.platform === "win32")
    ) {
      const makePosix = (str) => /^\\\\\?\\/.test(str) || /["<>|\u0000-\u001F]+/u.test(str) ? str : str.replace(/\\/g, "/");
      checkPath.convert = makePosix;
      const REGIX_IS_WINDOWS_PATH_ABSOLUTE = /^[a-z]:\//i;
      checkPath.isNotRelative = (path) => REGIX_IS_WINDOWS_PATH_ABSOLUTE.test(path) || isNotRelative(path);
    }
  }
});

// node_modules/diff3/onp.js
var require_onp = __commonJS({
  "node_modules/diff3/onp.js"(exports, module2) {
    init_git_buffer();
    module2.exports = function(a_, b_) {
      var a = a_, b = b_, m = a.length, n = b.length, reverse = false, ed = null, offset = m + 1, path = [], pathposi = [], ses = [], lcs = "", SES_DELETE = -1, SES_COMMON = 0, SES_ADD = 1;
      var tmp1, tmp2;
      var init2 = function() {
        if (m >= n) {
          tmp1 = a;
          tmp2 = m;
          a = b;
          b = tmp1;
          m = n;
          n = tmp2;
          reverse = true;
          offset = m + 1;
        }
      };
      var P = function(x, y, k) {
        return {
          "x": x,
          "y": y,
          "k": k
        };
      };
      var seselem = function(elem, t) {
        return {
          "elem": elem,
          "t": t
        };
      };
      var snake = function(k, p, pp) {
        var r, x, y;
        if (p > pp) {
          r = path[k - 1 + offset];
        } else {
          r = path[k + 1 + offset];
        }
        y = Math.max(p, pp);
        x = y - k;
        while (x < m && y < n && a[x] === b[y]) {
          ++x;
          ++y;
        }
        path[k + offset] = pathposi.length;
        pathposi[pathposi.length] = new P(x, y, r);
        return y;
      };
      var recordseq = function(epc) {
        var x_idx, y_idx, px_idx, py_idx, i;
        x_idx = y_idx = 1;
        px_idx = py_idx = 0;
        for (i = epc.length - 1; i >= 0; --i) {
          while (px_idx < epc[i].x || py_idx < epc[i].y) {
            if (epc[i].y - epc[i].x > py_idx - px_idx) {
              if (reverse) {
                ses[ses.length] = new seselem(b[py_idx], SES_DELETE);
              } else {
                ses[ses.length] = new seselem(b[py_idx], SES_ADD);
              }
              ++y_idx;
              ++py_idx;
            } else if (epc[i].y - epc[i].x < py_idx - px_idx) {
              if (reverse) {
                ses[ses.length] = new seselem(a[px_idx], SES_ADD);
              } else {
                ses[ses.length] = new seselem(a[px_idx], SES_DELETE);
              }
              ++x_idx;
              ++px_idx;
            } else {
              ses[ses.length] = new seselem(a[px_idx], SES_COMMON);
              lcs += a[px_idx];
              ++x_idx;
              ++y_idx;
              ++px_idx;
              ++py_idx;
            }
          }
        }
      };
      init2();
      return {
        SES_DELETE: -1,
        SES_COMMON: 0,
        SES_ADD: 1,
        editdistance: function() {
          return ed;
        },
        getlcs: function() {
          return lcs;
        },
        getses: function() {
          return ses;
        },
        compose: function() {
          var delta, size, fp, p, r, epc, i, k;
          delta = n - m;
          size = m + n + 3;
          fp = {};
          for (i = 0; i < size; ++i) {
            fp[i] = -1;
            path[i] = -1;
          }
          p = -1;
          do {
            ++p;
            for (k = -p; k <= delta - 1; ++k) {
              fp[k + offset] = snake(k, fp[k - 1 + offset] + 1, fp[k + 1 + offset]);
            }
            for (k = delta + p; k >= delta + 1; --k) {
              fp[k + offset] = snake(k, fp[k - 1 + offset] + 1, fp[k + 1 + offset]);
            }
            fp[delta + offset] = snake(delta, fp[delta - 1 + offset] + 1, fp[delta + 1 + offset]);
          } while (fp[delta + offset] !== n);
          ed = delta + 2 * p;
          r = path[delta + offset];
          epc = [];
          while (r !== -1) {
            epc[epc.length] = new P(pathposi[r].x, pathposi[r].y, null);
            r = pathposi[r].k;
          }
          recordseq(epc);
        }
      };
    };
  }
});

// node_modules/diff3/diff3.js
var require_diff3 = __commonJS({
  "node_modules/diff3/diff3.js"(exports, module2) {
    init_git_buffer();
    var onp = require_onp();
    function longestCommonSubsequence(file1, file2) {
      var diff = new onp(file1, file2);
      diff.compose();
      var ses = diff.getses();
      var root;
      var prev;
      var file1RevIdx = file1.length - 1, file2RevIdx = file2.length - 1;
      for (var i = ses.length - 1; i >= 0; --i) {
        if (ses[i].t === diff.SES_COMMON) {
          if (prev) {
            prev.chain = {
              file1index: file1RevIdx,
              file2index: file2RevIdx,
              chain: null
            };
            prev = prev.chain;
          } else {
            root = {
              file1index: file1RevIdx,
              file2index: file2RevIdx,
              chain: null
            };
            prev = root;
          }
          file1RevIdx--;
          file2RevIdx--;
        } else if (ses[i].t === diff.SES_DELETE) {
          file1RevIdx--;
        } else if (ses[i].t === diff.SES_ADD) {
          file2RevIdx--;
        }
      }
      var tail = {
        file1index: -1,
        file2index: -1,
        chain: null
      };
      if (!prev) {
        return tail;
      }
      prev.chain = tail;
      return root;
    }
    function diffIndices(file1, file2) {
      var result = [];
      var tail1 = file1.length;
      var tail2 = file2.length;
      for (var candidate = longestCommonSubsequence(file1, file2); candidate !== null; candidate = candidate.chain) {
        var mismatchLength1 = tail1 - candidate.file1index - 1;
        var mismatchLength2 = tail2 - candidate.file2index - 1;
        tail1 = candidate.file1index;
        tail2 = candidate.file2index;
        if (mismatchLength1 || mismatchLength2) {
          result.push({
            file1: [tail1 + 1, mismatchLength1],
            file2: [tail2 + 1, mismatchLength2]
          });
        }
      }
      result.reverse();
      return result;
    }
    function diff3MergeIndices(a, o, b) {
      var i;
      var m1 = diffIndices(o, a);
      var m2 = diffIndices(o, b);
      var hunks = [];
      function addHunk(h, side2) {
        hunks.push([h.file1[0], side2, h.file1[1], h.file2[0], h.file2[1]]);
      }
      for (i = 0; i < m1.length; i++) {
        addHunk(m1[i], 0);
      }
      for (i = 0; i < m2.length; i++) {
        addHunk(m2[i], 2);
      }
      hunks.sort(function(x, y) {
        return x[0] - y[0];
      });
      var result = [];
      var commonOffset = 0;
      function copyCommon(targetOffset) {
        if (targetOffset > commonOffset) {
          result.push([1, commonOffset, targetOffset - commonOffset]);
          commonOffset = targetOffset;
        }
      }
      for (var hunkIndex = 0; hunkIndex < hunks.length; hunkIndex++) {
        var firstHunkIndex = hunkIndex;
        var hunk = hunks[hunkIndex];
        var regionLhs = hunk[0];
        var regionRhs = regionLhs + hunk[2];
        while (hunkIndex < hunks.length - 1) {
          var maybeOverlapping = hunks[hunkIndex + 1];
          var maybeLhs = maybeOverlapping[0];
          if (maybeLhs > regionRhs) break;
          regionRhs = Math.max(regionRhs, maybeLhs + maybeOverlapping[2]);
          hunkIndex++;
        }
        copyCommon(regionLhs);
        if (firstHunkIndex == hunkIndex) {
          if (hunk[4] > 0) {
            result.push([hunk[1], hunk[3], hunk[4]]);
          }
        } else {
          var regions = {
            0: [a.length, -1, o.length, -1],
            2: [b.length, -1, o.length, -1]
          };
          for (i = firstHunkIndex; i <= hunkIndex; i++) {
            hunk = hunks[i];
            var side = hunk[1];
            var r = regions[side];
            var oLhs = hunk[0];
            var oRhs = oLhs + hunk[2];
            var abLhs = hunk[3];
            var abRhs = abLhs + hunk[4];
            r[0] = Math.min(abLhs, r[0]);
            r[1] = Math.max(abRhs, r[1]);
            r[2] = Math.min(oLhs, r[2]);
            r[3] = Math.max(oRhs, r[3]);
          }
          var aLhs = regions[0][0] + (regionLhs - regions[0][2]);
          var aRhs = regions[0][1] + (regionRhs - regions[0][3]);
          var bLhs = regions[2][0] + (regionLhs - regions[2][2]);
          var bRhs = regions[2][1] + (regionRhs - regions[2][3]);
          result.push([
            -1,
            aLhs,
            aRhs - aLhs,
            regionLhs,
            regionRhs - regionLhs,
            bLhs,
            bRhs - bLhs
          ]);
        }
        commonOffset = regionRhs;
      }
      copyCommon(o.length);
      return result;
    }
    function diff3Merge2(a, o, b) {
      var result = [];
      var files = [a, o, b];
      var indices = diff3MergeIndices(a, o, b);
      var okLines = [];
      function flushOk() {
        if (okLines.length) {
          result.push({
            ok: okLines
          });
        }
        okLines = [];
      }
      function pushOk(xs) {
        for (var j = 0; j < xs.length; j++) {
          okLines.push(xs[j]);
        }
      }
      function isTrueConflict(rec) {
        if (rec[2] != rec[6]) return true;
        var aoff = rec[1];
        var boff = rec[5];
        for (var j = 0; j < rec[2]; j++) {
          if (a[j + aoff] != b[j + boff]) return true;
        }
        return false;
      }
      for (var i = 0; i < indices.length; i++) {
        var x = indices[i];
        var side = x[0];
        if (side == -1) {
          if (!isTrueConflict(x)) {
            pushOk(files[0].slice(x[1], x[1] + x[2]));
          } else {
            flushOk();
            result.push({
              conflict: {
                a: a.slice(x[1], x[1] + x[2]),
                aIndex: x[1],
                o: o.slice(x[3], x[3] + x[4]),
                oIndex: x[3],
                b: b.slice(x[5], x[5] + x[6]),
                bIndex: x[5]
              }
            });
          }
        } else {
          pushOk(files[side].slice(x[1], x[1] + x[2]));
        }
      }
      flushOk();
      return result;
    }
    module2.exports = diff3Merge2;
  }
});

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => RefSync
});
module.exports = __toCommonJS(main_exports);
init_git_buffer();

// src/config-scope.ts
init_git_buffer();
var import_posix = __toESM(require_posix());

// src/model.ts
init_git_buffer();
var defaults = {
  id: "local",
  name: "RefSync",
  enabled: true,
  inheritMode: true,
  startup: true,
  startupSeconds: 5,
  intervalMinutes: 5,
  onFocus: true,
  onOnline: true,
  debounceSeconds: 2,
  quietSeconds: 5,
  maxDeferrals: 3,
  include: "",
  exclude: "",
  maxMiB: 0,
  maxDeleteCount: 100,
  maxDeletePercent: 50,
  shrinkPercent: 50,
  deleteGrace: 5,
  trash: "plugin",
  trashDays: 30,
  role: "subscriber",
  scope: "content",
  access: "local",
  local: "RefSync-copy",
  reference: "RefSync-reference",
  mirror: "preserve",
  deletions: false,
  conflict: "source",
  backup: true,
  emptyGuard: true,
  mode: "plan",
  firstPlan: false,
  fileEvents: false,
  watch: false,
  strictDrift: false
};
var fresh = () => ({
  entries: /* @__PURE__ */ Object.create(null),
  size: 0,
  lastRun: ""
});
var join = (a, b) => a && b ? a + "/" + b : a || b;
var parent = (p) => p.slice(0, Math.max(0, p.lastIndexOf("/")));
var fold = (v) => v.normalize("NFC").toLowerCase();
var under = (p, base) => !base || p === base || p.startsWith(base + "/");
function safe(p) {
  return p.length < 1024 && p.split("/").every(
    (s) => s.length > 0 && s.length <= 255 && !/[<>:"\\|?*\x00-\x1F\x7F]/.test(s) && !/[. ]$/.test(s) && !/^(con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(
      s
    )
  );
}
function checked(p) {
  if (!safe(p)) throw Error("path");
  return p;
}
async function hash(b) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", b)),
    (v) => v.toString(16).padStart(2, "0")
  ).join("");
}

// src/config-scope.ts
var categories = [
  "core",
  "appearance",
  "themes",
  "snippets",
  "community",
  "code",
  "data",
  "extras"
];
function preset(name) {
  switch (name) {
    case "look":
      return ["appearance", "themes", "snippets"];
    case "plugins":
      return ["code", "community"];
    case "noData":
      return categories.filter((c) => c !== "data" && c !== "extras");
    case "full":
      return categories.filter((c) => c !== "extras");
    default:
      return ["core", "appearance", "themes", "snippets", "community", "data"];
  }
}
var legacyConfig = () => ({
  categories: preset("legacy"),
  codeAllow: "",
  codeDeny: "",
  dataAllow: "",
  dataDeny: "",
  include: "",
  exclude: "",
  overlay: "",
  platformFilter: true,
  strategy: "changes",
  reload: "next",
  idleSeconds: 30,
  legacyThemes: true
});
function category(path) {
  const [dir, id, ...tail] = fold(path).split("/");
  if (!id && dir.endsWith(".json"))
    return dir === "appearance.json" ? "appearance" : dir === "community-plugins.json" ? "community" : "core";
  if (dir === "themes" && tail.length) return "themes";
  if (dir === "snippets" && path.endsWith(".css")) return "snippets";
  if (dir !== "plugins" || !id || !tail.length) return;
  const file = tail.join("/");
  return file === "data.json" ? "data" : ["main.js", "manifest.json", "styles.css"].includes(file) ? "code" : "extras";
}
var terms = (s) => s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
var matches = (path, patterns) => terms(patterns).some(
  (pattern) => import_posix.default.isMatch(path, pattern, {
    nonegate: true,
    noextglob: true,
    nobrace: true,
    nocase: true
  })
);
function inScope(path, c, directory) {
  path = fold(path);
  if (directory)
    return /^(themes|snippets|plugins)(\/|$)/.test(path) || !!c.include;
  const cat = category(path), custom = matches(path, c.include);
  if (!custom && (!cat || !c.categories.includes(cat))) return false;
  if (c.legacyThemes && cat === "themes" && !custom && !/^themes\/[^/]+\/(manifest\.json|theme\.css)$/.test(path))
    return false;
  if (matches(path, c.exclude)) return false;
  const id = path.startsWith("plugins/") ? path.split("/")[1] : void 0;
  if (!id) return true;
  const [allow, deny] = cat === "data" ? [c.dataAllow, c.dataDeny] : [c.codeAllow, c.codeDeny];
  return (!allow.trim() || matches(id, allow)) && !matches(id, deny);
}
async function mobileExcluded(source, target, budget) {
  const blocked = /* @__PURE__ */ new Set();
  for (const store of [source, target]) {
    if (!await budget.io(() => store.stat("plugins"))) continue;
    const dirs = await budget.io(() => store.list("plugins"));
    for (const folder of dirs.folders) {
      if (!/^plugins\/[^/]+$/.test(folder)) throw Error("path");
      const path = folder + "/manifest.json";
      if (!await budget.io(() => store.stat(path))) continue;
      const m = JSON.parse(
        new TextDecoder().decode(await budget.io(() => store.download(path)))
      );
      if (m.isDesktopOnly === true) blocked.add(fold(folder.split("/")[1]));
    }
  }
  return [...blocked];
}
function validConfig(c) {
  return !!c && Array.isArray(c.categories) && c.categories.every((k) => categories.includes(k)) && [
    "codeAllow",
    "codeDeny",
    "dataAllow",
    "dataDeny",
    "include",
    "exclude",
    "overlay"
  ].every(
    (k) => typeof c[k] === "string" && String(c[k]).length <= 8192
  ) && typeof c.platformFilter === "boolean" && typeof c.legacyThemes === "boolean" && ["batch", "changes"].includes(c.strategy) && ["now", "next", "idle", "never"].includes(c.reload) && Number.isInteger(c.idleSeconds) && c.idleSeconds >= 1 && c.idleSeconds <= 3600;
}

// src/hot-config.ts
init_git_buffer();
async function withPluginData(app, self, path, write) {
  const id = /^plugins\/([^/]+)\/data\.json$/.exec(path)?.[1];
  const host = app.plugins;
  if (!id || id === self || !host?.plugins?.[id] || typeof host.disablePlugin !== "function" || typeof host.enablePlugin !== "function" || host.isEnabled?.() === false) {
    await write();
    return;
  }
  await host.disablePlugin(id);
  try {
    await write();
  } finally {
    await host.enablePlugin(id);
  }
}
function reloadApp(app) {
  const commands2 = app.commands;
  if (!commands2?.executeCommandById?.("app:reload"))
    throw Error("reloadUnavailable");
}

// src/verify-settings.ts
init_git_buffer();

// src/json-overlay.ts
init_git_buffer();
var import_posix2 = __toESM(require_posix());
function parseOverlay(text) {
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const split = line.indexOf("=>");
    if (split < 1) throw Error("overlaySyntax");
    const file = line.slice(0, split).trim(), expr = line.slice(split + 2).trim().replace(/^\$\./, "").replace(/\[(\*|[0-9]+)\]/g, ".$1");
    const keys = expr.split(".");
    if (!file || keys.some((k) => !k || k !== "*" && !/^[\p{L}\p{N}_$-]+$/u.test(k)))
      throw Error("overlaySyntax");
    return { file, keys };
  });
}
var record = (x) => !!x && typeof x === "object" && !Array.isArray(x);
function combine(source, local, rules) {
  if (rules.some((r) => !r.length)) return local;
  const obj = record(source) || source === void 0 && record(local), array = Array.isArray(source) || source === void 0 && Array.isArray(local);
  if (!obj && !array) return source;
  const result = /* @__PURE__ */ Object.create(null);
  const a = obj && record(source) || array && Array.isArray(source) ? source : {};
  const b = obj && record(local) || array && Array.isArray(local) ? local : {};
  for (const key of [
    .../* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b)])
  ].sort()) {
    const next = rules.filter((r) => r[0] === key || r[0] === "*").map((r) => r.slice(1));
    const value = combine(
      Object.hasOwn(a, key) ? a[key] : void 0,
      next.length && Object.hasOwn(b, key) ? b[key] : void 0,
      next
    );
    if (value !== void 0) result[key] = value;
  }
  if (!Object.keys(result).length && (source === void 0 || rules.length && Object.keys(a).length > 0 && !local))
    return void 0;
  if (array) {
    const out = [];
    for (const k of Object.keys(result)) out[Number(k)] = result[k];
    return out;
  }
  return result;
}
var decode = (b) => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(b));
var encode = (v) => new TextEncoder().encode(JSON.stringify(v) + "\n").buffer;
function project(path, bytes, policy, local, keepSelf = false) {
  if (!path.toLowerCase().endsWith(".json")) return bytes;
  const src = decode(bytes), rules = policy.rules.filter((r) => import_posix2.default.isMatch(path, r.file, { nocase: true })).map((r) => r.keys);
  if (fold(path) === "community-plugins.json") {
    if (!Array.isArray(src) || src.some((id) => typeof id !== "string"))
      throw Error("invalidConfig");
    const ids = src.filter(
      (id) => fold(id) !== fold(policy.self) && !policy.blocked.includes(fold(id))
    );
    const old2 = local ? decode(local) : null;
    if (keepSelf || Array.isArray(old2) && old2.includes(policy.self))
      ids.push(policy.self);
    return encode([...new Set(ids)].sort());
  }
  const old = rules.length && local ? decode(local) : void 0;
  return encode(
    combine(src, old, rules) ?? (Array.isArray(src) ? [] : record(src) ? {} : src)
  );
}
var settingsHash = (path, bytes, policy) => hash(project(path, bytes, policy));
function deliveryBytes(path, bytes, policy, local, keepSelf = false) {
  if (fold(path) !== "community-plugins.json" && !policy.rules.some((r) => import_posix2.default.isMatch(path, r.file, { nocase: true })))
    return bytes;
  return project(path, bytes, policy, local, keepSelf);
}

// src/runtime.ts
init_git_buffer();
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function transient(e) {
  if (!e || typeof e !== "object") return false;
  const message = ("code" in e ? String(e.code) + " " : "") + ("message" in e ? String(e.message) : "");
  return /\b(?:EBUSY|EPERM|EACCES|indexPending|readTimeout)\b/.test(message);
}
var registryKey = Symbol.for("refsync.pending-mutations.v1");
var registryHost = globalThis;
var MutationFence = class _MutationFence {
  pending = false;
  previousInstance = Promise.resolve();
  static forVault(vault) {
    const registry = registryHost[registryKey] ??= /* @__PURE__ */ new WeakMap();
    let fence = registry.get(vault);
    if (!fence) {
      fence = new _MutationFence();
      registry.set(vault, fence);
    }
    return fence;
  }
  quarantine(operation) {
    this.pending = true;
    const clear = () => {
      this.pending = false;
    };
    void operation.then(clear, clear);
  }
  check() {
    if (this.pending) throw Error("settling");
  }
};
var RunBudget = class {
  constructor(deadline = Date.now() + 3e5, operationMs = 15e3, backoff = [250, 500, 1e3], fence = new MutationFence()) {
    this.deadline = deadline;
    this.operationMs = operationMs;
    this.backoff = backoff;
    this.fence = fence;
  }
  check() {
    this.fence.check();
    if (Date.now() >= this.deadline) throw Error("watchdog");
  }
  async io(work, read = true) {
    for (let i = 0; ; i++) {
      this.check();
      let timer;
      try {
        const operation = work();
        return await Promise.race([
          operation,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => {
                if (!read) this.fence.quarantine(operation);
                reject(Error(read ? "readTimeout" : "settling"));
              },
              Math.min(this.operationMs, this.deadline - Date.now())
            );
          })
        ]);
      } catch (e) {
        if (!transient(e) || i >= this.backoff.length) throw e;
      } finally {
        clearTimeout(timer);
      }
      await sleep(this.backoff[i]);
    }
  }
};
var QuietWindow = class {
  edits = /* @__PURE__ */ new Map();
  attempts = /* @__PURE__ */ new Map();
  edited(path, now = Date.now()) {
    this.edits.set(path, now);
  }
  check(p, path, open, now = Date.now()) {
    const key = JSON.stringify([p.id, p.local, path]), time = this.edits.get(join(p.local, path));
    if (!open || time === void 0 || now - time >= 1e3 * p.quietSeconds) {
      this.attempts.delete(key);
      return false;
    }
    const n = this.attempts.get(key) ?? 0;
    if (n >= p.maxDeferrals) {
      return false;
    }
    this.attempts.set(key, n + 1);
    return true;
  }
  clear() {
    this.edits.clear();
    this.attempts.clear();
  }
};
var NoticeCenter = class {
  constructor(show, clock = Date.now) {
    this.show = show;
    this.clock = clock;
  }
  times = /* @__PURE__ */ new Map();
  send(key, message) {
    const now = this.clock();
    for (const [k, t] of this.times) if (now - t >= 6e4) this.times.delete(k);
    if (this.times.has(key)) return;
    this.times.set(key, now);
    this.show(message);
  }
};
var Scheduler = class {
  constructor(run, failed) {
    this.run = run;
    this.failed = failed;
  }
  tail = Promise.resolve();
  pending = /* @__PURE__ */ new Map();
  queued = /* @__PURE__ */ new Set();
  stopped = false;
  serial(job) {
    const next = this.tail.then(() => {
      if (this.stopped) throw Error("stopped");
      return job();
    });
    this.tail = next.then(
      () => {
      },
      () => {
      }
    );
    return next;
  }
  schedule(id, ms = 0) {
    if (this.stopped) return;
    clearTimeout(this.pending.get(id));
    this.pending.set(
      id,
      setTimeout(() => {
        this.pending.delete(id);
        if (this.queued.has(id)) return;
        this.queued.add(id);
        void this.serial(async () => {
          this.queued.delete(id);
          await this.run(id);
        }).catch((e) => {
          if (!this.stopped) this.failed(e);
        });
      }, ms)
    );
  }
  cancel(id) {
    clearTimeout(this.pending.get(id));
    this.pending.delete(id);
  }
  stop() {
    this.stopped = true;
    for (const id of this.pending.keys()) this.cancel(id);
    return this.tail;
  }
};
function eventPath(p, path) {
  if (!p.enabled || p.scope !== "content" || !p.fileEvents || path.split("/").some((s) => s.startsWith(".")))
    return false;
  return (p.access === "local" ? [p.reference, p.local] : [p.local]).some(
    (root) => under(path, root === "/" ? "" : root)
  );
}

// src/verify-settings.ts
var needsReload = (p) => !["snippets", "data"].includes(category(p) ?? "core");
async function verifySettings(journal, target, current, budget = new RunBudget()) {
  const reports = [], covered = /* @__PURE__ */ new Set();
  const transactions = (await journal.transactions()).filter((t) => t.settings?.local).sort((a, b) => b.settings.at - a.settings.at);
  for (const t of transactions) {
    if (!await journal.disk.has(t.id + "/done") || await journal.disk.has(t.id + "/rolled-back"))
      continue;
    const cfg = current(t), policy = t.settings.projection, paths = [];
    const undone = await journal.disk.has(t.id + "/undo-start");
    for (const [i, step] of t.steps.entries()) {
      if (await journal.disk.has(t.id + "/skipped/" + i)) continue;
      const key = JSON.stringify([t.target, step.path]);
      if (covered.has(key)) continue;
      covered.add(key);
      if (!undone && cfg && inScope(step.path, cfg, false)) paths.push(i);
    }
    if (undone || !cfg || await journal.disk.has(t.id + "/verified") || await journal.disk.has(t.id + "/verify-failed"))
      continue;
    const store = target(t), report = { id: t.id, repaired: 0, unresolved: [] };
    const read = async (path) => await budget.io(() => store.stat(path)) ? await budget.io(() => store.download(path)) : null;
    const equivalent = async (path, local, expected, projection) => {
      if (!local || !expected) return local === expected;
      try {
        return await settingsHash(path, local, projection) === await settingsHash(path, expected, projection);
      } catch {
        return false;
      }
    };
    for (const i of paths) {
      const step = t.steps[i], path = step.path, expected = step.action === "delete" ? null : await journal.disk.read(t.id + "/stage/" + i);
      if (expected && await hash(expected) !== step.digest)
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
              () => store.upload(
                path,
                deliveryBytes(path, expected, policy, old, true),
                step.mtime
              ),
              false
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
      t.id + (report.unresolved.length ? "/verify-failed" : "/verified")
    );
    if (!report.unresolved.length) {
      await journal.disk.removeTree(t.id + "/stage");
      await journal.disk.removeTree(t.id + "/unchanged");
    }
    reports.push(report);
  }
  return reports;
}

// src/reload-manager.ts
init_git_buffer();
function canAutoReload(history, now = Date.now()) {
  const recent = history.filter((v) => v > now - 36e5);
  return recent.length < 2 && recent.every((v) => v <= now - 3e5);
}

// src/main.ts
var import_obsidian6 = require("obsidian");

// src/profiles.ts
init_git_buffer();
var object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function loadProfiles(raw) {
  let profiles = [];
  let current = "", mode = "plan", paused = false;
  if (object(raw) && Array.isArray(raw.profiles)) {
    const ids = /* @__PURE__ */ new Set();
    for (const entry of raw.profiles) {
      if (!object(entry) || typeof entry.id !== "string" || ids.has(entry.id))
        throw Error("invalid");
      ids.add(entry.id);
      profiles.push({ ...defaults, ...entry });
    }
    current = String(raw.current);
    mode = raw.mode === "silent" ? "silent" : "plan";
    paused = raw.paused === true;
  } else if (object(raw) && object(raw.profile)) {
    profiles = [
      {
        ...defaults,
        startup: false,
        onFocus: false,
        onOnline: false,
        intervalMinutes: 0,
        inheritMode: false,
        trash: "vault",
        ...raw.profile
      }
    ];
  } else
    profiles = [
      {
        ...defaults,
        startup: false,
        onFocus: false,
        onOnline: false,
        intervalMinutes: 0
      }
    ];
  for (const p of profiles) {
    if (p.scope === "settings" && p.config === void 0) {
      p.config = legacyConfig();
      p.startup = false;
      p.intervalMinutes = 0;
      p.onFocus = false;
      p.onOnline = false;
    }
  }
  return {
    version: 2,
    profiles,
    current: profiles.some((p) => p.id === current) ? current : profiles[0]?.id ?? "",
    mode,
    paused
  };
}
function newProfile(copy) {
  const id = crypto.randomUUID(), tag = id.slice(0, 6);
  return copy ? { ...structuredClone(copy), id, name: copy.name + " (2)", enabled: false } : {
    ...defaults,
    id,
    name: "RefSync " + tag,
    local: "RefSync-copy-" + tag,
    reference: "RefSync-reference-" + tag,
    enabled: false,
    fileEvents: true
  };
}

// src/applier.ts
init_git_buffer();
var decoder = new TextDecoder();
var Applier = class {
  constructor(journal, state, fence = new MutationFence()) {
    this.journal = journal;
    this.state = state;
    this.fence = fence;
  }
  needsRecovery = false;
  async restore(t, target, start = 0, end = t.steps.length) {
    const budget = new RunBudget(void 0, void 0, void 0, this.fence);
    for (let i = end - 1; i >= start; i--) {
      const p = t.steps[i].path, armed = t.id + "/armed/" + i;
      if (!await this.journal.disk.has(armed) || await this.journal.disk.has(t.id + "/skipped/" + i))
        continue;
      const perform = async () => {
        const saved = await this.journal.json(armed);
        const stat = await budget.io(() => target.stat(p));
        if (stat?.type === "folder") throw Error("collision");
        if (saved === null) {
          if (stat) await budget.io(() => target.delete(p), false);
        } else {
          const bytes = await this.journal.disk.read(t.id + "/backup/" + i);
          if (await hash(bytes) !== saved) throw Error("backup");
          if (!stat || await hash(await budget.io(() => target.download(p))) !== saved)
            await budget.io(() => target.upload(p, bytes), false);
        }
      };
      if (target.withFilePaused) await target.withFilePaused(p, perform);
      else await perform();
    }
  }
  async recover(resolve) {
    this.fence.check();
    for (const t of await this.journal.transactions()) {
      if (await this.journal.disk.has(t.id + "/undo-start") && !await this.journal.disk.has(t.id + "/undo-done")) {
        await this.restore(t, resolve(t));
        this.state.put(t.key, t.before);
        await this.journal.mark(t.id + "/undo-done");
        continue;
      }
      if (await this.journal.disk.has(t.id + "/done") || await this.journal.disk.has(t.id + "/rolled-back"))
        continue;
      if (this.state.get(t.key).lastRun === t.id) {
        await this.journal.mark(t.id + "/done");
        continue;
      }
      await this.restore(t, resolve(t));
      await this.journal.mark(t.id + "/rolled-back");
    }
    this.needsRecovery = false;
  }
  async undo(key, target, resolve) {
    this.fence.check();
    this.needsRecovery = true;
    const last = this.state.get(key).lastRun;
    const t = (await this.journal.transactions()).find(
      (v) => v.key === key && v.id === last
    );
    if (!t) throw Error("noBackup");
    await this.journal.mark(t.id + "/undo-start");
    await this.restore(t, resolve ? resolve(t) : target);
    this.state.put(key, t.before);
    await this.journal.mark(t.id + "/undo-done");
    this.needsRecovery = false;
  }
  async apply(profile, plan2, source, target, key, targetPath, budget = new RunBudget(void 0, void 0, void 0, this.fence), progress, active, projection) {
    this.fence.check();
    if (this.needsRecovery) throw Error("journal");
    const checkpoint = () => {
      budget.check();
      if (active && !active()) throw Error("stopped");
    };
    const cfg = profile.config ?? legacyConfig();
    const batch = profile.scope === "settings" && cfg.strategy === "batch";
    if (batch && plan2.deferred.some((x) => x.reason === "locked"))
      throw Error("incomplete");
    const previous = this.state.get(key);
    const next = {
      ...fresh(),
      size: plan2.held.length ? previous.size : plan2.count,
      lastRun: previous.lastRun
    };
    Object.assign(next.entries, previous.entries);
    for (const path of plan2.forgotten) delete next.entries[path];
    const id = crypto.randomUUID(), steps = [];
    const stage = async (path, bytes, mtime) => {
      const digest2 = await hash(bytes);
      await this.journal.disk.putNew(id + "/stage/" + steps.length, bytes);
      steps.push({ path, action: "write", mtime, digest: digest2 });
    };
    const stageBatch = batch && plan2.ops.some((x) => x.action === "write" || x.action === "delete");
    const displaced = /* @__PURE__ */ new Map();
    try {
      for (const op of plan2.ops) {
        checkpoint();
        const p = op.path, s = op.source, b = Object.hasOwn(previous.entries, p) ? previous.entries[p] : void 0;
        if (op.action === "delete") {
          steps.push({ path: p, action: "delete" });
          delete next.entries[p];
          continue;
        }
        if (!s) throw Error("incomplete");
        if (op.action === "retain") {
          next.entries[p] = {
            size: b?.size ?? 0,
            mtime: b?.mtime ?? 0,
            hash: b?.hash ?? "",
            applied: b?.applied ?? "",
            seen: s.hash,
            delivered: b?.delivered ?? false
          };
          continue;
        }
        if (stageBatch && op.action === "ack") {
          const bytes = await budget.io(() => source.download(p));
          if (await hash(bytes) !== (s.rawHash ?? s.hash))
            throw Error("referenceChanged");
          await this.journal.disk.putNew(
            id + "/unchanged/" + await hash(new TextEncoder().encode(p).buffer),
            projection ? deliveryBytes(p, bytes, projection) : bytes
          );
        }
        if (op.action === "write" || op.action === "both") {
          let bytes;
          try {
            bytes = await budget.io(() => source.download(p));
          } catch (e) {
            if (batch || !transient(e)) throw e;
            plan2.deferred.push({ path: p, reason: "locked" });
            continue;
          }
          if (bytes.byteLength !== s.size || await hash(bytes) !== (s.rawHash ?? s.hash)) {
            if (profile.role === "publisher") {
              plan2.deferred.push({ path: p, reason: "unstable" });
              continue;
            }
            throw Error("referenceChanged");
          }
          if (profile.scope === "settings" && p.endsWith(".json"))
            JSON.parse(decoder.decode(bytes));
          if (op.action === "both") {
            const dot = p.lastIndexOf("."), cut = dot > p.lastIndexOf("/") + 1 ? dot : p.length;
            const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
            const copy = p.slice(0, cut) + ".conflict-" + this.state.device + "-" + stamp + p.slice(cut);
            if (await target.stat(copy)) throw Error("collision");
            displaced.set(copy, p);
            steps.push({ path: copy, action: "write" });
          }
          await stage(
            p,
            projection ? deliveryBytes(p, bytes, projection) : bytes,
            s.mtime
          );
        }
        next.entries[p] = {
          size: s.size,
          mtime: s.mtime,
          hash: s.hash,
          applied: s.hash,
          seen: s.hash,
          delivered: op.action !== "ack" || b?.delivered === true
        };
      }
    } catch (e) {
      if (!this.fence.pending) await this.journal.disk.removeTree(id);
      throw e;
    }
    if (!steps.length) {
      this.state.put(key, next);
      return 0;
    }
    const t = {
      version: 1,
      id,
      key,
      target: targetPath,
      scope: profile.scope,
      settings: projection ? {
        config: cfg,
        projection,
        local: profile.role === "subscriber",
        at: Date.now()
      } : void 0,
      before: previous,
      steps
    };
    checkpoint();
    this.needsRecovery = true;
    await this.journal.begin(t);
    let changed = 0;
    try {
      for (let start = 0; start < steps.length; ) {
        const path = displaced.get(steps[start].path) ?? steps[start].path;
        const end = start + (displaced.has(steps[start].path) ? 2 : 1);
        try {
          for (let i = start; i < end; i++) {
            checkpoint();
            const step = steps[i];
            const perform = async () => {
              const stat = await budget.io(() => target.stat(step.path));
              if (stat?.type === "folder") throw Error("collision");
              const old = stat ? await budget.io(() => target.download(step.path)) : null;
              const copy = displaced.get(step.path);
              if (copy && stat) throw Error("collision");
              await this.journal.backup(id, i, old);
              if (step.action === "delete") {
                if (stat)
                  await budget.io(async () => {
                    if (await target.stat(step.path))
                      await target.delete(step.path);
                  }, false);
              } else {
                const bytes = copy ? await budget.io(() => target.download(copy)) : await this.journal.disk.read(id + "/stage/" + i);
                if (step.digest && await hash(bytes) !== step.digest)
                  throw Error("incomplete");
                await budget.io(
                  () => target.upload(
                    step.path,
                    projection ? deliveryBytes(
                      step.path,
                      bytes,
                      projection,
                      old,
                      profile.role === "subscriber"
                    ) : bytes,
                    step.mtime
                  ),
                  false
                );
              }
            };
            if (target.withFilePaused)
              await target.withFilePaused(step.path, perform);
            else await perform();
            await this.journal.mark(id + "/applied/" + i);
          }
          changed += end - start;
        } catch (e) {
          if (batch || !transient(e)) throw e;
          await this.restore(t, target, start, end);
          for (let i = start; i < end; i++)
            await this.journal.mark(id + "/skipped/" + i);
          if (Object.hasOwn(previous.entries, path))
            next.entries[path] = previous.entries[path];
          else delete next.entries[path];
          plan2.deferred.push({ path, reason: "locked" });
        }
        progress?.(end, steps.length);
        start = end;
      }
      if (changed) next.lastRun = id;
      this.state.put(key, next);
    } catch (e) {
      budget.fence.check();
      this.fence.check();
      await this.restore(t, target);
      await this.journal.mark(id + "/rolled-back");
      this.needsRecovery = false;
      throw e;
    }
    await this.journal.mark(id + "/done");
    this.needsRecovery = false;
    return changed;
  }
};

// src/state.ts
init_git_buffer();
var StateStore = class {
  constructor(port) {
    this.port = port;
    const current = port.get("device");
    this.device = typeof current === "string" && /^[a-f0-9-]{36}$/.test(current) ? current : crypto.randomUUID();
    port.set("device", this.device);
  }
  device;
  get(key) {
    const raw = this.port.get("state:" + this.device + ":" + key);
    if (raw == null) return fresh();
    if (typeof raw !== "object" || !("entries" in raw) || typeof raw.entries !== "object" || !raw.entries || !("size" in raw) || typeof raw.size !== "number" || !("lastRun" in raw) || typeof raw.lastRun !== "string")
      throw Error("state");
    return structuredClone(raw);
  }
  put(key, value) {
    this.port.set("state:" + this.device + ":" + key, value);
  }
};
var TimedArtifacts = class {
  constructor(disk, fence) {
    this.disk = disk;
    this.fence = fence;
  }
  io(work, read = true) {
    return new RunBudget(void 0, void 0, [], this.fence).io(work, read);
  }
  putNew(path, data) {
    return this.io(() => this.disk.putNew(path, data), false);
  }
  read(path) {
    return this.io(() => this.disk.read(path));
  }
  has(path) {
    return this.io(() => this.disk.has(path));
  }
  dirs() {
    return this.io(() => this.disk.dirs());
  }
  removeTree(path) {
    return this.io(() => this.disk.removeTree(path), false);
  }
};
var enc = (x) => new TextEncoder().encode(JSON.stringify(x)).buffer;
var ApplyJournal = class {
  constructor(disk) {
    this.disk = disk;
  }
  async json(p) {
    return JSON.parse(new TextDecoder().decode(await this.disk.read(p)));
  }
  mark(p) {
    return this.disk.putNew(p, enc(true));
  }
  async begin(t) {
    await this.disk.putNew(t.id + "/intent.json", enc(t));
  }
  async backup(id, i, bytes) {
    if (bytes !== null) await this.disk.putNew(id + "/backup/" + i, bytes);
    await this.disk.putNew(
      id + "/armed/" + i,
      enc(bytes === null ? null : await hash(bytes))
    );
  }
  async transactions() {
    const out = [];
    for (const id of await this.disk.dirs()) {
      if (!/^[0-9a-f-]{36}$/.test(id)) continue;
      if (!await this.disk.has(id + "/intent.json")) {
        await this.disk.removeTree(id);
        continue;
      }
      const t = await this.json(id + "/intent.json");
      if (t.version !== 1 || t.id !== id || !Array.isArray(t.steps) || !["content", "settings"].includes(t.scope))
        throw Error("journal");
      for (const step of t.steps) {
        checked(step.path);
        if (step.action !== "write" && step.action !== "delete")
          throw Error("journal");
      }
      out.push(t);
    }
    return out;
  }
};

// src/vault.ts
init_git_buffer();

// src/classifier.ts
init_git_buffer();
function volatility(p, scope) {
  if (scope === "content") return "S";
  p = fold(p);
  if (/^(workspace(?:-mobile)?\.json|cache(?:\/|$))$/.test(p) || p.startsWith("cache/") || p.endsWith(".lock") || p.split("/").some((x) => x === ".git" || x === "node_modules"))
    return "V";
  return /^(?:[^/]+\.json|plugins\/[^/]+\/data\.json)$/.test(p) ? "H" : "S";
}
function selected(p, scope, configDir, self, directory, config = legacyConfig()) {
  const f = fold(p);
  if (f.split("/").some(
    (s) => [".git", ".trash", ".sync-trash", "node_modules"].includes(s)
  ) || scope === "settings" && under(f, fold("plugins/" + self)) || under(f, fold(join(configDir, "plugins/" + self))))
    return false;
  if (scope === "content")
    return !under(f, fold(configDir)) && !p.split("/").some((s) => s.startsWith(".")) && !/(?:\.tmp$|(?:^|\/)(?:thumbs\.db|desktop\.ini)$)/i.test(p);
  if (volatility(p, scope) === "V" || p.split("/").some((s) => s.startsWith(".")))
    return false;
  return inScope(p, config, directory);
}
var priority = (p) => p === "community-plugins.json" ? 3 : p.includes("/") ? p.endsWith("/data.json") ? 1 : 0 : 2;

// src/vault.ts
var import_obsidian = require("obsidian");
async function ensure(adapter, dir) {
  if (!dir) return;
  const stat = await adapter.stat(dir);
  if (stat?.type === "folder") return;
  if (stat) throw Error("collision");
  await ensure(adapter, parent(dir));
  try {
    await adapter.mkdir(dir);
  } catch (e) {
    if ((await adapter.stat(dir))?.type !== "folder") throw e;
  }
}
var VaultArtifacts = class {
  constructor(adapter, root) {
    this.adapter = adapter;
    this.root = root;
  }
  path(p) {
    return join(this.root, checked(p));
  }
  async putNew(p, b) {
    const path = this.path(p);
    await ensure(this.adapter, parent(path));
    if (await this.adapter.exists(path)) throw Error("state");
    const tmp = path + ".tmp-" + crypto.randomUUID();
    await this.adapter.writeBinary(tmp, b);
    try {
      await this.adapter.rename(tmp, path);
    } finally {
      if (await this.adapter.exists(tmp)) await this.adapter.remove(tmp);
    }
  }
  read(p) {
    return this.adapter.readBinary(this.path(p));
  }
  has(p) {
    return this.adapter.exists(this.path(p));
  }
  async dirs() {
    if (!await this.adapter.exists(this.root)) return [];
    return (await this.adapter.list(this.root)).folders.map(
      (p) => p.slice(this.root.length + 1)
    );
  }
  async removeTree(p) {
    if (await this.has(p)) await this.adapter.rmdir(this.path(p), true);
  }
};
var LocalProvider = class {
  constructor(vault, root, self, scope, readOnly = false, policy = {
    trash: "vault",
    trashDays: 30
  }, ownWrite, config, withFilePaused) {
    this.vault = vault;
    this.root = root;
    this.self = self;
    this.scope = scope;
    this.policy = policy;
    this.ownWrite = ownWrite;
    this.config = config;
    this.withFilePaused = withFilePaused;
    if (root) checked(root);
    if (under(fold(root), fold(join(vault.configDir, "plugins/" + self))))
      throw Error("protected");
    this.id = "vault:" + root;
    this.capabilities = {
      readOnly,
      supportsChecksum: false,
      supportsChangesFeed: false,
      maxFileSize: Infinity,
      rateLimits: null
    };
  }
  id;
  capabilities;
  path(p) {
    return p ? join(this.root, checked(p)) : this.root;
  }
  indexed(path) {
    return !under(fold(path), fold(this.vault.configDir)) && !path.split("/").some((s) => s.startsWith("."));
  }
  writable(p, directory = false) {
    if (this.capabilities.readOnly || !selected(
      p,
      this.scope,
      this.vault.configDir,
      this.self,
      directory,
      this.config
    ))
      throw Error("protected");
    const path = this.path(p);
    if (under(
      fold(path),
      fold(join(this.vault.configDir, "plugins/" + this.self))
    ))
      throw Error("protected");
    return path;
  }
  async list(p) {
    const data = await this.vault.adapter.list(this.path(p) || "/");
    const rel = (f) => {
      if (this.root && !f.startsWith(this.root + "/")) throw Error("path");
      return this.root ? f.slice(this.root.length + 1) : f;
    };
    return { files: data.files.map(rel), folders: data.folders.map(rel) };
  }
  async stat(p) {
    if (!this.root && !p) return { type: "folder", size: 0, mtime: 0 };
    return this.vault.adapter.stat(this.path(p));
  }
  async download(p) {
    const path = this.path(p), file = this.vault.getAbstractFileByPath(path);
    return file instanceof import_obsidian.TFile && this.indexed(path) ? this.vault.readBinary(file) : this.vault.adapter.readBinary(path);
  }
  async mkdir(p) {
    const path = this.writable(p, true);
    if (this.indexed(path)) {
      if (!this.vault.getAbstractFileByPath(path))
        await this.vault.createFolder(path);
    } else await ensure(this.vault.adapter, path);
  }
  async upload(p, b, mtime) {
    const path = this.writable(p), options = Number.isFinite(mtime) ? { mtime } : void 0;
    if (this.ownWrite) this.ownWrite(path, await hash(b));
    if (this.indexed(path)) {
      const parts = p.split("/");
      let at = "";
      for (const part of parts.slice(0, -1)) {
        at = join(at, part);
        await this.mkdir(at);
      }
      const file = this.vault.getAbstractFileByPath(path);
      if (file instanceof import_obsidian.TFile) {
        await this.vault.modifyBinary(file, b, options);
        return;
      }
      if (file || await this.vault.adapter.exists(path))
        throw Error("indexPending");
      await this.vault.createBinary(path, b, options);
      return;
    }
    await ensure(this.vault.adapter, parent(path));
    if (await this.vault.adapter.exists(path)) {
      await this.vault.adapter.writeBinary(path, b, options);
      return;
    }
    const staging = join(
      this.vault.configDir,
      "plugins/" + this.self + "/runtime/tmp"
    );
    await ensure(this.vault.adapter, staging);
    const tmp = join(staging, crypto.randomUUID());
    await this.vault.adapter.writeBinary(tmp, b, options);
    try {
      await this.vault.adapter.rename(tmp, path);
    } finally {
      if (await this.vault.adapter.exists(tmp))
        await this.vault.adapter.remove(tmp);
    }
  }
  async delete(p) {
    const path = this.writable(p);
    if ((await this.stat(p))?.type !== "file") throw Error("collision");
    const a = this.vault.adapter;
    this.ownWrite?.(path, null);
    const file = this.indexed(path) ? this.vault.getAbstractFileByPath(path) : null;
    if (this.indexed(path) && !(file instanceof import_obsidian.TFile))
      throw Error("indexPending");
    switch (this.policy.trash) {
      case "plugin": {
        const expires = Date.now() + this.policy.trashDays * 864e5;
        const dest = join(
          join(this.vault.configDir, "plugins/" + this.self + "/runtime/trash"),
          expires + "-" + crypto.randomUUID() + "/" + path
        );
        await ensure(a, parent(dest));
        if (file) await this.vault.rename(file, dest);
        else await a.rename(path, dest);
        break;
      }
      case "permanent":
        if (file) await this.vault.delete(file);
        else await a.remove(path);
        break;
      case "system":
        if (!await a.trashSystem(path)) throw Error("trashUnavailable");
        break;
      case "vault":
        if (file) await this.vault.trash(file, false);
        else await a.trashLocal(path);
        break;
    }
  }
  async move(from, to) {
    const a = this.writable(from), b = this.writable(to);
    if (await this.vault.adapter.exists(b)) throw Error("collision");
    if (this.indexed(a)) {
      const f = this.vault.getAbstractFileByPath(a);
      if (!(f instanceof import_obsidian.TFile)) throw Error("indexPending");
      await this.vault.rename(f, b);
    } else await this.vault.adapter.rename(a, b);
  }
  async getRevision() {
    return null;
  }
};

// src/engine.ts
init_git_buffer();

// src/filters.ts
init_git_buffer();
var import_posix3 = __toESM(require_posix());
function pathFilter(p) {
  const compile = (s) => s.split(/[\n,]+/).map((v) => v.trim()).filter(Boolean).map(
    (v) => (0, import_posix3.default)(v, { nonegate: true, noextglob: true, nobrace: true })
  );
  const include = compile(p.include), exclude = compile(p.exclude);
  return (path) => !exclude.some((f) => f(path)) && (!include.length || include.some((f) => f(path)));
}

// src/selection.ts
init_git_buffer();
function selectPlan(profile, fresh2, review, choices, release) {
  const seen = new Map(review.ops.map((op) => [op.path, op]));
  const ops = fresh2.ops.flatMap((op) => {
    const before = seen.get(op.path);
    if (!before || choices?.get(op.path) === "skip") return [];
    if (op.action === "ack") return [op];
    if (before.source?.hash !== op.source?.hash || before.action !== op.action || before.conflict !== op.conflict)
      throw Error("referenceChanged");
    const decision = choices?.get(op.path);
    if (!decision || decision === op.action) return [op];
    if (!op.conflict || profile.mirror === "full" || !(decision === "write" || decision === "retain" || decision === "both" && profile.scope === "content"))
      throw Error("invalid");
    return [{ ...op, action: decision }];
  });
  const reviewedHeld = new Set(review.held);
  const held = fresh2.held.filter((path) => {
    if (!release?.has(path) || !reviewedHeld.has(path)) return true;
    ops.push({ path, action: "delete", conflict: false });
    return false;
  });
  return { ...fresh2, ops, held };
}

// src/validator.ts
init_git_buffer();

// src/public-location.ts
init_git_buffer();
function location(remote) {
  if (!remote || typeof remote.url !== "string" || typeof remote.branch !== "string")
    throw Error("publicUrl");
  const value = remote.url.trim();
  if (remote.engine === "yandex" && /^[a-zA-Z0-9+/=_-]{20,512}$/.test(value))
    return { root: value, resourceKey: "" };
  if (remote.engine === "google" && /^[A-Za-z0-9_-]+$/.test(value))
    return { root: value, resourceKey: "" };
  let u;
  try {
    u = new URL(value);
  } catch {
    throw Error("publicUrl");
  }
  if (u.protocol !== "https:" || u.username || u.password)
    throw Error("publicUrl");
  if (remote.engine === "google") {
    if (u.host !== "drive.google.com") throw Error("publicUrl");
    const id = /^\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)\/?$/.exec(u.pathname)?.[1] ?? (u.pathname === "/open" ? u.searchParams.get("id") : null);
    const resourceKey = u.searchParams.get("resourcekey") ?? "";
    if (!id || !/^[-\w]+$/.test(id) || resourceKey && !/^[-\w]+$/.test(resourceKey))
      throw Error("publicUrl");
    return { root: id, resourceKey };
  }
  if (remote.engine === "yandex" && /^(?:yadi\.sk|disk(?:\.360)?\.yandex\.(?:ru|com|kz|by))$/.test(u.host) && /^\/(?:d|i)\/[\w-]+\/?$/.test(u.pathname))
    return { root: u.origin + u.pathname.replace(/\/$/, ""), resourceKey: "" };
  if (remote.engine === "git" && !u.search && !u.hash && u.pathname !== "/") {
    const ref = remote.branch;
    if (ref && (ref.startsWith("-") || ref.startsWith("/") || ref.endsWith("/") || ref.endsWith(".") || ref.split("/").some((s) => s.startsWith(".") || s.endsWith(".lock")) || /[\s~^:?*\[\\\x00-\x1f\x7f]|\.\.|@\{|\/\//.test(ref)))
      throw Error("gitBranch");
    return { root: u.href.replace(/\/$/, ""), resourceKey: "" };
  }
  throw Error("publicUrl");
}
function referenceId(p) {
  if (p.access === "local")
    return "vault:" + (p.reference === "/" ? "" : p.reference);
  if (p.access !== "public" || !p.remote) throw Error("publicUrl");
  return JSON.stringify([
    p.remote.engine,
    location(p.remote).root,
    p.remote.engine === "git" ? p.remote.branch : "",
    p.reference === "/" ? "" : p.reference
  ]);
}

// src/validator.ts
function profileRules(p, desktop, readOnly) {
  const rules = [];
  const force = (field, forced, code) => rules.push({
    field,
    forced,
    code,
    locked: true,
    invalid: p[field] !== forced
  });
  if (p.access === "public" || readOnly)
    force("role", "subscriber", "readonly");
  if (p.mirror === "full") {
    force("deletions", true, "mirror");
    force("conflict", "source", "mirror");
  }
  if (p.scope === "settings") {
    if (p.conflict === "both") force("conflict", "source", "configConflict");
    rules.push({
      field: "fileEvents",
      visible: false,
      code: "configEvents",
      invalid: p.fileEvents
    });
  }
  if (p.role === "publisher")
    for (const field of ["deletions", "conflict"])
      rules.push({ field, visible: false, code: "publisher" });
  if (!desktop)
    rules.push({
      field: "watch",
      visible: false,
      code: "mobile",
      invalid: p.watch
    });
  if (p.mode === "silent")
    rules.push({ field: "firstPlan", code: "silentDefault" });
  if (p.mirror === "full" && (p.local === "/" || !p.local)) {
    for (const field of ["backup", "emptyGuard"])
      rules.push({ field, code: "guard", invalid: !p[field] });
  }
  return rules;
}
function validate(p, desktop, readOnly, configDir) {
  const errors = profileRules(p, desktop, readOnly).filter((r) => r.invalid);
  const err = (field, code) => errors.push({ field, code, invalid: true });
  const enums = {
    trash: ["plugin", "vault", "system", "permanent"],
    role: ["subscriber", "publisher"],
    scope: ["settings", "content"],
    access: ["local", "public", "oauth", "token"],
    mirror: ["full", "preserve"],
    conflict: ["source", "target", "both", "newer"],
    mode: ["plan", "silent"]
  };
  for (const [k, values] of Object.entries(enums))
    if (!values.includes(String(p[k]))) err(k, "invalid");
  for (const key of ["local", "reference"])
    if (typeof p[key] !== "string" || p[key] !== "/" && p[key] !== "" && !safe(p[key]))
      err(key, "path");
  if (p.access === "public") {
    try {
      if (!p.remote) throw Error("publicUrl");
      location(p.remote);
    } catch (e) {
      err("remote", e instanceof Error ? e.message : "publicUrl");
    }
  }
  if (!/^[\w-]+$/.test(p.id)) err("id", "invalid");
  for (const k of [
    "enabled",
    "inheritMode",
    "startup",
    "onFocus",
    "onOnline",
    "deletions",
    "backup",
    "emptyGuard",
    "firstPlan",
    "fileEvents",
    "watch",
    "strictDrift"
  ])
    if (typeof p[k] !== "boolean") err(k, "invalid");
  for (const [field, max] of [
    ["maxDeleteCount", 1e6],
    ["maxDeletePercent", 100],
    ["shrinkPercent", 100],
    ["deleteGrace", 1e3],
    ["startupSeconds", 3600],
    ["intervalMinutes", 10080],
    ["quietSeconds", 600],
    ["debounceSeconds", 600],
    ["maxDeferrals", 100],
    ["maxMiB", 1048576],
    ["trashDays", 3650]
  ]) {
    if (!Number.isInteger(p[field]) || p[field] < 0 || p[field] > max)
      err(field, "invalid");
  }
  if (typeof p.name !== "string" || !p.name.trim()) err("name", "invalid");
  for (const field of ["include", "exclude"])
    if (typeof p[field] !== "string" || p[field].length > 4096)
      err(field, "invalid");
  if (p.config !== void 0) {
    if (!validConfig(p.config)) err("config", "invalidConfig");
    else
      try {
        parseOverlay(p.config.overlay);
      } catch {
        err("config", "overlaySyntax");
      }
  }
  if (errors.length) return errors;
  const local = fold(
    p.scope === "settings" ? configDir : p.local === "/" ? "" : p.local
  ), ref = fold(p.reference === "/" ? "" : p.reference);
  if (p.access === "local" && (under(local, ref) || under(ref, local)))
    err("reference", "overlap");
  const hidden = (path) => path.split("/").some((s) => s.startsWith(".") || s === "node_modules");
  if (p.access === "local" && hidden(ref)) err("reference", "protected");
  if (p.scope === "content" && hidden(local)) err("local", "protected");
  if (p.access === "local" && under(ref, fold(configDir)) || p.scope === "content" && under(local, fold(configDir)))
    err("reference", "protected");
  return errors;
}

// src/scanner.ts
init_git_buffer();
async function scan(provider, scope, configDir, self, skipHotTarget = false, budget = new RunBudget(), accept = (path) => true, maxMiB = 0, config, projection) {
  const snap = {
    files: /* @__PURE__ */ new Map(),
    directories: /* @__PURE__ */ new Set(),
    complete: false,
    skipped: /* @__PURE__ */ new Map()
  };
  const todo = [""], seen = /* @__PURE__ */ new Map();
  if ((await budget.io(() => provider.stat("")))?.type !== "folder")
    throw Error("missingRoot");
  while (todo.length) {
    const dir = todo.pop();
    const list = await budget.io(() => provider.list(dir));
    for (const path of list.skipped ?? []) {
      if (parent(path) !== dir) throw Error("path");
      snap.skipped.set(path, "filter");
    }
    for (const [paths, isDir] of [
      [list.files, false],
      [list.folders, true]
    ]) {
      for (const p of paths) {
        if (parent(p) !== dir) throw Error("path");
        if (!selected(p, scope, configDir, self, isDir, config)) continue;
        if (projection?.blocked.includes(fold(p.split("/")[1] ?? "")) && p.startsWith("plugins/"))
          continue;
        if (!safe(p)) {
          snap.skipped.set(p, "badPath");
          continue;
        }
        const alias = seen.get(fold(p));
        if (alias !== void 0) {
          snap.skipped.set(alias, "collision");
          snap.skipped.set(p, "collision");
          continue;
        }
        seen.set(fold(p), p);
        if (isDir) {
          snap.directories.add(p);
          todo.push(p);
          continue;
        }
        if (!accept(p)) {
          snap.skipped.set(p, "filter");
          continue;
        }
        try {
          const stat = await budget.io(() => provider.stat(p));
          if (stat?.type !== "file") throw Error("incomplete");
          if (maxMiB > 0 && stat.size > maxMiB * 1048576) {
            snap.skipped.set(p, "filter");
            continue;
          }
          const kind = volatility(p, scope);
          if (kind === "H" && skipHotTarget) {
            snap.files.set(p, {
              hash: "",
              size: stat.size,
              mtime: stat.mtime,
              kind
            });
            continue;
          }
          const bytes = await budget.io(() => provider.download(p));
          if (bytes.byteLength !== stat.size) throw Error("incomplete");
          const rawHash = await hash(bytes);
          snap.files.set(p, {
            rawHash,
            hash: projection ? await settingsHash(p, bytes, projection) : rawHash,
            size: stat.size,
            mtime: stat.mtime,
            kind
          });
        } catch (e) {
          if (!transient(e)) throw e;
          snap.skipped.set(p, "locked");
        }
      }
    }
  }
  snap.complete = true;
  return snap;
}

// src/planner.ts
init_git_buffer();

// src/conflict-resolver.ts
init_git_buffer();
var resolveConflict = (policy, s, t) => {
  if (policy === "both") return "both";
  if (policy === "target" || policy === "newer" && Number.isFinite(s.mtime) && Number.isFinite(t.mtime) && t.mtime > s.mtime + 2e3)
    return "retain";
  return "write";
};

// src/planner.ts
function plan(p, src, dst, base, resolve = resolveConflict) {
  if (!src.complete || !dst.complete) throw Error("incomplete");
  const skipped = new Map([...src.skipped ?? [], ...dst.skipped ?? []]);
  const names = /* @__PURE__ */ new Map();
  for (const snap of [src, dst])
    for (const [paths, kind] of [
      [snap.files.keys(), "file"],
      [snap.directories.keys(), "folder"]
    ])
      for (const path of paths) {
        const key = fold(path), sig = kind + " " + path;
        if (names.has(key) && names.get(key) !== sig)
          skipped.set(path, "collision");
        names.set(key, sig);
      }
  const alias = (s) => fold(s).split("/").map((k) => k.replace(/[. ]+$/, "")).join("/");
  const blocked = new Set([...skipped.keys()].map(alias));
  const protectedPath = (path) => {
    const parts = alias(path).split("/");
    while (parts.length) {
      if (blocked.has(parts.join("/"))) return true;
      parts.pop();
    }
    return false;
  };
  const deferred = [...skipped].filter(([, reason]) => reason !== "filter").map(([path, reason]) => ({ path, reason }));
  const ops = [], deletes = [];
  for (const path of /* @__PURE__ */ new Set([...src.files.keys(), ...dst.files.keys()])) {
    if (protectedPath(path)) continue;
    const s = src.files.get(path), t = dst.files.get(path), b = Object.hasOwn(base.entries, path) ? base.entries[path] : void 0;
    if (!s) {
      if (p.scope === "settings" && p.role === "subscriber" && fold(path) === "community-plugins.json")
        continue;
      if (t && (p.mirror === "full" || p.deletions && b?.delivered))
        deletes.push({ path, action: "delete", conflict: false, target: t });
      continue;
    }
    if (s.kind === "V") continue;
    if (s.hash === t?.hash) {
      ops.push({ path, action: "ack", source: s, conflict: false });
      continue;
    }
    const strict = p.strictDrift || p.scope === "content" && p.mirror === "full";
    if (!strict && b?.seen === s.hash) continue;
    if (!strict && p.scope === "settings" && s.rawHash && b?.seen === s.rawHash && s.rawHash !== s.hash)
      continue;
    const conflict = !!t && s.kind === "S" && (!b || t.hash !== b.hash && s.hash !== b.applied);
    const action = conflict && t && p.mirror !== "full" ? resolve(p.conflict, s, t) : "write";
    ops.push({ path, action, source: s, target: t, conflict });
  }
  const protect = p.emptyGuard && (src.files.size === 0 || base.size > 0 && src.files.size < base.size * (1 - p.shrinkPercent / 100)) || deletes.length > p.maxDeleteCount || deletes.length > Math.max(p.deleteGrace, dst.files.size * p.maxDeletePercent / 100);
  if (!protect) ops.push(...deletes);
  ops.sort(
    (a, b) => priority(a.path) - priority(b.path) || a.path.localeCompare(b.path)
  );
  return {
    ops,
    deferred,
    forgotten: Object.keys(base.entries).filter(
      (path) => !protectedPath(path) && !src.files.has(path) && !dst.files.has(path)
    ),
    held: protect ? deletes.map((d) => d.path) : [],
    count: src.files.size,
    direction: "SourceToTarget"
  };
}

// src/engine.ts
var StatusStore = class {
  phase = "idle";
  listeners = /* @__PURE__ */ new Set();
  set(s) {
    this.phase = s;
    for (const l of this.listeners) l(s);
  }
  subscribe(l) {
    this.listeners.add(l);
    l(this.phase);
    return () => this.listeners.delete(l);
  }
};
var SyncEngine = class {
  constructor(applier, status, configDir, self, desktop) {
    this.applier = applier;
    this.status = status;
    this.configDir = configDir;
    this.self = self;
    this.desktop = desktop;
  }
  busy = false;
  lastSource;
  async exclusive(fn) {
    if (this.busy) throw Error("busy");
    this.busy = true;
    try {
      return await fn();
    } catch (e) {
      this.status.set("error");
      throw e;
    } finally {
      this.busy = false;
    }
  }
  async run(p, reference, local, preview, approved, options = {}) {
    return this.exclusive(async () => {
      const bad2 = validate(
        p,
        this.desktop,
        reference.capabilities.readOnly,
        this.configDir
      );
      if (bad2.length) throw Error(bad2[0].code);
      const [source, target] = p.role === "subscriber" ? [reference, local] : [local, reference];
      const key = JSON.stringify([p.id, p.scope, source.id, target.id]);
      this.status.set("scan");
      const budget = options.budget ?? new RunBudget(
        void 0,
        p.access === "public" ? 9e4 : void 0,
        void 0,
        this.applier.fence
      );
      const cfg = p.config ?? legacyConfig();
      const projection = p.scope === "settings" ? {
        rules: parseOverlay(cfg.overlay),
        self: this.self,
        blocked: !this.desktop && cfg.platformFilter ? await mobileExcluded(source, target, budget) : []
      } : void 0;
      const filter = p.scope === "content" ? pathFilter(p) : () => true;
      const scanSource = async () => {
        const revision = p.access === "public" ? await budget.io(() => source.getRevision()) : null;
        const cacheKey = revision && JSON.stringify([
          source.id,
          revision,
          p.scope,
          cfg,
          p.include,
          p.exclude,
          p.maxMiB,
          projection?.blocked
        ]);
        if (cacheKey && this.lastSource?.key === cacheKey)
          return this.lastSource.snapshot;
        const snapshot = await scan(
          source,
          p.scope,
          this.configDir,
          this.self,
          false,
          budget,
          filter,
          p.scope === "content" ? p.maxMiB : 0,
          cfg,
          projection
        );
        if (cacheKey && ![...snapshot.skipped?.values() ?? []].includes("locked"))
          this.lastSource = { key: cacheKey, snapshot };
        return snapshot;
      };
      const inputs = await Promise.allSettled([
        scanSource(),
        scan(
          target,
          p.scope,
          this.configDir,
          this.self,
          !p.strictDrift,
          budget,
          filter,
          p.scope === "content" ? p.maxMiB : 0,
          cfg,
          projection
        )
      ]);
      const [s, t] = inputs.map((i) => {
        if (i.status === "rejected") throw i.reason;
        return i.value;
      });
      let result = plan(p, s, t, this.applier.state.get(key));
      let changed = 0;
      if (approved)
        result = selectPlan(
          p,
          result,
          approved,
          options.choices,
          options.release
        );
      if (!preview) {
        if (options.active && !options.active()) throw Error("stopped");
        if (p.scope === "content" && p.role === "publisher" && result.ops.some((x) => x.action === "write" || x.action === "both")) {
          await sleep(2e3);
          for (const op of result.ops) {
            if (!op.source || !(op.action === "write" || op.action === "both"))
              continue;
            try {
              const now = await budget.io(() => source.stat(op.path));
              if (now?.mtime !== op.source.mtime || now?.size !== op.source.size)
                result.deferred.push({ path: op.path, reason: "unstable" });
            } catch (e) {
              if (!transient(e)) throw e;
              result.deferred.push({ path: op.path, reason: "locked" });
            }
          }
        }
        const held = new Set(result.deferred.map((x) => x.path));
        result.ops = result.ops.filter((op) => {
          if (held.has(op.path)) return false;
          if (p.scope === "content" && p.role === "subscriber" && ["delete", "both", "write"].includes(op.action) && options.quiet?.(op.path)) {
            result.deferred.push({ path: op.path, reason: "editing" });
            return false;
          }
          return true;
        });
        if (options.active && !options.active()) throw Error("stopped");
        const deletes = result.ops.filter((op) => op.action === "delete").map((op) => op.path);
        if (deletes.length && source.confirmAbsent)
          await budget.io(() => source.confirmAbsent(deletes));
        this.status.set("apply");
        changed = await this.applier.apply(
          p,
          result,
          source,
          target,
          key,
          p.role === "subscriber" ? p.scope === "settings" ? this.configDir : p.local : p.reference,
          budget,
          options.progress,
          options.active,
          projection
        );
      }
      this.status.set(
        result.held.length || result.deferred.length ? "partial" : "done"
      );
      return { plan: result, changed };
    });
  }
};

// src/i18n.ts
init_git_buffer();
var ru = {
  engine: "Источник эталона",
  vaultSource: "Папка в хранилище",
  google: "Google Диск",
  yandex: "Яндекс Диск",
  git: "Git по HTTPS",
  remote: "Публичная ссылка или ключ источника",
  branch: "Ветка Git (пусто — ветка по умолчанию)",
  deviceKey: "API-ключ Google Drive для этого устройства",
  subfolder: "Папка внутри источника (/ — корень)",
  browse: "Обзор папок источника",
  upFolder: "На уровень выше",
  openFolder: "Открыть",
  useFolder: "Выбрать эту папку",
  publicUrl: "Проверьте публичную ссылку или ключ источника",
  gitBranch: "Некорректное имя ветки Git",
  googleKey: "Введите и сохраните API-ключ Google Drive",
  publicQuota: "Исчерпана квота API. Повторите позже.",
  publicDenied: "Сервис отклонил доступ. Проверьте общий доступ и ключ.",
  remoteHttp: "Ошибка сервиса при чтении эталона",
  remoteNetwork: "Не удалось подключиться к источнику",
  remoteName: "Источник вернул неоднозначное имя файла",
  gitRead: "Не удалось получить Git-репозиторий. Проверьте HTTPS-ссылку, ветку и подключение.",
  maxDeleteCount: "Порог удалений, файлов",
  maxDeletePercent: "Порог удалений, % от цели",
  shrinkPercent: "Порог уменьшения эталона, %",
  deleteGrace: "Минимум файлов для процентного порога удалений",
  scopePreset: "Набор настроек",
  preset_full: "Полная копия",
  preset_noData: "Всё кроме данных плагинов",
  preset_look: "Оформление и темы",
  preset_plugins: "Код и список плагинов",
  preset_custom: "Свой набор",
  cat_core: "Основные настройки",
  cat_appearance: "Оформление",
  cat_themes: "Темы",
  cat_snippets: "CSS-сниппеты",
  cat_community: "Список включённых плагинов",
  cat_code: "Код, манифесты и стили плагинов",
  cat_data: "Данные плагинов",
  cat_extras: "Прочие файлы плагинов",
  existingCode: "Выбранные данные или список плагинов рассчитаны на уже установленный код.",
  cfg_codeAllow: "Разрешённые ID для файлов плагинов (glob через запятую)",
  cfg_codeDeny: "Исключённые ID для файлов плагинов",
  cfg_dataAllow: "Разрешённые ID для data.json",
  cfg_dataDeny: "Исключённые ID для data.json",
  cfg_include: "Дополнительные файлы настроек (glob)",
  cfg_exclude: "Исключить пути (glob)",
  cfg_overlay: "Локальные ключи JSON, по строке: plugins/*/data.json => accounts[*].token",
  mobileFilter: "Исключать desktop-only плагины на мобильных устройствах",
  strategy: "Стратегия применения",
  batch: "Пакет с полным предварительным чтением",
  changes: "Только изменения",
  reloadPolicy: "Перезагрузка Obsidian",
  reload_now: "Сразу после применения",
  reload_next: "При следующем запуске",
  reload_idle: "При простое",
  reload_never: "Только отметка в строке состояния",
  idleDelay: "Простой до перезагрузки, секунд",
  reloadNeeded: "Изменения требуют перезагрузки",
  repairFailed: "Проверка настроек завершилась с расхождениями",
  invalidConfig: "Некорректные параметры настроек",
  overlaySyntax: "Ожидается шаблон файла => путь JSON, по правилу на строке",
  reloadUnavailable: "Команда перезагрузки недоступна",
  strictDrift: "Восстанавливать настройки при локальных изменениях",
  badPath: "Недопустимое имя Windows",
  profiles: "Профили",
  defaultMode: "Режим по умолчанию",
  pause: "Приостановить синхронизацию",
  paused: "Пауза",
  add: "Добавить профиль",
  syncAll: "Запустить все активные профили",
  enabled: "Включён",
  edit: "Редактировать профиль",
  duplicate: "Дублировать",
  down: "Ниже",
  up: "Выше",
  current: "Текущий профиль",
  select: "Сделать текущим",
  name: "Имя профиля",
  mode: "Режим работы",
  inherit: "Использовать глобальный режим",
  plan: "План с подтверждением",
  silent: "Тихий",
  firstPlan: "Показывать план перед первой доставкой",
  mirrorMode: "Зеркалирование",
  preserve: "Сохранять локальные файлы",
  full: "Полное зеркало",
  source: "Предпочесть эталон",
  targetVersion: "Предпочесть версию цели",
  newer: "Предпочесть более новый файл",
  deletions: "Применять удаления из эталона",
  trash: "Способ удаления",
  plugin: "Корзина RefSync",
  vault: "Корзина хранилища",
  system: "Системная корзина",
  permanent: "Удалить файл с резервной копией",
  trashDays: "Хранить в корзине RefSync, дней",
  include: "Включать пути (glob через запятую)",
  exclude: "Исключать пути (glob через запятую)",
  maxMiB: "Максимальный размер в МиБ (0 — любой)",
  startup: "При запуске Obsidian",
  startupSeconds: "Задержка после запуска, секунд",
  intervalMinutes: "Интервал в минутах (0 — вручную и по событиям)",
  onFocus: "При возврате фокуса",
  onOnline: "При появлении сети",
  fileEvents: "При изменениях файлов",
  debounceSeconds: "Объединять события за период, секунд",
  quietSeconds: "Окно тишины редактора, секунд",
  maxDeferrals: "Сколько раз отложить открытый файл",
  remove: "Удалить профиль",
  removeText: "Удалить профиль из списка? Файлы в обеих папках сохранятся.",
  confirmAction: "Подтвердить",
  release: "Разрешить выбранные отложенные удаления",
  search: "Поиск по пути",
  all: "Все действия",
  toggleVisible: "Изменить выбор в фильтре",
  selected: "Выбрано",
  deferred: "Отложено файлов",
  diff: "Сравнить",
  export: "Копировать план JSON",
  close: "Закрыть",
  applySelected: "Применить выбранное",
  trashUnavailable: "Системная корзина недоступна",
  watchdog: "Истекло время прохода",
  readTimeout: "Истекло время чтения файла",
  stopped: "Запуск остановлен",
  editing: "Открытый файл недавно изменён",
  unstable: "Исходный файл меняется",
  locked: "Файл занят",
  settling: "Ожидается завершение предыдущей записи. Следующий запуск восстановит журнал.",
  idle: "Готов",
  scan: "Сравнение",
  apply: "Применение",
  recover: "Восстановление",
  done: "Готово",
  partial: "Частично",
  error: "Ошибка",
  title: "RefSync · локальный профиль",
  preview: "Показать план",
  sync: "Применить эталон",
  undo: "Откатить последнюю доставку",
  cancel: "Отмена",
  confirm: "Откатить",
  reference: "Папка эталона",
  target: "Локальная папка",
  scope: "Охват",
  content: "Контент",
  settings: "Настройки",
  save: "Сохранить",
  role: "Роль",
  subscriber: "Подписчик",
  publisher: "Издатель",
  saved: "Сохранено",
  instructions: "Создайте две отдельные папки. Для настроек локальным корнем служит каталог конфигурации Obsidian. Исходные папки должны существовать.",
  init: "Создать недостающие папки",
  none: "Изменений нет",
  held: "Защита отложила удаления",
  undoText: "Восстановить файлы из резервной копии последней доставки этого профиля?",
  write: "Доставить",
  delete: "В корзину",
  retain: "Оставить версию цели",
  both: "Сохранить обе версии",
  log: "Журнал",
  conflict: "Конфликт",
  invalid: "Недопустимое значение",
  readonly: "Источник доступен только для чтения",
  mirror: "Полное зеркало требует доставки эталона и удалений",
  configConflict: "Для настроек используется эталон с бэкапом",
  configEvents: "События файлов отключены для настроек",
  mobile: "Недоступно на мобильном устройстве",
  guard: "Требуются бэкап и защита от пустого эталона",
  overlap: "Папки пересекаются",
  protected: "Служебный путь исключён",
  path: "Непереносимый или некорректный путь",
  missingRoot: "Папка не найдена",
  incomplete: "Неполное чтение файлов",
  collision: "Коллизия путей",
  indexPending: "Файл ещё не готов в индексе",
  referenceChanged: "Эталон изменился, повторите сравнение",
  busy: "Выполняется другой запуск",
  noBackup: "Нет завершённой доставки для отката",
  backup: "Повреждён бэкап",
  state: "Ошибка локального состояния",
  journal: "Повреждён журнал",
  failed: "Операция не завершена",
  previewFirst: "Сначала проверьте список. Применение повторно сверяет эталон.",
  dry: "Пробный план",
  unknown: "Неизвестное состояние"
};
var en = {
  engine: "Reference source",
  vaultSource: "Vault folder",
  google: "Google Drive",
  yandex: "Yandex Disk",
  git: "Git over HTTPS",
  remote: "Public URL or source key",
  branch: "Git branch (leave empty for the default)",
  deviceKey: "Google Drive API key for this device",
  subfolder: "Folder within source (/ for root)",
  browse: "Browse source folders",
  upFolder: "Parent folder",
  openFolder: "Open",
  useFolder: "Choose this folder",
  publicUrl: "Check the public link or source key",
  gitBranch: "Invalid Git branch name",
  googleKey: "Enter and save your Google Drive API key",
  publicQuota: "API quota reached. Try again later.",
  publicDenied: "Access denied. Check sharing and the API key.",
  remoteHttp: "Service error while reading reference",
  remoteNetwork: "Cannot connect to source",
  remoteName: "Source returned an ambiguous file name",
  gitRead: "Cannot fetch repository. Check the HTTPS URL, branch and connection.",
  maxDeleteCount: "Deletion threshold (files)",
  maxDeletePercent: "Deletion threshold (% of target)",
  shrinkPercent: "Source shrink threshold (%)",
  deleteGrace: "Deletion count floor for percentage threshold",
  scopePreset: "Settings preset",
  preset_full: "Full copy",
  preset_noData: "All except plugin data",
  preset_look: "Appearance and themes",
  preset_plugins: "Plugin code and list",
  preset_custom: "Custom selection",
  cat_core: "Core settings",
  cat_appearance: "Appearance",
  cat_themes: "Themes",
  cat_snippets: "CSS snippets",
  cat_community: "Enabled community plugins",
  cat_code: "Plugin code, manifests and styles",
  cat_data: "Plugin data",
  cat_extras: "Other plugin files",
  existingCode: "The selected data or enabled list depends on already installed plugins.",
  cfg_codeAllow: "Allowed plugin IDs for files (comma-separated globs)",
  cfg_codeDeny: "Excluded plugin IDs for files",
  cfg_dataAllow: "Allowed plugin IDs for data.json",
  cfg_dataDeny: "Excluded plugin IDs for data.json",
  cfg_include: "Additional settings paths (globs)",
  cfg_exclude: "Exclude settings paths (globs)",
  cfg_overlay: "Keep local JSON keys, one per line: plugins/*/data.json => accounts[*].token",
  mobileFilter: "Exclude desktop-only plugins on mobile",
  strategy: "Application strategy",
  batch: "Batch with complete preflight",
  changes: "Changed files only",
  reloadPolicy: "Reload Obsidian",
  reload_now: "Immediately after delivery",
  reload_next: "At next launch",
  reload_idle: "When idle",
  reload_never: "Status indicator only",
  idleDelay: "Idle time before reload (seconds)",
  reloadNeeded: "Reload required",
  repairFailed: "Settings verification found unresolved differences",
  invalidConfig: "Invalid settings configuration",
  overlaySyntax: "Expected one file glob => JSON path per line",
  reloadUnavailable: "Reload command unavailable",
  strictDrift: "Restore settings after local changes",
  badPath: "Invalid Windows path",
  profiles: "Profiles",
  defaultMode: "Default mode",
  pause: "Pause sync",
  paused: "Paused",
  add: "New profile",
  syncAll: "Run all enabled profiles",
  enabled: "Enabled",
  edit: "Edit profile",
  duplicate: "Duplicate",
  down: "Move down",
  up: "Move up",
  current: "Current profile",
  select: "Make current",
  name: "Profile name",
  mode: "Run mode",
  inherit: "Use global mode",
  plan: "Review plan",
  silent: "Silent",
  firstPlan: "Review before first delivery",
  mirrorMode: "Mirroring",
  preserve: "Preserve local files",
  full: "Full mirror",
  source: "Prefer source",
  targetVersion: "Prefer target",
  newer: "Prefer newer file",
  deletions: "Propagate source deletions",
  trash: "Deletion destination",
  plugin: "RefSync trash",
  vault: "Vault trash",
  system: "System trash",
  permanent: "Delete file with backup",
  trashDays: "RefSync trash retention (days)",
  include: "Include paths (comma-separated globs)",
  exclude: "Exclude paths (comma-separated globs)",
  maxMiB: "Maximum MiB (0 for unlimited)",
  startup: "On Obsidian startup",
  startupSeconds: "Startup delay (seconds)",
  intervalMinutes: "Interval in minutes (0 for event or manual runs)",
  onFocus: "On window focus",
  onOnline: "When online",
  fileEvents: "On file changes",
  debounceSeconds: "Event debounce (seconds)",
  quietSeconds: "Editor quiet window (seconds)",
  maxDeferrals: "Maximum editor deferrals",
  remove: "Remove profile",
  removeText: "Remove the profile? Files in both folders will be kept.",
  confirmAction: "Confirm",
  release: "Allow selected held deletions",
  search: "Search paths",
  all: "All actions",
  toggleVisible: "Toggle filtered items",
  selected: "Selected",
  deferred: "Files deferred",
  diff: "Diff",
  export: "Copy plan JSON",
  close: "Close",
  applySelected: "Apply selected",
  trashUnavailable: "System trash unavailable",
  watchdog: "Run deadline exceeded",
  readTimeout: "File read timed out",
  stopped: "Run stopped",
  editing: "Recently edited open file",
  unstable: "Source file is changing",
  locked: "File is busy",
  settling: "A previous write is settling. The next run will recover the journal.",
  idle: "Ready",
  scan: "Scanning",
  apply: "Applying",
  recover: "Recovering",
  done: "Done",
  partial: "Partial",
  error: "Error",
  title: "RefSync · local profile",
  preview: "Show plan",
  sync: "Apply reference",
  undo: "Roll back last delivery",
  cancel: "Cancel",
  confirm: "Restore",
  reference: "Reference folder",
  target: "Local folder",
  scope: "Scope",
  content: "Content",
  settings: "Settings",
  save: "Save",
  role: "Role",
  subscriber: "Subscriber",
  publisher: "Publisher",
  saved: "Saved",
  instructions: "Create two separate folders. For settings, the local root is the Obsidian configuration folder. Both roots must exist.",
  init: "Create missing folders",
  none: "No changes",
  held: "Deletions held by safeguards",
  undoText: "Restore files from the last delivery of this profile?",
  write: "Deliver",
  delete: "Trash",
  retain: "Keep target",
  both: "Keep both",
  log: "Log",
  conflict: "Conflict",
  invalid: "Invalid value",
  readonly: "Read-only source",
  mirror: "Full mirror requires source preference and deletions",
  configConflict: "Settings use source and backup",
  configEvents: "File events disabled for settings",
  mobile: "Unavailable on mobile",
  guard: "Backup and empty-source guard required",
  overlap: "Folders overlap",
  protected: "Protected path",
  path: "Invalid or non-portable path",
  missingRoot: "Folder missing",
  incomplete: "Incomplete listing or read",
  collision: "Path collision",
  indexPending: "File not ready in vault index",
  referenceChanged: "Reference changed, scan again",
  busy: "Another run is active",
  noBackup: "No completed delivery to restore",
  backup: "Damaged backup",
  state: "Invalid local state",
  journal: "Invalid journal",
  failed: "Operation failed",
  previewFirst: "Review the list first. Apply checks the reference again.",
  dry: "Dry run",
  unknown: "Unknown state"
};
function translator(locale) {
  const dict = locale.startsWith("ru") ? ru : en;
  return (k) => Object.hasOwn(dict, k) ? dict[k] : dict.failed;
}

// src/review.ts
init_git_buffer();
var import_obsidian2 = require("obsidian");

// node_modules/diff/libesm/index.js
init_git_buffer();

// node_modules/diff/libesm/diff/base.js
init_git_buffer();
var Diff = class {
  diff(oldStr, newStr, options = {}) {
    let callback;
    if (typeof options === "function") {
      callback = options;
      options = {};
    } else if ("callback" in options) {
      callback = options.callback;
    }
    const oldString = this.castInput(oldStr, options);
    const newString = this.castInput(newStr, options);
    const oldTokens = this.removeEmpty(this.tokenize(oldString, options));
    const newTokens = this.removeEmpty(this.tokenize(newString, options));
    return this.diffWithOptionsObj(oldTokens, newTokens, options, callback);
  }
  diffWithOptionsObj(oldTokens, newTokens, options, callback) {
    var _a;
    const done = (value) => {
      value = this.postProcess(value, options);
      if (callback) {
        setTimeout(function() {
          callback(value);
        }, 0);
        return void 0;
      } else {
        return value;
      }
    };
    const newLen = newTokens.length, oldLen = oldTokens.length;
    let editLength = 1;
    let maxEditLength = newLen + oldLen;
    if (options.maxEditLength != null) {
      maxEditLength = Math.min(maxEditLength, options.maxEditLength);
    }
    const maxExecutionTime = (_a = options.timeout) !== null && _a !== void 0 ? _a : Infinity;
    const abortAfterTimestamp = Date.now() + maxExecutionTime;
    const bestPath = [{ oldPos: -1, lastComponent: void 0 }];
    let newPos = this.extractCommon(bestPath[0], newTokens, oldTokens, 0, options);
    if (bestPath[0].oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
      return done(this.buildValues(bestPath[0].lastComponent, newTokens, oldTokens));
    }
    let minDiagonalToConsider = -Infinity, maxDiagonalToConsider = Infinity;
    const execEditLength = () => {
      for (let diagonalPath = Math.max(minDiagonalToConsider, -editLength); diagonalPath <= Math.min(maxDiagonalToConsider, editLength); diagonalPath += 2) {
        let basePath;
        const removePath = bestPath[diagonalPath - 1], addPath = bestPath[diagonalPath + 1];
        if (removePath) {
          bestPath[diagonalPath - 1] = void 0;
        }
        let canAdd = false;
        if (addPath) {
          const addPathNewPos = addPath.oldPos - diagonalPath;
          canAdd = addPath && 0 <= addPathNewPos && addPathNewPos < newLen;
        }
        const canRemove = removePath && removePath.oldPos + 1 < oldLen;
        if (!canAdd && !canRemove) {
          bestPath[diagonalPath] = void 0;
          continue;
        }
        if (!canRemove || canAdd && removePath.oldPos < addPath.oldPos) {
          basePath = this.addToPath(addPath, true, false, 0, options);
        } else {
          basePath = this.addToPath(removePath, false, true, 1, options);
        }
        newPos = this.extractCommon(basePath, newTokens, oldTokens, diagonalPath, options);
        if (basePath.oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
          return done(this.buildValues(basePath.lastComponent, newTokens, oldTokens)) || true;
        } else {
          bestPath[diagonalPath] = basePath;
          if (basePath.oldPos + 1 >= oldLen) {
            maxDiagonalToConsider = Math.min(maxDiagonalToConsider, diagonalPath - 1);
          }
          if (newPos + 1 >= newLen) {
            minDiagonalToConsider = Math.max(minDiagonalToConsider, diagonalPath + 1);
          }
        }
      }
      editLength++;
    };
    if (callback) {
      (function exec() {
        setTimeout(function() {
          if (editLength > maxEditLength || Date.now() > abortAfterTimestamp) {
            return callback(void 0);
          }
          if (!execEditLength()) {
            exec();
          }
        }, 0);
      })();
    } else {
      while (editLength <= maxEditLength && Date.now() <= abortAfterTimestamp) {
        const ret = execEditLength();
        if (ret) {
          return ret;
        }
      }
    }
  }
  addToPath(path, added, removed, oldPosInc, options) {
    const last = path.lastComponent;
    if (last && !options.oneChangePerToken && last.added === added && last.removed === removed) {
      return {
        oldPos: path.oldPos + oldPosInc,
        lastComponent: { count: last.count + 1, added, removed, previousComponent: last.previousComponent }
      };
    } else {
      return {
        oldPos: path.oldPos + oldPosInc,
        lastComponent: { count: 1, added, removed, previousComponent: last }
      };
    }
  }
  extractCommon(basePath, newTokens, oldTokens, diagonalPath, options) {
    const newLen = newTokens.length, oldLen = oldTokens.length;
    let oldPos = basePath.oldPos, newPos = oldPos - diagonalPath, commonCount = 0;
    while (newPos + 1 < newLen && oldPos + 1 < oldLen && this.equals(oldTokens[oldPos + 1], newTokens[newPos + 1], options)) {
      newPos++;
      oldPos++;
      commonCount++;
      if (options.oneChangePerToken) {
        basePath.lastComponent = { count: 1, previousComponent: basePath.lastComponent, added: false, removed: false };
      }
    }
    if (commonCount && !options.oneChangePerToken) {
      basePath.lastComponent = { count: commonCount, previousComponent: basePath.lastComponent, added: false, removed: false };
    }
    basePath.oldPos = oldPos;
    return newPos;
  }
  equals(left, right, options) {
    if (options.comparator) {
      return options.comparator(left, right);
    } else {
      return left === right || !!options.ignoreCase && left.toLowerCase() === right.toLowerCase();
    }
  }
  removeEmpty(array) {
    const ret = [];
    for (let i = 0; i < array.length; i++) {
      if (array[i]) {
        ret.push(array[i]);
      }
    }
    return ret;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  castInput(value, options) {
    return value;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tokenize(value, options) {
    return Array.from(value);
  }
  join(chars) {
    return chars.join("");
  }
  postProcess(changeObjects, options) {
    return changeObjects;
  }
  get useLongestToken() {
    return false;
  }
  buildValues(lastComponent, newTokens, oldTokens) {
    const components = [];
    let nextComponent;
    while (lastComponent) {
      components.push(lastComponent);
      nextComponent = lastComponent.previousComponent;
      delete lastComponent.previousComponent;
      lastComponent = nextComponent;
    }
    components.reverse();
    const componentLen = components.length;
    let componentPos = 0, newPos = 0, oldPos = 0;
    for (; componentPos < componentLen; componentPos++) {
      const component = components[componentPos];
      if (!component.removed) {
        if (!component.added && this.useLongestToken) {
          let value = newTokens.slice(newPos, newPos + component.count);
          value = value.map(function(value2, i) {
            const oldValue = oldTokens[oldPos + i];
            return oldValue.length > value2.length ? oldValue : value2;
          });
          component.value = this.join(value);
        } else {
          component.value = this.join(newTokens.slice(newPos, newPos + component.count));
        }
        newPos += component.count;
        if (!component.added) {
          oldPos += component.count;
        }
      } else {
        component.value = this.join(oldTokens.slice(oldPos, oldPos + component.count));
        oldPos += component.count;
      }
    }
    return components;
  }
};

// node_modules/diff/libesm/diff/line.js
init_git_buffer();
var LineDiff = class extends Diff {
  constructor() {
    super(...arguments);
    this.tokenize = tokenize;
  }
  equals(left, right, options) {
    if (options.ignoreWhitespace) {
      if (!options.newlineIsToken || !left.includes("\n")) {
        left = left.trim();
      }
      if (!options.newlineIsToken || !right.includes("\n")) {
        right = right.trim();
      }
    } else if (options.ignoreNewlineAtEof && !options.newlineIsToken) {
      if (left.endsWith("\n")) {
        left = left.slice(0, -1);
      }
      if (right.endsWith("\n")) {
        right = right.slice(0, -1);
      }
    }
    return super.equals(left, right, options);
  }
};
var lineDiff = new LineDiff();
function diffLines(oldStr, newStr, options) {
  return lineDiff.diff(oldStr, newStr, options);
}
function tokenize(value, options) {
  if (options.stripTrailingCr) {
    value = value.replace(/\r\n/g, "\n");
  }
  const retLines = [], linesAndNewlines = value.split(/(\n|\r\n)/);
  if (!linesAndNewlines[linesAndNewlines.length - 1]) {
    linesAndNewlines.pop();
  }
  for (let i = 0; i < linesAndNewlines.length; i++) {
    const line = linesAndNewlines[i];
    if (i % 2 && !options.newlineIsToken) {
      retLines[retLines.length - 1] += line;
    } else {
      retLines.push(line);
    }
  }
  return retLines;
}

// src/review.ts
var Review = class extends import_obsidian2.Modal {
  constructor(app, p, plan2, tr, endpoints, closed, apply, releaseOnly = false) {
    super(app);
    this.p = p;
    this.plan = plan2;
    this.tr = tr;
    this.endpoints = endpoints;
    this.closed = closed;
    this.apply = apply;
    this.releaseOnly = releaseOnly;
  }
  choices = /* @__PURE__ */ new Map();
  query = "";
  filter = "all";
  page = 0;
  released = /* @__PURE__ */ new Set();
  onOpen() {
    this.titleEl.setText(
      this.tr(this.apply ? "preview" : "dry") + " · " + this.p.name
    );
    if (this.p.scope === "settings" && this.plan.ops.some(
      (o) => ["write", "delete"].includes(o.action) && needsReload(o.path)
    ))
      this.contentEl.createEl("p", { text: this.tr("reloadNeeded") });
    const metrics = this.contentEl.createEl("p"), toolbar = new import_obsidian2.Setting(this.contentEl);
    toolbar.addSearch(
      (s) => s.setPlaceholder(this.tr("search")).onChange((v) => {
        this.query = v.toLowerCase();
        this.page = 0;
        render();
      })
    );
    toolbar.addDropdown((d) => {
      for (const k of ["all", "conflict", "delete"]) d.addOption(k, this.tr(k));
      d.onChange((v) => {
        this.filter = v;
        this.page = 0;
        render();
      });
    });
    const body = this.contentEl.createDiv(), pager = new import_obsidian2.Setting(this.contentEl), foot = new import_obsidian2.Setting(this.contentEl);
    const ops = this.plan.ops.filter(
      (o) => o.action !== "ack" && !this.releaseOnly
    );
    const held = this.plan.held;
    const eligible = (o) => o.path.toLowerCase().includes(this.query) && (this.filter === "all" || this.filter === "conflict" && o.conflict || this.filter === "delete" && o.action === "delete");
    const filtered = () => ops.filter(eligible);
    if (this.apply && !this.releaseOnly)
      toolbar.addButton(
        (b) => b.setButtonText(this.tr("toggleVisible")).onClick(() => {
          const list = filtered(), off = list.some((o) => this.choices.get(o.path) !== "skip");
          for (const op of list)
            if (off) this.choices.set(op.path, "skip");
            else this.choices.delete(op.path);
          render();
        })
      );
    const render = () => {
      body.empty();
      pager.clear();
      const rows = filtered();
      const heldRows = held.filter(
        (p) => p.toLowerCase().includes(this.query) && this.filter !== "conflict"
      );
      const all = [
        ...rows.map((op) => ({ op, path: op.path })),
        ...heldRows.map((path) => ({ path, op: null }))
      ];
      const selected2 = ops.filter((o) => this.choices.get(o.path) !== "skip");
      metrics.setText(
        [
          [this.tr("selected"), selected2.length + this.released.size],
          [
            this.tr("write"),
            selected2.filter(
              (o) => ["write", "both"].includes(this.choices.get(o.path) ?? o.action)
            ).length
          ],
          [this.tr("conflict"), selected2.filter((o) => o.conflict).length],
          [
            this.tr("delete"),
            selected2.filter((o) => o.action === "delete").length + this.released.size
          ],
          [this.tr("held"), held.length],
          [this.tr("deferred"), this.plan.deferred.length]
        ].map((pair) => pair.join(" ")).join(" · ")
      );
      this.page = Math.min(
        this.page,
        Math.max(0, Math.ceil(all.length / 50) - 1)
      );
      if (!all.length) body.createEl("p", { text: this.tr("none") });
      for (const { op, path } of all.slice(
        this.page * 50,
        (this.page + 1) * 50
      )) {
        const row = new import_obsidian2.Setting(body).setName(path).setDesc(
          this.tr(op ? op.conflict ? "conflict" : op.action : "held")
        );
        if (!op) {
          if (this.releaseOnly)
            row.addToggle(
              (c) => c.setValue(this.released.has(path)).onChange((on) => {
                if (on) this.released.add(path);
                else this.released.delete(path);
                render();
              })
            );
          continue;
        }
        if (this.apply)
          row.addToggle(
            (c) => c.setValue(this.choices.get(path) !== "skip").onChange((on) => {
              if (on) this.choices.delete(path);
              else this.choices.set(path, "skip");
              render();
            })
          );
        if (this.apply && op.conflict && this.p.mirror !== "full" && this.choices.get(path) !== "skip") {
          row.addDropdown((d) => {
            for (const a of this.p.scope === "content" ? ["write", "retain", "both"] : ["write", "retain"])
              d.addOption(a, this.tr(a));
            d.setValue(this.choices.get(path) ?? op.action).onChange((v) => {
              this.choices.set(path, v);
              render();
            });
          });
        }
        row.addButton(
          (b) => b.setButtonText(this.tr("diff")).onClick(() => void this.diff(op))
        );
      }
      if (all.length > 50) {
        pager.setName(this.page + 1 + " / " + Math.ceil(all.length / 50));
        pager.addButton(
          (b) => b.setButtonText("←").setDisabled(this.page === 0).onClick(() => {
            this.page--;
            render();
          })
        ).addButton(
          (b) => b.setButtonText("→").setDisabled((this.page + 1) * 50 >= all.length).onClick(() => {
            this.page++;
            render();
          })
        );
      }
    };
    foot.addButton(
      (b) => b.setButtonText(this.tr("export")).onClick(async () => {
        const data = JSON.stringify(
          {
            profile: this.p.name,
            plan: this.plan,
            choices: Object.fromEntries(this.choices),
            release: [...this.released]
          },
          null,
          2
        );
        try {
          await navigator.clipboard.writeText(data);
        } catch {
          const box = this.contentEl.createEl("textarea");
          box.value = data;
          box.select();
        }
      })
    );
    foot.addButton(
      (b) => b.setButtonText(this.tr("close")).onClick(() => this.close())
    );
    if (this.apply)
      foot.addButton(
        (b) => b.setButtonText(
          this.tr(this.releaseOnly ? "release" : "applySelected")
        ).setCta().onClick(() => {
          this.apply(this.choices, this.released);
          this.close();
        })
      );
    render();
  }
  async diff(op) {
    const popup = new import_obsidian2.Modal(this.app);
    popup.titleEl.setText(op.path);
    popup.open();
    const out = popup.contentEl.createEl("pre");
    out.style.whiteSpace = "pre-wrap";
    const meta = [
      this.tr("target") + " · " + (op.target ? op.target.size + " B · " + new Date(op.target.mtime).toLocaleString() + " · " + op.target.hash : "—"),
      this.tr("reference") + " · " + (op.source ? op.source.size + " B · " + new Date(op.source.mtime).toLocaleString() + " · " + op.source.hash : "—")
    ].join("\n");
    out.setText(meta);
    if (!/\.(md|txt|json|css|ya?ml|csv|js|html|xml)$/i.test(op.path) || Math.max(op.target?.size ?? 0, op.source?.size ?? 0) > 131072)
      return;
    try {
      const [source, target] = this.endpoints(), read = async (s) => {
        let bytes = await s.download(op.path);
        if (this.p.scope === "settings" && op.path.endsWith(".json"))
          return JSON.stringify(
            JSON.parse(
              new TextDecoder().decode(
                project(op.path, bytes, {
                  self: "refsync",
                  blocked: [],
                  rules: parseOverlay(this.p.config?.overlay ?? "")
                })
              )
            ),
            null,
            2
          );
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      };
      const [before, after] = await Promise.all([
        op.target ? read(target) : "",
        op.source ? read(source) : ""
      ]);
      const parts = diffLines(before, after, { timeout: 150 });
      if (parts)
        out.setText(
          parts.flatMap(
            (part) => (part.value.match(/[^\n]*\n|[^\n]+$/g) ?? []).map(
              (line) => (part.added ? "+ " : part.removed ? "− " : "  ") + line
            )
          ).join("")
        );
    } catch {
    }
  }
  onClose() {
    this.contentEl.empty();
    this.closed();
  }
};

// src/public-store.ts
init_git_buffer();

// node_modules/@noble/hashes/esm/legacy.js
init_git_buffer();

// node_modules/@noble/hashes/esm/_md.js
init_git_buffer();

// node_modules/@noble/hashes/esm/utils.js
init_git_buffer();
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
function rotl(word, shift) {
  return word << shift | word >>> 32 - shift >>> 0;
}
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
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

// node_modules/@noble/hashes/esm/legacy.js
var SHA1_IV = /* @__PURE__ */ Uint32Array.from([
  1732584193,
  4023233417,
  2562383102,
  271733878,
  3285377520
]);
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
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      MD5_W[i] = view.getUint32(offset, true);
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

// src/public-store.ts
var rootItem = (key) => ({
  key,
  name: "",
  type: "folder",
  size: 0,
  mtime: 0
});
function fileName(v) {
  if (typeof v !== "string" || !v || v === "." || v === ".." || /[/\\\0]/.test(v))
    throw Error("remoteName");
  return v;
}
function sizeOf(v) {
  if (!(typeof v === "number" || typeof v === "string" && /^\d+$/.test(v)))
    throw Error("incomplete");
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw Error("incomplete");
  return n;
}
var PublicStore = class _PublicStore {
  constructor(id, tree, prefix = "") {
    this.id = id;
    this.tree = tree;
    this.prefix = prefix;
  }
  capabilities = {
    readOnly: true,
    supportsChecksum: false,
    supportsChangesFeed: false,
    maxFileSize: Infinity,
    rateLimits: null
  };
  dirs = /* @__PURE__ */ new Map();
  root;
  entries(dir) {
    let reading = this.dirs.get(dir.key);
    if (!reading) {
      reading = this.tree.children(dir).then((items) => {
        const out = /* @__PURE__ */ new Map();
        for (const item of items) {
          const name = fileName(item.name);
          if (out.has(name)) throw Error("collision");
          out.set(name, item);
        }
        return out;
      });
      this.dirs.set(dir.key, reading);
      reading.catch(() => this.dirs.delete(dir.key));
    }
    return reading;
  }
  async find(path) {
    this.root ??= this.tree.root();
    let dir = await this.root;
    const ancestors = /* @__PURE__ */ new Set([dir.key]);
    for (const name of join(this.prefix, path).split("/").filter(Boolean)) {
      if (dir.type !== "folder") return null;
      const node = (await this.entries(dir)).get(name);
      if (!node) return null;
      if (node.type === "folder" && ancestors.has(node.key))
        throw Error("collision");
      ancestors.add(node.key);
      dir = node;
    }
    return dir;
  }
  async list(path) {
    const dir = await this.find(path);
    if (dir?.type !== "folder") throw Error("missingRoot");
    const files = [], folders = [], skipped = [];
    for (const v of (await this.entries(dir)).values())
      (v.type === "folder" ? folders : v.type === "file" ? files : skipped).push(join(path, v.name));
    return { files, folders, skipped };
  }
  async stat(path) {
    const v = await this.find(path);
    if (!v || v.type === "skip") return null;
    if (v.type === "file" && v.size === -1 && this.tree.size)
      v.size = await this.tree.size(v);
    return { type: v.type, size: v.size, mtime: v.mtime };
  }
  async download(path) {
    const v = await this.find(path);
    if (v?.type !== "file") throw Error("incomplete");
    const bytes = await this.tree.read(v);
    if (v.size >= 0 && bytes.byteLength !== v.size || v.sha256 && await hash(bytes) !== v.sha256 || v.md5 && bytesToHex(md5(new Uint8Array(bytes))) !== v.md5)
      throw Error("referenceChanged");
    return bytes;
  }
  async confirmAbsent(paths) {
    const fresh2 = new _PublicStore(this.id, this.tree, this.prefix);
    for (const path of paths) {
      const base = await fresh2.find("");
      if (base?.type !== "folder") throw Error("missingRoot");
      let dir = base;
      const parts = path.split("/");
      for (const [index, name] of parts.entries()) {
        if (dir.type !== "folder") throw Error("referenceChanged");
        const matches2 = [...(await fresh2.entries(dir)).values()].filter(
          (v) => fold(v.name).replace(/[. ]+$/, "") === fold(name)
        );
        if (!matches2.length) break;
        if (matches2.length !== 1 || matches2[0].name !== name)
          throw Error("referenceChanged");
        dir = matches2[0];
        if (dir.type !== "folder" || index === parts.length - 1)
          throw Error("referenceChanged");
      }
    }
  }
  async getRevision() {
    return this.tree.revision?.() ?? null;
  }
  async upload() {
    throw Error("readonly");
  }
  async delete() {
    throw Error("readonly");
  }
  async mkdir() {
    throw Error("readonly");
  }
  async move() {
    throw Error("readonly");
  }
};

// src/public-cloud.ts
init_git_buffer();
var decoder2 = new TextDecoder();
function check(res) {
  if (res.status === 429 || res.status === 403 && /quota|rateLimit|dailyLimit/i.test(decoder2.decode(res.arrayBuffer)))
    throw Error("publicQuota");
  if (res.status === 401 || res.status === 403) throw Error("publicDenied");
  if (res.status === 404) throw Error("missingRoot");
  if (res.status < 200 || res.status >= 300) throw Error("remoteHttp");
  return res;
}
function record2(v) {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("incomplete");
  return v;
}
function digest(v, length) {
  if (v === void 0) return void 0;
  if (typeof v !== "string" || v.length !== length || !/^[a-f0-9]+$/i.test(v))
    throw Error("incomplete");
  return v.toLowerCase();
}
async function json(http, url, headers) {
  const data = check(await http(url, "GET", headers)).arrayBuffer;
  try {
    return record2(JSON.parse(decoder2.decode(data)));
  } catch {
    throw Error("incomplete");
  }
}
var date = (v) => typeof v === "string" ? Date.parse(v) : NaN;
var GoogleTree = class {
  constructor(http, folder, apiKey, linkKey) {
    this.http = http;
    this.folder = folder;
    this.apiKey = apiKey;
    this.linkKey = linkKey;
  }
  headers(id, key) {
    if (!this.apiKey.trim()) throw Error("googleKey");
    return {
      "X-Goog-Api-Key": this.apiKey,
      ...key ? { "X-Goog-Drive-Resource-Keys": id + "/" + key } : {}
    };
  }
  async root() {
    const data = await json(
      this.http,
      "https://www.googleapis.com/drive/v3/files/" + this.folder + "?fields=id,mimeType,trashed&supportsAllDrives=true",
      this.headers(this.folder, this.linkKey)
    );
    if (data.id !== this.folder || data.mimeType !== "application/vnd.google-apps.folder" || data.trashed === true)
      throw Error("missingRoot");
    return { ...rootItem(this.folder), resourceKey: this.linkKey };
  }
  async children(folder) {
    const result = [], tokens = /* @__PURE__ */ new Set();
    let token = "";
    do {
      const params = new URLSearchParams({
        q: "'" + folder.key + "' in parents and trashed = false",
        fields: "nextPageToken,incompleteSearch,files(id,name,mimeType,size,modifiedTime,md5Checksum,sha256Checksum,resourceKey)",
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true"
      });
      if (token) params.set("pageToken", token);
      const d = await json(
        this.http,
        "https://www.googleapis.com/drive/v3/files?" + params,
        this.headers(folder.key, folder.resourceKey)
      );
      if (!Array.isArray(d.files) || d.incompleteSearch)
        throw Error("incomplete");
      for (const raw of d.files) {
        const f = record2(raw);
        if (typeof f.id !== "string" || !/^[-\w]+$/.test(f.id) || typeof f.mimeType !== "string" || f.resourceKey !== void 0 && (typeof f.resourceKey !== "string" || !/^[-\w]+$/.test(f.resourceKey)))
          throw Error("incomplete");
        const type = f.mimeType === "application/vnd.google-apps.folder" ? "folder" : f.mimeType.startsWith("application/vnd.google-apps.") ? "skip" : "file";
        result.push({
          name: fileName(f.name),
          key: f.id,
          type,
          size: type === "file" ? sizeOf(f.size) : 0,
          mtime: date(f.modifiedTime),
          md5: digest(f.md5Checksum, 32),
          sha256: digest(f.sha256Checksum, 64),
          resourceKey: f.resourceKey
        });
      }
      const next = d.nextPageToken ?? "";
      if (typeof next !== "string" || tokens.has(next))
        throw Error("incomplete");
      token = next;
      tokens.add(token);
    } while (token);
    return result;
  }
  async read(f) {
    return check(
      await this.http(
        "https://www.googleapis.com/drive/v3/files/" + f.key + "?alt=media&supportsAllDrives=true",
        "GET",
        this.headers(f.key, f.resourceKey)
      )
    ).arrayBuffer;
  }
};
var YandexTree = class {
  constructor(http, key) {
    this.http = http;
    this.key = key;
  }
  url(path, download = false, offset = 0) {
    const q = new URLSearchParams({ public_key: this.key, path: "/" + path });
    if (!download) {
      q.set("offset", String(offset));
      q.set("limit", "200");
    }
    return "https://cloud-api.yandex.net/v1/disk/public/resources" + (download ? "/download" : "") + "?" + q;
  }
  async root() {
    return rootItem("");
  }
  async children(dir) {
    let offset = 0, total;
    const result = [];
    do {
      const d = await json(this.http, this.url(dir.key, false, offset)), page = record2(d._embedded);
      if (d.type !== "dir" || !page || !Array.isArray(page.items) || page.offset !== offset || typeof page.total !== "number" || !Number.isSafeInteger(page.total) || page.total < 0 || total !== void 0 && total !== page.total || offset + page.items.length > page.total || !page.items.length && offset < page.total)
        throw Error("incomplete");
      total = page.total;
      for (const raw of page.items) {
        const item = record2(raw);
        if (item.type !== "dir" && item.type !== "file")
          throw Error("incomplete");
        const name = fileName(item.name);
        result.push({
          name,
          key: join(dir.key, name),
          type: item.type === "dir" ? "folder" : "file",
          size: item.type === "dir" ? 0 : sizeOf(item.size),
          mtime: date(item.modified),
          sha256: digest(item.sha256, 64),
          md5: digest(item.md5, 32)
        });
      }
      offset += page.items.length;
    } while (offset < total);
    return result;
  }
  async read(file) {
    const d = await json(this.http, this.url(file.key, true));
    if (typeof d.href !== "string") throw Error("incomplete");
    let u;
    try {
      u = new URL(d.href);
    } catch {
      throw Error("publicUrl");
    }
    if (u.protocol !== "https:" || u.username || u.password || !/(^|\.)(yandex\.(net|ru|com)|storage\.yandexcloud\.net)$/.test(
      u.hostname
    ))
      throw Error("publicUrl");
    return check(await this.http(u.href)).arrayBuffer;
  }
};

// src/public-git.ts
init_git_buffer();

// node_modules/isomorphic-git/index.js
init_git_buffer();
var import_sha1 = __toESM(require_sha1(), 1);
var import_async_lock = __toESM(require_async_lock(), 1);
var import_clean_git_ref = __toESM(require_lib2(), 1);
var import_crc_32 = __toESM(require_crc32(), 1);
var import_pako = __toESM(require_pako(), 1);
var import_pify = __toESM(require_pify(), 1);
var import_ignore = __toESM(require_ignore(), 1);
var import_diff3 = __toESM(require_diff3(), 1);
var BaseError = class _BaseError extends Error {
  constructor(message) {
    super(message);
    this.caller = "";
  }
  toJSON() {
    const metadata = (
      /** @type {any} */
      this
    );
    return {
      code: metadata.code,
      data: metadata.data,
      caller: this.caller,
      message: this.message,
      stack: this.stack
    };
  }
  fromJSON(json2) {
    const e = new _BaseError(json2.message);
    const metadata = (
      /** @type {any} */
      e
    );
    metadata.code = json2.code;
    metadata.data = json2.data;
    e.caller = json2.caller;
    e.stack = json2.stack;
    return e;
  }
  get isIsomorphicGitError() {
    return true;
  }
};
var UnmergedPathsError = class _UnmergedPathsError extends BaseError {
  /**
   * @param {Array<string>} filepaths
   */
  constructor(filepaths) {
    super(
      `Modifying the index is not possible because you have unmerged files: ${filepaths.toString}. Fix them up in the work tree, and then use 'git add/rm as appropriate to mark resolution and make a commit.`
    );
    this.code = this.name = _UnmergedPathsError.code;
    this.data = { filepaths };
  }
};
UnmergedPathsError.code = "UnmergedPathsError";
var InternalError = class _InternalError extends BaseError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(
      `An internal error caused this command to fail.

If you're using an application that depends on isomorphic-git, please report this error to that application's developers.

If you're a developer and you believe this is a bug in isomorphic-git, please file an issue at https://github.com/isomorphic-git/isomorphic-git/issues with a minimal reproduction, version and environment details, and this error message: ${message}`
    );
    this.code = this.name = _InternalError.code;
    this.data = { message };
  }
};
InternalError.code = "InternalError";
var UnsafeFilepathError = class _UnsafeFilepathError extends BaseError {
  /**
   * @param {string} filepath
   */
  constructor(filepath) {
    super(`The filepath "${filepath}" contains unsafe character sequences`);
    this.code = this.name = _UnsafeFilepathError.code;
    this.data = { filepath };
  }
};
UnsafeFilepathError.code = "UnsafeFilepathError";
var BufferCursor = class {
  constructor(buffer) {
    this.buffer = buffer;
    this._start = 0;
  }
  eof() {
    return this._start >= this.buffer.length;
  }
  tell() {
    return this._start;
  }
  seek(n) {
    this._start = n;
  }
  slice(n) {
    const r = this.buffer.slice(this._start, this._start + n);
    this._start += n;
    return r;
  }
  toString(enc2, length) {
    const r = this.buffer.toString(enc2, this._start, this._start + length);
    this._start += length;
    return r;
  }
  write(value, length, enc2) {
    const r = this.buffer.write(value, this._start, length, enc2);
    this._start += length;
    return r;
  }
  copy(source, start, end) {
    const r = source.copy(this.buffer, this._start, start, end);
    this._start += r;
    return r;
  }
  readUInt8() {
    const r = this.buffer.readUInt8(this._start);
    this._start += 1;
    return r;
  }
  writeUInt8(value) {
    const r = this.buffer.writeUInt8(value, this._start);
    this._start += 1;
    return r;
  }
  readUInt16BE() {
    const r = this.buffer.readUInt16BE(this._start);
    this._start += 2;
    return r;
  }
  writeUInt16BE(value) {
    const r = this.buffer.writeUInt16BE(value, this._start);
    this._start += 2;
    return r;
  }
  readUInt32BE() {
    const r = this.buffer.readUInt32BE(this._start);
    this._start += 4;
    return r;
  }
  writeUInt32BE(value) {
    const r = this.buffer.writeUInt32BE(value, this._start);
    this._start += 4;
    return r;
  }
};
var NEEDS_CODE_POINT_ORDER = /[\ud800-￿]/;
function isLoneSurrogate(s, i, unit) {
  if (unit < 55296 || unit > 57343) return false;
  if (unit < 56320) {
    const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
    return next < 56320 || next > 57343;
  }
  const prev = i > 0 ? s.charCodeAt(i - 1) : 0;
  return prev < 55296 || prev > 56319;
}
function compareStrings(a, b) {
  if (!NEEDS_CODE_POINT_ORDER.test(a) && !NEEDS_CODE_POINT_ORDER.test(b)) {
    return -(a < b) || +(a > b);
  }
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    let x = a.charCodeAt(i);
    let y = b.charCodeAt(i);
    if (x !== y) {
      if (isLoneSurrogate(a, i, x)) x = 65533;
      if (isLoneSurrogate(b, i, y)) y = 65533;
      if (x === y) continue;
      if (x >= 55296 && y >= 55296) {
        x += x >= 57344 ? -2048 : 8192;
        y += y >= 57344 ? -2048 : 8192;
      }
      return x < y ? -1 : 1;
    }
  }
  return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
}
function comparePath(a, b) {
  return compareStrings(a.path, b.path);
}
var MAX_UINT32 = 2 ** 32;
function createSha1() {
  return new import_sha1.default();
}
function toHex(buffer) {
  let hex = "";
  for (const byte of new Uint8Array(buffer)) {
    if (byte < 16) hex += "0";
    hex += byte.toString(16);
  }
  return hex;
}
var supportsSubtleSHA1 = null;
async function shasum(buffer) {
  if (supportsSubtleSHA1 === null) {
    supportsSubtleSHA1 = await testSubtleSHA1();
  }
  return supportsSubtleSHA1 ? subtleSHA1(buffer) : shasumSync(buffer);
}
function shasumSync(buffer) {
  return createSha1().update(buffer).digest("hex");
}
async function subtleSHA1(buffer) {
  const hash2 = await crypto.subtle.digest("SHA-1", buffer);
  return toHex(hash2);
}
async function testSubtleSHA1() {
  try {
    const hash2 = await subtleSHA1(new Uint8Array([]));
    return hash2 === "da39a3ee5e6b4b0d3255bfef95601890afd80709";
  } catch (_) {
  }
  return false;
}
var lock;
function getLock() {
  if (lock === void 0) lock = new import_async_lock.default({ maxPending: Infinity });
  return lock;
}
function acquireLock(key, callback) {
  return getLock().acquire(key, callback);
}
var IndexCache = Symbol("IndexCache");
function dirname(path) {
  const last = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (last === -1) return ".";
  if (last === 0) return "/";
  return path.slice(0, last);
}
var GitWalkSymbol = Symbol("GitWalkSymbol");
var NotFoundError = class _NotFoundError extends BaseError {
  /**
   * @param {string} what
   */
  constructor(what) {
    super(`Could not find ${what}.`);
    this.code = this.name = _NotFoundError.code;
    this.data = { what };
  }
};
NotFoundError.code = "NotFoundError";
var ObjectTypeError = class _ObjectTypeError extends BaseError {
  /**
   * @param {string} oid
   * @param {'blob'|'commit'|'tag'|'tree'} actual
   * @param {'blob'|'commit'|'tag'|'tree'} expected
   * @param {string} [filepath]
   */
  constructor(oid, actual, expected, filepath) {
    super(
      `Object ${oid} ${filepath ? `at ${filepath}` : ""}was anticipated to be a ${expected} but it is a ${actual}.`
    );
    this.code = this.name = _ObjectTypeError.code;
    this.data = { oid, actual, expected, filepath };
  }
};
ObjectTypeError.code = "ObjectTypeError";
var InvalidOidError = class _InvalidOidError extends BaseError {
  /**
   * @param {string} value
   */
  constructor(value) {
    super(`Expected a 40-char hex object id but saw "${value}".`);
    this.code = this.name = _InvalidOidError.code;
    this.data = { value };
  }
};
InvalidOidError.code = "InvalidOidError";
var InvalidRefNameError = class _InvalidRefNameError extends BaseError {
  /**
   * @param {string} ref
   * @param {string} suggestion
   * @param {boolean} canForce
   */
  constructor(ref, suggestion) {
    super(
      `"${ref}" would be an invalid git reference. (Hint: a valid alternative would be "${suggestion}".)`
    );
    this.code = this.name = _InvalidRefNameError.code;
    this.data = { ref, suggestion };
  }
};
InvalidRefNameError.code = "InvalidRefNameError";
var NoRefspecError = class _NoRefspecError extends BaseError {
  /**
   * @param {string} remote
   */
  constructor(remote) {
    super(`Could not find a fetch refspec for remote "${remote}". Make sure the config file has an entry like the following:
[remote "${remote}"]
	fetch = +refs/heads/*:refs/remotes/origin/*
`);
    this.code = this.name = _NoRefspecError.code;
    this.data = { remote };
  }
};
NoRefspecError.code = "NoRefspecError";
var GitPackedRefs = class _GitPackedRefs {
  constructor(text) {
    this.refs = /* @__PURE__ */ new Map();
    this.parsedConfig = [];
    if (text) {
      let key = null;
      this.parsedConfig = text.trim().split("\n").map((line) => {
        if (/^\s*#/.test(line)) {
          return { line, comment: true };
        }
        const i = line.indexOf(" ");
        if (line.startsWith("^")) {
          const value = line.slice(1);
          this.refs.set(key + "^{}", value);
          return { line, ref: key, peeled: value };
        } else {
          const value = line.slice(0, i);
          key = line.slice(i + 1);
          this.refs.set(key, value);
          return { line, ref: key, oid: value };
        }
      });
    }
    return this;
  }
  static from(text) {
    return new _GitPackedRefs(text);
  }
  delete(ref) {
    this.parsedConfig = this.parsedConfig.filter((entry) => entry.ref !== ref);
    this.refs.delete(ref);
  }
  toString() {
    return this.parsedConfig.map(({ line }) => line).join("\n") + "\n";
  }
};
var GitRefSpec = class _GitRefSpec {
  constructor({
    remotePath,
    remoteSuffix = "",
    localPath,
    force,
    matchPrefix,
    negative = false
  }) {
    Object.assign(this, {
      remotePath,
      remoteSuffix,
      localPath,
      force,
      matchPrefix,
      negative
    });
  }
  static from(refspec) {
    if (refspec.startsWith("^") || !refspec.includes(":")) {
      const negative = refspec.startsWith("^");
      const [, forceMatch2, remote] = refspec.slice(negative ? 1 : 0).match(/^(\+?)(.*)$/);
      const star = remote.indexOf("*");
      return new _GitRefSpec({
        remotePath: star === -1 ? remote : remote.slice(0, star),
        remoteSuffix: star === -1 ? "" : remote.slice(star + 1),
        localPath: null,
        force: forceMatch2 === "+",
        matchPrefix: star !== -1,
        negative
      });
    }
    const [forceMatch, remotePath, remoteGlobMatch, localPath, localGlobMatch] = refspec.match(/^(\+?)(.*?)(\*?):(.*?)(\*?)$/).slice(1);
    const force = forceMatch === "+";
    const remoteIsGlob = remoteGlobMatch === "*";
    const localIsGlob = localGlobMatch === "*";
    if (remoteIsGlob !== localIsGlob) {
      throw new InternalError("Invalid refspec");
    }
    return new _GitRefSpec({
      remotePath,
      localPath,
      force,
      matchPrefix: remoteIsGlob
    });
  }
  matches(remoteBranch) {
    return this.matchPrefix ? remoteBranch.length >= this.remotePath.length + this.remoteSuffix.length && remoteBranch.startsWith(this.remotePath) && remoteBranch.endsWith(this.remoteSuffix) : remoteBranch === this.remotePath;
  }
  translate(remoteBranch) {
    if (this.localPath === null) return null;
    if (this.matchPrefix) {
      if (remoteBranch.startsWith(this.remotePath)) {
        return this.localPath + remoteBranch.replace(this.remotePath, "");
      }
    } else {
      if (remoteBranch === this.remotePath) return this.localPath;
    }
    return null;
  }
  reverseTranslate(localBranch) {
    if (this.localPath === null) return null;
    if (this.matchPrefix) {
      if (localBranch.startsWith(this.localPath)) {
        return this.remotePath + localBranch.replace(this.localPath, "");
      }
    } else {
      if (localBranch === this.localPath) return this.remotePath;
    }
    return null;
  }
};
var GitRefSpecSet = class _GitRefSpecSet {
  constructor(rules = []) {
    this.rules = rules;
  }
  static from(refspecs) {
    const rules = [];
    for (const refspec of refspecs) {
      rules.push(GitRefSpec.from(refspec));
    }
    return new _GitRefSpecSet(rules);
  }
  add(refspec) {
    const rule = GitRefSpec.from(refspec);
    this.rules.push(rule);
  }
  isExcluded(remoteRef) {
    return this.rules.some((rule) => rule.negative && rule.matches(remoteRef));
  }
  translate(remoteRefs) {
    const result = [];
    for (const rule of this.rules) {
      for (const remoteRef of remoteRefs) {
        if (this.isExcluded(remoteRef)) continue;
        const localRef = rule.translate(remoteRef);
        if (localRef) {
          result.push([remoteRef, localRef]);
        }
      }
    }
    return result;
  }
  translateOne(remoteRef) {
    let result = null;
    if (this.isExcluded(remoteRef)) return result;
    for (const rule of this.rules) {
      const localRef = rule.translate(remoteRef);
      if (localRef) {
        result = localRef;
      }
    }
    return result;
  }
  localNamespaces() {
    return this.rules.filter((rule) => rule.matchPrefix && rule.localPath !== null).map((rule) => rule.localPath.replace(/\/$/, ""));
  }
};
function compareRefNames(a, b) {
  const _a = a.replace(/\^\{\}$/, "");
  const _b = b.replace(/\^\{\}$/, "");
  const tmp = -(_a < _b) || +(_a > _b);
  if (tmp === 0) {
    return a.endsWith("^{}") ? 1 : -1;
  }
  return tmp;
}
var bad = /(^|[/.])([/.]|$)|^@$|@{|[\x00-\x20\x7f~^:?*[\\]|\.lock(\/|$)/;
function isValidRef(name, onelevel) {
  if (typeof name !== "string")
    throw new TypeError("Reference name must be a string");
  return !bad.test(name) && (!!onelevel || name.includes("/"));
}
function assertPath(path) {
  if (typeof path !== "string") {
    throw new TypeError(
      "Path must be a string. Received " + JSON.stringify(path)
    );
  }
}
function normalizeStringPosix(path, allowAboveRoot) {
  let res = "";
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let code;
  for (let i = 0; i <= path.length; ++i) {
    if (i < path.length) code = path.charCodeAt(i);
    else if (code === 47) break;
    else code = 47;
    if (code === 47) {
      if (lastSlash === i - 1 || dots === 1) {
      } else if (lastSlash !== i - 1 && dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 || res.charCodeAt(res.length - 2) !== 46) {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf("/");
            if (lastSlashIndex !== res.length - 1) {
              if (lastSlashIndex === -1) {
                res = "";
                lastSegmentLength = 0;
              } else {
                res = res.slice(0, lastSlashIndex);
                lastSegmentLength = res.length - 1 - res.lastIndexOf("/");
              }
              lastSlash = i;
              dots = 0;
              continue;
            }
          } else if (res.length === 2 || res.length === 1) {
            res = "";
            lastSegmentLength = 0;
            lastSlash = i;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0) res += "/..";
          else res = "..";
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0) res += "/" + path.slice(lastSlash + 1, i);
        else res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (code === 46 && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}
function getWindowsDrivePrefix(path) {
  if (path.length >= 2 && /^[a-zA-Z]:/.test(path)) {
    return path.slice(0, 2);
  }
  return null;
}
function normalize(path) {
  assertPath(path);
  if (path.length === 0) return ".";
  path = path.replace(/\\/g, "/");
  const drivePrefix = getWindowsDrivePrefix(path);
  const isAbsolute2 = path.charCodeAt(0) === 47 || drivePrefix !== null && path.charCodeAt(2) === 47;
  const trailingSeparator = path.charCodeAt(path.length - 1) === 47;
  let normalized = normalizeStringPosix(
    drivePrefix ? path.slice(2) : path,
    !isAbsolute2
  );
  if (normalized.length === 0 && !isAbsolute2) normalized = ".";
  if (normalized.length > 0 && trailingSeparator) normalized += "/";
  if (drivePrefix) {
    return isAbsolute2 ? `${drivePrefix}/${normalized}` : `${drivePrefix}${normalized}`;
  }
  return isAbsolute2 ? `/${normalized}` : normalized;
}
function join2(...args) {
  if (args.length === 0) return ".";
  let joined;
  for (let i = 0; i < args.length; ++i) {
    assertPath(args[i]);
    const arg = args[i].replace(/\\/g, "/");
    if (arg.length === 0) continue;
    if (/^[a-zA-Z]:\//.test(arg)) {
      joined = arg;
    } else if (joined === void 0) {
      joined = arg;
    } else {
      joined += "/" + arg;
    }
  }
  if (joined === void 0) return ".";
  return normalize(joined);
}
var num = (val) => {
  if (typeof val === "number") {
    return val;
  }
  val = val.toLowerCase();
  let n = parseInt(val);
  if (val.endsWith("k")) n *= 1024;
  if (val.endsWith("m")) n *= 1024 * 1024;
  if (val.endsWith("g")) n *= 1024 * 1024 * 1024;
  return n;
};
var bool = (val) => {
  if (typeof val === "boolean") {
    return val;
  }
  val = val.trim().toLowerCase();
  if (val === "true" || val === "yes" || val === "on") return true;
  if (val === "false" || val === "no" || val === "off") return false;
  throw Error(
    `Expected 'true', 'false', 'yes', 'no', 'on', or 'off', but got ${val}`
  );
};
var schema = {
  core: {
    filemode: bool,
    bare: bool,
    logallrefupdates: bool,
    symlinks: bool,
    ignorecase: bool,
    bigFileThreshold: num
  }
};
var SECTION_LINE_REGEX = /^\[([A-Za-z0-9-.]+)(?:[ \t]+"((?:[^"\\]|\\.)*)")?\][ \t]*(?:[#;].*)?$/;
var SECTION_REGEX = /^[A-Za-z0-9-.]+$/;
var VARIABLE_LINE_REGEX = /^([A-Za-z][A-Za-z0-9-]*)(?:\s*=\s*(.*))?$/;
var VARIABLE_NAME_REGEX = /^[A-Za-z][A-Za-z0-9-]*$/;
var extractSectionLine = (line) => {
  const matches2 = SECTION_LINE_REGEX.exec(line);
  if (matches2 != null) {
    const [section, subsection] = matches2.slice(1);
    return [section, subsection && subsection.replace(/\\(.)/g, "$1")];
  }
  return null;
};
var extractVariableLine = (line) => {
  const matches2 = VARIABLE_LINE_REGEX.exec(line);
  if (matches2 != null) {
    const [name, rawValue = "true"] = matches2.slice(1);
    return [name, parseValue(rawValue)];
  }
  return null;
};
var ESCAPED_CHARS = /* @__PURE__ */ new Map([
  ["t", "	"],
  ["b", "\b"],
  ["n", "\n"],
  ["\\", "\\"],
  ['"', '"']
]);
var parseValue = (rawValue) => {
  let value = "";
  let pendingSpace = "";
  let inQuotes = false;
  for (let i = 0; i < rawValue.length; i++) {
    const c = rawValue[i];
    if (!inQuotes && /[ \t\r\v\f]/.test(c)) {
      if (value !== "") pendingSpace += c;
      continue;
    }
    if (!inQuotes && (c === "#" || c === ";")) break;
    value += pendingSpace;
    pendingSpace = "";
    if (c === "\\" && ESCAPED_CHARS.has(rawValue[i + 1])) {
      value += ESCAPED_CHARS.get(rawValue[++i]);
    } else if (c === '"') {
      inQuotes = !inQuotes;
    } else {
      value += c;
    }
  }
  return value;
};
var serializeValue = (value) => {
  if (typeof value !== "string") return value;
  const quote = value.startsWith(" ") || value.endsWith(" ") || /[#;]/.test(value) ? '"' : "";
  const escaped = value.replace(/[\\"\n\t]/g, (c) => {
    if (c === "\n") return "\\n";
    if (c === "	") return "\\t";
    return `\\${c}`;
  });
  return `${quote}${escaped}${quote}`;
};
var lower = (text) => {
  return text != null ? text.toLowerCase() : null;
};
var getPath = (section, subsection, name) => {
  return [lower(section), subsection, lower(name)].filter((a) => a != null).join(".");
};
var normalizePath = (path) => {
  const pathSegments = path.split(".");
  const section = pathSegments.shift();
  const name = pathSegments.pop();
  const subsection = pathSegments.length ? pathSegments.join(".") : void 0;
  return {
    section,
    subsection,
    name,
    path: getPath(section, subsection, name),
    sectionPath: getPath(section, subsection, null),
    isSection: !!section
  };
};
var findLastIndex = (array, callback) => {
  return array.reduce((lastIndex, item, index) => {
    return callback(item) ? index : lastIndex;
  }, -1);
};
var GitConfig = class _GitConfig {
  constructor(text) {
    let section = null;
    let subsection = null;
    this.parsedConfig = text ? text.split("\n").map((line) => {
      let name = null;
      let value = null;
      const trimmedLine = line.trim();
      const extractedSection = extractSectionLine(trimmedLine);
      const isSection = extractedSection != null;
      if (isSection) {
        ;
        [section, subsection] = extractedSection;
      } else {
        const extractedVariable = extractVariableLine(trimmedLine);
        const isVariable = extractedVariable != null;
        if (isVariable) {
          ;
          [name, value] = extractedVariable;
        }
      }
      const path = getPath(section, subsection, name);
      return { line, isSection, section, subsection, name, value, path };
    }) : [];
  }
  static from(text) {
    return new _GitConfig(text);
  }
  async get(path, getall = false) {
    const normalizedPath = normalizePath(path).path;
    const allValues = this.parsedConfig.filter((config) => config.path === normalizedPath).map(({ section, name, value }) => {
      const fn = schema[section] && schema[section][name];
      return fn ? fn(value) : value;
    });
    return getall ? allValues : allValues.pop();
  }
  async getall(path) {
    return this.get(path, true);
  }
  async getSubsections(section) {
    return this.parsedConfig.filter((config) => config.isSection && config.section === section).map((config) => config.subsection);
  }
  async deleteSection(section, subsection) {
    this.parsedConfig = this.parsedConfig.filter(
      (config) => !(config.section === section && config.subsection === subsection)
    );
  }
  async append(path, value) {
    return this.set(path, value, true);
  }
  async set(path, value, append = false) {
    const {
      section,
      subsection,
      name,
      path: normalizedPath,
      sectionPath,
      isSection
    } = normalizePath(path);
    const configIndex = findLastIndex(
      this.parsedConfig,
      (config) => config.path === normalizedPath
    );
    if (value == null) {
      if (configIndex !== -1) {
        this.parsedConfig.splice(configIndex, 1);
      }
    } else {
      if (configIndex !== -1) {
        const config = this.parsedConfig[configIndex];
        const modifiedConfig = Object.assign({}, config, {
          name,
          value,
          modified: true
        });
        if (append) {
          this.parsedConfig.splice(configIndex + 1, 0, modifiedConfig);
        } else {
          this.parsedConfig[configIndex] = modifiedConfig;
        }
      } else {
        const sectionIndex = this.parsedConfig.findIndex(
          (config) => config.path === sectionPath
        );
        const newConfig = {
          section,
          subsection,
          name,
          value,
          modified: true,
          path: normalizedPath
        };
        if (SECTION_REGEX.test(section) && VARIABLE_NAME_REGEX.test(name)) {
          if (sectionIndex >= 0) {
            this.parsedConfig.splice(sectionIndex + 1, 0, newConfig);
          } else {
            const newSection = {
              isSection,
              section,
              subsection,
              modified: true,
              path: sectionPath
            };
            this.parsedConfig.push(newSection, newConfig);
          }
        }
      }
    }
  }
  toString() {
    return this.parsedConfig.map(({ line, section, subsection, name, value, modified = false }) => {
      if (!modified) {
        return line;
      }
      if (name != null && value != null) {
        return `	${name} = ${serializeValue(value)}`;
      }
      if (subsection != null) {
        return `[${section} "${subsection}"]`;
      }
      return `[${section}]`;
    }).join("\n");
  }
};
var GitConfigManager = class {
  /**
   * Reads the Git configuration file from the specified `.git` directory.
   *
   * @param {object} opts - Options for reading the Git configuration.
   * @param {FSClient} opts.fs - A file system implementation.
   * @param {string} opts.gitdir - The path to the `.git` directory.
   * @returns {Promise<GitConfig>} A `GitConfig` object representing the parsed configuration.
   */
  static async get({ fs, gitdir }) {
    const text = await fs.read(`${gitdir}/config`, { encoding: "utf8" });
    return GitConfig.from(text);
  }
  /**
   * Saves the provided Git configuration to the specified `.git` directory.
   *
   * @param {object} opts - Options for saving the Git configuration.
   * @param {FSClient} opts.fs - A file system implementation.
   * @param {string} opts.gitdir - The path to the `.git` directory.
   * @param {GitConfig} opts.config - The `GitConfig` object to save.
   * @returns {Promise<void>} Resolves when the configuration has been successfully saved.
   */
  static async save({ fs, gitdir, config }) {
    await fs.write(`${gitdir}/config`, config.toString(), {
      encoding: "utf8"
    });
  }
};
var refpaths = (ref) => [
  `${ref}`,
  `refs/${ref}`,
  `refs/tags/${ref}`,
  `refs/heads/${ref}`,
  `refs/remotes/${ref}`,
  `refs/remotes/${ref}/HEAD`
];
var GIT_FILES = ["config", "description", "index", "shallow", "commondir"];
function assertWritableRef(ref) {
  if (GIT_FILES.includes(ref)) {
    throw new InvalidRefNameError(ref, `refs/heads/${ref}`);
  }
  if (!isValidRef(ref, true)) {
    throw new InvalidRefNameError(ref, import_clean_git_ref.default.clean(ref));
  }
}
var GitRefManager = class _GitRefManager {
  /**
   * Updates remote refs based on the provided refspecs and options.
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation.
   * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
   * @param {string} args.remote - The name of the remote.
   * @param {Map<string, string>} args.refs - A map of refs to their object IDs.
   * @param {Map<string, string>} args.symrefs - A map of symbolic refs.
   * @param {boolean} args.tags - Whether to fetch tags.
   * @param {string[]} [args.refspecs = undefined] - The refspecs to use.
   * @param {boolean} [args.prune = false] - Whether to prune stale refs.
   * @param {boolean} [args.pruneTags = false] - Whether to prune tags.
   * @returns {Promise<Object>} - An object containing pruned refs.
   */
  static async updateRemoteRefs({
    fs,
    gitdir,
    remote,
    refs,
    symrefs,
    tags,
    refspecs = void 0,
    prune = false,
    pruneTags = false
  }) {
    for (const value of refs.values()) {
      if (!value.match(/[0-9a-f]{40}/)) {
        throw new InvalidOidError(value);
      }
    }
    const config = await GitConfigManager.get({ fs, gitdir });
    if (!refspecs) {
      refspecs = await config.getall(`remote.${remote}.fetch`);
      if (refspecs.length === 0) {
        throw new NoRefspecError(remote);
      }
      refspecs.unshift(`+HEAD:refs/remotes/${remote}/HEAD`);
    }
    const refspec = GitRefSpecSet.from(refspecs);
    const actualRefsToWrite = /* @__PURE__ */ new Map();
    const refTranslations = refspec.translate([...refs.keys()]);
    const symrefTranslations = [];
    for (const [serverRef, translatedRef] of refspec.translate([
      ...symrefs.keys()
    ])) {
      const symtarget = refspec.translateOne(symrefs.get(serverRef));
      if (symtarget) {
        assertWritableRef(symtarget);
        symrefTranslations.push([translatedRef, `ref: ${symtarget}`]);
      }
    }
    const tagRefsToWrite = tags ? [...refs.keys()].filter(
      (serverRef) => serverRef.startsWith("refs/tags") && !serverRef.endsWith("^{}")
    ) : [];
    for (const [, translatedRef] of refTranslations) {
      assertWritableRef(translatedRef);
    }
    for (const [translatedRef] of symrefTranslations) {
      assertWritableRef(translatedRef);
    }
    tagRefsToWrite.forEach(assertWritableRef);
    if (pruneTags) {
      const tags2 = await _GitRefManager.listRefs({
        fs,
        gitdir,
        filepath: "refs/tags"
      });
      await _GitRefManager.deleteRefs({
        fs,
        gitdir,
        refs: tags2.map((tag) => `refs/tags/${tag}`)
      });
    }
    for (const serverRef of tagRefsToWrite) {
      if (!await _GitRefManager.exists({ fs, gitdir, ref: serverRef })) {
        const oid = refs.get(serverRef);
        actualRefsToWrite.set(serverRef, oid);
      }
    }
    for (const [serverRef, translatedRef] of refTranslations) {
      const value = refs.get(serverRef);
      actualRefsToWrite.set(translatedRef, value);
    }
    for (const [translatedRef, value] of symrefTranslations) {
      actualRefsToWrite.set(translatedRef, value);
    }
    const pruned = [];
    if (prune) {
      for (const filepath of refspec.localNamespaces()) {
        const refs2 = (await _GitRefManager.listRefs({
          fs,
          gitdir,
          filepath
        })).map((file) => `${filepath}/${file}`);
        for (const ref of refs2) {
          if (!actualRefsToWrite.has(ref)) {
            pruned.push(ref);
          }
        }
      }
      if (pruned.length > 0) {
        await _GitRefManager.deleteRefs({ fs, gitdir, refs: pruned });
      }
    }
    for (const [key, value] of actualRefsToWrite) {
      await acquireLock(
        key,
        async () => fs.write(join2(gitdir, key), `${value.trim()}
`, "utf8")
      );
    }
    return { pruned };
  }
  /**
   * Writes a ref to the file system.
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation.
   * @param {string} [args.gitdir] - [required] The [git directory](dir-vs-gitdir.md) path
   * @param {string} args.ref - The ref to write.
   * @param {string} args.value - The object ID to write.
   * @returns {Promise<void>}
   */
  // TODO: make this less crude?
  static async writeRef({ fs, gitdir, ref, value }) {
    assertWritableRef(ref);
    if (!value.match(/[0-9a-f]{40}/)) {
      throw new InvalidOidError(value);
    }
    await acquireLock(
      ref,
      async () => fs.write(join2(gitdir, ref), `${value.trim()}
`, "utf8")
    );
  }
  /**
   * Writes a symbolic ref to the file system.
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation.
   * @param {string} [args.gitdir] - [required] The [git directory](dir-vs-gitdir.md) path
   * @param {string} args.ref - The ref to write.
   * @param {string} args.value - The target ref.
   * @returns {Promise<void>}
   */
  static async writeSymbolicRef({ fs, gitdir, ref, value }) {
    assertWritableRef(ref);
    await acquireLock(
      ref,
      async () => fs.write(join2(gitdir, ref), `ref: ${value.trim()}
`, "utf8")
    );
  }
  /**
   * Deletes a single ref.
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation.
   * @param {string} [args.gitdir] - [required] The [git directory](dir-vs-gitdir.md) path
   * @param {string} args.ref - The ref to delete.
   * @returns {Promise<void>}
   */
  static async deleteRef({ fs, gitdir, ref }) {
    return _GitRefManager.deleteRefs({ fs, gitdir, refs: [ref] });
  }
  /**
   * Deletes multiple refs.
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation.
   * @param {string} [args.gitdir] - [required] The [git directory](dir-vs-gitdir.md) path
   * @param {string[]} args.refs - The refs to delete.
   * @returns {Promise<void>}
   */
  static async deleteRefs({ fs, gitdir, refs }) {
    refs.forEach(assertWritableRef);
    await Promise.all(refs.map((ref) => fs.rm(join2(gitdir, ref))));
    let text = await acquireLock(
      "packed-refs",
      async () => fs.read(`${gitdir}/packed-refs`, { encoding: "utf8" })
    );
    const packed = GitPackedRefs.from(text);
    const beforeSize = packed.refs.size;
    for (const ref of refs) {
      if (packed.refs.has(ref)) {
        packed.delete(ref);
      }
    }
    if (packed.refs.size < beforeSize) {
      text = packed.toString();
      await acquireLock(
        "packed-refs",
        async () => fs.write(`${gitdir}/packed-refs`, text, { encoding: "utf8" })
      );
    }
  }
  /**
   * Resolves a ref to its object ID.
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation.
   * @param {string} [args.gitdir] - [required] The [git directory](dir-vs-gitdir.md) path
   * @param {string} args.ref - The ref to resolve.
   * @param {number} [args.depth = undefined] - The maximum depth to resolve symbolic refs.
   * @returns {Promise<string>} - The resolved object ID.
   */
  static async resolve({
    fs,
    gitdir,
    ref,
    depth = void 0,
    visited = /* @__PURE__ */ new Set()
  }) {
    if (depth !== void 0) {
      depth--;
      if (depth === -1) {
        return ref;
      }
    }
    if (ref.startsWith("ref: ")) {
      ref = ref.slice("ref: ".length);
      return _GitRefManager.resolve({ fs, gitdir, ref, depth, visited });
    }
    if (ref.length === 40 && /[0-9a-f]{40}/.test(ref)) {
      return ref;
    }
    const packedMap = await _GitRefManager.packedRefs({ fs, gitdir });
    const allpaths = refpaths(ref).filter((p) => !GIT_FILES.includes(p));
    for (const ref2 of allpaths) {
      const sha = await acquireLock(
        ref2,
        async () => await fs.read(`${gitdir}/${ref2}`, { encoding: "utf8" }) || packedMap.get(ref2)
      );
      if (sha) {
        if (visited.has(ref2)) {
          throw new InternalError(
            `Circular reference detected while resolving ref "${ref2}"`
          );
        }
        visited.add(ref2);
        return _GitRefManager.resolve({
          fs,
          gitdir,
          ref: sha.trim(),
          depth,
          visited
        });
      }
    }
    throw new NotFoundError(ref);
  }
  /**
   * Checks whether a ref names the branch HEAD points at in a repository where
   * that branch has no commits yet.
   *
   * A repository created by `git init` has a HEAD pointing at a branch that
   * does not exist on disk. Resolving that branch fails the same way resolving
   * a misspelled ref does, so callers that want to treat the two differently
   * need this to tell them apart.
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation.
   * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
   * @param {string} args.ref - The ref to check.
   * @returns {Promise<boolean>} - True if the ref names an unborn branch.
   */
  static async isUnbornBranch({ fs, gitdir, ref }) {
    let target;
    try {
      target = await _GitRefManager.resolve({
        fs,
        gitdir,
        ref: "HEAD",
        depth: 2
      });
    } catch (err) {
      if (err instanceof NotFoundError) return false;
      throw err;
    }
    if (!target.startsWith("refs/heads/")) return false;
    return ref === "HEAD" || refpaths(ref).includes(target);
  }
  /**
   * Checks if a ref exists.
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation.
   * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
   * @param {string} args.ref - The ref to check.
   * @returns {Promise<boolean>} - True if the ref exists, false otherwise.
   */
  static async exists({ fs, gitdir, ref }) {
    try {
      await _GitRefManager.expand({ fs, gitdir, ref });
      return true;
    } catch (err) {
      if (err instanceof NotFoundError) return false;
      throw err;
    }
  }
  /**
   * Expands a ref to its full name.
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation.
   * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
   * @param {string} args.ref - The ref to expand.
   * @returns {Promise<string>} - The full ref name.
   */
  static async expand({ fs, gitdir, ref }) {
    if (ref.length === 40 && /[0-9a-f]{40}/.test(ref)) {
      return ref;
    }
    const packedMap = await _GitRefManager.packedRefs({ fs, gitdir });
    const allpaths = refpaths(ref).filter((p) => !GIT_FILES.includes(p));
    for (const ref2 of allpaths) {
      const refExists = await acquireLock(
        ref2,
        async () => fs.exists(`${gitdir}/${ref2}`)
      );
      if (refExists) return ref2;
      if (packedMap.has(ref2)) return ref2;
    }
    throw new NotFoundError(ref);
  }
  /**
   * Expands a ref against a provided map.
   *
   * @param {Object} args
   * @param {string} args.ref - The ref to expand.
   * @param {Map<string, string>} args.map - The map of refs.
   * @returns {Promise<string>} - The expanded ref.
   */
  static async expandAgainstMap({ ref, map }) {
    const allpaths = refpaths(ref);
    for (const ref2 of allpaths) {
      if (await map.has(ref2)) return ref2;
    }
    throw new NotFoundError(ref);
  }
  /**
   * Resolves a ref against a provided map.
   *
   * @param {Object} args
   * @param {string} args.ref - The ref to resolve.
   * @param {string} [args.fullref = args.ref] - The full ref name.
   * @param {number} [args.depth = undefined] - The maximum depth to resolve symbolic refs.
   * @param {Map<string, string>} args.map - The map of refs.
   * @returns {Object} - An object containing the full ref and its object ID.
   */
  static resolveAgainstMap({ ref, fullref = ref, depth = void 0, map }) {
    if (depth !== void 0) {
      depth--;
      if (depth === -1) {
        return { fullref, oid: ref };
      }
    }
    if (ref.startsWith("ref: ")) {
      ref = ref.slice("ref: ".length);
      return _GitRefManager.resolveAgainstMap({ ref, fullref, depth, map });
    }
    if (ref.length === 40 && /[0-9a-f]{40}/.test(ref)) {
      return { fullref, oid: ref };
    }
    const allpaths = refpaths(ref);
    for (const ref2 of allpaths) {
      const sha = map.get(ref2);
      if (sha) {
        return _GitRefManager.resolveAgainstMap({
          ref: sha.trim(),
          fullref: ref2,
          depth,
          map
        });
      }
    }
    throw new NotFoundError(ref);
  }
  /**
   * Reads the packed refs file and returns a map of refs.
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation.
   * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
   * @returns {Promise<Map<string, string>>} - A map of packed refs.
   */
  static async packedRefs({ fs, gitdir }) {
    const text = await acquireLock(
      "packed-refs",
      async () => fs.read(`${gitdir}/packed-refs`, { encoding: "utf8" })
    );
    const packed = GitPackedRefs.from(text);
    return packed.refs;
  }
  /**
   * Lists all refs matching a given filepath prefix.
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation.
   * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
   * @param {string} args.filepath - The filepath prefix to match.
   * @returns {Promise<string[]>} - A sorted list of refs.
   */
  static async listRefs({ fs, gitdir, filepath }) {
    const packedMap = await _GitRefManager.packedRefs({ fs, gitdir });
    let files = null;
    try {
      files = await fs.readdirDeep(`${gitdir}/${filepath}`);
      files = files.map((x) => x.replace(`${gitdir}/${filepath}/`, ""));
    } catch (err) {
      files = [];
    }
    for (let key of packedMap.keys()) {
      if (key.startsWith(filepath)) {
        key = key.replace(filepath + "/", "");
        if (!files.includes(key)) {
          files.push(key);
        }
      }
    }
    files.sort(compareRefNames);
    return files;
  }
  /**
   * Lists all branches, optionally filtered by remote.
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation.
   * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
   * @param {string} [args.remote] - The remote to filter branches by.
   * @returns {Promise<string[]>} - A list of branch names.
   */
  static async listBranches({ fs, gitdir, remote }) {
    if (remote) {
      return _GitRefManager.listRefs({
        fs,
        gitdir,
        filepath: `refs/remotes/${remote}`
      });
    } else {
      return _GitRefManager.listRefs({ fs, gitdir, filepath: `refs/heads` });
    }
  }
  /**
   * Lists all tags.
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation.
   * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
   * @returns {Promise<string[]>} - A list of tag names.
   */
  static async listTags({ fs, gitdir }) {
    const tags = await _GitRefManager.listRefs({
      fs,
      gitdir,
      filepath: `refs/tags`
    });
    return tags.filter((x) => !x.endsWith("^{}"));
  }
};
function compareTreeEntryPath(a, b) {
  return compareStrings(appendSlashIfDir(a), appendSlashIfDir(b));
}
function appendSlashIfDir(entry) {
  return entry.mode === "040000" ? entry.path + "/" : entry.path;
}
function mode2type$1(mode) {
  switch (mode) {
    case "040000":
      return "tree";
    case "100644":
      return "blob";
    case "100755":
      return "blob";
    case "120000":
      return "blob";
    case "160000":
      return "commit";
  }
  throw new InternalError(`Unexpected GitTree entry mode: ${mode}`);
}
function stripTrailingDotsAndSpaces(name) {
  let end = name.length;
  while (end > 0) {
    const c = name.charCodeAt(end - 1);
    if (c !== 46 && c !== 32) break;
    end--;
  }
  return end === name.length ? name : name.slice(0, end);
}
function assertSafeEntryPath(path) {
  const hfsClean = path.replace(
    /[\u200C-\u200F\u202A-\u202E\u206A-\u206F\uFEFF]/g,
    ""
  );
  const ntfsClean = hfsClean.split(":")[0];
  const normalized = stripTrailingDotsAndSpaces(ntfsClean.toLowerCase());
  if (path.includes("\\") || path.includes("/") || normalized === "" && ntfsClean !== "" || normalized === ".git" || /^\.?git~[1-9]$/.test(normalized)) {
    throw new UnsafeFilepathError(path);
  }
}
function parseBuffer(buffer) {
  const _entries = [];
  let cursor = 0;
  while (cursor < buffer.length) {
    const space = buffer.indexOf(32, cursor);
    if (space === -1) {
      throw new InternalError(
        `GitTree: Error parsing buffer at byte location ${cursor}: Could not find the next space character.`
      );
    }
    const nullchar = buffer.indexOf(0, cursor);
    if (nullchar === -1) {
      throw new InternalError(
        `GitTree: Error parsing buffer at byte location ${cursor}: Could not find the next null character.`
      );
    }
    let mode = buffer.slice(cursor, space).toString("utf8");
    if (mode === "40000") mode = "040000";
    const type = mode2type$1(mode);
    const path = buffer.slice(space + 1, nullchar).toString("utf8");
    assertSafeEntryPath(path);
    const oid = buffer.slice(nullchar + 1, nullchar + 21).toString("hex");
    cursor = nullchar + 21;
    _entries.push({ mode, path, oid, type });
  }
  return _entries;
}
function limitModeToAllowed(mode) {
  if (typeof mode === "number") {
    mode = mode.toString(8);
  }
  if (mode.match(/^0?4.*/)) return "040000";
  if (mode.match(/^1006.*/)) return "100644";
  if (mode.match(/^1007.*/)) return "100755";
  if (mode.match(/^120.*/)) return "120000";
  if (mode.match(/^160.*/)) return "160000";
  throw new InternalError(`Could not understand file mode: ${mode}`);
}
function nudgeIntoShape(entry) {
  if (!entry.oid && entry.sha) {
    entry.oid = entry.sha;
  }
  entry.mode = limitModeToAllowed(entry.mode);
  if (!entry.type) {
    entry.type = mode2type$1(entry.mode);
  }
  assertSafeEntryPath(entry.path);
  return entry;
}
var GitTree = class _GitTree {
  constructor(entries) {
    if (import_buffer.Buffer.isBuffer(entries)) {
      this._entries = parseBuffer(entries);
    } else if (Array.isArray(entries)) {
      this._entries = entries.map(nudgeIntoShape);
    } else {
      throw new InternalError("invalid type passed to GitTree constructor");
    }
    this._entries.sort(comparePath);
  }
  static from(tree) {
    return new _GitTree(tree);
  }
  render() {
    return this._entries.map((entry) => `${entry.mode} ${entry.type} ${entry.oid}    ${entry.path}`).join("\n");
  }
  toObject() {
    const entries = [...this._entries];
    entries.sort(compareTreeEntryPath);
    return import_buffer.Buffer.concat(
      entries.map((entry) => {
        const mode = import_buffer.Buffer.from(entry.mode.replace(/^0/, ""));
        const space = import_buffer.Buffer.from(" ");
        const path = import_buffer.Buffer.from(entry.path, "utf8");
        const nullchar = import_buffer.Buffer.from([0]);
        const oid = import_buffer.Buffer.from(entry.oid, "hex");
        return import_buffer.Buffer.concat([mode, space, path, nullchar, oid]);
      })
    );
  }
  /**
   * @returns {TreeEntry[]}
   */
  entries() {
    return this._entries;
  }
  *[Symbol.iterator]() {
    for (const entry of this._entries) {
      yield entry;
    }
  }
};
var GitObject = class {
  /**
   * Wraps a raw object with a Git header.
   *
   * @param {Object} params - The parameters for wrapping.
   * @param {string} params.type - The type of the Git object (e.g., 'blob', 'tree', 'commit').
   * @param {Uint8Array} params.object - The raw object data to wrap.
   * @returns {Uint8Array} The wrapped Git object as a single buffer.
   */
  static wrap({ type, object: object2 }) {
    const header = `${type} ${object2.length}\0`;
    const headerLen = header.length;
    const totalLength = headerLen + object2.length;
    const wrappedObject = new Uint8Array(totalLength);
    for (let i = 0; i < headerLen; i++) {
      wrappedObject[i] = header.charCodeAt(i);
    }
    wrappedObject.set(object2, headerLen);
    return wrappedObject;
  }
  /**
   * Unwraps a Git object buffer into its type and raw object data.
   *
   * @param {Buffer|Uint8Array} buffer - The buffer containing the wrapped Git object.
   * @returns {{ type: string, object: Buffer }} An object containing the type and the raw object data.
   * @throws {InternalError} If the length specified in the header does not match the actual object length.
   */
  static unwrap(buffer) {
    const s = buffer.indexOf(32);
    const i = buffer.indexOf(0);
    const type = buffer.slice(0, s).toString("utf8");
    const length = buffer.slice(s + 1, i).toString("utf8");
    const actualLength = buffer.length - (i + 1);
    if (parseInt(length) !== actualLength) {
      throw new InternalError(
        `Length mismatch: expected ${length} bytes but got ${actualLength} instead.`
      );
    }
    return {
      type,
      object: import_buffer.Buffer.from(buffer.slice(i + 1))
    };
  }
};
async function readObjectLoose({ fs, gitdir, oid }) {
  const source = `objects/${oid.slice(0, 2)}/${oid.slice(2)}`;
  const file = await fs.read(`${gitdir}/${source}`);
  if (!file) {
    return null;
  }
  return { object: file, format: "deflated", source };
}
function applyDelta(delta, source) {
  const reader = new BufferCursor(delta);
  const sourceSize = readVarIntLE(reader);
  if (sourceSize !== source.byteLength) {
    throw new InternalError(
      `applyDelta expected source buffer to be ${sourceSize} bytes but the provided buffer was ${source.length} bytes`
    );
  }
  const targetSize = readVarIntLE(reader);
  let target;
  const firstOp = readOp(reader, source);
  if (firstOp.byteLength === targetSize) {
    target = firstOp;
  } else {
    const chunks = [firstOp];
    let tell = firstOp.byteLength;
    while (!reader.eof()) {
      const op = readOp(reader, source);
      chunks.push(op);
      tell += op.byteLength;
    }
    if (targetSize !== tell) {
      throw new InternalError(
        `applyDelta expected target buffer to be ${targetSize} bytes but the resulting buffer was ${tell} bytes`
      );
    }
    target = import_buffer.Buffer.concat(chunks, targetSize);
  }
  return target;
}
function readVarIntLE(reader) {
  let result = 0;
  let shift = 0;
  let byte = null;
  do {
    byte = reader.readUInt8();
    result |= (byte & 127) << shift;
    shift += 7;
  } while (byte & 128);
  return result;
}
function readCompactLE(reader, flags, size) {
  let result = 0;
  let shift = 0;
  while (size--) {
    if (flags & 1) {
      result |= reader.readUInt8() << shift;
    }
    flags >>= 1;
    shift += 8;
  }
  return result;
}
function readOp(reader, source) {
  const byte = reader.readUInt8();
  const COPY = 128;
  const OFFS = 15;
  const SIZE = 112;
  if (byte & COPY) {
    const offset = readCompactLE(reader, byte & OFFS, 4);
    let size = readCompactLE(reader, (byte & SIZE) >> 4, 3);
    if (size === 0) size = 65536;
    return source.slice(offset, offset + size);
  } else {
    return reader.slice(byte);
  }
}
function fromValue(value) {
  let queue = [value];
  return {
    next() {
      return Promise.resolve({ done: queue.length === 0, value: queue.pop() });
    },
    return() {
      queue = [];
      return {};
    },
    [Symbol.asyncIterator]() {
      return this;
    }
  };
}
function getIterator(iterable) {
  if (iterable[Symbol.asyncIterator]) {
    return iterable[Symbol.asyncIterator]();
  }
  if (iterable[Symbol.iterator]) {
    return iterable[Symbol.iterator]();
  }
  if (iterable.next) {
    return iterable;
  }
  return fromValue(iterable);
}
var StreamReader = class {
  constructor(stream) {
    if (typeof import_buffer.Buffer === "undefined") {
      throw new Error("Missing Buffer dependency");
    }
    this.stream = getIterator(stream);
    this.buffer = null;
    this.cursor = 0;
    this.undoCursor = 0;
    this.started = false;
    this._ended = false;
    this._discardedBytes = 0;
  }
  eof() {
    return this._ended && this.cursor === this.buffer.length;
  }
  tell() {
    return this._discardedBytes + this.cursor;
  }
  async byte() {
    if (this.eof()) return;
    if (!this.started) await this._init();
    if (this.cursor === this.buffer.length) {
      await this._loadnext();
      if (this._ended) return;
    }
    this._moveCursor(1);
    return this.buffer[this.undoCursor];
  }
  async chunk() {
    if (this.eof()) return;
    if (!this.started) await this._init();
    if (this.cursor === this.buffer.length) {
      await this._loadnext();
      if (this._ended) return;
    }
    this._moveCursor(this.buffer.length);
    return this.buffer.slice(this.undoCursor, this.cursor);
  }
  async read(n) {
    if (this.eof()) return;
    if (!this.started) await this._init();
    if (this.cursor + n > this.buffer.length) {
      this._trim();
      await this._accumulate(n);
    }
    this._moveCursor(n);
    return this.buffer.slice(this.undoCursor, this.cursor);
  }
  async skip(n) {
    if (this.eof()) return;
    if (!this.started) await this._init();
    if (this.cursor + n > this.buffer.length) {
      this._trim();
      await this._accumulate(n);
    }
    this._moveCursor(n);
  }
  async undo() {
    this.cursor = this.undoCursor;
  }
  async _next() {
    this.started = true;
    let { done, value } = await this.stream.next();
    if (done) {
      this._ended = true;
      if (!value) return import_buffer.Buffer.alloc(0);
    }
    if (value) {
      value = import_buffer.Buffer.from(value);
    }
    return value;
  }
  _trim() {
    this.buffer = this.buffer.slice(this.undoCursor);
    this.cursor -= this.undoCursor;
    this._discardedBytes += this.undoCursor;
    this.undoCursor = 0;
  }
  _moveCursor(n) {
    this.undoCursor = this.cursor;
    this.cursor += n;
    if (this.cursor > this.buffer.length) {
      this.cursor = this.buffer.length;
    }
  }
  async _accumulate(n) {
    if (this._ended) return;
    const buffers = [this.buffer];
    while (this.cursor + n > lengthBuffers(buffers)) {
      const nextbuffer = await this._next();
      if (this._ended) break;
      buffers.push(nextbuffer);
    }
    this.buffer = import_buffer.Buffer.concat(buffers);
  }
  async _loadnext() {
    this._discardedBytes += this.buffer.length;
    this.undoCursor = 0;
    this.cursor = 0;
    this.buffer = await this._next();
  }
  async _init() {
    this.buffer = await this._next();
  }
};
function lengthBuffers(buffers) {
  return buffers.reduce((acc, buffer) => acc + buffer.length, 0);
}
async function listpack(stream, onData) {
  const reader = new StreamReader(stream);
  let PACK = await reader.read(4);
  PACK = PACK.toString("utf8");
  if (PACK !== "PACK") {
    throw new InternalError(`Invalid PACK header '${PACK}'`);
  }
  let version = await reader.read(4);
  version = version.readUInt32BE(0);
  if (version !== 2) {
    throw new InternalError(`Invalid packfile version: ${version}`);
  }
  let numObjects = await reader.read(4);
  numObjects = numObjects.readUInt32BE(0);
  if (numObjects < 1) return;
  while (!reader.eof() && numObjects--) {
    const offset = reader.tell();
    const { type, length, ofs, reference } = await parseHeader(reader);
    const inflator = new import_pako.default.Inflate();
    while (!inflator.result) {
      const chunk = await reader.chunk();
      if (!chunk) break;
      inflator.push(chunk, false);
      if (inflator.err) {
        throw new InternalError(`Pako error: ${inflator.msg}`);
      }
      if (inflator.result) {
        if (inflator.result.length !== length) {
          throw new InternalError(
            `Inflated object size is different from that stated in packfile.`
          );
        }
        await reader.undo();
        await reader.read(chunk.length - inflator.strm.avail_in);
        const end = reader.tell();
        await onData({
          data: inflator.result,
          type,
          num: numObjects,
          offset,
          end,
          reference,
          ofs
        });
      }
    }
  }
}
async function parseHeader(reader) {
  let byte = await reader.byte();
  const type = byte >> 4 & 7;
  let length = byte & 15;
  if (byte & 128) {
    let shift = 4;
    do {
      byte = await reader.byte();
      length |= (byte & 127) << shift;
      shift += 7;
    } while (byte & 128);
  }
  let ofs;
  let reference;
  if (type === 6) {
    let shift = 0;
    ofs = 0;
    const bytes = [];
    do {
      byte = await reader.byte();
      ofs |= (byte & 127) << shift;
      shift += 7;
      bytes.push(byte);
    } while (byte & 128);
    reference = import_buffer.Buffer.from(bytes);
  }
  if (type === 7) {
    const buf = await reader.read(20);
    reference = buf;
  }
  return { type, length, ofs, reference };
}
var DecompressionError = class _DecompressionError extends BaseError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(`Invalid compressed buffer: ${message}`);
    this.code = this.name = _DecompressionError.code;
    this.data = { message };
  }
};
DecompressionError.code = "DecompressionError";
async function nativeInflate(buffer) {
  const ds = new DecompressionStream("deflate");
  const d = new Blob([buffer]).stream().pipeThrough(ds);
  try {
    return new Uint8Array(await new Response(d).arrayBuffer());
  } catch (err) {
    if (err && err.name === "TypeError" && err.message === "") {
      throw new DecompressionError("decompression failed");
    }
    throw err;
  }
}
var supportsDecompressionStream = false;
async function inflate(buffer) {
  if (supportsDecompressionStream === null) {
    supportsDecompressionStream = testDecompressionStream();
  }
  try {
    return supportsDecompressionStream ? await nativeInflate(buffer) : import_pako.default.inflate(buffer);
  } catch (err) {
    if (typeof err === "string") {
      throw new DecompressionError(err);
    }
    throw err;
  }
}
function testDecompressionStream() {
  try {
    const ds = new DecompressionStream("deflate");
    if (ds) return true;
  } catch (_) {
  }
  return false;
}
function decodeVarInt(reader) {
  const bytes = [];
  let byte = 0;
  let multibyte = 0;
  do {
    byte = reader.readUInt8();
    const lastSeven = byte & 127;
    bytes.push(lastSeven);
    multibyte = byte & 128;
  } while (multibyte);
  return bytes.reduce((a, b) => a + 1 << 7 | b, -1);
}
function otherVarIntDecode(reader, startWith) {
  let result = startWith;
  let shift = 4;
  let byte = null;
  do {
    byte = reader.readUInt8();
    result |= (byte & 127) << shift;
    shift += 7;
  } while (byte & 128);
  return result;
}
var RESOLVE_CACHE_BYTES = 32 * 1024 * 1024;
var ObjectCache = class {
  constructor(maxBytes) {
    this.maxBytes = maxBytes;
    this.bytes = 0;
    this.map = /* @__PURE__ */ new Map();
  }
  get(key) {
    const value = this.map.get(key);
    if (value !== void 0) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }
  set(key, value) {
    const size = value.object.byteLength;
    if (size > this.maxBytes / 4) return;
    this.map.set(key, value);
    this.bytes += size;
    for (const [oldKey, old] of this.map) {
      if (this.bytes <= this.maxBytes) break;
      this.map.delete(oldKey);
      this.bytes -= old.object.byteLength;
    }
  }
};
function resolveInflated({ type, data, reference, offset }, cache, offsetByOid) {
  const object2 = import_buffer.Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (type !== "ofs-delta" && type !== "ref-delta") return { type, object: object2 };
  const baseOffset = type === "ofs-delta" ? offset - decodeVarInt(new BufferCursor(reference)) : offsetByOid.get(reference.toString("hex"));
  const base = cache.get(baseOffset);
  if (!base) return null;
  try {
    return {
      type: base.type,
      object: import_buffer.Buffer.from(applyDelta(object2, base.object))
    };
  } catch (err) {
    if (err instanceof InternalError || err instanceof RangeError) return null;
    throw err;
  }
}
var GitPackIndex = class _GitPackIndex {
  constructor(stuff) {
    Object.assign(this, stuff);
    this.offsetCache = {};
  }
  static async fromIdx({ idx, getExternalRefDelta }) {
    const reader = new BufferCursor(idx);
    const magic = reader.slice(4).toString("hex");
    if (magic !== "ff744f63") {
      return;
    }
    const version = reader.readUInt32BE();
    if (version !== 2) {
      throw new InternalError(
        `Unable to read version ${version} packfile IDX. (Only version 2 supported)`
      );
    }
    if (idx.byteLength > 2048 * 1024 * 1024) {
      throw new InternalError(
        `To keep implementation simple, I haven't implemented the layer 5 feature needed to support packfiles > 2GB in size.`
      );
    }
    reader.seek(reader.tell() + 4 * 255);
    const size = reader.readUInt32BE();
    const hashes = [];
    for (let i = 0; i < size; i++) {
      const hash2 = reader.slice(20).toString("hex");
      hashes[i] = hash2;
    }
    reader.seek(reader.tell() + 4 * size);
    const offsets = /* @__PURE__ */ new Map();
    for (let i = 0; i < size; i++) {
      offsets.set(hashes[i], reader.readUInt32BE());
    }
    const packfileSha = reader.slice(20).toString("hex");
    return new _GitPackIndex({
      hashes,
      crcs: {},
      offsets,
      packfileSha,
      getExternalRefDelta
    });
  }
  static async fromPack({ pack, getExternalRefDelta, onProgress }) {
    const listpackTypes = {
      1: "commit",
      2: "tree",
      3: "blob",
      4: "tag",
      6: "ofs-delta",
      7: "ref-delta"
    };
    const offsetToObject = {};
    const packfileSha = pack.slice(-20).toString("hex");
    const hashes = [];
    const crcs = {};
    const offsets = /* @__PURE__ */ new Map();
    let totalObjectCount = null;
    let lastPercent = null;
    const cache = new ObjectCache(RESOLVE_CACHE_BYTES);
    const offsetByOid = /* @__PURE__ */ new Map();
    await listpack([pack], async ({ data, type, reference, offset, num: num2 }) => {
      if (totalObjectCount === null) totalObjectCount = num2;
      const percent = Math.floor(
        (totalObjectCount - num2) * 100 / totalObjectCount
      );
      if (percent !== lastPercent) {
        if (onProgress) {
          await onProgress({
            phase: "Receiving objects",
            loaded: totalObjectCount - num2,
            total: totalObjectCount
          });
        }
      }
      lastPercent = percent;
      type = listpackTypes[type];
      if (["commit", "tree", "blob", "tag"].includes(type)) {
        offsetToObject[offset] = {
          type,
          offset
        };
      } else if (type === "ofs-delta") {
        offsetToObject[offset] = {
          type,
          offset
        };
      } else if (type === "ref-delta") {
        offsetToObject[offset] = {
          type,
          offset
        };
      }
      const o = offsetToObject[offset];
      if (!o) return;
      const resolved = resolveInflated(
        { type, data, reference, offset },
        cache,
        offsetByOid
      );
      if (!resolved) return;
      o.oid = await shasum(GitObject.wrap(resolved));
      offsetByOid.set(o.oid, offset);
      cache.set(offset, resolved);
    });
    const offsetArray = Object.keys(offsetToObject).map(Number);
    for (const [i, start] of offsetArray.entries()) {
      const end = i + 1 === offsetArray.length ? pack.byteLength - 20 : offsetArray[i + 1];
      const o = offsetToObject[start];
      const crc = import_crc_32.default.buf(pack.slice(start, end)) >>> 0;
      o.end = end;
      o.crc = crc;
    }
    const p = new _GitPackIndex({
      pack: Promise.resolve(pack),
      packfileSha,
      crcs,
      hashes,
      offsets,
      getExternalRefDelta
    });
    lastPercent = null;
    let count = 0;
    const objectsByDepth = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let offset in offsetToObject) {
      offset = Number(offset);
      const percent = Math.floor(count * 100 / totalObjectCount);
      if (percent !== lastPercent) {
        if (onProgress) {
          await onProgress({
            phase: "Resolving deltas",
            loaded: count,
            total: totalObjectCount
          });
        }
      }
      count++;
      lastPercent = percent;
      const o = offsetToObject[offset];
      if (!o.oid) {
        try {
          p.readDepth = 0;
          p.externalReadDepth = 0;
          const { type, object: object2 } = await p.readSlice({ start: offset });
          objectsByDepth[p.readDepth] += 1;
          o.oid = await shasum(GitObject.wrap({ type, object: object2 }));
        } catch (err) {
          continue;
        }
      }
      hashes.push(o.oid);
      offsets.set(o.oid, offset);
      crcs[o.oid] = o.crc;
    }
    hashes.sort();
    return p;
  }
  async toBuffer() {
    const buffers = [];
    const write = (str, encoding) => {
      buffers.push(import_buffer.Buffer.from(str, encoding));
    };
    write("ff744f63", "hex");
    write("00000002", "hex");
    const fanoutBuffer = new BufferCursor(import_buffer.Buffer.alloc(256 * 4));
    for (let i = 0; i < 256; i++) {
      let count = 0;
      for (const hash2 of this.hashes) {
        if (parseInt(hash2.slice(0, 2), 16) <= i) count++;
      }
      fanoutBuffer.writeUInt32BE(count);
    }
    buffers.push(fanoutBuffer.buffer);
    for (const hash2 of this.hashes) {
      write(hash2, "hex");
    }
    const crcsBuffer = new BufferCursor(import_buffer.Buffer.alloc(this.hashes.length * 4));
    for (const hash2 of this.hashes) {
      crcsBuffer.writeUInt32BE(this.crcs[hash2]);
    }
    buffers.push(crcsBuffer.buffer);
    const offsetsBuffer = new BufferCursor(import_buffer.Buffer.alloc(this.hashes.length * 4));
    for (const hash2 of this.hashes) {
      offsetsBuffer.writeUInt32BE(this.offsets.get(hash2));
    }
    buffers.push(offsetsBuffer.buffer);
    write(this.packfileSha, "hex");
    const totalBuffer = import_buffer.Buffer.concat(buffers);
    const sha = await shasum(totalBuffer);
    const shaBuffer = import_buffer.Buffer.alloc(20);
    shaBuffer.write(sha, "hex");
    return import_buffer.Buffer.concat([totalBuffer, shaBuffer]);
  }
  async load({ pack }) {
    this.pack = pack;
  }
  async unload() {
    this.pack = null;
  }
  async read({ oid }) {
    if (!this.offsets.get(oid)) {
      if (this.getExternalRefDelta) {
        this.externalReadDepth++;
        return this.getExternalRefDelta(oid);
      } else {
        throw new InternalError(`Could not read object ${oid} from packfile`);
      }
    }
    const start = this.offsets.get(oid);
    return this.readSlice({ start });
  }
  async readSlice({ start }) {
    if (this.offsetCache[start]) {
      return Object.assign({}, this.offsetCache[start]);
    }
    this.readDepth++;
    const types = {
      16: "commit",
      32: "tree",
      48: "blob",
      64: "tag",
      96: "ofs_delta",
      112: "ref_delta"
    };
    const pack = await this.pack;
    if (!pack) {
      throw new InternalError(
        "Could not read packfile data. The packfile may be missing, corrupted, or too large to read into memory."
      );
    }
    const raw = pack.slice(start);
    const reader = new BufferCursor(raw);
    const byte = reader.readUInt8();
    const btype = byte & 112;
    let type = types[btype];
    if (type === void 0) {
      throw new InternalError("Unrecognized type: 0b" + btype.toString(2));
    }
    const lastFour = byte & 15;
    let length = lastFour;
    const multibyte = byte & 128;
    if (multibyte) {
      length = otherVarIntDecode(reader, lastFour);
    }
    let base = null;
    let object2 = null;
    if (type === "ofs_delta") {
      const offset = decodeVarInt(reader);
      const baseOffset = start - offset;
      ({ object: base, type } = await this.readSlice({ start: baseOffset }));
    }
    if (type === "ref_delta") {
      const oid = reader.slice(20).toString("hex");
      ({ object: base, type } = await this.read({ oid }));
    }
    const buffer = raw.slice(reader.tell());
    object2 = import_buffer.Buffer.from(await inflate(buffer));
    if (object2.byteLength !== length) {
      throw new InternalError(
        `Packfile told us object would have length ${length} but it had length ${object2.byteLength}`
      );
    }
    if (base) {
      object2 = import_buffer.Buffer.from(applyDelta(object2, base));
    }
    if (this.readDepth > 3) {
      this.offsetCache[start] = { type, object: object2 };
    }
    return { type, format: "content", object: object2 };
  }
};
var PackfileCache = Symbol("PackfileCache");
async function loadPackIndex({
  fs,
  filename,
  getExternalRefDelta,
  emitter,
  emitterPrefix
}) {
  const idx = await fs.read(filename);
  return GitPackIndex.fromIdx({ idx, getExternalRefDelta });
}
function readPackIndex({
  fs,
  cache,
  filename,
  getExternalRefDelta,
  emitter,
  emitterPrefix
}) {
  if (!cache[PackfileCache]) cache[PackfileCache] = /* @__PURE__ */ new Map();
  let p = cache[PackfileCache].get(filename);
  if (!p) {
    p = loadPackIndex({
      fs,
      filename,
      getExternalRefDelta,
      emitter,
      emitterPrefix
    });
    cache[PackfileCache].set(filename, p);
    p.catch(() => {
      if (cache[PackfileCache].get(filename) === p) {
        cache[PackfileCache].delete(filename);
      }
    });
  }
  return p;
}
async function shasumRange(buffer, { start = 0, end = buffer.length } = {}) {
  return shasum(buffer.subarray(start, end));
}
async function readObjectPacked({
  fs,
  cache,
  gitdir,
  oid,
  format = "content",
  getExternalRefDelta
}) {
  let list = await fs.readdir(join2(gitdir, "objects/pack"));
  list = list.filter((x) => x.endsWith(".idx"));
  for (const filename of list) {
    const indexFile = `${gitdir}/objects/pack/${filename}`;
    const p = await readPackIndex({
      fs,
      cache,
      filename: indexFile,
      getExternalRefDelta
    });
    if (p.error) throw new InternalError(p.error);
    if (p.offsets.has(oid)) {
      const packFile = indexFile.replace(/idx$/, "pack");
      if (!p.pack) {
        const read = fs.read(packFile);
        p.pack = read;
        read.catch(() => {
          if (p.pack === read) p.pack = null;
        });
      }
      const pack = await p.pack;
      if (!pack) {
        p.pack = null;
        throw new InternalError(
          `Could not read packfile at ${packFile}. The file may be missing, corrupted, or too large to read into memory.`
        );
      }
      if (!p._checksumVerification) {
        p._checksumVerification = verifyPackfile(pack, p.packfileSha);
      }
      await p._checksumVerification;
      const result = await p.read({ oid, getExternalRefDelta });
      result.format = "content";
      result.source = `objects/pack/${filename.replace(/idx$/, "pack")}`;
      return result;
    }
  }
  return null;
}
async function verifyPackfile(pack, expectedShaFromIndex) {
  const packTrailer = pack.subarray(-20);
  const packTrailerSha = Array.from(packTrailer).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (packTrailerSha !== expectedShaFromIndex) {
    throw new InternalError(
      `Packfile trailer mismatch: expected ${expectedShaFromIndex}, got ${packTrailerSha}. The packfile may be corrupted.`
    );
  }
  const actualPayloadSha = await shasumRange(pack, {
    start: 0,
    end: pack.length - 20
  });
  if (actualPayloadSha !== expectedShaFromIndex) {
    throw new InternalError(
      `Packfile payload corrupted: calculated ${actualPayloadSha} but expected ${expectedShaFromIndex}. The packfile may have been tampered with.`
    );
  }
}
async function _readObject({
  fs,
  cache,
  gitdir,
  oid,
  format = "content"
}) {
  if (!["deflated", "wrapped", "content"].includes(format)) {
    throw new InternalError(`invalid requested format "${format}"`);
  }
  const getExternalRefDelta = (oid2) => _readObject({ fs, cache, gitdir, oid: oid2 });
  let result;
  if (oid === "4b825dc642cb6eb9a060e54bf8d69288fbee4904") {
    result = { format: "wrapped", object: import_buffer.Buffer.from(`tree 0\0`) };
  }
  if (!result) {
    result = await readObjectLoose({ fs, gitdir, oid });
  }
  if (!result) {
    result = await readObjectPacked({
      fs,
      cache,
      gitdir,
      oid,
      getExternalRefDelta
    });
    if (!result) {
      throw new NotFoundError(oid);
    }
    return result;
  }
  if (format === "deflated") {
    return result;
  }
  if (result.format === "deflated") {
    result.object = import_buffer.Buffer.from(await inflate(result.object));
    result.format = "wrapped";
  }
  if (format === "wrapped") {
    return result;
  }
  const sha = await shasum(result.object);
  if (sha !== oid) {
    throw new InternalError(
      `SHA check failed! Expected ${oid}, computed ${sha}`
    );
  }
  const { object: object2, type } = GitObject.unwrap(result.object);
  result.type = type;
  result.object = object2;
  result.format = "content";
  return result;
}
var AlreadyExistsError = class _AlreadyExistsError extends BaseError {
  /**
   * @param {'note'|'remote'|'tag'|'branch'} noun
   * @param {string} where
   * @param {boolean} canForce
   */
  constructor(noun, where, canForce = true) {
    super(
      `Failed to create ${noun} at ${where} because it already exists.${canForce ? ` (Hint: use 'force: true' parameter to overwrite existing ${noun}.)` : ""}`
    );
    this.code = this.name = _AlreadyExistsError.code;
    this.data = { noun, where, canForce };
  }
};
AlreadyExistsError.code = "AlreadyExistsError";
var AmbiguousError = class _AmbiguousError extends BaseError {
  /**
   * @param {'oids'|'refs'} nouns
   * @param {string} short
   * @param {string[]} matches
   */
  constructor(nouns, short, matches2) {
    super(
      `Found multiple ${nouns} matching "${short}" (${matches2.join(
        ", "
      )}). Use a longer abbreviation length to disambiguate them.`
    );
    this.code = this.name = _AmbiguousError.code;
    this.data = { nouns, short, matches: matches2 };
  }
};
AmbiguousError.code = "AmbiguousError";
var CheckoutConflictError = class _CheckoutConflictError extends BaseError {
  /**
   * @param {string[]} filepaths
   */
  constructor(filepaths) {
    super(
      `Your local changes to the following files would be overwritten by checkout: ${filepaths.join(
        ", "
      )}`
    );
    this.code = this.name = _CheckoutConflictError.code;
    this.data = { filepaths };
  }
};
CheckoutConflictError.code = "CheckoutConflictError";
var CherryPickLocalChangesError = class _CherryPickLocalChangesError extends BaseError {
  /**
   * @param {string[]} filepaths
   */
  constructor(filepaths) {
    super(
      `Your local changes to the following files would be overwritten by cherry-pick: ${filepaths.join(
        ", "
      )}`
    );
    this.code = this.name = _CherryPickLocalChangesError.code;
    this.data = { filepaths };
  }
};
CherryPickLocalChangesError.code = "CherryPickLocalChangesError";
var CherryPickMergeCommitError = class _CherryPickMergeCommitError extends BaseError {
  /**
   * @param {string} oid
   * @param {number} parentCount
   */
  constructor(oid, parentCount) {
    super(
      `Cannot cherry-pick merge commit ${oid}. Merge commits have ${parentCount} parents and require specifying which parent to use as the base.`
    );
    this.code = this.name = _CherryPickMergeCommitError.code;
    this.data = { oid, parentCount };
  }
};
CherryPickMergeCommitError.code = "CherryPickMergeCommitError";
var CherryPickRootCommitError = class _CherryPickRootCommitError extends BaseError {
  /**
   * @param {string} oid
   */
  constructor(oid) {
    super(
      `Cannot cherry-pick root commit ${oid}. Root commits have no parents.`
    );
    this.code = this.name = _CherryPickRootCommitError.code;
    this.data = { oid };
  }
};
CherryPickRootCommitError.code = "CherryPickRootCommitError";
var CommitNotFetchedError = class _CommitNotFetchedError extends BaseError {
  /**
   * @param {string} ref
   * @param {string} oid
   */
  constructor(ref, oid) {
    super(
      `Failed to checkout "${ref}" because commit ${oid} is not available locally. Do a git fetch to make the branch available locally.`
    );
    this.code = this.name = _CommitNotFetchedError.code;
    this.data = { ref, oid };
  }
};
CommitNotFetchedError.code = "CommitNotFetchedError";
var EmptyCommitError = class _EmptyCommitError extends BaseError {
  constructor() {
    super("Cannot create an empty commit when disallowEmpty is true.");
    this.code = this.name = _EmptyCommitError.code;
    this.data = {};
  }
};
EmptyCommitError.code = "EmptyCommitError";
var EmptyServerResponseError = class _EmptyServerResponseError extends BaseError {
  constructor() {
    super(`Empty response from git server.`);
    this.code = this.name = _EmptyServerResponseError.code;
    this.data = {};
  }
};
EmptyServerResponseError.code = "EmptyServerResponseError";
var FastForwardError = class _FastForwardError extends BaseError {
  constructor() {
    super(`A simple fast-forward merge was not possible.`);
    this.code = this.name = _FastForwardError.code;
    this.data = {};
  }
};
FastForwardError.code = "FastForwardError";
var GitPushError = class _GitPushError extends BaseError {
  /**
   * @param {string} prettyDetails
   * @param {PushResult} result
   */
  constructor(prettyDetails, result) {
    super(`One or more branches were not updated: ${prettyDetails}`);
    this.code = this.name = _GitPushError.code;
    this.data = { prettyDetails, result };
  }
};
GitPushError.code = "GitPushError";
var HttpError = class _HttpError extends BaseError {
  /**
   * @param {number} statusCode
   * @param {string} statusMessage
   * @param {string} response
   */
  constructor(statusCode, statusMessage, response) {
    super(`HTTP Error: ${statusCode} ${statusMessage}`);
    this.code = this.name = _HttpError.code;
    this.data = { statusCode, statusMessage, response };
  }
};
HttpError.code = "HttpError";
var InvalidFilepathError = class _InvalidFilepathError extends BaseError {
  /**
   * @param {'leading-slash'|'trailing-slash'|'directory'} [reason]
   */
  constructor(reason) {
    let message = "invalid filepath";
    if (reason === "leading-slash" || reason === "trailing-slash") {
      message = `"filepath" parameter should not include leading or trailing directory separators because these can cause problems on some platforms.`;
    } else if (reason === "directory") {
      message = `"filepath" should not be a directory.`;
    }
    super(message);
    this.code = this.name = _InvalidFilepathError.code;
    this.data = { reason };
  }
};
InvalidFilepathError.code = "InvalidFilepathError";
var MaxDepthError = class _MaxDepthError extends BaseError {
  /**
   * @param {number} depth
   */
  constructor(depth) {
    super(`Maximum search depth of ${depth} exceeded.`);
    this.code = this.name = _MaxDepthError.code;
    this.data = { depth };
  }
};
MaxDepthError.code = "MaxDepthError";
var MergeNotSupportedError = class _MergeNotSupportedError extends BaseError {
  constructor() {
    super(`Merges with conflicts are not supported yet.`);
    this.code = this.name = _MergeNotSupportedError.code;
    this.data = {};
  }
};
MergeNotSupportedError.code = "MergeNotSupportedError";
var MergeConflictError = class _MergeConflictError extends BaseError {
  /**
   * @param {Array<string>} filepaths
   * @param {Array<string>} bothModified
   * @param {Array<string>} deleteByUs
   * @param {Array<string>} deleteByTheirs
   */
  constructor(filepaths, bothModified, deleteByUs, deleteByTheirs) {
    super(
      `Automatic merge failed with one or more merge conflicts in the following files: ${filepaths.toString()}. Fix conflicts then commit the result.`
    );
    this.code = this.name = _MergeConflictError.code;
    this.data = { filepaths, bothModified, deleteByUs, deleteByTheirs };
  }
};
MergeConflictError.code = "MergeConflictError";
var MissingNameError = class _MissingNameError extends BaseError {
  /**
   * @param {'author'|'committer'|'tagger'} role
   */
  constructor(role) {
    super(
      `No name was provided for ${role} in the argument or in the .git/config file.`
    );
    this.code = this.name = _MissingNameError.code;
    this.data = { role };
  }
};
MissingNameError.code = "MissingNameError";
var MissingParameterError = class _MissingParameterError extends BaseError {
  /**
   * @param {string} parameter
   */
  constructor(parameter) {
    super(
      `The function requires a "${parameter}" parameter but none was provided.`
    );
    this.code = this.name = _MissingParameterError.code;
    this.data = { parameter };
  }
};
MissingParameterError.code = "MissingParameterError";
var MultipleGitError = class _MultipleGitError extends BaseError {
  /**
   * @param {Error[]} errors
   * @param {string} message
   */
  constructor(errors) {
    super(
      `There are multiple errors that were thrown by the method. Please refer to the "errors" property to see more`
    );
    this.code = this.name = _MultipleGitError.code;
    this.data = { errors };
    this.errors = errors;
  }
};
MultipleGitError.code = "MultipleGitError";
var ParseError = class _ParseError extends BaseError {
  /**
   * @param {string} expected
   * @param {string} actual
   */
  constructor(expected, actual) {
    super(`Expected "${expected}" but received "${actual}".`);
    this.code = this.name = _ParseError.code;
    this.data = { expected, actual };
  }
};
ParseError.code = "ParseError";
var PushRejectedError = class _PushRejectedError extends BaseError {
  /**
   * @param {'not-fast-forward'|'tag-exists'} reason
   */
  constructor(reason) {
    let message = "";
    if (reason === "not-fast-forward") {
      message = " because it was not a simple fast-forward";
    } else if (reason === "tag-exists") {
      message = " because tag already exists";
    }
    super(`Push rejected${message}. Use "force: true" to override.`);
    this.code = this.name = _PushRejectedError.code;
    this.data = { reason };
  }
};
PushRejectedError.code = "PushRejectedError";
var RemoteCapabilityError = class _RemoteCapabilityError extends BaseError {
  /**
   * @param {'shallow'|'deepen-since'|'deepen-not'|'deepen-relative'} capability
   * @param {'depth'|'since'|'exclude'|'relative'} parameter
   */
  constructor(capability, parameter) {
    super(
      `Remote does not support the "${capability}" so the "${parameter}" parameter cannot be used.`
    );
    this.code = this.name = _RemoteCapabilityError.code;
    this.data = { capability, parameter };
  }
};
RemoteCapabilityError.code = "RemoteCapabilityError";
var SmartHttpError = class _SmartHttpError extends BaseError {
  /**
   * @param {string} preview
   * @param {string} response
   */
  constructor(preview, response) {
    super(
      `Remote did not reply using the "smart" HTTP protocol. Expected "001e# service=git-upload-pack" but received: ${preview}`
    );
    this.code = this.name = _SmartHttpError.code;
    this.data = { preview, response };
  }
};
SmartHttpError.code = "SmartHttpError";
var UnknownTransportError = class _UnknownTransportError extends BaseError {
  /**
   * @param {string} url
   * @param {string} transport
   * @param {string} [suggestion]
   */
  constructor(url, transport, suggestion) {
    super(
      `Git remote "${url}" uses an unrecognized transport protocol: "${transport}"`
    );
    this.code = this.name = _UnknownTransportError.code;
    this.data = { url, transport, suggestion };
  }
};
UnknownTransportError.code = "UnknownTransportError";
var UrlParseError = class _UrlParseError extends BaseError {
  /**
   * @param {string} url
   */
  constructor(url) {
    super(`Cannot parse remote URL: "${url}"`);
    this.code = this.name = _UrlParseError.code;
    this.data = { url };
  }
};
UrlParseError.code = "UrlParseError";
var UserCanceledError = class _UserCanceledError extends BaseError {
  constructor() {
    super(`The operation was canceled.`);
    this.code = this.name = _UserCanceledError.code;
    this.data = {};
  }
};
UserCanceledError.code = "UserCanceledError";
var IndexResetError = class _IndexResetError extends BaseError {
  /**
   * @param {Array<string>} filepaths
   */
  constructor(filepath) {
    super(
      `Could not merge index: Entry for '${filepath}' is not up to date. Either reset the index entry to HEAD, or stage your unstaged changes.`
    );
    this.code = this.name = _IndexResetError.code;
    this.data = { filepath };
  }
};
IndexResetError.code = "IndexResetError";
var NoCommitError = class _NoCommitError extends BaseError {
  /**
   * @param {string} ref
   */
  constructor(ref) {
    super(
      `"${ref}" does not point to any commit. You're maybe working on a repository with no commits yet. `
    );
    this.code = this.name = _NoCommitError.code;
    this.data = { ref };
  }
};
NoCommitError.code = "NoCommitError";
function formatAuthor({ name, email, timestamp, timezoneOffset }) {
  timezoneOffset = formatTimezoneOffset(timezoneOffset);
  return `${name} <${email}> ${timestamp} ${timezoneOffset}`;
}
function formatTimezoneOffset(minutes) {
  const sign = simpleSign(negateExceptForZero(minutes));
  minutes = Math.abs(minutes);
  const hours = Math.floor(minutes / 60);
  minutes -= hours * 60;
  let strHours = String(hours);
  let strMinutes = String(minutes);
  if (strHours.length < 2) strHours = "0" + strHours;
  if (strMinutes.length < 2) strMinutes = "0" + strMinutes;
  return (sign === -1 ? "-" : "+") + strHours + strMinutes;
}
function simpleSign(n) {
  return Math.sign(n) || (Object.is(n, -0) ? -1 : 1);
}
function negateExceptForZero(n) {
  return n === 0 ? n : -n;
}
function normalizeNewlines(str) {
  str = str.replace(/\r/g, "");
  str = str.replace(/^\n+/, "");
  str = str.replace(/\n+$/, "") + "\n";
  return str;
}
function parseAuthor(author) {
  const [, name, email, timestamp, offset] = author.match(
    /^(.*) <(.*)> (.*) (.*)$/
  );
  return {
    name,
    email,
    timestamp: Number(timestamp),
    timezoneOffset: parseTimezoneOffset(offset)
  };
}
function parseTimezoneOffset(offset) {
  let [, sign, hours, minutes] = offset.match(/(\+|-)(\d\d)(\d\d)/);
  minutes = (sign === "+" ? 1 : -1) * (Number(hours) * 60 + Number(minutes));
  return negateExceptForZero$1(minutes);
}
function negateExceptForZero$1(n) {
  return n === 0 ? n : -n;
}
var GitAnnotatedTag = class _GitAnnotatedTag {
  constructor(tag) {
    if (typeof tag === "string") {
      this._tag = tag;
    } else if (import_buffer.Buffer.isBuffer(tag)) {
      this._tag = tag.toString("utf8");
    } else if (typeof tag === "object") {
      this._tag = _GitAnnotatedTag.render(tag);
    } else {
      throw new InternalError(
        "invalid type passed to GitAnnotatedTag constructor"
      );
    }
  }
  static from(tag) {
    return new _GitAnnotatedTag(tag);
  }
  static render(obj) {
    return `object ${obj.object}
type ${obj.type}
tag ${obj.tag}
tagger ${formatAuthor(obj.tagger)}

${obj.message}
${obj.gpgsig ? obj.gpgsig : ""}`;
  }
  justHeaders() {
    return this._tag.slice(0, this._tag.indexOf("\n\n"));
  }
  message() {
    const tag = this.withoutSignature();
    return tag.slice(tag.indexOf("\n\n") + 2);
  }
  parse() {
    return Object.assign(this.headers(), {
      message: this.message(),
      gpgsig: this.gpgsig()
    });
  }
  render() {
    return this._tag;
  }
  headers() {
    const headers = this.justHeaders().split("\n");
    const hs = [];
    for (const h of headers) {
      if (h[0] === " ") {
        hs[hs.length - 1] += "\n" + h.slice(1);
      } else {
        hs.push(h);
      }
    }
    const obj = {};
    const seen = /* @__PURE__ */ new Set();
    for (const h of hs) {
      const key = h.slice(0, h.indexOf(" "));
      const value = h.slice(h.indexOf(" ") + 1);
      if (!seen.has(key)) {
        seen.add(key);
        obj[key] = value;
      }
    }
    if (obj.tagger) {
      obj.tagger = parseAuthor(obj.tagger);
    }
    if (obj.committer) {
      obj.committer = parseAuthor(obj.committer);
    }
    return obj;
  }
  withoutSignature() {
    const tag = normalizeNewlines(this._tag);
    if (tag.indexOf("\n-----BEGIN PGP SIGNATURE-----") === -1) return tag;
    return tag.slice(0, tag.lastIndexOf("\n-----BEGIN PGP SIGNATURE-----"));
  }
  gpgsig() {
    if (this._tag.indexOf("\n-----BEGIN PGP SIGNATURE-----") === -1) return;
    const signature = this._tag.slice(
      this._tag.indexOf("-----BEGIN PGP SIGNATURE-----"),
      this._tag.indexOf("-----END PGP SIGNATURE-----") + "-----END PGP SIGNATURE-----".length
    );
    return normalizeNewlines(signature);
  }
  payload() {
    return this.withoutSignature() + "\n";
  }
  toObject() {
    return import_buffer.Buffer.from(this._tag, "utf8");
  }
  static async sign(tag, sign, secretKey) {
    const payload = tag.payload();
    let { signature } = await sign({ payload, secretKey });
    signature = normalizeNewlines(signature);
    const signedTag = payload + signature;
    return _GitAnnotatedTag.from(signedTag);
  }
};
function indent(str) {
  return str.trim().split("\n").map((x) => " " + x).join("\n") + "\n";
}
function outdent(str) {
  return str.split("\n").map((x) => x.replace(/^ /, "")).join("\n");
}
var GitCommit = class _GitCommit {
  constructor(commit) {
    if (typeof commit === "string") {
      this._commit = commit;
    } else if (import_buffer.Buffer.isBuffer(commit)) {
      this._commit = commit.toString("utf8");
    } else if (typeof commit === "object") {
      this._commit = _GitCommit.render(commit);
    } else {
      throw new InternalError("invalid type passed to GitCommit constructor");
    }
  }
  static fromPayloadSignature({ payload, signature }) {
    const headers = _GitCommit.justHeaders(payload);
    const message = _GitCommit.justMessage(payload);
    const commit = normalizeNewlines(
      headers + "\ngpgsig" + indent(signature) + "\n" + message
    );
    return new _GitCommit(commit);
  }
  static from(commit) {
    return new _GitCommit(commit);
  }
  toObject() {
    return import_buffer.Buffer.from(this._commit, "utf8");
  }
  // Todo: allow setting the headers and message
  headers() {
    return this.parseHeaders();
  }
  // Todo: allow setting the headers and message
  message() {
    return _GitCommit.justMessage(this._commit);
  }
  parse() {
    return Object.assign({ message: this.message() }, this.headers());
  }
  static justMessage(commit) {
    return normalizeNewlines(commit.slice(commit.indexOf("\n\n") + 2));
  }
  static justHeaders(commit) {
    return commit.slice(0, commit.indexOf("\n\n"));
  }
  parseHeaders() {
    const headers = _GitCommit.justHeaders(this._commit).split("\n");
    const hs = [];
    for (const h of headers) {
      if (h[0] === " ") {
        hs[hs.length - 1] += "\n" + h.slice(1);
      } else {
        hs.push(h);
      }
    }
    const obj = {
      parent: []
    };
    const keyOf = (h) => h.slice(0, h.indexOf(" "));
    const valueOf = (h) => h.slice(h.indexOf(" ") + 1);
    if (hs.length === 0 || keyOf(hs[0]) !== "tree") {
      throw new ParseError(
        "tree as the first commit header",
        keyOf(hs[0] || "")
      );
    }
    obj.tree = valueOf(hs[0]);
    let index = 1;
    while (index < hs.length && keyOf(hs[index]) === "parent") {
      obj.parent.push(valueOf(hs[index]));
      index++;
    }
    const seen = /* @__PURE__ */ new Set(["tree", "parent"]);
    for (; index < hs.length; index++) {
      const key = keyOf(hs[index]);
      if (seen.has(key)) continue;
      seen.add(key);
      obj[key] = valueOf(hs[index]);
    }
    if (obj.author) {
      obj.author = parseAuthor(obj.author);
    }
    if (obj.committer) {
      obj.committer = parseAuthor(obj.committer);
    }
    return obj;
  }
  static renderHeaders(obj) {
    let headers = "";
    if (obj.tree) {
      headers += `tree ${obj.tree}
`;
    } else {
      headers += `tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904
`;
    }
    if (obj.parent) {
      if (obj.parent.length === void 0) {
        throw new InternalError(`commit 'parent' property should be an array`);
      }
      for (const p of obj.parent) {
        headers += `parent ${p}
`;
      }
    }
    const author = obj.author;
    headers += `author ${formatAuthor(author)}
`;
    const committer = obj.committer || obj.author;
    headers += `committer ${formatAuthor(committer)}
`;
    if (obj.gpgsig) {
      headers += "gpgsig" + indent(obj.gpgsig);
    }
    return headers;
  }
  static render(obj) {
    return _GitCommit.renderHeaders(obj) + "\n" + normalizeNewlines(obj.message);
  }
  render() {
    return this._commit;
  }
  withoutSignature() {
    const commit = normalizeNewlines(this._commit);
    if (commit.indexOf("\ngpgsig") === -1) return commit;
    const headers = commit.slice(0, commit.indexOf("\ngpgsig"));
    const message = commit.slice(
      commit.indexOf("-----END PGP SIGNATURE-----\n") + "-----END PGP SIGNATURE-----\n".length
    );
    return normalizeNewlines(headers + "\n" + message);
  }
  isolateSignature() {
    const signature = this._commit.slice(
      this._commit.indexOf("-----BEGIN PGP SIGNATURE-----"),
      this._commit.indexOf("-----END PGP SIGNATURE-----") + "-----END PGP SIGNATURE-----".length
    );
    return outdent(signature);
  }
  static async sign(commit, sign, secretKey) {
    const payload = commit.withoutSignature();
    const message = _GitCommit.justMessage(commit._commit);
    let { signature } = await sign({ payload, secretKey });
    signature = normalizeNewlines(signature);
    const headers = _GitCommit.justHeaders(commit._commit);
    const signedCommit = headers + "\ngpgsig" + indent(signature) + "\n" + message;
    return _GitCommit.from(signedCommit);
  }
};
async function resolveTree({ fs, cache, gitdir, oid }) {
  if (oid === "4b825dc642cb6eb9a060e54bf8d69288fbee4904") {
    return { tree: GitTree.from([]), oid };
  }
  const { type, object: object2 } = await _readObject({ fs, cache, gitdir, oid });
  if (type === "tag") {
    oid = GitAnnotatedTag.from(object2).parse().object;
    return resolveTree({ fs, cache, gitdir, oid });
  }
  if (type === "commit") {
    oid = GitCommit.from(object2).parse().tree;
    return resolveTree({ fs, cache, gitdir, oid });
  }
  if (type !== "tree") {
    throw new ObjectTypeError(oid, type, "tree");
  }
  return { tree: GitTree.from(object2), oid };
}
var flat = typeof Array.prototype.flat === "undefined" ? (entries) => entries.reduce((acc, x) => acc.concat(x), []) : (entries) => entries.flat();
async function mkdirp(mkdir, filepath, retries = 10) {
  try {
    await mkdir(filepath);
  } catch (err) {
    if (err === null) return;
    if (err.code === "EEXIST") return;
    if (err.code !== "ENOENT") throw err;
    const parent2 = dirname(filepath);
    if (parent2 === "." || parent2 === "/" || parent2 === filepath) throw err;
    await mkdirp(mkdir, parent2, retries);
    for (let attempt = 0; ; attempt++) {
      try {
        await mkdir(filepath);
        return;
      } catch (err2) {
        if (err2 === null || err2.code === "EEXIST") return;
        if (err2.code === "ENOENT" && attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          continue;
        }
        throw err2;
      }
    }
  }
}
async function rmRecursive(fs, filepath) {
  const entries = await fs.readdir(filepath);
  if (entries == null) {
    await fs.rm(filepath);
  } else if (entries.length) {
    await Promise.all(
      entries.map((entry) => {
        const subpath = join2(filepath, entry);
        return fs.lstat(subpath).then((stat) => {
          if (!stat) return;
          return stat.isDirectory() ? rmRecursive(fs, subpath) : fs.rm(subpath);
        });
      })
    ).then(() => fs.rmdir(filepath));
  } else {
    await fs.rmdir(filepath);
  }
}
function isPromiseLike(obj) {
  return isObject(obj) && isFunction(obj.then) && isFunction(obj.catch);
}
function isObject(obj) {
  return obj && typeof obj === "object";
}
function isFunction(obj) {
  return typeof obj === "function";
}
function isNotFoundError(err) {
  const code = err.code;
  if (typeof code !== "string") return false;
  return code === "ENOENT" || code === "ENOTDIR" || code.includes("ENS");
}
function isPromiseFs(fs) {
  const test = (targetFs) => {
    try {
      return targetFs.readFile().catch((e) => e);
    } catch (e) {
      return e;
    }
  };
  return isPromiseLike(test(fs));
}
var commands = [
  "readFile",
  "writeFile",
  "mkdir",
  "rmdir",
  "unlink",
  "stat",
  "lstat",
  "readdir",
  "readlink",
  "symlink"
];
function bindFs(target, fs) {
  if (isPromiseFs(fs)) {
    for (const command of commands) {
      target[`_${command}`] = fs[command].bind(fs);
    }
  } else {
    for (const command of commands) {
      target[`_${command}`] = (0, import_pify.default)(fs[command].bind(fs));
    }
  }
  if (isPromiseFs(fs)) {
    if (fs.cp) target._cp = fs.cp.bind(fs);
    if (fs.rm) target._rm = fs.rm.bind(fs);
    else if (fs.rmdir.length > 1) target._rm = fs.rmdir.bind(fs);
    else target._rm = rmRecursive.bind(null, target);
  } else {
    if (fs.cp) target._cp = (0, import_pify.default)(fs.cp.bind(fs));
    if (fs.rm) target._rm = (0, import_pify.default)(fs.rm.bind(fs));
    else if (fs.rmdir.length > 2) target._rm = (0, import_pify.default)(fs.rmdir.bind(fs));
    else target._rm = rmRecursive.bind(null, target);
  }
}
var FileSystem = class {
  /**
   * Creates an instance of FileSystem.
   *
   * @param {Object} fs - A file system implementation to wrap.
   */
  constructor(fs) {
    if (typeof fs._original_unwrapped_fs !== "undefined") return fs;
    const promises = Object.getOwnPropertyDescriptor(fs, "promises");
    if (promises && promises.enumerable) {
      bindFs(this, fs.promises);
    } else {
      bindFs(this, fs);
    }
    this._original_unwrapped_fs = fs;
  }
  /**
   * Return true if a file exists, false if it doesn't exist.
   * Rethrows errors that aren't related to file existence.
   *
   * @param {string} filepath - The path to the file.
   * @param {Object} [options] - Additional options.
   * @returns {Promise<boolean>} - `true` if the file exists, `false` otherwise.
   */
  async exists(filepath, options = {}) {
    try {
      await this._stat(filepath);
      return true;
    } catch (err) {
      if (isNotFoundError(err)) {
        return false;
      } else {
        console.log('Unhandled error in "FileSystem.exists()" function', err);
        throw err;
      }
    }
  }
  /**
   * Return the contents of a file if it exists, otherwise returns null.
   * Rethrows errors that aren't related to file existence.
   *
   * @param {string} filepath - The path to the file.
   * @param {Object} [options] - Options for reading the file.
   * @returns {Promise<Buffer|string|null>} - The file contents, or `null` if the file doesn't exist.
   */
  async read(filepath, options = {}) {
    let buffer;
    try {
      buffer = await this._readFile(filepath, options);
    } catch (err) {
      if (isNotFoundError(err) || err.code === "EISDIR") return null;
      throw err;
    }
    if (buffer == null) return null;
    if (options.autocrlf === "true") {
      try {
        buffer = new TextDecoder("utf8", { fatal: true }).decode(buffer);
        buffer = buffer.replace(/\r\n/g, "\n");
        buffer = new TextEncoder().encode(buffer);
      } catch (error) {
      }
    }
    if (typeof buffer !== "string") {
      buffer = import_buffer.Buffer.from(buffer);
    }
    return buffer;
  }
  /**
   * Write a file (creating missing directories if need be) without throwing errors.
   *
   * @param {string} filepath - The path to the file.
   * @param {Buffer|Uint8Array|string} contents - The data to write.
   * @param {Object|string} [options] - Options for writing the file.
   * @returns {Promise<void>}
   */
  async write(filepath, contents, options = {}) {
    try {
      await this._writeFile(filepath, contents, options);
    } catch (err) {
      await this.mkdir(dirname(filepath));
      await this._writeFile(filepath, contents, options);
    }
  }
  /**
   * Make a directory (or series of nested directories) without throwing an error if it already exists.
   *
   * @param {string} filepath - The path to the directory.
   * @returns {Promise<void>}
   */
  async mkdir(filepath) {
    await mkdirp(this._mkdir, filepath);
  }
  /**
   * Delete a file without throwing an error if it is already deleted.
   *
   * @param {string} filepath - The path to the file.
   * @returns {Promise<void>}
   */
  async rm(filepath) {
    try {
      await this._unlink(filepath);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  /**
   * Delete a directory without throwing an error if it is already deleted.
   *
   * @param {string} filepath - The path to the directory.
   * @param {Object} [opts] - Options for deleting the directory.
   * @returns {Promise<void>}
   */
  async rmdir(filepath, opts) {
    try {
      if (opts && opts.recursive) {
        await this._rm(filepath, opts);
      } else {
        await this._rmdir(filepath);
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  /**
   * Read a directory without throwing an error if the directory doesn't exist.
   * Rethrows errors that aren't related to directory existence.
   *
   * @param {string} filepath - The path to the directory.
   * @returns {Promise<string[]|null>} - An array of file names, or `null` if the path is not a directory.
   */
  async readdir(filepath) {
    let names;
    try {
      names = await this._readdir(filepath);
    } catch (err) {
      if (err.code === "ENOTDIR") return null;
      if (isNotFoundError(err)) return [];
      throw err;
    }
    names.sort(compareStrings);
    return names;
  }
  /**
   * Return a flat list of all the files nested inside a directory
   *
   * Based on an elegant concurrent recursive solution from SO
   * https://stackoverflow.com/a/45130990/2168416
   *
   * @param {string} dir - The directory to read.
   * @returns {Promise<string[]>} - A flat list of all files in the directory.
   */
  async readdirDeep(dir) {
    const subdirs = await this._readdir(dir);
    const files = await Promise.all(
      subdirs.map(async (subdir) => {
        const res = dir + "/" + subdir;
        return (await this._stat(res)).isDirectory() ? this.readdirDeep(res) : res;
      })
    );
    return files.reduce((a, f) => a.concat(f), []);
  }
  /**
   * Return the Stats of a file/symlink if it exists, otherwise returns null.
   * Rethrows errors that aren't related to file existence.
   *
   * @param {string} filename - The path to the file or symlink.
   * @returns {Promise<Object|null>} - The stats object, or `null` if the file doesn't exist.
   */
  async lstat(filename) {
    try {
      const stats = await this._lstat(filename);
      return stats;
    } catch (err) {
      if (isNotFoundError(err)) {
        return null;
      }
      throw err;
    }
  }
  /**
   * Reads the contents of a symlink if it exists, otherwise returns null.
   * Rethrows errors that aren't related to file existence.
   *
   * @param {string} filename - The path to the symlink.
   * @param {Object} [opts={ encoding: 'buffer' }] - Options for reading the symlink.
   * @returns {Promise<Buffer|null>} - The symlink target, or `null` if it doesn't exist.
   */
  async readlink(filename, opts = { encoding: "buffer" }) {
    try {
      const link = await this._readlink(filename, opts);
      return import_buffer.Buffer.isBuffer(link) ? link : import_buffer.Buffer.from(link);
    } catch (err) {
      if (isNotFoundError(err)) {
        return null;
      }
      throw err;
    }
  }
  /**
   * Write the contents of buffer to a symlink.
   *
   * @param {string} filename - The path to the symlink.
   * @param {Buffer} buffer - The symlink target.
   * @returns {Promise<void>}
   */
  async writelink(filename, buffer) {
    return this._symlink(buffer.toString("utf8"), filename);
  }
};
function assertParameter(name, value) {
  if (value === void 0) {
    throw new MissingParameterError(name);
  }
}
function isAbsolute(filepath) {
  return filepath.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(filepath);
}
async function discoverGitdir({ fsp, dotgit }) {
  assertParameter("fsp", fsp);
  assertParameter("dotgit", dotgit);
  const dotgitStat = await fsp._stat(dotgit).catch(() => ({ isFile: () => false, isDirectory: () => false }));
  if (dotgitStat.isDirectory()) {
    return dotgit;
  } else if (dotgitStat.isFile()) {
    return fsp._readFile(dotgit, "utf8").then((contents) => contents.trimRight().substr(8)).then((submoduleGitdir) => {
      if (isAbsolute(submoduleGitdir)) {
        return submoduleGitdir;
      }
      const gitdir = join2(dirname(dotgit), submoduleGitdir);
      return gitdir;
    });
  } else {
    return dotgit;
  }
}
async function hasObjectLoose({ fs, gitdir, oid }) {
  const source = `objects/${oid.slice(0, 2)}/${oid.slice(2)}`;
  return fs.exists(`${gitdir}/${source}`);
}
async function hasObjectPacked({
  fs,
  cache,
  gitdir,
  oid,
  getExternalRefDelta
}) {
  let list = await fs.readdir(join2(gitdir, "objects/pack"));
  list = list.filter((x) => x.endsWith(".idx"));
  for (const filename of list) {
    const indexFile = `${gitdir}/objects/pack/${filename}`;
    const p = await readPackIndex({
      fs,
      cache,
      filename: indexFile,
      getExternalRefDelta
    });
    if (p.error) throw new InternalError(p.error);
    if (p.offsets.has(oid)) {
      return true;
    }
  }
  return false;
}
async function hasObject({
  fs,
  cache,
  gitdir,
  oid,
  format = "content"
}) {
  const getExternalRefDelta = (oid2) => _readObject({ fs, cache, gitdir, oid: oid2 });
  let result = await hasObjectLoose({ fs, gitdir, oid });
  if (!result) {
    result = await hasObjectPacked({
      fs,
      cache,
      gitdir,
      oid,
      getExternalRefDelta
    });
  }
  return result;
}
async function resolveCommit({ fs, cache, gitdir, oid }) {
  const { type, object: object2 } = await _readObject({ fs, cache, gitdir, oid });
  if (type === "tag") {
    oid = GitAnnotatedTag.from(object2).parse().object;
    return resolveCommit({ fs, cache, gitdir, oid });
  }
  if (type !== "commit") {
    throw new ObjectTypeError(oid, type, "commit");
  }
  return { commit: GitCommit.from(object2), oid };
}
async function _readCommit({ fs, cache, gitdir, oid }) {
  const { commit, oid: commitOid } = await resolveCommit({
    fs,
    cache,
    gitdir,
    oid
  });
  const result = {
    oid: commitOid,
    commit: commit.parse(),
    payload: commit.withoutSignature()
  };
  return result;
}
async function resolveFilepath({ fs, cache, gitdir, oid, filepath }) {
  const entry = await resolveFilepathEntry({
    fs,
    cache,
    gitdir,
    oid,
    filepath
  });
  return entry.oid;
}
async function resolveFilepathEntry({
  fs,
  cache,
  gitdir,
  oid,
  filepath
}) {
  if (filepath.startsWith("/")) {
    throw new InvalidFilepathError("leading-slash");
  } else if (filepath.endsWith("/")) {
    throw new InvalidFilepathError("trailing-slash");
  }
  const _oid = oid;
  const result = await resolveTree({ fs, cache, gitdir, oid });
  const tree = result.tree;
  if (filepath === "") {
    return { mode: "040000", oid: result.oid, path: "", type: "tree" };
  } else {
    const pathArray = filepath.split("/");
    return _resolveFilepath({
      fs,
      cache,
      gitdir,
      tree,
      pathArray,
      oid: _oid,
      filepath
    });
  }
}
async function _resolveFilepath({
  fs,
  cache,
  gitdir,
  tree,
  pathArray,
  oid,
  filepath
}) {
  const name = pathArray.shift();
  for (const entry of tree) {
    if (entry.path === name) {
      if (pathArray.length === 0) {
        return entry;
      } else {
        const { type, object: object2 } = await _readObject({
          fs,
          cache,
          gitdir,
          oid: entry.oid
        });
        if (type !== "tree") {
          throw new ObjectTypeError(oid, type, "tree", filepath);
        }
        tree = GitTree.from(object2);
        return _resolveFilepath({
          fs,
          cache,
          gitdir,
          tree,
          pathArray,
          oid,
          filepath
        });
      }
    }
  }
  throw new NotFoundError(`file or directory found at "${oid}:${filepath}"`);
}
async function _readTree({
  fs,
  cache,
  gitdir,
  oid,
  filepath = void 0
}) {
  if (filepath !== void 0) {
    oid = await resolveFilepath({ fs, cache, gitdir, oid, filepath });
  }
  const { tree, oid: treeOid } = await resolveTree({ fs, cache, gitdir, oid });
  const result = {
    oid: treeOid,
    tree: tree.entries()
  };
  return result;
}
async function _addRemote({ fs, gitdir, remote, url, force }) {
  if (!isValidRef(remote, true)) {
    throw new InvalidRefNameError(remote, import_clean_git_ref.default.clean(remote));
  }
  const config = await GitConfigManager.get({ fs, gitdir });
  if (!force) {
    const remoteNames = await config.getSubsections("remote");
    if (remoteNames.includes(remote)) {
      if (url !== await config.get(`remote.${remote}.url`)) {
        throw new AlreadyExistsError("remote", remote);
      }
    }
  }
  await config.set(`remote.${remote}.url`, url);
  await config.set(
    `remote.${remote}.fetch`,
    `+refs/heads/*:refs/remotes/${remote}/*`
  );
  await GitConfigManager.save({ fs, gitdir, config });
}
async function addRemote({
  fs,
  dir,
  gitdir = join2(dir, ".git"),
  remote,
  url,
  force = false
}) {
  try {
    assertParameter("fs", fs);
    assertParameter("gitdir", gitdir);
    assertParameter("remote", remote);
    assertParameter("url", url);
    const fsp = new FileSystem(fs);
    const updatedGitdir = await discoverGitdir({ fsp, dotgit: gitdir });
    return await _addRemote({
      fs: fsp,
      gitdir: updatedGitdir,
      remote,
      url,
      force
    });
  } catch (err) {
    err.caller = "git.addRemote";
    throw err;
  }
}
var abbreviateRx = /^refs\/(heads\/|tags\/|remotes\/)?(.*)/;
function abbreviateRef(ref) {
  const match = abbreviateRx.exec(ref);
  if (match) {
    if (match[1] === "remotes/" && ref.endsWith("/HEAD")) {
      return match[2].slice(0, -5);
    } else {
      return match[2];
    }
  }
  return ref;
}
async function _currentBranch({
  fs,
  gitdir,
  fullname = false,
  test = false
}) {
  const ref = await GitRefManager.resolve({
    fs,
    gitdir,
    ref: "HEAD",
    depth: 2
  });
  if (test) {
    try {
      await GitRefManager.resolve({ fs, gitdir, ref });
    } catch (err) {
      if (err instanceof NotFoundError) return;
      throw err;
    }
  }
  if (!ref.startsWith("refs/")) return;
  return fullname ? ref : abbreviateRef(ref);
}
function translateSSHtoHTTP(url) {
  url = url.replace(/^[^/@:]+@([^/@:]+):/, "https://$1/");
  url = url.replace(/^ssh:\/\//, "https://");
  return url;
}
function calculateBasicAuthHeader({ username = "", password = "" }) {
  return `Basic ${import_buffer.Buffer.from(`${username}:${password}`).toString("base64")}`;
}
async function forAwait(iterable, cb) {
  const iter = getIterator(iterable);
  while (true) {
    const { value, done } = await iter.next();
    if (value) await cb(value);
    if (done) break;
  }
  if (iter.return) iter.return();
}
async function collect(iterable) {
  let size = 0;
  const buffers = [];
  await forAwait(iterable, (value) => {
    buffers.push(value);
    size += value.byteLength;
  });
  const result = new Uint8Array(size);
  let nextIndex = 0;
  for (const buffer of buffers) {
    result.set(buffer, nextIndex);
    nextIndex += buffer.byteLength;
  }
  return result;
}
var CREDENTIALS = /^(https?:\/\/)([^/?#]+)@/i;
function extractAuthFromUrl(url) {
  const credentials = url.match(CREDENTIALS);
  if (credentials == null) return { url, auth: {} };
  return {
    url: url.replace(CREDENTIALS, "$1"),
    auth: parseUserinfo(url, credentials[2])
  };
}
function parseUserinfo(url, userpass) {
  const parsed = parseUrl(url);
  const hasPassword = userpass.indexOf(":") !== -1;
  if (parsed !== null) {
    return {
      username: decodeUserinfo(parsed.username),
      password: hasPassword ? decodeUserinfo(parsed.password) : void 0
    };
  }
  const separatorIndex = userpass.indexOf(":");
  return {
    username: hasPassword ? userpass.slice(0, separatorIndex) : userpass,
    password: hasPassword ? userpass.slice(separatorIndex + 1) : void 0
  };
}
function parseUrl(url) {
  if (typeof URL !== "function") return null;
  try {
    return new URL(url);
  } catch (_) {
    return null;
  }
}
function decodeUserinfo(value) {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}
function padHex(b, n) {
  const s = n.toString(16);
  return "0".repeat(b - s.length) + s;
}
var GitPktLine = class {
  static flush() {
    return import_buffer.Buffer.from("0000", "utf8");
  }
  static delim() {
    return import_buffer.Buffer.from("0001", "utf8");
  }
  static encode(line) {
    if (typeof line === "string") {
      line = import_buffer.Buffer.from(line);
    }
    const length = line.length + 4;
    const hexlength = padHex(4, length);
    return import_buffer.Buffer.concat([import_buffer.Buffer.from(hexlength, "utf8"), line]);
  }
  static streamReader(stream) {
    const reader = new StreamReader(stream);
    return async function read() {
      try {
        const header = await reader.read(4);
        if (header == null || header.length === 0) return true;
        const hex = header.toString("utf8");
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          throw new ParseError("four hexadecimal digits", hex);
        }
        const length = parseInt(hex, 16);
        if (length === 0) return null;
        if (length === 1) return null;
        if (length < 4) {
          throw new ParseError("pkt-line length of 0, 1, or at least 4", hex);
        }
        const buffer = await reader.read(length - 4);
        if (buffer == null || buffer.length !== length - 4) {
          throw new ParseError(
            `${length - 4} bytes of pkt-line data`,
            `${buffer == null ? 0 : buffer.length} bytes`
          );
        }
        return buffer;
      } catch (err) {
        stream.error = err;
        return true;
      }
    };
  }
};
async function parseCapabilitiesV2(read) {
  const capabilities2 = {};
  let line;
  while (true) {
    line = await read();
    if (line === true) break;
    if (line === null) continue;
    line = line.toString("utf8").replace(/\n$/, "");
    const i = line.indexOf("=");
    if (i > -1) {
      const key = line.slice(0, i);
      const value = line.slice(i + 1);
      capabilities2[key] = value;
    } else {
      capabilities2[line] = true;
    }
  }
  return { protocolVersion: 2, capabilities2 };
}
async function parseRefsAdResponse(stream, { service }) {
  const capabilities = /* @__PURE__ */ new Set();
  const refs = /* @__PURE__ */ new Map();
  const symrefs = /* @__PURE__ */ new Map();
  const read = GitPktLine.streamReader(stream);
  let lineOne = await read();
  while (lineOne === null) lineOne = await read();
  if (lineOne === true) throw new EmptyServerResponseError();
  if (lineOne.includes("version 2")) {
    return parseCapabilitiesV2(read);
  }
  if (lineOne.toString("utf8").replace(/\n$/, "") !== `# service=${service}`) {
    throw new ParseError(`# service=${service}\\n`, lineOne.toString("utf8"));
  }
  let lineTwo = await read();
  while (lineTwo === null) lineTwo = await read();
  if (lineTwo === true) return { capabilities, refs, symrefs };
  lineTwo = lineTwo.toString("utf8");
  if (lineTwo.includes("version 2")) {
    return parseCapabilitiesV2(read);
  }
  const [firstRef, capabilitiesLine] = splitAndAssert(lineTwo, "\0", "\\x00");
  capabilitiesLine.split(" ").map((x) => capabilities.add(x));
  if (firstRef !== "0000000000000000000000000000000000000000 capabilities^{}") {
    const [ref, name] = splitAndAssert(firstRef, " ", " ");
    refs.set(name, ref);
    while (true) {
      const line = await read();
      if (line === true) break;
      if (line !== null) {
        const [ref2, name2] = splitAndAssert(line.toString("utf8"), " ", " ");
        refs.set(name2, ref2);
      }
    }
  }
  for (const cap of capabilities) {
    if (cap.startsWith("symref=")) {
      const m = cap.match(/symref=([^:]+):(.*)/);
      if (m.length === 3) {
        symrefs.set(m[1], m[2]);
      }
    }
  }
  return { protocolVersion: 1, capabilities, refs, symrefs };
}
function splitAndAssert(line, sep, expected) {
  const split = line.trim().split(sep);
  if (split.length !== 2) {
    throw new ParseError(
      `Two strings separated by '${expected}'`,
      line.toString("utf8")
    );
  }
  return split;
}
var corsProxify = (corsProxy, url) => corsProxy.endsWith("?") ? `${corsProxy}${url}` : `${corsProxy}/${url.replace(/^https?:\/\//, "")}`;
var updateHeaders = (headers, auth) => {
  if (auth.username || auth.password) {
    headers.Authorization = calculateBasicAuthHeader(auth);
  }
  if (auth.headers) {
    Object.assign(headers, auth.headers);
  }
};
var stringifyBody = async (res) => {
  try {
    const data = import_buffer.Buffer.from(await collect(res.body));
    const response = data.toString("utf8");
    const preview = response.length < 256 ? response : response.slice(0, 256) + "...";
    return { preview, response, data };
  } catch (e) {
    return {};
  }
};
var GitRemoteHTTP = class {
  /**
   * Returns the capabilities of the GitRemoteHTTP class.
   *
   * @returns {Promise<string[]>} - An array of supported capabilities.
   */
  static async capabilities() {
    return ["discover", "connect"];
  }
  /**
   * Discovers references from a remote Git repository.
   *
   * @param {Object} args
   * @param {HttpClient} args.http - The HTTP client to use for requests.
   * @param {ProgressCallback} [args.onProgress] - Callback for progress updates.
   * @param {AuthCallback} [args.onAuth] - Callback for providing authentication credentials.
   * @param {AuthFailureCallback} [args.onAuthFailure] - Callback for handling authentication failures.
   * @param {AuthSuccessCallback} [args.onAuthSuccess] - Callback for handling successful authentication.
   * @param {string} [args.corsProxy] - Optional CORS proxy URL.
   * @param {string} args.service - The Git service (e.g., "git-upload-pack").
   * @param {string} args.url - The URL of the remote repository.
   * @param {Object<string, string>} args.headers - HTTP headers to include in the request.
   * @param {AbortSignal} [args.signal] - Signal to abort the operation.
   * @param {1 | 2} args.protocolVersion - The Git protocol version to use.
   * @returns {Promise<Object>} - The parsed response from the remote repository.
   * @throws {HttpError} - If the HTTP request fails.
   * @throws {SmartHttpError} - If the response cannot be parsed.
   * @throws {UserCanceledError} - If the user cancels the operation.
   */
  static async discover({
    http,
    onProgress,
    onAuth,
    onAuthSuccess,
    onAuthFailure,
    corsProxy,
    service,
    url: _origUrl,
    headers,
    signal,
    protocolVersion
  }) {
    let { url, auth } = extractAuthFromUrl(_origUrl);
    const proxifiedURL = corsProxy ? corsProxify(corsProxy, url) : url;
    if (auth.username || auth.password) {
      headers.Authorization = calculateBasicAuthHeader(auth);
    }
    if (protocolVersion === 2) {
      headers["Git-Protocol"] = "version=2";
    }
    let res;
    let tryAgain;
    let providedAuthBefore = false;
    do {
      res = await http.request({
        onProgress,
        method: "GET",
        url: `${proxifiedURL}/info/refs?service=${service}`,
        headers,
        signal
      });
      tryAgain = false;
      if (res.statusCode === 401 || res.statusCode === 203) {
        const getAuth = providedAuthBefore ? onAuthFailure : onAuth;
        if (getAuth) {
          auth = await getAuth(url, {
            ...auth,
            headers: { ...headers }
          });
          if (auth && auth.cancel) {
            throw new UserCanceledError();
          } else if (auth) {
            updateHeaders(headers, auth);
            providedAuthBefore = true;
            tryAgain = true;
          }
        }
      } else if (res.statusCode === 200 && providedAuthBefore && onAuthSuccess) {
        await onAuthSuccess(url, auth);
      }
    } while (tryAgain);
    if (res.statusCode !== 200) {
      const { response } = await stringifyBody(res);
      throw new HttpError(res.statusCode, res.statusMessage, response);
    }
    if (res.headers["content-type"] === `application/x-${service}-advertisement`) {
      const remoteHTTP = await parseRefsAdResponse(res.body, { service });
      remoteHTTP.auth = auth;
      return remoteHTTP;
    } else {
      const { preview, response, data } = await stringifyBody(res);
      try {
        const remoteHTTP = await parseRefsAdResponse([data], { service });
        remoteHTTP.auth = auth;
        return remoteHTTP;
      } catch (e) {
        throw new SmartHttpError(preview, response);
      }
    }
  }
  /**
   * Connects to a remote Git repository and sends a request.
   *
   * @param {Object} args
   * @param {HttpClient} args.http - The HTTP client to use for requests.
   * @param {ProgressCallback} [args.onProgress] - Callback for progress updates.
   * @param {string} [args.corsProxy] - Optional CORS proxy URL.
   * @param {string} args.service - The Git service (e.g., "git-upload-pack").
   * @param {string} args.url - The URL of the remote repository.
   * @param {Object<string, string>} [args.headers] - HTTP headers to include in the request.
   * @param {any} args.body - The request body to send.
   * @param {any} args.auth - Authentication credentials.
   * @param {AbortSignal} [args.signal] - Signal to abort the operation.
   * @returns {Promise<GitHttpResponse>} - The HTTP response from the remote repository.
   * @throws {HttpError} - If the HTTP request fails.
   */
  static async connect({
    http,
    onProgress,
    corsProxy,
    service,
    url,
    auth,
    body,
    headers,
    signal
  }) {
    const urlAuth = extractAuthFromUrl(url);
    if (urlAuth) url = urlAuth.url;
    if (corsProxy) url = corsProxify(corsProxy, url);
    headers["content-type"] = `application/x-${service}-request`;
    headers.accept = `application/x-${service}-result`;
    updateHeaders(headers, auth);
    const res = await http.request({
      onProgress,
      method: "POST",
      url: `${url}/${service}`,
      body,
      headers,
      signal
    });
    if (res.statusCode !== 200) {
      const { response } = stringifyBody(res);
      throw new HttpError(res.statusCode, res.statusMessage, response);
    }
    return res;
  }
};
var GitRemoteManager = class {
  /**
   * Determines the appropriate remote helper for the given URL.
   *
   * @param {Object} args
   * @param {string} args.url - The URL of the remote repository.
   * @returns {Object} - The remote helper class for the specified transport.
   * @throws {UrlParseError} - If the URL cannot be parsed.
   * @throws {UnknownTransportError} - If the transport is not supported.
   */
  static getRemoteHelperFor({ url }) {
    const remoteHelpers = /* @__PURE__ */ new Map();
    remoteHelpers.set("http", GitRemoteHTTP);
    remoteHelpers.set("https", GitRemoteHTTP);
    const parts = parseRemoteUrl({ url });
    if (!parts) {
      throw new UrlParseError(url);
    }
    if (remoteHelpers.has(parts.transport)) {
      return remoteHelpers.get(parts.transport);
    }
    throw new UnknownTransportError(
      url,
      parts.transport,
      parts.transport === "ssh" ? translateSSHtoHTTP(url) : void 0
    );
  }
};
var scpLike = /^[^/@:]+@[^/@:]+:/;
function parseRemoteUrl({ url }) {
  if (scpLike.test(url)) {
    return {
      transport: "ssh",
      address: url
    };
  }
  const matches2 = url.match(/(\w+)(:\/\/|::)(.*)/);
  if (matches2 === null) return;
  if (matches2[2] === "://") {
    return {
      transport: matches2[1],
      address: matches2[0]
    };
  }
  if (matches2[2] === "::") {
    return {
      transport: matches2[1],
      address: matches2[3]
    };
  }
}
var GitShallowManager = class {
  /**
   * Reads the `shallow` file in the Git repository and returns a set of object IDs (OIDs).
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation.
   * @param {string} [args.gitdir] - [required] The [git directory](dir-vs-gitdir.md) path
   * @returns {Promise<Set<string>>} - A set of shallow object IDs.
   */
  static async read({ fs, gitdir }) {
    const filepath = join2(gitdir, "shallow");
    const oids = /* @__PURE__ */ new Set();
    await acquireLock(filepath, async function() {
      const text = await fs.read(filepath, { encoding: "utf8" });
      if (text === null) return oids;
      if (text.trim() === "") return oids;
      text.trim().split("\n").map((oid) => oids.add(oid));
    });
    return oids;
  }
  /**
   * Writes a set of object IDs (OIDs) to the `shallow` file in the Git repository.
   * If the set is empty, the `shallow` file is removed.
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation.
   * @param {string} [args.gitdir] - [required] The [git directory](dir-vs-gitdir.md) path
   * @param {Set<string>} args.oids - A set of shallow object IDs to write.
   * @returns {Promise<void>}
   */
  static async write({ fs, gitdir, oids }) {
    const filepath = join2(gitdir, "shallow");
    if (oids.size > 0) {
      const text = [...oids].join("\n") + "\n";
      await acquireLock(filepath, async function() {
        await fs.write(filepath, text, {
          encoding: "utf8"
        });
      });
    } else {
      await acquireLock(filepath, async function() {
        await fs.rm(filepath);
      });
    }
  }
};
function addCredentialUsername({ config, onAuth }) {
  if (!onAuth) return onAuth;
  return async (url, auth) => {
    const username = auth.username || await config.get(`credential.${url}.username`);
    return onAuth(url, username ? { ...auth, username } : auth);
  };
}
function emptyPackfile(pack) {
  const pheader = "5041434b";
  const version = "00000002";
  const obCount = "00000000";
  const header = pheader + version + obCount;
  return pack.slice(0, 12).toString("hex") === header;
}
function filterCapabilities(server, client) {
  const serverNames = server.map((cap) => cap.split("=", 1)[0]);
  return client.filter((cap) => {
    const name = cap.split("=", 1)[0];
    return serverNames.includes(name);
  });
}
var pkg = {
  name: "isomorphic-git",
  version: "1.44.18",
  agent: "git/isomorphic-git@1.44.18"
};
var FIFO = class {
  constructor() {
    this._queue = [];
  }
  write(chunk) {
    if (this._ended) {
      throw Error("You cannot write to a FIFO that has already been ended!");
    }
    if (this._waiting) {
      const resolve = this._waiting;
      this._waiting = null;
      resolve({ value: chunk });
    } else {
      this._queue.push(chunk);
    }
  }
  end() {
    this._ended = true;
    if (this._waiting) {
      const resolve = this._waiting;
      this._waiting = null;
      resolve({ done: true });
    }
  }
  destroy(err) {
    this.error = err;
    this.end();
  }
  async next() {
    if (this._queue.length > 0) {
      return { value: this._queue.shift() };
    }
    if (this._ended) {
      return { done: true };
    }
    if (this._waiting) {
      throw Error(
        "You cannot call read until the previous call to read has returned!"
      );
    }
    return new Promise((resolve) => {
      this._waiting = resolve;
    });
  }
};
function findSplit(str) {
  const r = str.indexOf("\r");
  const n = str.indexOf("\n");
  if (r === -1 && n === -1) return -1;
  if (r === -1) return n + 1;
  if (n === -1) return r + 1;
  if (n === r + 1) return n + 1;
  return Math.min(r, n) + 1;
}
function splitLines(input) {
  const output = new FIFO();
  let tmp = "";
  (async () => {
    await forAwait(input, (chunk) => {
      chunk = chunk.toString("utf8");
      tmp += chunk;
      while (true) {
        const i = findSplit(tmp);
        if (i === -1) break;
        if (i === tmp.length && tmp[i - 1] === "\r") break;
        output.write(tmp.slice(0, i));
        tmp = tmp.slice(i);
      }
    });
    if (tmp.length > 0) {
      output.write(tmp);
    }
    output.end();
  })();
  return output;
}
var GitSideBand = class {
  static demux(input) {
    const read = GitPktLine.streamReader(input);
    const packetlines = new FIFO();
    const packfile = new FIFO();
    const progress = new FIFO();
    const nextBit = async function() {
      const line = await read();
      if (line === null) return nextBit();
      if (line === true) {
        packetlines.end();
        progress.end();
        input.error ? packfile.destroy(input.error) : packfile.end();
        return;
      }
      switch (line[0]) {
        case 1: {
          packfile.write(line.slice(1));
          break;
        }
        case 2: {
          progress.write(line.slice(1));
          break;
        }
        case 3: {
          const error = line.slice(1);
          progress.write(error);
          packetlines.end();
          progress.end();
          packfile.destroy(new Error(error.toString("utf8")));
          return;
        }
        default: {
          packetlines.write(line);
        }
      }
      nextBit();
    };
    nextBit();
    return {
      packetlines,
      packfile,
      progress
    };
  }
  // static mux ({
  //   protocol, // 'side-band' or 'side-band-64k'
  //   packetlines,
  //   packfile,
  //   progress,
  //   error
  // }) {
  //   const MAX_PACKET_LENGTH = protocol === 'side-band-64k' ? 999 : 65519
  //   let output = new PassThrough()
  //   packetlines.on('data', data => {
  //     if (data === null) {
  //       output.write(GitPktLine.flush())
  //     } else {
  //       output.write(GitPktLine.encode(data))
  //     }
  //   })
  //   let packfileWasEmpty = true
  //   let packfileEnded = false
  //   let progressEnded = false
  //   let errorEnded = false
  //   let goodbye = Buffer.concat([
  //     GitPktLine.encode(Buffer.from('010A', 'hex')),
  //     GitPktLine.flush()
  //   ])
  //   packfile
  //     .on('data', data => {
  //       packfileWasEmpty = false
  //       const buffers = splitBuffer(data, MAX_PACKET_LENGTH)
  //       for (const buffer of buffers) {
  //         output.write(
  //           GitPktLine.encode(Buffer.concat([Buffer.from('01', 'hex'), buffer]))
  //         )
  //       }
  //     })
  //     .on('end', () => {
  //       packfileEnded = true
  //       if (!packfileWasEmpty) output.write(goodbye)
  //       if (progressEnded && errorEnded) output.end()
  //     })
  //   progress
  //     .on('data', data => {
  //       const buffers = splitBuffer(data, MAX_PACKET_LENGTH)
  //       for (const buffer of buffers) {
  //         output.write(
  //           GitPktLine.encode(Buffer.concat([Buffer.from('02', 'hex'), buffer]))
  //         )
  //       }
  //     })
  //     .on('end', () => {
  //       progressEnded = true
  //       if (packfileEnded && errorEnded) output.end()
  //     })
  //   error
  //     .on('data', data => {
  //       const buffers = splitBuffer(data, MAX_PACKET_LENGTH)
  //       for (const buffer of buffers) {
  //         output.write(
  //           GitPktLine.encode(Buffer.concat([Buffer.from('03', 'hex'), buffer]))
  //         )
  //       }
  //     })
  //     .on('end', () => {
  //       errorEnded = true
  //       if (progressEnded && packfileEnded) output.end()
  //     })
  //   return output
  // }
};
async function parseUploadPackResponse(stream) {
  const { packetlines, packfile, progress } = GitSideBand.demux(stream);
  const shallows = [];
  const unshallows = [];
  const acks = [];
  let nak = false;
  let done = false;
  return new Promise((resolve, reject) => {
    forAwait(packetlines, (data) => {
      const line = data.toString("utf8").trim();
      if (line.startsWith("shallow")) {
        const oid = line.slice(-41).trim();
        if (oid.length !== 40) {
          reject(new InvalidOidError(oid));
        }
        shallows.push(oid);
      } else if (line.startsWith("unshallow")) {
        const oid = line.slice(-41).trim();
        if (oid.length !== 40) {
          reject(new InvalidOidError(oid));
        }
        unshallows.push(oid);
      } else if (line.startsWith("ACK")) {
        const [, oid, status] = line.split(" ");
        acks.push({ oid, status });
        if (!status) done = true;
      } else if (line.startsWith("NAK")) {
        nak = true;
        done = true;
      } else {
        done = true;
        nak = true;
      }
      if (done) {
        stream.error ? reject(stream.error) : resolve({ shallows, unshallows, acks, nak, packfile, progress });
      }
    }).finally(() => {
      if (!done) {
        stream.error ? reject(stream.error) : resolve({ shallows, unshallows, acks, nak, packfile, progress });
      }
    });
  });
}
function writeUploadPackRequest({
  capabilities = [],
  wants = [],
  haves = [],
  shallows = [],
  depth = null,
  since = null,
  exclude = []
}) {
  const packstream = [];
  wants = [...new Set(wants)];
  let firstLineCapabilities = ` ${capabilities.join(" ")}`;
  for (const oid of wants) {
    packstream.push(GitPktLine.encode(`want ${oid}${firstLineCapabilities}
`));
    firstLineCapabilities = "";
  }
  for (const oid of shallows) {
    packstream.push(GitPktLine.encode(`shallow ${oid}
`));
  }
  if (depth !== null) {
    packstream.push(GitPktLine.encode(`deepen ${depth}
`));
  }
  if (since !== null) {
    packstream.push(
      GitPktLine.encode(`deepen-since ${Math.floor(since.valueOf() / 1e3)}
`)
    );
  }
  for (const oid of exclude) {
    packstream.push(GitPktLine.encode(`deepen-not ${oid}
`));
  }
  packstream.push(GitPktLine.flush());
  for (const oid of haves) {
    packstream.push(GitPktLine.encode(`have ${oid}
`));
  }
  packstream.push(GitPktLine.encode(`done
`));
  return packstream;
}
async function _fetch({
  fs,
  cache,
  http,
  onProgress,
  onMessage,
  onAuth,
  onAuthSuccess,
  onAuthFailure,
  gitdir,
  ref: _ref,
  remoteRef: _remoteRef,
  remote: _remote,
  url: _url,
  corsProxy,
  depth = null,
  since = null,
  exclude = [],
  relative = false,
  tags = false,
  singleBranch = false,
  headers = {},
  prune = false,
  pruneTags = false
}) {
  const ref = _ref || await _currentBranch({ fs, gitdir, test: true });
  const config = await GitConfigManager.get({ fs, gitdir });
  const remote = _remote || ref && await config.get(`branch.${ref}.remote`) || "origin";
  const url = _url || await config.get(`remote.${remote}.url`);
  if (typeof url === "undefined") {
    throw new MissingParameterError("remote OR url");
  }
  const remoteRef = _remoteRef || ref && await config.get(`branch.${ref}.merge`) || _ref || "HEAD";
  if (corsProxy === void 0) {
    corsProxy = await config.get("http.corsProxy");
  }
  const GitRemoteHTTP2 = GitRemoteManager.getRemoteHelperFor({ url });
  const remoteHTTP = await GitRemoteHTTP2.discover({
    http,
    onAuth: addCredentialUsername({ config, onAuth }),
    onAuthSuccess,
    onAuthFailure: addCredentialUsername({ config, onAuth: onAuthFailure }),
    corsProxy,
    service: "git-upload-pack",
    url,
    headers,
    protocolVersion: 1
  });
  const auth = remoteHTTP.auth;
  const remoteRefs = remoteHTTP.refs;
  if (remoteRefs.size === 0) {
    return {
      defaultBranch: null,
      fetchHead: null,
      fetchHeadDescription: null
    };
  }
  if (depth !== null && !remoteHTTP.capabilities.has("shallow")) {
    throw new RemoteCapabilityError("shallow", "depth");
  }
  if (since !== null && !remoteHTTP.capabilities.has("deepen-since")) {
    throw new RemoteCapabilityError("deepen-since", "since");
  }
  if (exclude.length > 0 && !remoteHTTP.capabilities.has("deepen-not")) {
    throw new RemoteCapabilityError("deepen-not", "exclude");
  }
  if (relative === true && !remoteHTTP.capabilities.has("deepen-relative")) {
    throw new RemoteCapabilityError("deepen-relative", "relative");
  }
  const { oid, fullref } = GitRefManager.resolveAgainstMap({
    ref: remoteRef,
    map: remoteRefs
  });
  for (const remoteRef2 of remoteRefs.keys()) {
    if (remoteRef2 === fullref || remoteRef2 === "HEAD" || remoteRef2.startsWith("refs/heads/") || tags && remoteRef2.startsWith("refs/tags/")) {
      continue;
    }
    remoteRefs.delete(remoteRef2);
  }
  const capabilities = filterCapabilities(
    [...remoteHTTP.capabilities],
    [
      "multi_ack_detailed",
      "no-done",
      "side-band-64k",
      // Note: I removed 'thin-pack' option since our code doesn't "fatten" packfiles,
      // which is necessary for compatibility with git. It was the cause of mysterious
      // 'fatal: pack has [x] unresolved deltas' errors that plagued us for some time.
      // isomorphic-git is perfectly happy with thin packfiles in .git/objects/pack but
      // canonical git it turns out is NOT.
      "ofs-delta",
      `agent=${pkg.agent}`
    ]
  );
  if (relative) capabilities.push("deepen-relative");
  const wants = singleBranch ? [oid] : remoteRefs.values();
  const haveRefs = singleBranch ? [ref] : await GitRefManager.listRefs({
    fs,
    gitdir,
    filepath: `refs`
  });
  let haves = [];
  for (let ref2 of haveRefs) {
    try {
      ref2 = await GitRefManager.expand({ fs, gitdir, ref: ref2 });
      const oid2 = await GitRefManager.resolve({ fs, gitdir, ref: ref2 });
      if (await hasObject({ fs, cache, gitdir, oid: oid2 })) {
        haves.push(oid2);
      }
    } catch (err) {
    }
  }
  haves = [...new Set(haves)];
  const oids = await GitShallowManager.read({ fs, gitdir });
  const shallows = remoteHTTP.capabilities.has("shallow") ? [...oids] : [];
  const packstream = writeUploadPackRequest({
    capabilities,
    wants,
    haves,
    shallows,
    depth,
    since,
    exclude
  });
  const packbuffer = import_buffer.Buffer.from(await collect(packstream));
  const raw = await GitRemoteHTTP2.connect({
    http,
    onProgress,
    corsProxy,
    service: "git-upload-pack",
    url,
    auth,
    body: [packbuffer],
    headers
  });
  const response = await parseUploadPackResponse(raw.body);
  if (raw.headers) {
    response.headers = raw.headers;
  }
  for (const oid2 of response.shallows) {
    if (!oids.has(oid2)) {
      try {
        const { object: object2 } = await _readObject({ fs, cache, gitdir, oid: oid2 });
        const commit = new GitCommit(object2);
        const hasParents = await Promise.all(
          commit.headers().parent.map((oid3) => hasObject({ fs, cache, gitdir, oid: oid3 }))
        );
        const haveAllParents = hasParents.length === 0 || hasParents.every((has) => has);
        if (!haveAllParents) {
          oids.add(oid2);
        }
      } catch (err) {
        oids.add(oid2);
      }
    }
  }
  for (const oid2 of response.unshallows) {
    oids.delete(oid2);
  }
  await GitShallowManager.write({ fs, gitdir, oids });
  if (singleBranch) {
    const refs = /* @__PURE__ */ new Map([[fullref, oid]]);
    const symrefs = /* @__PURE__ */ new Map();
    let bail = 10;
    let key = fullref;
    while (bail--) {
      const value = remoteHTTP.symrefs.get(key);
      if (value === void 0) break;
      symrefs.set(key, value);
      key = value;
    }
    const realRef = remoteRefs.get(key);
    if (realRef) {
      refs.set(key, realRef);
    }
    const { pruned } = await GitRefManager.updateRemoteRefs({
      fs,
      gitdir,
      remote,
      refs,
      symrefs,
      tags,
      prune
    });
    if (prune) {
      response.pruned = pruned;
    }
  } else {
    const { pruned } = await GitRefManager.updateRemoteRefs({
      fs,
      gitdir,
      remote,
      refs: remoteRefs,
      symrefs: remoteHTTP.symrefs,
      tags,
      prune,
      pruneTags
    });
    if (prune) {
      response.pruned = pruned;
    }
  }
  response.HEAD = remoteHTTP.symrefs.get("HEAD");
  if (response.HEAD === void 0) {
    const { oid: oid2 } = GitRefManager.resolveAgainstMap({
      ref: "HEAD",
      map: remoteRefs
    });
    for (const [key, value] of remoteRefs.entries()) {
      if (key !== "HEAD" && value === oid2) {
        response.HEAD = key;
        break;
      }
    }
  }
  const noun = fullref.startsWith("refs/tags") ? "tag" : "branch";
  const { url: urlWithoutAuth } = extractAuthFromUrl(url);
  response.FETCH_HEAD = {
    oid,
    description: `${noun} '${abbreviateRef(fullref)}' of ${urlWithoutAuth}`
  };
  if (onProgress || onMessage) {
    const lines = splitLines(response.progress);
    forAwait(lines, async (line) => {
      if (onMessage) await onMessage(line);
      if (onProgress) {
        const matches2 = line.match(/([^:]*).*\((\d+?)\/(\d+?)\)/);
        if (matches2) {
          await onProgress({
            phase: matches2[1].trim(),
            loaded: parseInt(matches2[2], 10),
            total: parseInt(matches2[3], 10)
          });
        }
      }
    });
  }
  const packfile = import_buffer.Buffer.from(await collect(response.packfile));
  if (raw.body.error) throw raw.body.error;
  const packfileSha = packfile.slice(-20).toString("hex");
  const res = {
    defaultBranch: response.HEAD,
    fetchHead: response.FETCH_HEAD.oid,
    fetchHeadDescription: response.FETCH_HEAD.description
  };
  if (response.headers) {
    res.headers = response.headers;
  }
  if (prune) {
    res.pruned = response.pruned;
  }
  if (packfileSha !== "" && !emptyPackfile(packfile)) {
    res.packfile = `objects/pack/pack-${packfileSha}.pack`;
    const fullpath = join2(gitdir, res.packfile);
    await fs.write(fullpath, packfile);
    const getExternalRefDelta = (oid2) => _readObject({ fs, cache, gitdir, oid: oid2 });
    const idx = await GitPackIndex.fromPack({
      pack: packfile,
      getExternalRefDelta,
      onProgress
    });
    await fs.write(fullpath.replace(/\.pack$/, ".idx"), await idx.toBuffer());
  }
  return res;
}
async function _init({
  fs,
  bare = false,
  dir,
  gitdir = bare ? dir : join2(dir, ".git"),
  defaultBranch = "master"
}) {
  if (await fs.exists(gitdir + "/config")) return;
  let folders = [
    "hooks",
    "info",
    "objects/info",
    "objects/pack",
    "refs/heads",
    "refs/tags"
  ];
  folders = folders.map((dir2) => gitdir + "/" + dir2);
  for (const folder of folders) {
    await fs.mkdir(folder);
  }
  await fs.write(
    gitdir + "/config",
    `[core]
	repositoryformatversion = 0
	filemode = false
	bare = ${bare}
` + (bare ? "" : "	logallrefupdates = true\n") + "	symlinks = false\n	ignorecase = true\n"
  );
  await fs.write(gitdir + "/HEAD", `ref: refs/heads/${defaultBranch}
`);
}
async function fetch({
  fs,
  http,
  onProgress,
  onMessage,
  onAuth,
  onAuthSuccess,
  onAuthFailure,
  dir,
  gitdir = join2(dir, ".git"),
  ref,
  remote,
  remoteRef,
  url,
  corsProxy,
  depth = null,
  since = null,
  exclude = [],
  relative = false,
  tags = false,
  singleBranch = false,
  headers = {},
  prune = false,
  pruneTags = false,
  cache = {}
}) {
  try {
    assertParameter("fs", fs);
    assertParameter("http", http);
    assertParameter("gitdir", gitdir);
    const fsp = new FileSystem(fs);
    const updatedGitdir = await discoverGitdir({ fsp, dotgit: gitdir });
    return await _fetch({
      fs: fsp,
      cache,
      http,
      onProgress,
      onMessage,
      onAuth,
      onAuthSuccess,
      onAuthFailure,
      gitdir: updatedGitdir,
      ref,
      remote,
      remoteRef,
      url,
      corsProxy,
      depth,
      since,
      exclude,
      relative,
      tags,
      singleBranch,
      headers,
      prune,
      pruneTags
    });
  } catch (err) {
    err.caller = "git.fetch";
    throw err;
  }
}
async function init({
  fs,
  bare = false,
  dir,
  gitdir = bare ? dir : join2(dir, ".git"),
  defaultBranch = "master"
}) {
  try {
    assertParameter("fs", fs);
    assertParameter("gitdir", gitdir);
    if (!bare) {
      assertParameter("dir", dir);
    }
    const fsp = new FileSystem(fs);
    const updatedGitdir = await discoverGitdir({ fsp, dotgit: gitdir });
    return await _init({
      fs: fsp,
      bare,
      dir,
      gitdir: updatedGitdir,
      defaultBranch
    });
  } catch (err) {
    err.caller = "git.init";
    throw err;
  }
}
async function resolveBlob({ fs, cache, gitdir, oid }) {
  const { type, object: object2 } = await _readObject({ fs, cache, gitdir, oid });
  if (type === "tag") {
    oid = GitAnnotatedTag.from(object2).parse().object;
    return resolveBlob({ fs, cache, gitdir, oid });
  }
  if (type !== "blob") {
    throw new ObjectTypeError(oid, type, "blob");
  }
  return { oid, blob: new Uint8Array(object2) };
}
async function _readBlob({
  fs,
  cache,
  gitdir,
  oid,
  filepath = void 0
}) {
  if (filepath !== void 0) {
    oid = await resolveFilepath({ fs, cache, gitdir, oid, filepath });
  }
  const blob = await resolveBlob({
    fs,
    cache,
    gitdir,
    oid
  });
  return blob;
}
async function readBlob({
  fs,
  dir,
  gitdir = join2(dir, ".git"),
  oid,
  filepath,
  cache = {}
}) {
  try {
    assertParameter("fs", fs);
    assertParameter("gitdir", gitdir);
    assertParameter("oid", oid);
    const fsp = new FileSystem(fs);
    const updatedGitdir = await discoverGitdir({ fsp, dotgit: gitdir });
    return await _readBlob({
      fs: fsp,
      cache,
      gitdir: updatedGitdir,
      oid,
      filepath
    });
  } catch (err) {
    err.caller = "git.readBlob";
    throw err;
  }
}
async function readCommit({
  fs,
  dir,
  gitdir = join2(dir, ".git"),
  oid,
  cache = {}
}) {
  try {
    assertParameter("fs", fs);
    assertParameter("gitdir", gitdir);
    assertParameter("oid", oid);
    const fsp = new FileSystem(fs);
    const updatedGitdir = await discoverGitdir({ fsp, dotgit: gitdir });
    return await _readCommit({
      fs: fsp,
      cache,
      gitdir: updatedGitdir,
      oid
    });
  } catch (err) {
    err.caller = "git.readCommit";
    throw err;
  }
}
async function readTree({
  fs,
  dir,
  gitdir = join2(dir, ".git"),
  oid,
  filepath = void 0,
  cache = {}
}) {
  try {
    assertParameter("fs", fs);
    assertParameter("gitdir", gitdir);
    assertParameter("oid", oid);
    const fsp = new FileSystem(fs);
    const updatedGitdir = await discoverGitdir({ fsp, dotgit: gitdir });
    return await _readTree({
      fs: fsp,
      cache,
      gitdir: updatedGitdir,
      oid,
      filepath
    });
  } catch (err) {
    err.caller = "git.readTree";
    throw err;
  }
}

// src/public-git.ts
function gitHttp(send) {
  return {
    async request({ url, method = "GET", headers = {}, body }) {
      const u = new URL(url);
      if (u.protocol !== "https:" || !(method === "GET" && u.pathname.endsWith("/info/refs") && u.searchParams.get("service") === "git-upload-pack" || method === "POST" && u.pathname.endsWith("/git-upload-pack")))
        throw Error("gitRead");
      let payload;
      if (body) {
        const chunks = [];
        let n = 0;
        for await (const chunk of body) {
          chunks.push(chunk);
          n += chunk.length;
        }
        const bytes = new Uint8Array(n);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        payload = bytes.buffer;
      }
      const res = await send(url, method, headers, payload);
      return {
        url,
        method,
        statusCode: res.status,
        statusMessage: String(res.status),
        headers: res.headers,
        body: (async function* () {
          yield new Uint8Array(res.arrayBuffer);
        })()
      };
    }
  };
}
var fetching = /* @__PURE__ */ new Map();
var GitTree2 = class {
  constructor(openFs, send, url, branch, cacheKey) {
    this.openFs = openFs;
    this.send = send;
    this.url = url;
    this.branch = branch;
    this.cacheKey = cacheKey;
  }
  pinned;
  last;
  snapshot() {
    if (!this.pinned) {
      let work = fetching.get(this.cacheKey);
      if (!work) {
        work = this.fetch().finally(() => fetching.delete(this.cacheKey));
        fetching.set(this.cacheKey, work);
      }
      this.pinned = work;
    }
    return this.pinned;
  }
  async fetch() {
    try {
      const fs = await this.openFs(), opts = { fs, dir: "/work", gitdir: "/db" };
      await init({ ...opts, defaultBranch: "main" });
      await addRemote({
        ...opts,
        remote: "origin",
        url: this.url,
        force: true
      });
      const { fetchHead } = await fetch({
        ...opts,
        http: gitHttp(this.send),
        url: this.url,
        ref: this.branch || "HEAD",
        remote: "origin",
        singleBranch: true,
        depth: 1,
        tags: false
      });
      if (!fetchHead) throw Error("gitRead");
      const { commit } = await readCommit({ ...opts, oid: fetchHead });
      return {
        fs,
        oid: fetchHead,
        tree: commit.tree,
        mtime: commit.committer.timestamp * 1e3
      };
    } catch (cause) {
      throw Error("gitRead", { cause });
    }
  }
  async revision() {
    return (await this.snapshot()).oid;
  }
  async root() {
    return rootItem((await this.snapshot()).tree);
  }
  async children(dir) {
    const { fs, mtime } = await this.snapshot();
    const { tree } = await readTree({
      fs,
      dir: "/work",
      gitdir: "/db",
      oid: dir.key
    });
    return tree.map((e) => ({
      ...rootItem(e.oid),
      name: e.path,
      mtime,
      size: -1,
      type: e.type === "tree" ? "folder" : ["100644", "100755"].includes(e.mode) ? "file" : "skip"
    }));
  }
  async read(item) {
    if (this.last?.key === item.key) return this.last.bytes;
    const { fs } = await this.snapshot();
    const { blob } = await readBlob({
      fs,
      dir: "/work",
      gitdir: "/db",
      oid: item.key
    });
    const bytes = Uint8Array.from(blob).buffer;
    this.last = { key: item.key, bytes };
    return bytes;
  }
  async size(item) {
    return (await this.read(item)).byteLength;
  }
};

// src/git-fs.ts
init_git_buffer();
var failure = (code) => Object.assign(new Error(code), { code });
function gitFs(adapter, cacheRoot) {
  const path = (p) => {
    if (p === "/") return cacheRoot;
    const rel = p.replace(/^\//, "");
    if (!safe(rel) || !["db", "work"].includes(rel.split("/")[0]))
      throw failure("EINVAL");
    return join(cacheRoot, rel);
  };
  const info = async (p) => {
    const s = await adapter.stat(path(p));
    if (!s) throw failure("ENOENT");
    return s;
  };
  const stat = async (p) => {
    const s = await info(p);
    return {
      ...s,
      mtimeMs: s.mtime,
      ctimeMs: s.ctime,
      mtime: new Date(s.mtime),
      ctime: new Date(s.ctime),
      mode: s.type === "folder" ? 16877 : 33188,
      isDirectory: () => s.type === "folder",
      isFile: () => s.type === "file",
      isSymbolicLink: () => false
    };
  };
  const unsupported = async () => {
    throw failure("ENOSYS");
  };
  return {
    promises: {
      stat,
      lstat: stat,
      readlink: unsupported,
      symlink: unsupported,
      chmod: unsupported,
      async readFile(p, opts) {
        if ((await info(p)).type !== "file") throw failure("EISDIR");
        return (typeof opts === "string" ? opts : opts?.encoding) ? adapter.read(path(p)) : new Uint8Array(await adapter.readBinary(path(p)));
      },
      async writeFile(p, data) {
        if (typeof data === "string") await adapter.write(path(p), data);
        else await adapter.writeBinary(path(p), Uint8Array.from(data).buffer);
      },
      async mkdir(p) {
        if (await adapter.exists(path(p))) throw failure("EEXIST");
        await adapter.mkdir(path(p));
      },
      async readdir(p) {
        if ((await info(p)).type !== "folder") throw failure("ENOTDIR");
        const list = await adapter.list(path(p));
        return [...list.files, ...list.folders].map(
          (s) => s.slice(path(p).length + 1)
        );
      },
      async rmdir(p) {
        await info(p);
        await adapter.rmdir(path(p), false);
      },
      async unlink(p) {
        await info(p);
        await adapter.remove(path(p));
      }
    }
  };
}

// src/editor.ts
init_git_buffer();

// src/remote-browser.ts
init_git_buffer();
var import_obsidian3 = require("obsidian");
var RemoteFolderBrowser = class extends import_obsidian3.Modal {
  constructor(app, source, tr, choose) {
    super(app);
    this.source = source;
    this.tr = tr;
    this.choose = choose;
  }
  sequence = 0;
  onOpen() {
    void this.show("");
  }
  onClose() {
    this.sequence++;
    this.contentEl.empty();
  }
  async show(path) {
    const seq = ++this.sequence, el = this.contentEl, t = this.tr;
    el.empty();
    this.titleEl.setText(t("browse"));
    el.createEl("p", { text: "/" + path });
    if (path)
      new import_obsidian3.Setting(el).addButton(
        (b) => b.setButtonText(t("upFolder")).onClick(() => this.show(parent(path)))
      );
    const status = el.createEl("p", {
      text: t("scan"),
      attr: { role: "status" }
    });
    try {
      const { folders } = await this.source.list(path);
      if (seq !== this.sequence) return;
      status.remove();
      new import_obsidian3.Setting(el).addButton(
        (b) => b.setButtonText(t("useFolder")).setCta().onClick(() => {
          this.choose(path || "/");
          this.close();
        })
      );
      for (const folder of folders.sort((a, b) => a.localeCompare(b)))
        new import_obsidian3.Setting(el).setName(folder.slice(path ? path.length + 1 : 0)).addButton(
          (b) => b.setButtonText(t("openFolder")).onClick(() => this.show(folder))
        );
    } catch (e) {
      if (seq !== this.sequence) return;
      status.setText(t(e instanceof Error ? e.message : "failed"));
    }
  }
};

// src/scope-editor.ts
init_git_buffer();
var import_obsidian4 = require("obsidian");
function scopeEditor(el, p, t, redraw, validate2) {
  const c = p.config ??= legacyConfig();
  el.createEl("h3", { text: t("settings") });
  const sets = ["full", "noData", "look", "plugins"];
  const selected2 = sets.find(
    (s) => preset(s).length === c.categories.length && preset(s).every((k) => c.categories.includes(k))
  ) ?? "custom";
  new import_obsidian4.Setting(el).setName(t("scopePreset")).addDropdown((d) => {
    for (const s of [...sets, "custom"]) d.addOption(s, t("preset_" + s));
    d.setValue(selected2).onChange((v) => {
      if (v !== "custom") {
        c.categories = preset(v);
        c.legacyThemes = false;
        redraw();
      }
    });
  });
  for (const k of categories)
    new import_obsidian4.Setting(el).setName(t("cat_" + k)).setDesc(
      ["core", "appearance", "data", "community"].includes(k) ? "H" : "S"
    ).addToggle(
      (x) => x.setValue(c.categories.includes(k)).onChange((on) => {
        c.categories = on ? [...c.categories, k] : c.categories.filter((i) => i !== k);
        if (k === "themes") c.legacyThemes = false;
        redraw();
      })
    );
  if (!c.categories.includes("code") && c.categories.some((k) => k === "data" || k === "community"))
    el.createEl("p", { text: t("existingCode") });
  const input = (k) => new import_obsidian4.Setting(el).setName(t("cfg_" + k)).addTextArea(
    (a) => a.setValue(c[k]).onChange((v) => {
      c[k] = v;
      validate2();
    })
  );
  for (const k of [
    "codeAllow",
    "codeDeny",
    "dataAllow",
    "dataDeny",
    "include",
    "exclude",
    "overlay"
  ])
    input(k);
  new import_obsidian4.Setting(el).setName(t("mobileFilter")).addToggle(
    (x) => x.setValue(c.platformFilter).onChange((v) => {
      c.platformFilter = v;
    })
  );
  new import_obsidian4.Setting(el).setName(t("strategy")).addDropdown((d) => {
    for (const k of ["batch", "changes"]) d.addOption(k, t(k));
    d.setValue(c.strategy).onChange((v) => {
      c.strategy = v;
    });
  });
  new import_obsidian4.Setting(el).setName(t("reloadPolicy")).addDropdown((d) => {
    for (const k of ["next", "now", "idle", "never"])
      d.addOption(k, t("reload_" + k));
    d.setValue(c.reload).onChange((v) => {
      c.reload = v;
    });
  });
  new import_obsidian4.Setting(el).setName(t("idleDelay")).addText((a) => {
    a.inputEl.type = "number";
    a.setValue(String(c.idleSeconds)).onChange((v) => {
      c.idleSeconds = Number(v);
      validate2();
    });
  });
}

// src/editor.ts
var import_obsidian5 = require("obsidian");
var Editor = class extends import_obsidian5.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  draft;
  hide() {
    this.draft = void 0;
  }
  display() {
    const el = this.containerEl, rs = this.plugin, t = rs.t;
    el.empty();
    if (this.draft) {
      this.edit(this.draft);
      return;
    }
    el.createEl("h2", { text: t("profiles") });
    new import_obsidian5.Setting(el).setName(t("defaultMode")).addDropdown(
      (d) => d.addOption("plan", t("plan")).addOption("silent", t("silent")).setValue(rs.config.mode).onChange(async (v) => {
        await rs.save({
          ...rs.config,
          mode: v === "silent" ? "silent" : "plan"
        });
      })
    );
    new import_obsidian5.Setting(el).setName(t("pause")).addToggle(
      (c) => c.setValue(rs.config.paused).onChange(async (paused) => {
        await rs.save({ ...rs.config, paused });
      })
    );
    new import_obsidian5.Setting(el).addButton(
      (b) => b.setButtonText(t("add")).setCta().onClick(() => {
        this.draft = newProfile();
        this.display();
      })
    ).addButton(
      (b) => b.setButtonText(t("syncAll")).onClick(() => rs.runAll())
    );
    rs.config.profiles.forEach((p, index) => {
      const row = new import_obsidian5.Setting(el).setName(p.name).setDesc(
        [
          t(p.scope),
          p.role === "subscriber" ? (p.access === "public" && p.remote ? t(p.remote.engine) + " · " : "") + p.reference + " → " + (p.scope === "settings" ? this.app.vault.configDir : p.local) : (p.scope === "settings" ? this.app.vault.configDir : p.local) + " → " + p.access === "local" ? p.reference : "",
          t(p.inheritMode ? rs.config.mode : p.mode)
        ].join(" · ")
      );
      row.addToggle(
        (c) => c.setTooltip(t("enabled")).setValue(p.enabled).onChange(async (enabled) => {
          await rs.put({ ...p, enabled });
          this.display();
        })
      );
      row.addButton(
        (b) => b.setButtonText(t("edit")).onClick(() => {
          this.draft = structuredClone(p);
          this.display();
        })
      );
      row.addExtraButton(
        (b) => b.setIcon("copy").setTooltip(t("duplicate")).onClick(() => {
          this.draft = newProfile(p);
          this.display();
        })
      );
      for (const [delta, icon] of [
        [-1, "arrow-up"],
        [1, "arrow-down"]
      ])
        if (rs.config.profiles[index + delta])
          row.addExtraButton(
            (b) => b.setIcon(icon).setTooltip(t(delta < 0 ? "up" : "down")).onClick(async () => {
              const list = [...rs.config.profiles];
              [list[index], list[index + delta]] = [
                list[index + delta],
                list[index]
              ];
              await rs.save({ ...rs.config, profiles: list });
              this.display();
            })
          );
      new import_obsidian5.Setting(el).addButton(
        (b) => b.setButtonText(t(p.id === rs.config.current ? "current" : "select")).setDisabled(p.id === rs.config.current).onClick(async () => {
          await rs.save({ ...rs.config, current: p.id });
          this.display();
        })
      ).addButton(
        (b) => b.setButtonText(t("dry")).onClick(() => rs.request(p.id, "dry"))
      ).addButton(
        (b) => b.setButtonText(t("sync")).setDisabled(!p.enabled).onClick(() => rs.request(p.id, "run"))
      );
    });
  }
  edit(p) {
    const rs = this.plugin, t = rs.t, el = this.containerEl;
    el.createEl("h2", { text: t("edit") + " · " + p.name });
    const back = () => {
      this.draft = void 0;
      this.display();
    };
    const text = (field, key) => new import_obsidian5.Setting(el).setName(t(key)).addText(
      (c) => c.setValue(String(p[field])).onChange((v) => {
        Object.assign(p, {
          [field]: field === "reference" || field === "local" ? v.replace(/\\/g, "/") : v
        });
        validateForm();
      })
    );
    const num2 = (field, key) => new import_obsidian5.Setting(el).setName(t(key)).addText((c) => {
      c.inputEl.type = "number";
      c.inputEl.min = "0";
      c.setValue(String(p[field])).onChange((v) => {
        Object.assign(p, { [field]: v.trim() === "" ? NaN : Number(v) });
        validateForm();
      });
    });
    const toggle = (field, key, disabled = false) => new import_obsidian5.Setting(el).setName(t(key)).addToggle(
      (c) => c.setDisabled(disabled).setValue(p[field] === true).onChange((v) => {
        Object.assign(p, { [field]: v });
        validateForm();
      })
    );
    const choice = (field, key, values, disabled = false) => new import_obsidian5.Setting(el).setName(t(key)).addDropdown((d) => {
      for (const v of values)
        d.addOption(
          v,
          t(field === "conflict" && v === "target" ? "targetVersion" : v)
        );
      d.setValue(String(p[field])).setDisabled(disabled).onChange((v) => {
        Object.assign(p, { [field]: v });
        if (p.mirror === "full") {
          p.conflict = "source";
          p.deletions = true;
        }
        if (p.scope === "settings") {
          p.fileEvents = false;
          if (field === "scope" && !p.config) {
            p.config = {
              ...legacyConfig(),
              categories: preset("full"),
              legacyThemes: false,
              strategy: "batch"
            };
            p.startup = true;
            p.intervalMinutes = 60;
            p.onFocus = false;
            p.onOnline = false;
          }
          if (p.conflict === "both") p.conflict = "source";
        }
        if (field === "role" && p.role === "publisher") {
          p.conflict = "source";
          p.deletions = p.mirror === "full";
        }
        this.display();
      });
    });
    if (p.config) p.config = structuredClone(p.config);
    text("name", "name");
    toggle("enabled", "enabled");
    choice("scope", "scope", ["content", "settings"]);
    new import_obsidian5.Setting(el).setName(t("engine")).addDropdown((d) => {
      for (const k of ["vaultSource", "google", "yandex", "git"])
        d.addOption(k, t(k));
      d.setValue(p.remote?.engine ?? "vaultSource").onChange((v) => {
        if (v === "vaultSource") {
          delete p.remote;
          p.access = "local";
          p.reference = "RefSync-reference";
        } else {
          p.access = "public";
          p.role = "subscriber";
          p.reference = "/";
          p.remote = {
            engine: v,
            url: "",
            branch: ""
          };
        }
        this.display();
      });
    });
    const remote = p.access === "public" ? p.remote : void 0;
    choice("role", "role", ["subscriber", "publisher"], !!remote);
    if (remote) {
      new import_obsidian5.Setting(el).setName(t("remote")).setDesc(t("readonly")).addText(
        (c) => c.setValue(remote.url).onChange((v) => {
          remote.url = v.trim();
          validateForm();
        })
      );
      if (remote.engine === "git")
        new import_obsidian5.Setting(el).setName(t("branch")).addText(
          (c) => c.setValue(remote.branch).onChange((v) => {
            remote.branch = v.trim();
            validateForm();
          })
        );
      if (remote.engine === "google") {
        let key = rs.googleKey();
        new import_obsidian5.Setting(el).setName(t("deviceKey")).addText((c) => {
          c.inputEl.type = "password";
          c.setValue(key).onChange((v) => {
            key = v;
          });
        }).addButton(
          (b) => b.setButtonText(t("save")).onClick(() => {
            rs.saveGoogleKey(key);
            b.setButtonText(t("saved"));
          })
        );
      }
    }
    text("reference", remote ? "subfolder" : "reference");
    if (remote)
      new import_obsidian5.Setting(el).addButton(
        (b) => b.setButtonText(t("browse")).onClick(() => {
          try {
            new RemoteFolderBrowser(
              this.app,
              rs.publicReference(p, ""),
              t,
              (path) => {
                p.reference = path;
                this.display();
              }
            ).open();
          } catch (e) {
            rs.report(e, p.id);
          }
        })
      );
    if (p.scope === "settings")
      new import_obsidian5.Setting(el).setName(t("target")).setDesc(this.app.vault.configDir);
    else text("local", "target");
    if (p.scope === "settings")
      scopeEditor(
        el,
        p,
        t,
        () => this.display(),
        () => validateForm()
      );
    choice("mirror", "mirrorMode", ["preserve", "full"]);
    if (p.role === "subscriber") {
      toggle("deletions", "deletions", p.mirror === "full");
      choice(
        "conflict",
        "conflict",
        p.scope === "content" ? ["source", "target", "newer", "both"] : ["source", "target", "newer"],
        p.mirror === "full"
      );
    }
    num2("maxDeleteCount", "maxDeleteCount");
    num2("maxDeletePercent", "maxDeletePercent");
    num2("deleteGrace", "deleteGrace");
    num2("shrinkPercent", "shrinkPercent");
    choice("trash", "trash", ["plugin", "vault", "system", "permanent"]);
    if (p.trash === "plugin") num2("trashDays", "trashDays");
    new import_obsidian5.Setting(el).setName(t("mode")).addDropdown((d) => {
      for (const k of ["inherit", "plan", "silent"]) d.addOption(k, t(k));
      d.setValue(p.inheritMode ? "inherit" : p.mode).onChange((v) => {
        p.inheritMode = v === "inherit";
        if (v !== "inherit") p.mode = v === "silent" ? "silent" : "plan";
        this.display();
      });
    });
    toggle("firstPlan", "firstPlan");
    if (p.scope === "settings") {
      toggle("strictDrift", "strictDrift");
      toggle("startup", "startup");
      num2("startupSeconds", "startupSeconds");
      num2("intervalMinutes", "intervalMinutes");
    }
    if (p.scope === "content") {
      text("include", "include");
      text("exclude", "exclude");
      num2("maxMiB", "maxMiB");
      toggle("startup", "startup");
      num2("startupSeconds", "startupSeconds");
      num2("intervalMinutes", "intervalMinutes");
      toggle("onFocus", "onFocus");
      toggle("onOnline", "onOnline");
      toggle("fileEvents", "fileEvents");
      num2("debounceSeconds", "debounceSeconds");
      num2("quietSeconds", "quietSeconds");
      num2("maxDeferrals", "maxDeferrals");
    }
    const error = el.createEl("p", { attr: { role: "status" } }), actions = new import_obsidian5.Setting(el);
    const validateForm = () => {
      const errors = validate(
        p,
        import_obsidian5.Platform.isDesktopApp,
        false,
        this.app.vault.configDir
      );
      error.setText(
        errors.map((e) => t(e.field) + " · " + t(e.code)).join("\n")
      );
      return !errors.length;
    };
    actions.addButton((b) => b.setButtonText(t("cancel")).onClick(back)).addButton(
      (b) => b.setButtonText(t("init")).onClick(async () => {
        if (!validateForm()) return;
        try {
          for (const dir of [
            p.access === "local" ? p.reference : "",
            p.scope === "content" ? p.local : this.app.vault.configDir
          ])
            if (dir && dir !== "/" && !await this.app.vault.adapter.exists(dir))
              await this.app.vault.createFolder(checked(dir));
        } catch (e) {
          rs.report(e, p.id);
        }
      })
    );
    actions.addButton((b) => {
      b.setButtonText(t("save")).setCta().onClick(async () => {
        if (validateForm()) {
          await rs.put({ ...p }, true);
          back();
        }
      });
      el.addEventListener("input", () => b.setDisabled(!validateForm()), {
        signal: this.formSignal()
      });
      b.setDisabled(!validateForm());
    });
    if (rs.config.profiles.some((x) => x.id === p.id))
      actions.addButton(
        (b) => b.setButtonText(t("remove")).onClick(
          () => rs.confirm(t("removeText"), async () => {
            const profiles = rs.config.profiles.filter((x) => x.id !== p.id);
            await rs.save({
              ...rs.config,
              profiles,
              current: rs.config.current === p.id ? profiles[0]?.id ?? "" : rs.config.current
            });
            back();
          })
        )
      );
  }
  formAbort;
  formSignal() {
    this.formAbort?.abort();
    this.formAbort = new AbortController();
    return this.formAbort.signal;
  }
};

// src/main.ts
var icons = {
  idle: "refresh-cw",
  scan: "search",
  apply: "download",
  recover: "history",
  done: "check",
  partial: "shield-alert",
  error: "circle-alert"
};
var Confirmation = class extends import_obsidian6.Modal {
  constructor(app, message, tr, action) {
    super(app);
    this.message = message;
    this.tr = tr;
    this.action = action;
  }
  onOpen() {
    this.contentEl.createEl("p", { text: this.message });
    new import_obsidian6.Setting(this.contentEl).addButton(
      (b) => b.setButtonText(this.tr("cancel")).onClick(() => this.close())
    ).addButton(
      (b) => b.setButtonText(this.tr("confirmAction")).onClick(() => {
        this.close();
        this.action();
      })
    );
  }
};
var RefSync = class extends import_obsidian6.Plugin {
  config;
  t = translator(navigator.language);
  engine;
  ready;
  logDir = "";
  scheduler;
  quiet = new QuietWindow();
  notices = new NoticeCenter((m) => new import_obsidian6.Notice(m));
  live = true;
  due = /* @__PURE__ */ new Map();
  own = /* @__PURE__ */ new Map();
  retries = /* @__PURE__ */ new Map();
  saves = Promise.resolve();
  reviewQueue = [];
  openIds = /* @__PURE__ */ new Set();
  activeReview;
  statusLabel = "";
  bar = null;
  ribbon;
  lastPrune = 0;
  lastInput = Date.now();
  reloadQueued = false;
  pendingReload;
  async verify() {
    const applier = this.engine.applier;
    const reports = await verifySettings(
      applier.journal,
      (t) => this.recoveryTarget(t),
      (t) => {
        const p = this.config.profiles.find(
          (p2) => p2.enabled && p2.role === "subscriber" && p2.scope === "settings" && p2.id === JSON.parse(t.key)[0] && JSON.parse(t.key)[2] === referenceId(p2)
        );
        return p && t.target === this.app.vault.configDir ? p.config ?? legacyConfig() : void 0;
      },
      new RunBudget(void 0, void 0, void 0, applier.fence)
    );
    for (const r of reports) {
      await this.log(
        r.unresolved.length ? "verify-failed" : "verified",
        r.repaired,
        this.config.current,
        r
      );
      if (r.unresolved.length)
        this.notices.send(
          "verify",
          this.t("repairFailed") + " · " + r.unresolved.join(", ")
        );
    }
  }
  promptReload() {
    if (!this.pendingReload) return;
    this.confirm(
      this.t("reloadNeeded") + " · " + this.pendingReload.paths.join(", "),
      () => this.queueReload(true)
    );
  }
  queueReload(manual = false) {
    if (this.reloadQueued || !this.pendingReload) return;
    this.reloadQueued = true;
    void this.scheduler.serial(async () => {
      const now = Date.now(), raw = this.app.loadLocalStorage("refsync:reloadHistory"), history = Array.isArray(raw) ? raw.filter((x) => typeof x === "number" && x > now - 36e5) : [];
      if (!this.live || !this.pendingReload || this.config.paused && !manual)
        return;
      if (!manual && (!canAutoReload(history, now) || this.pendingReload.policy === "idle" && now - this.lastInput < this.pendingReload.idleSeconds * 1e3))
        return;
      this.app.saveLocalStorage("refsync:reloadHistory", [...history, now]);
      reloadApp(this.app);
    }).catch((e) => this.report(e)).finally(() => {
      this.reloadQueued = false;
    });
  }
  startupRecovery;
  async onload() {
    const fence = MutationFence.forVault(this.app.vault);
    await fence.previousInstance;
    this.config = loadProfiles(await this.loadData());
    const deviceKey = (k) => this.manifest.id + ":" + k;
    const state = new StateStore({
      get: (k) => this.app.loadLocalStorage(deviceKey(k)),
      set: (k, v) => this.app.saveLocalStorage(deviceKey(k), v)
    });
    this.logDir = join(
      this.app.vault.configDir,
      "plugins/" + this.manifest.id + "/runtime"
    );
    const journal = new ApplyJournal(
      new TimedArtifacts(
        new VaultArtifacts(
          this.app.vault.adapter,
          join(this.logDir, "journal/" + state.device)
        ),
        fence
      )
    );
    const status = new StatusStore();
    this.engine = new SyncEngine(
      new Applier(journal, state, fence),
      status,
      this.app.vault.configDir,
      this.manifest.id,
      import_obsidian6.Platform.isDesktopApp
    );
    this.scheduler = new Scheduler(
      (id) => this.execute(id, "auto"),
      (e) => this.report(e)
    );
    this.ribbon = this.addRibbonIcon(
      "refresh-cw",
      "RefSync",
      (e) => this.menu(e)
    );
    if (import_obsidian6.Platform.isDesktopApp) {
      this.bar = this.addStatusBarItem();
      this.bar.tabIndex = 0;
      this.bar.setAttribute("role", "button");
      this.bar.onclick = (e) => this.menu(e);
      this.bar.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.bar?.click();
        }
      };
    }
    this.register(status.subscribe(() => this.paint()));
    this.addSettingTab(new Editor(this.app, this));
    const current = (intent) => this.request(this.config.current, intent);
    const cmd = (id, label, fn) => this.addCommand({ id, name: this.t(label), callback: fn });
    cmd("dry-run", "dry", () => current("dry"));
    cmd("deliver", "sync", () => current("run"));
    cmd("sync-all", "syncAll", () => this.runAll());
    cmd("settings-reload", "reloadNeeded", () => this.promptReload());
    cmd("undo", "undo", () => this.confirmUndo());
    cmd("resolve-deletions", "release", () => current("release"));
    cmd(
      "toggle-silent",
      "defaultMode",
      () => void this.save({
        ...this.config,
        mode: this.config.mode === "plan" ? "silent" : "plan"
      })
    );
    cmd(
      "pause",
      "pause",
      () => void this.save({ ...this.config, paused: !this.config.paused })
    );
    this.ready = new Promise(
      (resolve, reject) => this.app.workspace.onLayoutReady(() => {
        if (!this.live) {
          resolve();
          return;
        }
        status.set("recover");
        if (fence.pending) {
          this.engine.applier.needsRecovery = true;
          this.listen();
          resolve();
          return;
        }
        this.startupRecovery = this.engine.exclusive(async () => {
          await this.engine.applier.recover((t) => this.recoveryTarget(t));
          if (!this.config.paused)
            await this.verify().catch((e) => this.report(e));
        }).then(() => {
          if (this.live) {
            status.set("idle");
            this.listen();
          }
          resolve();
        }, reject);
      })
    );
    void this.ready.catch((e) => this.report(e));
  }
  onunload() {
    this.live = false;
    const fence = MutationFence.forVault(this.app.vault);
    const previous = fence.previousInstance;
    fence.previousInstance = Promise.allSettled([
      previous,
      this.scheduler?.stop(),
      this.startupRecovery,
      this.saves
    ]).then(() => {
    });
    this.quiet.clear();
    this.own.clear();
    this.reviewQueue = [];
    this.activeReview?.close();
  }
  paint() {
    const phase = this.engine.status.phase, label = this.t(this.config.paused ? "paused" : phase);
    const text = ["RefSync", label, this.statusLabel].filter(Boolean).join(" · ");
    (0, import_obsidian6.setIcon)(this.ribbon, this.config.paused ? "pause" : icons[phase]);
    this.ribbon.setAttribute("aria-label", text);
    this.bar?.setText(
      this.pendingReload ? text + " · " + this.t("reloadNeeded") : text
    );
  }
  menu(e) {
    const m = new import_obsidian6.Menu();
    for (const p of this.config.profiles)
      m.addItem(
        (item) => item.setTitle(p.name).setChecked(p.id === this.config.current).onClick(() => this.save({ ...this.config, current: p.id }))
      );
    m.addSeparator();
    if (this.pendingReload)
      m.addItem(
        (i) => i.setTitle(this.t("reloadNeeded")).onClick(() => this.promptReload())
      );
    for (const [k, f] of [
      ["preview", () => this.request(this.config.current, "dry")],
      ["sync", () => this.request(this.config.current, "run")],
      ["syncAll", () => this.runAll()],
      ["undo", () => this.confirmUndo()],
      ["release", () => this.request(this.config.current, "release")],
      [
        "pause",
        () => this.save({ ...this.config, paused: !this.config.paused })
      ]
    ])
      m.addItem((item) => item.setTitle(this.t(k)).onClick(f));
    m.showAtMouseEvent(e);
  }
  save(config) {
    const prev = this.config;
    this.config = config;
    for (const p of prev.profiles)
      if (config.profiles.find((q) => q.id === p.id) !== p) {
        this.scheduler.cancel(p.id);
        this.due.delete(p.id);
      }
    this.paint();
    const write = this.saves.then(() => this.saveData(config));
    this.saves = write.catch((e) => this.report(e));
    return write;
  }
  put(p, select = false) {
    const old = this.config.profiles.some((q) => q.id === p.id);
    return this.save({
      ...this.config,
      current: select ? p.id : this.config.current,
      profiles: old ? this.config.profiles.map((q) => q.id === p.id ? p : q) : [...this.config.profiles, p]
    });
  }
  listen() {
    const contents = () => this.config.profiles.filter(
      (p) => p.enabled && (p.scope === "content" || !!p.config) && !this.config.paused
    );
    for (const e of ["keydown", "pointerdown"])
      this.registerDomEvent(document, e, () => {
        this.lastInput = Date.now();
      });
    for (const p of contents())
      if (p.startup) this.scheduler.schedule(p.id, p.startupSeconds * 1e3);
    this.registerInterval(
      window.setInterval(() => {
        const now = Date.now();
        if (this.pendingReload?.policy === "idle" && !this.config.paused && now - this.lastInput >= this.pendingReload.idleSeconds * 1e3)
          this.queueReload();
        for (const p of contents()) {
          if (!p.intervalMinutes) continue;
          const next = this.due.get(p.id);
          if (next && next <= now) this.scheduler.schedule(p.id);
          if (!next || next <= now)
            this.due.set(p.id, now + p.intervalMinutes * 6e4);
        }
        if (now - this.lastPrune >= 864e5) {
          this.lastPrune = now;
          void this.scheduler.serial(() => this.pruneTrash()).catch((e) => this.report(e));
        }
        for (const [k, v] of this.own) if (v.expires < now) this.own.delete(k);
      }, 1e3)
    );
    for (const event2 of ["focus", "online"])
      this.registerDomEvent(window, event2, () => {
        for (const p of contents())
          if (event2 === "focus" ? p.onFocus : p.onOnline)
            this.scheduler.schedule(p.id, p.debounceSeconds * 1e3);
      });
    this.registerEvent(
      this.app.workspace.on("editor-change", (_, editor) => {
        if (editor.file) this.quiet.edited(editor.file.path);
      })
    );
    const event = (path, removed) => {
      for (const p of contents())
        if (eventPath(p, path))
          void this.fileEvent(p, path, removed).catch(
            (e) => this.report(e, p.id)
          );
    };
    for (const type of ["create", "modify", "delete"])
      this.registerEvent(
        this.app.vault.on(
          type,
          (file) => event(file.path, type === "delete")
        )
      );
    this.registerEvent(
      this.app.vault.on("rename", (file, old) => {
        event(old, true);
        event(file.path, false);
      })
    );
  }
  async fileEvent(p, path, removed) {
    const key = JSON.stringify([p.id, path]), own = this.own.get(key);
    if (own && own.expires > Date.now()) {
      if (removed && own.digest === null) return;
      if (!removed && own.digest && await this.app.vault.adapter.exists(path)) {
        if (await hash(await this.app.vault.adapter.readBinary(path)) === own.digest)
          return;
      }
    }
    this.scheduler.schedule(p.id, p.debounceSeconds * 1e3);
  }
  async pruneTrash() {
    const a = this.app.vault.adapter, root = join(this.logDir, "trash");
    if (!await a.exists(root)) return;
    for (const dir of (await a.list(root)).folders) {
      const id = dir.slice(root.length + 1);
      if (dir.startsWith(root + "/") && /^\d{13}-[a-f0-9-]{36}$/.test(id) && Number(id.slice(0, 13)) <= Date.now())
        await a.rmdir(dir, true);
    }
  }
  recoveryTarget(t) {
    return new LocalProvider(
      this.app.vault,
      t.target === "/" ? "" : t.target,
      this.manifest.id,
      t.scope,
      false,
      void 0,
      void 0,
      t.settings?.config,
      t.target === this.app.vault.configDir ? (path, write) => withPluginData(this.app, this.manifest.id, path, write) : void 0
    );
  }
  googleKey() {
    return String(this.app.loadLocalStorage("refsync:google-public-key") ?? "");
  }
  saveGoogleKey(value) {
    this.app.saveLocalStorage("refsync:google-public-key", value.trim());
  }
  publicReference(p, prefix = p.reference) {
    if (p.access !== "public" || p.role !== "subscriber" || !p.remote)
      throw Error("readonly");
    const { root, resourceKey } = location(p.remote);
    const send = async (url, method = "GET", headers = {}, body) => {
      try {
        const r = await (0, import_obsidian6.requestUrl)({
          url,
          method,
          headers,
          body,
          throw: false
        });
        return {
          status: r.status,
          headers: r.headers,
          arrayBuffer: r.arrayBuffer
        };
      } catch (cause) {
        throw Error("remoteNetwork", { cause });
      }
    };
    let tree;
    if (p.remote.engine === "google")
      tree = new GoogleTree(send, root, this.googleKey(), resourceKey);
    else if (p.remote.engine === "yandex") tree = new YandexTree(send, root);
    else {
      const identity = JSON.stringify([root, p.remote.branch]), adapter = this.app.vault.adapter;
      tree = new GitTree2(
        async () => {
          const key = await hash(new TextEncoder().encode(identity).buffer), dir = join(this.logDir, "git/" + key);
          await ensure(adapter, dir);
          return gitFs(adapter, dir);
        },
        send,
        root,
        p.remote.branch,
        this.app.vault.getName() + ":" + identity
      );
    }
    return new PublicStore(referenceId(p), tree, prefix === "/" ? "" : prefix);
  }
  stores(p) {
    if (p.access !== "local" && p.access !== "public") throw Error("invalid");
    const make = (path, ro) => new LocalProvider(
      this.app.vault,
      path === "/" ? "" : path,
      this.manifest.id,
      p.scope,
      ro,
      p,
      ro ? void 0 : (file, digest2) => this.own.set(JSON.stringify([p.id, file]), {
        digest: digest2,
        expires: Date.now() + 1e4
      }),
      p.config,
      !ro && p.scope === "settings" && path === this.app.vault.configDir ? (file, write) => withPluginData(this.app, this.manifest.id, file, write) : void 0
    );
    return {
      reference: p.access === "public" ? this.publicReference(p) : make(p.reference, p.role === "subscriber"),
      local: make(
        p.scope === "settings" ? this.app.vault.configDir : p.local,
        p.role === "publisher"
      )
    };
  }
  request(id, intent) {
    void this.scheduler.serial(() => this.execute(id, intent)).catch((e) => this.report(e, id));
  }
  runAll() {
    for (const p of this.config.profiles)
      if (p.enabled) this.request(p.id, "run");
  }
  async execute(id, intent) {
    await this.ready;
    const p = this.config.profiles.find((x) => x.id === id);
    if (!p || !this.live) return;
    if (intent !== "dry" && (!p.enabled || this.config.paused)) return;
    if (intent === "auto" && this.openIds.has(id)) return;
    if (this.engine.applier.needsRecovery)
      await this.engine.exclusive(
        () => this.engine.applier.recover((t) => this.recoveryTarget(t))
      );
    this.statusLabel = p.name;
    const v = this.stores(p);
    const firstKey = this.firstKey(p), first = p.firstPlan && !this.app.loadLocalStorage(firstKey);
    if ((intent === "run" || intent === "auto") && (p.inheritMode ? this.config.mode : p.mode) === "silent" && !first) {
      await this.deliver(p);
      return;
    }
    const { plan: plan2 } = await this.engine.run(p, v.reference, v.local, true);
    if (!this.live) return;
    if (intent === "auto" && !plan2.ops.some((o) => o.action !== "ack") && !plan2.held.length && !plan2.deferred.length)
      return;
    if (this.openIds.has(id)) return;
    this.openIds.add(id);
    const close = () => {
      this.openIds.delete(id);
      this.activeReview = void 0;
      this.showNext();
    };
    const endpoints = () => p.role === "subscriber" ? [v.reference, v.local] : [v.local, v.reference];
    this.reviewQueue.push(
      new Review(
        this.app,
        p,
        plan2,
        this.t,
        endpoints,
        close,
        intent === "dry" ? void 0 : (choices, release) => {
          const picked = intent === "release" ? new Map(plan2.ops.map((o) => [o.path, "skip"])) : choices;
          void this.scheduler.serial(() => this.deliver(p, plan2, picked, release)).catch((e) => this.report(e, p.id));
        },
        intent === "release"
      )
    );
    this.showNext();
  }
  showNext() {
    if (!this.activeReview && this.live) {
      this.activeReview = this.reviewQueue.shift();
      this.activeReview?.open();
    }
  }
  firstKey(p) {
    return this.manifest.id + ":first:" + JSON.stringify([
      p.id,
      p.scope,
      p.role,
      p.local,
      p.access === "local" ? p.reference : referenceId(p)
    ]);
  }
  async deliver(p, approved, choices, release) {
    const active = () => this.live && !this.config.paused && p.enabled && this.config.profiles.includes(p);
    if (!active()) return;
    const v = this.stores(p);
    const isOpen = (path) => this.app.workspace.getLeavesOfType("markdown").some(
      (leaf) => leaf.view instanceof import_obsidian6.MarkdownView && leaf.view.file?.path === join(p.local, path)
    );
    const result = await this.engine.run(
      p,
      v.reference,
      v.local,
      false,
      approved,
      {
        choices,
        release,
        active,
        budget: new RunBudget(
          void 0,
          p.access === "public" ? 9e4 : void 0,
          void 0,
          this.engine.applier.fence
        ),
        quiet: (path) => this.quiet.check(p, path, isOpen(path)),
        progress: (done, total) => {
          this.statusLabel = p.name + " · " + done + "/" + total;
          this.paint();
        }
      }
    );
    this.app.saveLocalStorage(this.firstKey(p), true);
    this.statusLabel = p.name;
    this.paint();
    const { held, deferred } = result.plan;
    await this.log(
      held.length || deferred.length ? "partial" : "done",
      result.changed,
      p.id,
      { held, deferred }
    );
    if (p.scope === "settings" && p.role === "subscriber" && result.changed) {
      const cfg = p.config ?? legacyConfig(), excluded = new Set(deferred.map((d) => d.path));
      const paths = result.plan.ops.filter(
        (o) => !excluded.has(o.path) && ["write", "delete"].includes(o.action) && needsReload(o.path)
      ).map((o) => o.path);
      if (paths.length) {
        this.pendingReload = {
          paths: [.../* @__PURE__ */ new Set([...this.pendingReload?.paths ?? [], ...paths])],
          policy: cfg.reload,
          idleSeconds: cfg.idleSeconds,
          at: Date.now()
        };
        this.paint();
        if (cfg.reload === "now") this.queueReload();
        else if (cfg.reload === "next" && (p.inheritMode ? this.config.mode : p.mode) === "plan")
          this.promptReload();
      }
    }
    if (held.length)
      this.notices.send(
        p.id + ":held",
        p.name + " · " + this.t("held") + " (" + held.length + ")"
      );
    const prefix = p.id + "\n", again = new Set(deferred.map((x) => prefix + x.path));
    for (const key of this.retries.keys())
      if (key.startsWith(prefix) && !again.has(key)) this.retries.delete(key);
    for (const key of again) {
      const n = (this.retries.get(key) ?? 0) + 1;
      this.retries.set(key, n);
      if (n === 6)
        this.notices.send(
          p.id + ":deferred",
          p.name + " · " + this.t("deferred")
        );
    }
  }
  confirm(message, fn) {
    new Confirmation(
      this.app,
      message,
      this.t,
      () => void Promise.resolve().then(fn).catch((e) => this.report(e))
    ).open();
  }
  confirmUndo() {
    const p = this.config.profiles.find((p2) => p2.id === this.config.current);
    if (!p) return;
    this.confirm(
      this.t("undoText") + " · " + p.name,
      () => this.scheduler.serial(async () => {
        await this.ready;
        const v = this.stores(p), [source, target] = p.role === "subscriber" ? [v.reference, v.local] : [v.local, v.reference];
        await this.engine.exclusive(
          () => this.engine.applier.undo(
            JSON.stringify([p.id, p.scope, source.id, target.id]),
            target,
            (t) => this.recoveryTarget(t)
          )
        );
        await this.log("undo", 1, p.id);
      })
    );
  }
  async log(event, count, profile, details = {}) {
    const a = this.app.vault.adapter;
    if (!await a.exists(this.logDir)) await a.mkdir(this.logDir);
    const f = join(this.logDir, "events.jsonl"), prev = f + ".1";
    if (((await a.stat(f))?.size ?? 0) > 262144) {
      if (await a.exists(prev)) await a.remove(prev);
      await a.rename(f, prev);
    }
    await a.append(
      f,
      JSON.stringify({ at: Date.now(), profile, event, count, ...details }) + "\n"
    );
  }
  report(e, id = this.config?.current ?? "") {
    if (!this.live) return;
    const code = e instanceof Error ? e.message : "failed";
    this.notices.send(id + ":" + code, "RefSync · " + this.t(code));
    void this.log("error", 0, id, { code }).catch(() => {
    });
  }
};
/*! Bundled license information:

ieee754/index.js:
  (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)

buffer/index.js:
  (*!
   * The buffer module from node.js, for the browser.
   *
   * @author   Feross Aboukhadijeh <https://feross.org>
   * @license  MIT
   *)

safe-buffer/index.js:
  (*! safe-buffer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> *)

crc-32/crc32.js:
  (*! crc32.js (C) 2014-present SheetJS -- http://sheetjs.com *)

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

isomorphic-git/index.js:
  (*!
   * The POSIX core below - `assertPath`, `normalizeStringPosix` and the body of
   * `normalize` - comes from path-browserify, which extracted it from Node.js.
   * Reformatted to this project's style (`const`/`let`, no semicolons); the
   * algorithm is unchanged.
   *
   * SPDX-License-Identifier: MIT
   * Copyright (c) 2013 James Halliday
   * Copyright Joyent, Inc. and other Node contributors.
   *
   * @see https://github.com/browserify/path-browserify
   *
   * The Windows handling is this project's own, added in #2302. path-browserify
   * is the POSIX part of `path` only, so `normalize` and `join` are wrapped with:
   *   - Backslashes are normalised to forward slashes before processing.
   *   - Drive-letter prefixes (e.g. "C:") are detected and preserved through
   *     normalisation, so absolute Windows paths are handled correctly.
   *   - A drive-letter argument passed to join() resets the accumulated path,
   *     matching Node behaviour and handling worktree gitdir paths properly.
   *
   * Limitation: UNC paths (e.g. \\server\share) are not supported. The leading
   *   backslashes are normalised to forward slashes and then collapsed by
   *   normalizeStringPosix, losing the UNC root. Git on Windows works with
   *   drive-letter paths, so this is not expected to be a practical issue.
   *)
*/
