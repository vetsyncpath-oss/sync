"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// node_modules/picomatch/lib/constants.js
var require_constants = __commonJS({
  "node_modules/picomatch/lib/constants.js"(exports, module2) {
    "use strict";
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
      const consume = (value2 = "", num = 0) => {
        state.consumed += value2;
        state.index += num;
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
    var scan2 = require_scan();
    var parse = require_parse();
    var utils = require_utils();
    var constants = require_constants();
    var isObject = (val) => val && typeof val === "object" && !Array.isArray(val);
    var picomatch2 = (glob, options, returnState = false) => {
      if (Array.isArray(glob)) {
        const fns = glob.map((input) => picomatch2(input, options, returnState));
        const arrayMatcher = (str) => {
          for (const isMatch of fns) {
            const state2 = isMatch(str);
            if (state2) return state2;
          }
          return false;
        };
        return arrayMatcher;
      }
      const isState = isObject(glob) && glob.tokens && glob.input;
      if (glob === "" || typeof glob !== "string" && !isState) {
        throw new TypeError("Expected pattern to be a non-empty string");
      }
      const opts = options || {};
      const posix = opts.windows;
      const regex = isState ? picomatch2.compileRe(glob, options) : picomatch2.makeRe(glob, options, false, true);
      const state = regex.state;
      delete regex.state;
      let isIgnored = () => false;
      if (opts.ignore) {
        const ignoreOpts = { ...options, ignore: null, onMatch: null, onResult: null };
        isIgnored = picomatch2(opts.ignore, ignoreOpts, returnState);
      }
      const matcher = (input, returnObject = false) => {
        const { isMatch, match, output } = picomatch2.test(input, regex, options, { glob, posix });
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
    picomatch2.test = (input, regex, options, { glob, posix } = {}) => {
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
          match = picomatch2.matchBase(input, regex, options, posix);
        } else {
          match = regex.exec(output);
        }
      }
      return { isMatch: Boolean(match), match, output };
    };
    picomatch2.matchBase = (input, glob, options, posix = options && options.windows) => {
      const regex = glob instanceof RegExp ? glob : picomatch2.makeRe(glob, options);
      return regex.test(utils.basename(input, { windows: posix }));
    };
    picomatch2.isMatch = (str, patterns, options) => picomatch2(patterns, options)(str);
    picomatch2.parse = (pattern, options) => {
      if (Array.isArray(pattern)) return pattern.map((p) => picomatch2.parse(p, options));
      return parse(pattern, { ...options, fastpaths: false });
    };
    picomatch2.scan = (input, options) => scan2(input, options);
    picomatch2.compileRe = (state, options, returnOutput = false, returnState = false) => {
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
      const regex = picomatch2.toRegex(source, options);
      if (returnState === true) {
        regex.state = state;
      }
      return regex;
    };
    picomatch2.makeRe = (input, options = {}, returnOutput = false, returnState = false) => {
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
      return picomatch2.compileRe(parsed, options, returnOutput, returnState);
    };
    picomatch2.toRegex = (source, options) => {
      try {
        const opts = options || {};
        return new RegExp(source, opts.flags || (opts.nocase ? "i" : ""));
      } catch (err) {
        if (options && options.debug === true) throw err;
        return /$^/;
      }
    };
    picomatch2.constants = constants;
    module2.exports = picomatch2;
  }
});

// node_modules/picomatch/posix.js
var require_posix = __commonJS({
  "node_modules/picomatch/posix.js"(exports, module2) {
    "use strict";
    module2.exports = require_picomatch();
  }
});

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => RefSync
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/model.ts
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
    (s) => s.length > 0 && s.length <= 255 && !/[<>:"\\|?*\x00-\x1F\x7F]/.test(s) && !/[. ]$/.test(s) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)
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

// src/profiles.ts
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
  return copy ? { ...copy, id, name: copy.name + " (2)", enabled: false } : {
    ...defaults,
    id,
    name: "RefSync " + tag,
    local: "RefSync-copy-" + tag,
    reference: "RefSync-reference-" + tag,
    enabled: false,
    fileEvents: true
  };
}

// src/runtime.ts
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
  return [p.reference, p.local].some(
    (root) => under(path, root === "/" ? "" : root)
  );
}

