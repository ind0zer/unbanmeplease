#!/bin/bash

set -e

echo "Starting deployment with systemd..."

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}Checking Node.js version...${NC}"
NODE_VERSION=$(node -v 2>/dev/null || echo "not found")
echo "Node.js version: $NODE_VERSION"

if [ "$NODE_VERSION" = "not found" ]; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js 18+ first:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -"
    echo "  apt-get install -y nodejs"
    exit 1
fi

NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo -e "${RED}Error: Node.js 18+ is required${NC}"
    echo "Run ./update-nodejs.sh or install a current LTS release."
    exit 1
fi

echo -e "${YELLOW}Creating logs directory...${NC}"
mkdir -p logs

if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo "Copy .env.example to .env and fill in real values first."
    exit 1
fi

echo -e "${YELLOW}Installing dependencies...${NC}"
npm ci --omit=dev

echo -e "${YELLOW}Stopping existing service...${NC}"
systemctl stop unban-bot 2>/dev/null || true

echo -e "${YELLOW}Installing systemd service...${NC}"
cp unban-bot.service /etc/systemd/system/

systemctl daemon-reload

echo -e "${YELLOW}Enabling service...${NC}"
systemctl enable unban-bot

echo -e "${YELLOW}Starting bot service...${NC}"
systemctl start unban-bot

sleep 2

echo -e "${YELLOW}Checking status...${NC}"
systemctl status unban-bot --no-pager || true

echo ""
echo -e "${GREEN}Deployment completed.${NC}"
echo ""
echo "Useful commands:"
echo "  systemctl status unban-bot   - Check status"
echo "  systemctl restart unban-bot  - Restart bot"
echo "  systemctl stop unban-bot     - Stop bot"
echo "  journalctl -u unban-bot -f   - View logs"
echo "  tail -f logs/bot.log         - View output logs"
echo "  tail -f logs/error.log       - View error logs"
