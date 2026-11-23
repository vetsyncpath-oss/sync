import picomatch from "picomatch/posix";
import { parent, type Profile } from "./model";
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
  return (path: string) => {
    if (exclude.some((f) => f(path) || f(path + "/"))) return false;
    for (let dir = parent(path); dir; dir = parent(dir))
      if (exclude.some((f) => f(dir) || f(dir + "/"))) return false;
    return !include.length || include.some((f) => f(path));
  };
}