// src/applier.ts
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
  async undo(key, target) {
    this.fence.check();
    this.needsRecovery = true;
    const last = this.state.get(key).lastRun;
    const t = (await this.journal.transactions()).find(
      (v) => v.key === key && v.id === last
    );
    if (!t) throw Error("noBackup");
    await this.journal.mark(t.id + "/undo-start");
    await this.restore(t, target);
    this.state.put(key, t.before);
    await this.journal.mark(t.id + "/undo-done");
    this.needsRecovery = false;
  }
  async apply(profile, plan2, source, target, key, targetPath, budget = new RunBudget(void 0, void 0, void 0, this.fence), progress, active) {
    this.fence.check();
    if (this.needsRecovery) throw Error("journal");
    const checkpoint = () => {
      budget.check();
      if (active && !active()) throw Error("stopped");
    };
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
      const digest = await hash(bytes);
      await this.journal.disk.putNew(id + "/stage/" + steps.length, bytes);
      steps.push({ path, action: "write", mtime, digest });
    };
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
        if (op.action === "write" || op.action === "both") {
          let bytes;
          try {
            bytes = await budget.io(() => source.download(p));
          } catch (e) {
            if (!transient(e)) throw e;
            plan2.deferred.push({ path: p, reason: "locked" });
            continue;
          }
          if (bytes.byteLength !== s.size || await hash(bytes) !== s.hash) {
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
          await stage(p, bytes, s.mtime);
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
            const step = steps[i], stat = await budget.io(() => target.stat(step.path));
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
                () => target.upload(step.path, bytes, step.mtime),
                false
              );
            }
            await this.journal.mark(id + "/applied/" + i);
          }
          changed += end - start;
        } catch (e) {
          if (!transient(e)) throw e;
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

// src/classifier.ts
function volatility(p, scope) {
  if (scope === "content") return "S";
  p = fold(p);
  if (/^(workspace(?:-mobile)?\.json|cache(?:\/|$))$/.test(p) || p.startsWith("cache/") || p.endsWith(".lock") || p.split("/").some((x) => x === ".git" || x === "node_modules"))
    return "V";
  return /^(?:[^/]+\.json|plugins\/[^/]+\/data\.json)$/.test(p) ? "H" : "S";
}
function selected(p, scope, configDir, self, directory) {
  const f = fold(p);
  if (f.split("/").some(
    (s) => [".git", ".trash", ".sync-trash", "node_modules"].includes(s)
  ) || scope === "settings" && under(f, fold("plugins/" + self)) || under(f, fold(join(configDir, "plugins/" + self))))
    return false;
  if (scope === "content")
    return !under(f, fold(configDir)) && !p.split("/").some((s) => s.startsWith(".")) && !/(?:\.tmp$|(?:^|\/)(?:thumbs\.db|desktop\.ini)$)/i.test(p);
  if (volatility(p, scope) === "V" || p.split("/").some((s) => s.startsWith(".")))
    return false;
  if (directory)
    return /^(themes|snippets)(\/|$)|^plugins(?:\/[^/]+)?$/.test(p);
  return /^[^/]+\.json$|^themes\/[^/]+\/(manifest\.json|theme\.css)$|^snippets\/.+\.css$|^plugins\/[^/]+\/data\.json$/.test(
    p
  );
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
  }, ownWrite) {
    this.vault = vault;
    this.root = root;
    this.self = self;
    this.scope = scope;
    this.policy = policy;
    this.ownWrite = ownWrite;
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
    if (this.capabilities.readOnly || !selected(p, this.scope, this.vault.configDir, this.self, directory))
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

// src/filters.ts
var import_posix = __toESM(require_posix());
function pathFilter(p) {
  const compile = (s) => s.split(/[\n,]+/).map((v) => v.trim()).filter(Boolean).map(
    (v) => (0, import_posix.default)(v, { nonegate: true, noextglob: true, nobrace: true })
  );
  const include = compile(p.include), exclude = compile(p.exclude);
  return (path) => !exclude.some((f) => f(path)) && (!include.length || include.some((f) => f(path)));
}

// src/selection.ts
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
  if (errors.length) return errors;
  const local = fold(
    p.scope === "settings" ? configDir : p.local === "/" ? "" : p.local
  ), ref = fold(p.reference === "/" ? "" : p.reference);
  if (p.access === "local" && (under(local, ref) || under(ref, local)))
    err("reference", "overlap");
  const hidden = (path) => path.split("/").some((s) => s.startsWith(".") || s === "node_modules");
  if (p.access === "local" && hidden(ref)) err("reference", "protected");
  if (p.scope === "content" && hidden(local)) err("local", "protected");
  if (under(ref, fold(configDir)) || p.scope === "content" && under(local, fold(configDir)))
    err("reference", "protected");
  return errors;
}

