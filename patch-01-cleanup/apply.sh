#!/usr/bin/env bash
# Patch 01: clean-up. Run it from the folder where you unzipped, or from the project root:
#   bash patch-01-cleanup/apply.sh [path/to/project]
# It asks before overwriting, archiving or removing anything. Nothing is deleted for good:
# every file it replaces or removes is first saved in archive/patch-01-backup.tar.gz.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_NAME="patch-01-cleanup"

say()  { printf '%s\n' "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
ask()  { local a; [ "${PATCH_YES:-}" = 1 ] && return 0; read -r -p "$1 [y/N] " a </dev/tty || a=n; [[ "$a" =~ ^[Yy] ]]; }

is_project() { [ -f "$1/server/index.js" ] && [ -d "$1/SQL" ] && [ -d "$1/client" ]; }

# --- find the project root -------------------------------------------------
ROOT=""
if [ $# -ge 1 ]; then ROOT="$1"
elif is_project "$PWD"; then ROOT="$PWD"
else
  for d in "$PWD"/*/ "$HERE"/../*/; do
    d="${d%/}"; [ -d "$d" ] && is_project "$d" && { ROOT="$d"; break; }
  done
fi
[ -n "$ROOT" ] && is_project "$ROOT" || die "could not find the project (a folder with server/, client/ and SQL/). Run: bash $PATCH_NAME/apply.sh path/to/project"
ROOT="$(cd "$ROOT" && pwd)"
say "Project folder: $ROOT"

[ -d "$ROOT/SQL/schema" ] && die "SQL/schema already exists, so this patch looks applied already. Nothing was changed."
[ -f "$ROOT/SQL/theme-park-schema.sql" ] || die "SQL/theme-park-schema.sql not found: this is not the project this patch was made for."

NEW=0; SAME=0; CHANGED=0
while IFS= read -r f; do
  if   [ ! -e "$ROOT/$f" ];                   then NEW=$((NEW+1))
  elif cmp -s "$HERE/payload/$f" "$ROOT/$f";  then SAME=$((SAME+1))
  else CHANGED=$((CHANGED+1)); fi
done < <(cd "$HERE/payload" && find . -type f | sed 's#^\./##' | sort)

say ""
say "This patch will:"
say "  - add $NEW new files and overwrite $CHANGED existing files ($SAME are already identical)"
say "  - move $(grep -c . "$HERE/MOVE_TO_ARCHIVE.txt") unused files/folders into archive/"
say "  - remove $(grep -c . "$HERE/REMOVE.txt") old flat SQL files that are replaced by the new SQL/ folders"
say "  - move SQL/history to SQL/seed/history"
say ""
ask "Continue?" || { say "Cancelled. Nothing was changed."; exit 0; }

# --- backup ----------------------------------------------------------------
mkdir -p "$ROOT/archive"
BK="$ROOT/archive/patch-01-backup.tar.gz"
LIST="$(mktemp)"
{ (cd "$HERE/payload" && find . -type f | sed 's#^\./##') ; cat "$HERE/REMOVE.txt"; } | while IFS= read -r f; do
  [ -f "$ROOT/$f" ] && echo "$f"; done > "$LIST"
(cd "$ROOT" && tar -czf "$BK" -T "$LIST") && say "Backup of files about to change: archive/patch-01-backup.tar.gz ($(wc -l < "$LIST") files)"
rm -f "$LIST"

# --- copy payload (ask before each overwrite) -------------------------------
ALL=0
while IFS= read -r f; do
  src="$HERE/payload/$f"; dst="$ROOT/$f"
  mkdir -p "$(dirname "$dst")"
  if [ ! -e "$dst" ]; then cp "$src" "$dst"; continue; fi
  cmp -s "$src" "$dst" && continue
  if [ "$ALL" = 1 ]; then cp "$src" "$dst"; continue; fi
  if [ "${PATCH_YES:-}" = 1 ]; then a=y; else read -r -p "Overwrite $f ? [y]es / [n]o / [a]ll / [q]uit " a </dev/tty || a=n; fi
  case "$a" in
    [Aa]) ALL=1; cp "$src" "$dst" ;;
    [Yy]) cp "$src" "$dst" ;;
    [Qq]) die "stopped. Files copied so far stay in place. To undo, unpack archive/patch-01-backup.tar.gz in the project folder." ;;
    *)    say "  kept your version of $f" ;;
  esac
done < <(cd "$HERE/payload" && find . -type f | sed 's#^\./##' | sort)

# --- move unused files to archive/ ------------------------------------------
say ""; say "Unused files to move into archive/ (same paths, so you can copy any back):"
sed 's/^/  /' "$HERE/MOVE_TO_ARCHIVE.txt"
if ask "Move them?"; then
  while IFS= read -r m; do
    [ -e "$ROOT/$m" ] || continue
    mkdir -p "$ROOT/archive/$(dirname "$m")"
    mv "$ROOT/$m" "$ROOT/archive/$m"
  done < "$HERE/MOVE_TO_ARCHIVE.txt"
else say "  skipped"; fi

# --- remove old flat SQL files ----------------------------------------------
say ""; say "Old SQL files replaced by the new SQL/schema, views, rules, migrations and seed folders:"
sed 's/^/  /' "$HERE/REMOVE.txt"
if ask "Remove them? (a copy is in archive/patch-01-backup.tar.gz)"; then
  while IFS= read -r f; do [ -f "$ROOT/$f" ] && rm -- "$ROOT/$f"; done < "$HERE/REMOVE.txt"
  [ -f "$ROOT/SQL/02_test_data.sql" ] && mv "$ROOT/SQL/02_test_data.sql" "$ROOT/SQL/seed/02_test_data.sql"
  if [ -d "$ROOT/SQL/history" ]; then
    if [ -e "$ROOT/SQL/seed/history" ]; then say "  SQL/seed/history already exists; left SQL/history in place."
    else mv "$ROOT/SQL/history" "$ROOT/SQL/seed/history"; fi
  fi
else say "  skipped (the old and new SQL files will both exist until you remove the old ones)"; fi

# --- changelog + clean up ---------------------------------------------------
mkdir -p "$ROOT/docs"
{ [ -f "$ROOT/docs/CHANGELOG.md" ] || printf '# Changelog\n\nOne entry per patch zip, newest last.\n'
  printf '\n'; cat "$HERE/PATCH_NOTES.md"; } >> "$ROOT/docs/CHANGELOG.md"
say ""; say "Done. Notes added to docs/CHANGELOG.md."
say "Next: docker compose config -q   (checks the compose file), then commit."
if ask "Delete the patch folder ($HERE) now? (you can still delete the zip yourself)"; then rm -rf "$HERE"; fi
