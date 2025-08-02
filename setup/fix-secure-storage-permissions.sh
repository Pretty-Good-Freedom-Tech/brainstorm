#!/bin/bash

# Quick fix for secure storage permissions
# Run this on your remote server to fix the current EACCES error

set -e

echo "🔧 Fixing Brainstorm Secure Storage Permissions"
echo "==============================================="

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo "❌ This script must be run as root (use sudo)"
    exit 1
fi

STORAGE_DIR="/var/lib/brainstorm/secure-keys"
CONFIG_DIR="/etc/brainstorm"

echo "📁 Checking directories..."

# Create directories if they don't exist
mkdir -p "$CONFIG_DIR"
mkdir -p "$STORAGE_DIR"

# Try to detect the web server user
WEB_USER=""
if id "brainstorm" &>/dev/null; then
    WEB_USER="brainstorm"
elif id "www-data" &>/dev/null; then
    WEB_USER="www-data"
elif id "nodejs" &>/dev/null; then
    WEB_USER="nodejs"
elif id "nginx" &>/dev/null; then
    WEB_USER="nginx"
elif pgrep -f "control-panel.js" &>/dev/null; then
    # Try to detect from running process
    WEB_USER=$(ps -o user= -p $(pgrep -f "control-panel.js" | head -1) 2>/dev/null || echo "")
fi

if [[ -n "$WEB_USER" ]]; then
    echo "🔍 Detected web server user: $WEB_USER"
    echo "🔧 Setting ownership and permissions..."
    
    # Set ownership
    chown -R "$WEB_USER:$WEB_USER" "$CONFIG_DIR"
    chown -R "$WEB_USER:$WEB_USER" "$STORAGE_DIR"
    
    # Set permissions
    chmod -R 750 "$STORAGE_DIR"
    chmod -R 750 "$CONFIG_DIR"
    
    # Ensure specific file permissions
    if [[ -f "$CONFIG_DIR/relay-master.key" ]]; then
        chmod 600 "$CONFIG_DIR/relay-master.key"
    fi
    
    if [[ -f "$CONFIG_DIR/secure-storage.env" ]]; then
        chmod 600 "$CONFIG_DIR/secure-storage.env"
    fi
    
    echo "✅ Permissions fixed successfully!"
    echo ""
    echo "📋 Summary:"
    echo "   Owner: $WEB_USER:$WEB_USER"
    echo "   Config dir: $CONFIG_DIR (750)"
    echo "   Storage dir: $STORAGE_DIR (750)"
    echo "   Key files: 600"
    echo ""
    echo "🚀 You can now try customer sign-up again!"
    
else
    echo "❌ Could not detect web server user automatically."
    echo ""
    echo "🔍 Please check which user runs your control panel:"
    echo "   ps aux | grep control-panel"
    echo ""
    echo "📝 Then run these commands manually (replace USER with actual user):"
    echo "   chown -R USER:USER $CONFIG_DIR"
    echo "   chown -R USER:USER $STORAGE_DIR"
    echo "   chmod -R 750 $STORAGE_DIR"
    echo "   chmod -R 750 $CONFIG_DIR"
    echo ""
    exit 1
fi
