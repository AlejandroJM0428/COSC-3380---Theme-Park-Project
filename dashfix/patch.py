#!/usr/bin/env python3
"""Replace the broken /api/visitor/dashboard handler in server/routes/visitor.js.
Run from the repo root:  python3 dashfix/patch.py
"""
import pathlib, shutil, sys

here = pathlib.Path(__file__).resolve().parent
target = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "server/routes/visitor.js")
new = (here / "new_handler.js").read_text()

if not target.exists():
    sys.exit(f"ERROR: {target} not found. Run from the repo root.")

lines = target.read_text().splitlines(keepends=True)
start = next((i for i, l in enumerate(lines) if l.startswith("route('GET', '/api/visitor/dashboard'")), None)
end = next((i for i, l in enumerate(lines) if start is not None and i > start and l.startswith("// POST /api/visitor/tickets")), None)
if start is None or end is None:
    sys.exit("ERROR: could not find the dashboard handler boundaries. File not changed.")

if "membershipHistory: []" in "".join(lines[start:end]) and "const waits = new Map()" in "".join(lines[start:end]) and "".join(lines[start:end]).count("const [[cust]]") == 1:
    sys.exit("Already patched. File not changed.")

shutil.copyfile(target, str(target) + ".bak")
lines[start:end] = [new, "\n"]
target.write_text("".join(lines))
print(f"Patched {target} (lines {start+1}-{end}). Backup: {target}.bak")
print("Next: node --check server/routes/visitor.js")
