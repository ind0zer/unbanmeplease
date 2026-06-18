#!/bin/bash

set -e

echo "UnbanMePlease setup"
echo ""

NODE_MAJOR=$(node -v 2>/dev/null | cut -d'.' -f1 | sed 's/v//')

if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 18 ]; then
    echo "Node.js is missing or too old."
    echo "Current: $(node -v 2>/dev/null || echo 'not installed')"
    echo "Required: v18+"
    echo ""
    echo "For Ubuntu/Debian you can run:"
    echo "  chmod +x update-nodejs.sh && ./update-nodejs.sh"
    exit 1
fi

if [ ! -f .env ]; then
    cp .env.example .env
    echo ""
    echo ".env created from .env.example."
    echo "Fill it with real tokens, then run ./setup.sh again:"
    echo "   nano .env"
    exit 0
fi

chmod +x deploy.sh
./deploy.sh
