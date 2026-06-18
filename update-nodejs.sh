#!/bin/bash

set -e

echo "Updating Node.js to v22 LTS..."
echo "Removing old Node.js packages..."
apt-get remove -y nodejs nodejs-doc npm 2>/dev/null || true
apt-get remove -y libnode-dev 2>/dev/null || true
apt-get autoremove -y

apt-get clean

echo "Adding NodeSource repository..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -

echo "Installing Node.js 22..."
apt-get install -y nodejs

echo ""
echo "Node.js installed:"
node -v
npm -v

echo ""
echo "Now you can run:"
echo "  cd /root/unban"
echo "  ./deploy.sh"
