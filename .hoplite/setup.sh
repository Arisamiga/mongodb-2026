#!/bin/sh
set -eu
repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
# Shared sandbox caches may be owned by a different runtime user.
export UV_CACHE_DIR="$repo_root/.hoplite/runtime/uv-cache"
cd "$repo_root/frontend"
npm ci
cd "$repo_root/backend"
uv sync --frozen
npm ci --prefix matching-service
