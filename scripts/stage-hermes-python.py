"""Stage a relocatable Windows Python and the PM-built, locked engine dependencies."""
import json
from pathlib import Path
import shutil
import sys

if sys.platform != "win32":
    raise SystemExit("The current release targets Windows x64.")
destination = Path(sys.argv[1]).resolve()
destination.mkdir(parents=True, exist_ok=False)
base = Path(sys.base_prefix)
ignore = shutil.ignore_patterns("__pycache__", "*.pyc", "test", "tests", "idlelib", "tkinter", "ensurepip")
for item in base.iterdir():
    if item.is_file() and (item.suffix.lower() in {".exe", ".dll"} or item.name.startswith("LICENSE")):
        shutil.copy2(item, destination / item.name)
for name in ("DLLs", "Lib"):
    shutil.copytree(base / name, destination / name,
                    ignore=lambda root, names: set(ignore(root, names)) | ({"site-packages"} if Path(root) == base / "Lib" else set()))
shutil.copytree(Path(sys.prefix) / "Lib" / "site-packages", destination / "Lib" / "site-packages", ignore=ignore)
(destination / "apollo-python-manifest.json").write_text(json.dumps({
    "python": sys.version.split()[0], "platform": sys.platform,
    "engine_commit": "21ede8a41bd4814aae6151eb6eaeca420751111b",
    "dependencies": "Hermes PM frozen environment; core plus anthropic, ddgs, edge-tts",
    "license": "Python Software Foundation License; dependency licenses are in their dist-info directories"
}, indent=2), encoding="utf-8")
print(destination)
