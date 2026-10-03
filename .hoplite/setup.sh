#!/bin/sh
set -eu

cd "$(dirname "$0")/../frontend"
npm ci
if [ ! -f .env.local ]; then
    cp .env.example .env.local
fi
