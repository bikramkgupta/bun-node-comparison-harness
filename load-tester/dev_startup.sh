#!/bin/bash
#
# Benchmark Service Development Startup Script
# For DigitalOcean App Platform Hot Reload
#

set -e

echo "=== Benchmark Service Startup ==="
echo "Bun version: $(bun --version)"

# Install hey from pre-built binary (no Go required)
HEY_BIN="/tmp/hey"
if [ -f "$HEY_BIN" ]; then
    echo "hey tool available: $HEY_BIN"
else
    echo "Installing hey from pre-built binary..."
    curl -sL https://hey-release.s3.us-east-2.amazonaws.com/hey_linux_amd64 -o "$HEY_BIN"
    chmod +x "$HEY_BIN"
    echo "hey installed: $HEY_BIN"
fi
export PATH=$PATH:/tmp

# Show service URLs
echo "BUN_URL: ${BUN_URL:-not set}"
echo "NODEJS_URL: ${NODEJS_URL:-not set}"

# Start the benchmark dashboard on port 8080
echo "Starting Benchmark Dashboard on port 8080..."
exec bun run server.js
