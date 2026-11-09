#!/usr/bin/env bash
set -euo pipefail

LIMIT_MB=30
MAX_FILE_KB=${MAX_FILE_KB:-5120}   # skip any single file bigger than ~5MB
NAME=$(basename "$PWD")
OUT="../${NAME}.zip"
rm -f "$OUT"

echo "Files over ${MAX_FILE_KB}KB being skipped:"
find . -type f -size +"${MAX_FILE_KB}k" \
  -not -path '*/node_modules/*' -not -path './.git/*' -printf '  %k KB  %p\n' || true

find . -type f -size -"${MAX_FILE_KB}k" \
  -not -path './.git/*' \
  -not -path '*/node_modules/*' \
  -not -path '*/dist/*' \
  -not -path '*/build/*' \
  -not -path '*/.next/*' \
  -not -path '*/.cache/*' \
  -not -path '*/venv/*' \
  -not -path '*/.venv/*' \
  -not -path '*/__pycache__/*' \
  -not -path '*/target/*' \
  -not -path '*/coverage/*' \
  -not -name '*.log' \
  -not -name '*.zip' -not -name '*.tar*' -not -name '*.gz' \
  -not -name '.env' -not -name '.env.*' \
  -not -name '.DS_Store' \
  | zip -9 -q "$OUT" -@

SIZE=$(stat -c %s "$OUT")
SIZE_MB=$(awk "BEGIN{printf \"%.1f\", $SIZE/1048576}")
echo
echo "Created: $(realpath "$OUT")  (${SIZE_MB} MB)"

if [ "$SIZE" -gt $((LIMIT_MB*1024*1024)) ]; then
  echo "Still over ${LIMIT_MB}MB. Biggest files in the zip:"
  unzip -l "$OUT" | sort -rn | head -12
  echo "Try: MAX_FILE_KB=1024 ./compress.sh"
else
  echo "Under ${LIMIT_MB}MB, good to send."
fi
