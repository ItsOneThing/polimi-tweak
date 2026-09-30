"""Create a store upload archive after preparing local runtime dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]
OUTPUT = ROOT / "dist" / f"keban-{VERSION}.zip"
VENDOR = ROOT / "vendor"
DIST = ROOT / "node_modules" / "@huggingface" / "transformers" / "dist"
RUNTIME_FILES = (
    "transformers.min.js",
    "ort-wasm-simd-threaded.jsep.mjs",
    "ort-wasm-simd-threaded.jsep.wasm",
)
for name in RUNTIME_FILES:
    source = DIST / name
    if not source.is_file():
        raise SystemExit("Missing runtime dependency. Run `pnpm install` first.")
    VENDOR.mkdir(exist_ok=True)
    shutil.copy2(source, VENDOR / name)
FILES = [
    "manifest.json", "content.js", "background.js", "popup.html", "popup.css", "popup.js", "asr-frame.html",
    "asr-frame.js", "asr-worker.js", "youtube-ads.css", "rules/ads.json",
    "LICENSE", "README.md", "PRIVACY.md",
]
FILES += [str(path.relative_to(ROOT)) for folder in ("icons", "vendor") for path in (ROOT / folder).iterdir() if path.is_file()]

OUTPUT.parent.mkdir(exist_ok=True)
with ZipFile(OUTPUT, "w", ZIP_DEFLATED, compresslevel=6) as archive:
    for name in FILES:
        archive.write(ROOT / name, name)
print(OUTPUT)
