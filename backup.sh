#!/usr/bin/env bash
# backup.sh - zips the project folder into a dated backup, leaving out secrets (.env),
# build output (client/dist), dependencies (node_modules) and files over 5 MB.
#
# Usage: ./backup.sh [project-folder]
#   With no argument it backs up the folder this script lives in.

DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
OUT="$DIR/theme-park-project-$(date +%Y%m%d-%H%M).zip"
MAX_KB=5120
LIMIT_MB=30

command -v zip >/dev/null 2>&1 || { echo "ERROR: zip not installed"; exit 1; }
cd "$DIR" || { echo "ERROR: directory not found: $DIR"; exit 1; }

EXCLUDES=(
  -not -path './.git/*'
  -not -path '*/node_modules/*'
  -not -path './client/dist/*'
  -not -name '*.zip'
  -not -name '.env'
  -not -name '.DS_Store'
)

find . -type f -size -"${MAX_KB}"k "${EXCLUDES[@]}" | zip -q "$OUT" -@

echo "Skipped (over ${MAX_KB} KB):"
find . -type f -size +"${MAX_KB}"k "${EXCLUDES[@]}"

# GNU stat on Linux; BSD stat on macOS.
BYTES=$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")
SIZE_MB=$(( BYTES / 1024 / 1024 ))
echo "Created: $OUT (${SIZE_MB} MB)"
echo "Files inside: $(unzip -Z1 "$OUT" | grep -vc '/$')"
[ "$SIZE_MB" -ge "$LIMIT_MB" ] && echo "WARNING: archive is over ${LIMIT_MB} MB"
exit 0