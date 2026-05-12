#!/bin/bash
# cco-daemon.sh - LaunchAgent wrapper for cco start
# Ensures PATH includes node/npm and runs the orchestrator in continuous mode

export PATH="/opt/homebrew/bin:/opt/homebrew/opt/node@22/bin:/usr/local/bin:$PATH"

PROJECT_DIR="$HOME/projects/claude-code-orchestrator"
DATA_DIR="$HOME/.cco/data"
LOG_DIR="$HOME/.cco/logs"

mkdir -p "$DATA_DIR/inbox" "$DATA_DIR/processed" "$LOG_DIR"

cd "$PROJECT_DIR" || exit 1

exec node dist/index.js start --data-dir "$DATA_DIR"
