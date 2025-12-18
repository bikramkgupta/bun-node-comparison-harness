#!/bin/bash
#
# Benchmark Service Development Startup Script
# For DigitalOcean App Platform Hot Reload
#

set -e

echo "=== Benchmark Service Startup ==="
echo "Bun version: $(bun --version)"

# Set GOPATH to writable directory (matches PRE_DEPLOY_COMMAND)
export GOPATH=/tmp/go
export PATH=$PATH:/tmp/go/bin

# Verify hey is available
if command -v hey &> /dev/null; then
    echo "hey tool available: $(which hey)"
else
    echo "Warning: hey tool not found, installing..."
    go install github.com/rakyll/hey@latest
fi

# Show service URLs
echo "BUN_URL: ${BUN_URL:-not set}"
echo "NODEJS_URL: ${NODEJS_URL:-not set}"

# Start the benchmark dashboard on port 8080
echo "Starting Benchmark Dashboard on port 8080..."
exec bun run server.js
