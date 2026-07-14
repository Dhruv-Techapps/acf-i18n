#!/bin/bash

# Start i18n locale server
# Serves locale files on port 3333

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
I18N_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🌐 Starting i18n Server..."

cd "$I18N_ROOT"
npm start
