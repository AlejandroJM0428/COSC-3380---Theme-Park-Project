#!/usr/bin/env bash
# Patch 04: run from the folder where you unzipped, or from the project root:
#   bash patch-04-run-on-click/apply.sh [path/to/project]
# Asks before overwriting anything. Every file it replaces is first saved in archive/patch-04-backup.tar.gz.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
say() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
ask() { local a; [ "${PATCH_YES:-}" = 1 ] && return 0; read -r -p "$1 [y/N] " a </dev/tty || a=n; [[ "$a" =~ ^[Yy] ]]; }
is_project() { [ -f "$1/server/index.js" ] && [ -d "$1/SQL" ] && [ -d "$1/client" ]; }

ROOT=""
if [ $# -ge 1 ]; then ROOT="$1"
elif is_project "$PWD"; then ROOT="$PWD"
else for d in "$PWD"/*/ "$HERE"/../*/; do d="${d%/}"; [ -d "$d" ] && is_project "$d" && { ROOT="$d"; break; }; done; fi
[ -n "$ROOT" ] && is_project "$ROOT" || die "could not find the project. Run: bash $(basename "$HERE")/apply.sh path/to/project"
ROOT="$(cd "$ROOT" && pwd)"; say "Project folder: $ROOT"
[ -f "$ROOT/client/src/pages/SignIn.jsx" ] || die "client/src/pages/SignIn.jsx not found: apply patch 03 first."

FILES="$(cd "$HERE/payload" && find . -type f | sed 's#^\./##' | sort)"
NEW=0; SAME=0; CHG=0
while IFS= read -r f; do
  if [ ! -e "$ROOT/$f" ]; then NEW=$((NEW+1)); elif cmp -s "$HERE/payload/$f" "$ROOT/$f"; then SAME=$((SAME+1)); else CHG=$((CHG+1)); fi
done <<< "$FILES"
say ""; say "This patch will add $NEW new files and overwrite $CHG existing files ($SAME already identical)."
ask "Continue?" || { say "Cancelled. Nothing was changed."; exit 0; }

mkdir -p "$ROOT/archive"; LIST="$(mktemp)"
while IFS= read -r f; do [ -f "$ROOT/$f" ] && echo "$f"; done <<< "$FILES" > "$LIST"
if [ -s "$LIST" ]; then (cd "$ROOT" && tar -czf archive/patch-04-backup.tar.gz -T "$LIST") && say "Backup: archive/patch-04-backup.tar.gz ($(wc -l < "$LIST") files)"; fi
rm -f "$LIST"

ALL=0
while IFS= read -r f; do
  src="$HERE/payload/$f"; dst="$ROOT/$f"; mkdir -p "$(dirname "$dst")"
  if [ ! -e "$dst" ]; then cp "$src" "$dst"; say "  added    $f"; continue; fi
  cmp -s "$src" "$dst" && continue
  if [ "$ALL" = 1 ] || [ "${PATCH_YES:-}" = 1 ]; then cp "$src" "$dst"; say "  replaced $f"; continue; fi
  read -r -p "Overwrite $f ? [y]es / [n]o / [a]ll / [q]uit " a </dev/tty || a=n
  case "$a" in
    [Aa]) ALL=1; cp "$src" "$dst"; say "  replaced $f" ;;
    [Yy]) cp "$src" "$dst"; say "  replaced $f" ;;
    [Qq]) die "stopped. To undo, unpack archive/patch-04-backup.tar.gz in the project folder." ;;
    *)    say "  kept your version of $f" ;;
  esac
done <<< "$FILES"

if [ -s "$HERE/MOVE_TO_ARCHIVE.txt" ]; then
  say ""; say "These pages are replaced by the new sign-in page and move into archive/ (same paths):"
  sed 's/^/  /' "$HERE/MOVE_TO_ARCHIVE.txt"
  if ask "Move them?"; then
    while IFS= read -r m; do
      [ -e "$ROOT/$m" ] || continue
      mkdir -p "$ROOT/archive/$(dirname "$m")"; mv "$ROOT/$m" "$ROOT/archive/$m"
    done < "$HERE/MOVE_TO_ARCHIVE.txt"
  else say "  skipped (they are no longer used by the app)"; fi
fi

say ""; cat "$HERE/PATCH_NOTES.txt"; say ""
if ask "Delete the patch folder ($HERE) now?"; then rm -rf "$HERE"; fi
