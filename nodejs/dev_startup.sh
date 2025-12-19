#!/bin/bash
#
# Node.js Service Development Startup Script
# For DigitalOcean App Platform Hot Reload
#

set -e

echo "=== Node.js Service Startup ==="
echo "Runtime: $(node --version)"

# Create .npmrc for peer dependency compatibility
echo "legacy-peer-deps=true" > .npmrc

# Track if we need to reinstall dependencies
HASH_FILE=".deps_hash"
CURRENT_HASH=$(sha256sum package.json 2>/dev/null | cut -d' ' -f1 || echo "none")
STORED_HASH=$(cat "$HASH_FILE" 2>/dev/null || echo "")

install_deps() {
    echo "Installing dependencies with npm..."
    if ! npm install; then
        echo "Standard install failed, trying hard rebuild..."
        rm -rf node_modules package-lock.json
        npm install
    fi
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
echo "Starting Node.js server on port 8080..."
exec node server.js