// src/scanner.ts
async function scan(provider, scope, configDir, self, skipHotTarget = false, budget = new RunBudget(), accept = (path) => true, maxMiB = 0) {
  const snap = {
    files: /* @__PURE__ */ new Map(),
    directories: /* @__PURE__ */ new Set(),
    complete: false,
    skipped: /* @__PURE__ */ new Map()
  };
  const todo = [""], seen = /* @__PURE__ */ new Set();
  if ((await budget.io(() => provider.stat("")))?.type !== "folder")
    throw Error("missingRoot");
  while (todo.length) {
    const dir = todo.pop();
    const list = await budget.io(() => provider.list(dir));
    for (const [paths, isDir] of [
      [list.files, false],
      [list.folders, true]
    ]) {
      for (const p of paths) {
        if (parent(p) !== dir) throw Error("path");
        if (!selected(p, scope, configDir, self, isDir)) continue;
        checked(p);
        if (seen.has(fold(p))) throw Error("collision");
        seen.add(fold(p));
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
          snap.files.set(p, {
            hash: await hash(bytes),
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

// src/conflict-resolver.ts
var resolveConflict = (policy, s, t) => {
  if (policy === "both") return "both";
  if (policy === "target" || policy === "newer" && Number.isFinite(s.mtime) && Number.isFinite(t.mtime) && t.mtime > s.mtime + 2e3)
    return "retain";
  return "write";
};

// src/planner.ts
function plan(p, src, dst, base, resolve = resolveConflict) {
  if (!src.complete || !dst.complete) throw Error("incomplete");
  const names = /* @__PURE__ */ new Map();
  for (const snap of [src, dst])
    for (const [paths, kind] of [
      [snap.files.keys(), "file"],
      [snap.directories.keys(), "folder"]
    ])
      for (const path of paths) {
        const key = fold(path), sig = kind + " " + path;
        if (names.has(key) && names.get(key) !== sig) throw Error("collision");
        names.set(key, sig);
      }
  const skipped = new Map([...src.skipped ?? [], ...dst.skipped ?? []]);
  const deferred = [...skipped].filter(([, reason]) => reason !== "filter").map(([path, reason]) => ({ path, reason }));
  const ops = [], deletes = [];
  for (const path of /* @__PURE__ */ new Set([...src.files.keys(), ...dst.files.keys()])) {
    if (skipped.has(path)) continue;
    const s = src.files.get(path), t = dst.files.get(path), b = Object.hasOwn(base.entries, path) ? base.entries[path] : void 0;
    if (!s) {
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
      (path) => !skipped.has(path) && !src.files.has(path) && !dst.files.has(path)
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
      const bad = validate(
        p,
        this.desktop,
        reference.capabilities.readOnly,
        this.configDir
      );
      if (bad.length) throw Error(bad[0].code);
      const [source, target] = p.role === "subscriber" ? [reference, local] : [local, reference];
      const key = JSON.stringify([p.id, p.scope, source.id, target.id]);
      this.status.set("scan");
      const budget = options.budget ?? new RunBudget(void 0, void 0, void 0, this.applier.fence);
      const filter = p.scope === "content" ? pathFilter(p) : () => true;
      const inputs = await Promise.allSettled([
        scan(
          source,
          p.scope,
          this.configDir,
          this.self,
          false,
          budget,
          filter,
          p.scope === "content" ? p.maxMiB : 0
        ),
        scan(
          target,
          p.scope,
          this.configDir,
          this.self,
          !p.strictDrift,
          budget,
          filter,
          p.scope === "content" ? p.maxMiB : 0
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
          options.active
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
var ru = {
  maxDeleteCount: "Порог удалений, файлов",
  maxDeletePercent: "Порог удалений, % от цели",
  shrinkPercent: "Порог уменьшения эталона, %",
  deleteGrace: "Минимум файлов для процентного порога удалений",
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
  maxDeleteCount: "Deletion threshold (files)",
  maxDeletePercent: "Deletion threshold (% of target)",
  shrinkPercent: "Source shrink threshold (%)",
  deleteGrace: "Deletion count floor for percentage threshold",
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
var import_obsidian2 = require("obsidian");

// node_modules/diff/libesm/diff/base.js
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
      const [source, target] = this.endpoints(), read = async (s) => new TextDecoder("utf-8", { fatal: true }).decode(
        await s.download(op.path)
      );
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

// src/editor.ts
var import_obsidian3 = require("obsidian");
var Editor = class extends import_obsidian3.PluginSettingTab {
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
    new import_obsidian3.Setting(el).setName(t("defaultMode")).addDropdown(
      (d) => d.addOption("plan", t("plan")).addOption("silent", t("silent")).setValue(rs.config.mode).onChange(async (v) => {
        await rs.save({
          ...rs.config,
          mode: v === "silent" ? "silent" : "plan"
        });
      })
    );
    new import_obsidian3.Setting(el).setName(t("pause")).addToggle(
      (c) => c.setValue(rs.config.paused).onChange(async (paused) => {
        await rs.save({ ...rs.config, paused });
      })
    );
    new import_obsidian3.Setting(el).addButton(
      (b) => b.setButtonText(t("add")).setCta().onClick(() => {
        this.draft = newProfile();
        this.display();
      })
    ).addButton(
      (b) => b.setButtonText(t("syncAll")).onClick(() => rs.runAll())
    );
    rs.config.profiles.forEach((p, index) => {
      const row = new import_obsidian3.Setting(el).setName(p.name).setDesc(
        [
          t(p.scope),
          p.role === "subscriber" ? p.reference + " → " + (p.scope === "settings" ? this.app.vault.configDir : p.local) : (p.scope === "settings" ? this.app.vault.configDir : p.local) + " → " + p.reference,
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
          this.draft = { ...p };
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
      new import_obsidian3.Setting(el).addButton(
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
    const text = (field, key) => new import_obsidian3.Setting(el).setName(t(key)).addText(
      (c) => c.setValue(String(p[field])).onChange((v) => {
        Object.assign(p, { [field]: v });
        validateForm();
      })
    );
    const num = (field, key) => new import_obsidian3.Setting(el).setName(t(key)).addText((c) => {
      c.inputEl.type = "number";
      c.inputEl.min = "0";
      c.setValue(String(p[field])).onChange((v) => {
        Object.assign(p, { [field]: v.trim() === "" ? NaN : Number(v) });
        validateForm();
      });
    });
    const toggle = (field, key, disabled = false) => new import_obsidian3.Setting(el).setName(t(key)).addToggle(
      (c) => c.setDisabled(disabled).setValue(p[field] === true).onChange((v) => {
        Object.assign(p, { [field]: v });
        validateForm();
      })
    );
    const choice = (field, key, values, disabled = false) => new import_obsidian3.Setting(el).setName(t(key)).addDropdown((d) => {
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
          if (p.conflict === "both") p.conflict = "source";
        }
        if (field === "role" && p.role === "publisher") {
          p.conflict = "source";
          p.deletions = p.mirror === "full";
        }
        this.display();
      });
    });
    text("name", "name");
    toggle("enabled", "enabled");
    choice("scope", "scope", ["content", "settings"]);
    choice("role", "role", ["subscriber", "publisher"]);
    text("reference", "reference");
    if (p.scope === "settings")
      new import_obsidian3.Setting(el).setName(t("target")).setDesc(this.app.vault.configDir);
    else text("local", "target");
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
    num("maxDeleteCount", "maxDeleteCount");
    num("maxDeletePercent", "maxDeletePercent");
    num("deleteGrace", "deleteGrace");
    num("shrinkPercent", "shrinkPercent");
    choice("trash", "trash", ["plugin", "vault", "system", "permanent"]);
    if (p.trash === "plugin") num("trashDays", "trashDays");
    new import_obsidian3.Setting(el).setName(t("mode")).addDropdown((d) => {
      for (const k of ["inherit", "plan", "silent"]) d.addOption(k, t(k));
      d.setValue(p.inheritMode ? "inherit" : p.mode).onChange((v) => {
        p.inheritMode = v === "inherit";
        if (v !== "inherit") p.mode = v === "silent" ? "silent" : "plan";
        this.display();
      });
    });
    toggle("firstPlan", "firstPlan");
    if (p.scope === "content") {
      text("include", "include");
      text("exclude", "exclude");
      num("maxMiB", "maxMiB");
      toggle("startup", "startup");
      num("startupSeconds", "startupSeconds");
      num("intervalMinutes", "intervalMinutes");
      toggle("onFocus", "onFocus");
      toggle("onOnline", "onOnline");
      toggle("fileEvents", "fileEvents");
      num("debounceSeconds", "debounceSeconds");
      num("quietSeconds", "quietSeconds");
      num("maxDeferrals", "maxDeferrals");
    }
    const error = el.createEl("p", { attr: { role: "status" } }), actions = new import_obsidian3.Setting(el);
    const validateForm = () => {
      const errors = validate(
        p,
        import_obsidian3.Platform.isDesktopApp,
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
            p.reference,
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
var Confirmation = class extends import_obsidian4.Modal {
  constructor(app, message, tr, action) {
    super(app);
    this.message = message;
    this.tr = tr;
    this.action = action;
  }
  onOpen() {
    this.contentEl.createEl("p", { text: this.message });
    new import_obsidian4.Setting(this.contentEl).addButton(
      (b) => b.setButtonText(this.tr("cancel")).onClick(() => this.close())
    ).addButton(
      (b) => b.setButtonText(this.tr("confirmAction")).onClick(() => {
        this.close();
        this.action();
      })
    );
  }
};
var RefSync = class extends import_obsidian4.Plugin {
  config;
  t = translator(navigator.language);
  engine;
  ready;
  logDir = "";
  scheduler;
  quiet = new QuietWindow();
  notices = new NoticeCenter((m) => new import_obsidian4.Notice(m));
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
      import_obsidian4.Platform.isDesktopApp
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
    if (import_obsidian4.Platform.isDesktopApp) {
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
        this.startupRecovery = this.engine.exclusive(
          () => this.engine.applier.recover((t) => this.recoveryTarget(t))
        ).then(() => {
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
    (0, import_obsidian4.setIcon)(this.ribbon, this.config.paused ? "pause" : icons[phase]);
    this.ribbon.setAttribute("aria-label", text);
    this.bar?.setText(text);
  }
  menu(e) {
    const m = new import_obsidian4.Menu();
    for (const p of this.config.profiles)
      m.addItem(
        (item) => item.setTitle(p.name).setChecked(p.id === this.config.current).onClick(() => this.save({ ...this.config, current: p.id }))
      );
    m.addSeparator();
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
      (p) => p.enabled && p.scope === "content" && !this.config.paused
    );
    for (const p of contents())
      if (p.startup) this.scheduler.schedule(p.id, p.startupSeconds * 1e3);
    this.registerInterval(
      window.setInterval(() => {
        const now = Date.now();
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
      t.scope
    );
  }
  stores(p) {
    if (p.access !== "local") throw Error("invalid");
    const make = (path, ro) => new LocalProvider(
      this.app.vault,
      path === "/" ? "" : path,
      this.manifest.id,
      p.scope,
      ro,
      p,
      ro ? void 0 : (file, digest) => this.own.set(JSON.stringify([p.id, file]), {
        digest,
        expires: Date.now() + 1e4
      })
    );
    return {
      reference: make(p.reference, p.role === "subscriber"),
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
    return this.manifest.id + ":first:" + JSON.stringify([p.id, p.scope, p.role, p.local, p.reference]);
  }
  async deliver(p, approved, choices, release) {
    const active = () => this.live && !this.config.paused && p.enabled && this.config.profiles.includes(p);
    if (!active()) return;
    const v = this.stores(p);
    const isOpen = (path) => this.app.workspace.getLeavesOfType("markdown").some(
      (leaf) => leaf.view instanceof import_obsidian4.MarkdownView && leaf.view.file?.path === join(p.local, path)
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
          void 0,
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
            target
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
