import picomatch from "picomatch/posix";
import type { Profile } from "./model";
export function pathFilter(p: Profile) {
  const compile = (s: string) =>
    s
      .split(/[\n,]+/)
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) =>
        picomatch(v, { nonegate: true, noextglob: true, nobrace: true }),
      );
  const include = compile(p.include),
    exclude = compile(p.exclude);
  return (path: string) =>
    !exclude.some((f) => f(path)) &&
    (!include.length || include.some((f) => f(path)));
}
