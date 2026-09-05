#!/bin/bash
cd "$(dirname "$0")"
PORT=8080
echo "Eagle is at http://localhost:${PORT}"
echo "Leave this window open. Use Chrome or Safari so the Extreme 3D Pro is detected."
python3 -m http.server "$PORT"
