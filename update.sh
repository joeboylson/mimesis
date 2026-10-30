#!/bin/sh
# Pulls the latest ochre and reinstalls it. `ochre update` runs this.
# Passes its options on to install.sh, so ./update.sh --app updates the app too.
set -e
cd "$(dirname "$0")"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "This repo has uncommitted changes; commit or stash them, then update." >&2
  exit 1
fi

before="$(git rev-parse --short HEAD)"
git pull --ff-only --quiet
after="$(git rev-parse --short HEAD)"
if [ "$before" = "$after" ]; then
  echo "Already up to date ($after); reinstalling anyway."
else
  echo "Updated $before → $after:"
  git log --oneline "$before..$after"
fi

exec ./install.sh "$@"
