#!/usr/bin/env bash
# Pull, install, build and restart Meet on the VPS. Run as root: bash /opt/meet/deploy/update.sh
set -euo pipefail
cd /opt/meet
sudo -u meet git pull --ff-only
sudo -u meet pnpm install --frozen-lockfile
sudo -u meet env AGENT_URL=http://127.0.0.1:8797 NEXT_PUBLIC_ATTRIBUTION_TAG=celo_8d6bd2780c7d pnpm --filter web build
systemctl restart meet-agent meet-web
systemctl --no-pager --lines=3 status meet-agent meet-web
