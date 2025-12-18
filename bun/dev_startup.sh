#!/bin/bash
#
# Bun Service Development Startup Script
# For DigitalOcean App Platform Hot Reload
#

set -e

echo "=== Bun Service Startup ==="
echo "Runtime: $(bun --version)"

# Track if we need to reinstall dependencies
HASH_FILE=".deps_hash"
CURRENT_HASH=$(sha256sum package.json 2>/dev/null | cut -d' ' -f1 || echo "none")
STORED_HASH=$(cat "$HASH_FILE" 2>/dev/null || echo "")

install_deps() {
    echo "Installing dependencies with Bun..."
    bun install
    echo "$CURRENT_HASH" > "$HASH_FILE"
    echo "Dependencies installed successfully"
}

# Install if hash changed or node_modules missing
if [ "$CURRENT_HASH" != "$STORED_HASH" ] || [ ! -d "node_modules" ]; then
    install_deps
else
    echo "Dependencies up to date, skipping install"
fi

# Start the server on port 8080 (required by App Platform)
echo "Starting Bun server on port 8080..."
exec bun run server.js
