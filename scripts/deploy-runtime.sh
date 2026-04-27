#!/bin/sh
set -eu

SRC_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
RUNTIME_ROOT=${BM_GTM_RUNTIME_ROOT:-"$HOME/.codex/memories/brandmultiplier-gtm-runtime"}
RUNTIME_DATA="$RUNTIME_ROOT/data"
RUNTIME_PLIST="$RUNTIME_ROOT/com.brandmultipliergtm.campaign-runner.plist"
PROJECT_DATA="$SRC_DIR/data"

mkdir -p "$RUNTIME_ROOT"
mkdir -p "$RUNTIME_DATA"

if [ -L "$PROJECT_DATA" ]; then
  SYMLINK_BACKUP="$SRC_DIR/data.symlink.backup.$(date +%Y%m%d%H%M%S)"
  mv "$PROJECT_DATA" "$SYMLINK_BACKUP"
  mkdir -p "$PROJECT_DATA"
  rsync -a "$RUNTIME_DATA/" "$PROJECT_DATA/"
  echo "Replaced project data symlink with local mirror:"
  echo "  backup=$SYMLINK_BACKUP"
elif [ ! -e "$PROJECT_DATA" ]; then
  mkdir -p "$PROJECT_DATA"
  rsync -a "$RUNTIME_DATA/" "$PROJECT_DATA/"
fi

rsync -a --delete \
  --exclude '.git' \
  --exclude '.next' \
  --exclude 'data' \
  --exclude 'data.backup.*' \
  --exclude 'logs' \
  "$SRC_DIR/" "$RUNTIME_ROOT/"

cat > "$RUNTIME_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.brandmultipliergtm.campaign-runner</string>

    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/node</string>
        <string>$RUNTIME_ROOT/node_modules/tsx/dist/cli.mjs</string>
        <string>$RUNTIME_ROOT/scripts/run-campaign.ts</string>
    </array>

    <key>WorkingDirectory</key>
    <string>$RUNTIME_ROOT</string>

    <key>StartInterval</key>
    <integer>300</integer>

    <key>StandardOutPath</key>
    <string>$RUNTIME_DATA/cron.log</string>
    <key>StandardErrorPath</key>
    <string>$RUNTIME_DATA/cron-error.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>BM_GTM_DATA_DIR</key>
        <string>$RUNTIME_DATA</string>
    </dict>
</dict>
</plist>
EOF

echo "Runtime deployed:"
echo "  root=$RUNTIME_ROOT"
echo "  plist=$RUNTIME_PLIST"
