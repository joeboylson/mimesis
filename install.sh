#!/bin/sh
# Builds mimesis from this repo and installs it, or updates it. Run it again
# after any change here, or run ./update.sh (or `mimesis update`) to pull the
# latest first.
#
#   ./install.sh          the mimesis command, page included, into ~/.local/bin
#   ./install.sh --app    also the Mimesis app, into ~/Applications (macOS)
set -e
cd "$(dirname "$0")"

app=false
for arg in "$@"; do
  case "$arg" in
    --app) app=true ;;
    *) echo "Unknown option: $arg (try --app)" >&2; exit 1 ;;
  esac
done

echo "Building the page…"
(cd web && npm ci --no-fund --no-audit --loglevel=error && npx vite build --logLevel error)

echo "Building mimesis…"
cargo build --release --quiet -p mimesis

bin_dir="$HOME/.local/bin"
mkdir -p "$bin_dir"
# A copy, not a link, so the installed one keeps working while this repo changes.
cp target/release/mimesis "$bin_dir/.mimesis.new"
mv "$bin_dir/.mimesis.new" "$bin_dir/mimesis"
echo "Installed $("$bin_dir/mimesis" --version) in $bin_dir"
# Skills already installed get this version's copy.
"$bin_dir/mimesis" skill update

if [ "$app" = true ]; then
  if [ "$(uname -s)" != Darwin ]; then
    echo "The app install is macOS only; on Linux run: cd app/src-tauri && cargo tauri build" >&2
  elif ! cargo tauri --version >/dev/null 2>&1; then
    echo "Building the app needs the Tauri CLI: cargo install tauri-cli" >&2
  else
    echo "Building the app…"
    (cd app/src-tauri && cargo tauri build --bundles app >/dev/null)
    mkdir -p "$HOME/Applications"
    rm -rf "$HOME/Applications/Mimesis.app"
    cp -R target/release/bundle/macos/Mimesis.app "$HOME/Applications/"
    echo "Installed Mimesis.app in $HOME/Applications"
  fi
fi

# A running server keeps serving the old page until it restarts.
port="${MIMESIS_PORT:-4620}"
if pid="$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null)" && [ -n "$pid" ]; then
  if ps -o comm= -p "$pid" | grep -q "mimesis$"; then
    kill "$pid" && echo "Stopped the running server; \`mimesis open\` starts the new one."
  fi
fi

case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) echo "Add this to your shell profile: export PATH=\"$bin_dir:\$PATH\"" ;;
esac
if [ ! -d "${MIMESIS_HOME:-$HOME/.mimesis}" ]; then
  echo "Next: mimesis open, then drop some images in. mimesis guide shows what an AI runs."
fi
