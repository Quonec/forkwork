"""FWSlot game server: the only place where outcomes are decided (the client just shows them)."""
import sys
from pathlib import Path

MATH_DIR = Path(__file__).resolve().parents[2] / "math"
if str(MATH_DIR) not in sys.path:
    sys.path.insert(0, str(MATH_DIR))
