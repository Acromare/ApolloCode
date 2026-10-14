"""Provision only Apollo's isolated engine environment through Hermes PM."""
import json
import os
from pathlib import Path
import sys

source = Path(__file__).resolve().parents[1] / "vendor" / "hermes-engine"
target = Path(sys.argv[1]).resolve()
os.environ["HERMES_HOME"] = str(target.parent / "bootstrap-profile")
os.environ["HERMES_RUNTIME_DIR"] = str(target.parent / "manager")
sys.path.insert(0, str(source))
from pm.client import build_environment

python = build_environment(source=source, out=target, python=Path(sys.executable),
                           extras=["anthropic", "ddgs", "edge-tts"],
                           no_install_project=True, frozen=True, explicit=True)
print(json.dumps({"python": str(python), "source": str(source)}, ensure_ascii=False))
