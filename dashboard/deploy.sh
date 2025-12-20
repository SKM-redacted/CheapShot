#!/bin/bash
# CheapShot Dashboard Deploy Script
# Copies static frontend files to nginx web directory

# Configuration
SOURCE_DIR="$(dirname "$0")/public"
DEST_DIR="/home/ubuntu/docker-stuff/web-data/subdomains/cheapshot.skmredacted.com"
NGINX_CONFIG_SRC="$(dirname "$0")/cheapshot.conf"
NGINX_CONFIG_DEST="/home/ubuntu/docker-stuff/nginx-config/cheapshot.conf"

echo "🚀 Deploying CheapShot Dashboard..."

# Copy static files
echo "📁 Copying static files..."
rm -rf "$DEST_DIR"
cp -r "$SOURCE_DIR" "$DEST_DIR"
echo "   ✅ Copied to $DEST_DIR"

# Copy nginx config
echo "⚙️  Updating nginx config..."
cp "$NGINX_CONFIG_SRC" "$NGINX_CONFIG_DEST"
echo "   ✅ Copied to $NGINX_CONFIG_DEST"

# Reload nginx
echo "🔄 Reloading nginx..."
docker exec nginx nginx -s reload 2>/dev/null && echo "   ✅ Nginx reloaded" || echo "   ⚠️  Nginx reload failed (is it running?)"

echo ""
echo "✨ Deploy complete!"
echo "   Dashboard: https://cheapshot.skmredacted.com"
