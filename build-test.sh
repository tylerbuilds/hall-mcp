#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "=== Building ==="
npx tsc -p tsconfig.json 2>&1
echo "=== Build Complete ==="
echo "=== Running Tests ==="
npx vitest run 2>&1
echo "=== Tests Complete ==="
