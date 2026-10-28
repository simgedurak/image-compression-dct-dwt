#!/usr/bin/env bash
# Runs the FastAPI backend (:8004) and the Vite frontend (:8003) together.
# Ctrl+C stops both.
set -euo pipefail
cd "$(dirname "$0")"

# Job control (set -m) puts each backgrounded job in its own process group,
# so `kill -- -$PID` below can reap npm's vite child too -- killing just the
# `npm run dev` PID leaves vite itself orphaned and still holding the port.
set -m

if [ ! -d "frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  (cd frontend && npm install)
fi

cleanup() {
  echo
  echo "Stopping backend and frontend..."
  [ -n "${BACKEND_PID:-}" ] && kill -- -"$BACKEND_PID" 2>/dev/null
  [ -n "${FRONTEND_PID:-}" ] && kill -- -"$FRONTEND_PID" 2>/dev/null
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting backend on http://localhost:8004 ..."
PYTHONPATH=backend python3 -m uvicorn app.main:app --reload --port 8004 &
BACKEND_PID=$!

echo "Starting frontend on http://localhost:8003 ..."
(cd frontend && npm run dev -- --port 8003) &
FRONTEND_PID=$!

wait "$BACKEND_PID" "$FRONTEND_PID"
