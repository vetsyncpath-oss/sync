"""Build reproducible install and source archives using the standard library."""
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parents[1]
version = json.loads((root / "manifest.json").read_text())["version"]
output = root / "releases"
output.mkdir(exist_ok=True)

def archive(suffix, files):
    path = output / f"refsync-{version}-m5{suffix}.zip"
    with ZipFile(path, "w") as dest:
        for file in sorted(files):
            entry = ZipInfo("refsync/" + file.relative_to(root).as_posix())
            entry.external_attr = 0o100644 << 16
            dest.writestr(entry, file.read_bytes(), compress_type=ZIP_DEFLATED)
    print(path.name)

install = [root / name for name in ("README.md", "main.js", "manifest.json","THIRD_PARTY.txt")]
source = [root / name for name in ("package.json", "package-lock.json", "tsconfig.json", "esbuild.config.mjs")]
source += list(root.glob("src/*.ts")) + list(root.glob("test/*.ts")) + list(root.glob("scripts/*.py"))
archive("", install)
archive("-source", install + source)
