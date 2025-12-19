#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "Bun DevContainer Post-Create Setup"
echo "=========================================="

# Fix ownership of credential directories
echo "Setting up credential directories..."
if [ -d "/home/vscode/.config" ]; then
    sudo chown -R vscode:vscode /home/vscode/.config
    sudo chmod -R 755 /home/vscode/.config
fi

if [ -d "/home/vscode/.claude" ]; then
    sudo chown -R vscode:vscode /home/vscode/.claude
    sudo chmod -R 700 /home/vscode/.claude
fi

if [ -d "/home/vscode/.codex" ]; then
    sudo chown -R vscode:vscode /home/vscode/.codex
    sudo chmod -R 700 /home/vscode/.codex
fi

# Add aliases for codex and claude
echo "alias codex2='codex --ask-for-approval never --sandbox danger-full-access'" >> ~/.bashrc
echo "alias claude2='claude --dangerously-skip-permissions'" >> ~/.bashrc

# Add alias for running benchmarks
# Note: These commands should be run from /workspaces/bun directory
echo "alias benchmark-up='cd /workspaces/bun && docker compose -f .devcontainer/docker-compose.yml --profile benchmark up -d'" >> ~/.bashrc
echo "alias benchmark-down='cd /workspaces/bun && docker compose -f .devcontainer/docker-compose.yml --profile benchmark down'" >> ~/.bashrc
echo "alias benchmark-ps='cd /workspaces/bun && docker compose -f .devcontainer/docker-compose.yml --profile benchmark ps'" >> ~/.bashrc

source ~/.bashrc

# Verify Bun installation
echo ""
echo "Verifying Bun installation..."
if command -v bun &> /dev/null; then
    bun --version
    echo "✓ Bun is installed and ready"
else
    echo "⚠ Warning: Bun not found. It should be installed via devcontainer feature."
fi

echo "=========================================="
echo "DevContainer Ready!"
echo "=========================================="
echo ""
echo "To start benchmark services, run:"
echo "  benchmark-up"
echo ""
echo "To stop benchmark services, run:"
echo "  benchmark-down"
echo ""

