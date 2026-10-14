"""Bootstrap Apollo's engine through the vendored Hermes package manager."""
from pathlib import Path
import json
import sys

source, target = (Path(value).resolve() for value in sys.argv[1:3])
sys.path.insert(0, str(source))
from pm.client import build_environment

python = build_environment(source=source, out=target, python=Path(sys.executable),
                           extras=["anthropic", "ddgs", "edge-tts"],
                           no_install_project=True, frozen=True, explicit=True)
print("APOLLO_PYTHON=" + json.dumps(str(python)))
