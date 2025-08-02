#!/bin/bash

# Setup script for Brainstorm Secure Relay Key Storage
# This script helps configure secure storage for customer relay keys

set -e

echo "🔐 Brainstorm Secure Relay Key Storage Setup"
echo "============================================="
echo ""

# Check if running as root for system-wide setup
if [[ $EUID -eq 0 ]]; then
    SYSTEM_WIDE=true
    CONFIG_DIR="/etc/brainstorm"
    STORAGE_DIR="/var/lib/brainstorm/secure-keys"
    echo "Running as root - setting up system-wide configuration"
else
    SYSTEM_WIDE=false
    CONFIG_DIR="$HOME/.brainstorm"
    STORAGE_DIR="$HOME/.brainstorm/secure-keys"
    echo "Running as user - setting up user-specific configuration"
fi

echo ""

# Create directories
echo "📁 Creating directories..."
mkdir -p "$CONFIG_DIR"
mkdir -p "$STORAGE_DIR"
chmod 700 "$STORAGE_DIR"  # Secure permissions

# Generate master key if it doesn't exist
MASTER_KEY_FILE="$CONFIG_DIR/relay-master.key"
if [[ ! -f "$MASTER_KEY_FILE" ]]; then
    echo "🔑 Generating master encryption key..."
    openssl rand -hex 32 > "$MASTER_KEY_FILE"
    chmod 600 "$MASTER_KEY_FILE"
    echo "Master key generated and saved to: $MASTER_KEY_FILE"
else
    echo "✅ Master key already exists: $MASTER_KEY_FILE"
fi

# Read the master key
MASTER_KEY=$(cat "$MASTER_KEY_FILE")

# Create environment configuration
ENV_FILE="$CONFIG_DIR/secure-storage.env"
echo "📝 Creating configuration file..."

cat > "$ENV_FILE" << EOF
# Brainstorm Secure Relay Key Storage Configuration
# Generated on $(date)

# Storage backend: encrypted-file, sqlite, vault
RELAY_KEY_STORAGE=encrypted-file

# Master encryption key
RELAY_KEY_MASTER_KEY=$MASTER_KEY

# Storage directory
RELAY_KEY_STORAGE_PATH=$STORAGE_DIR

# SQLite options (if using sqlite storage)
RELAY_KEY_DB_PATH=$STORAGE_DIR/relay-keys.db

# Vault options (if using vault storage)
# VAULT_ENDPOINT=http://localhost:8200
# VAULT_TOKEN=your_vault_token_here
# VAULT_MOUNT_PATH=secret
EOF

chmod 600 "$ENV_FILE"
echo "Configuration saved to: $ENV_FILE"

echo ""
echo "🎯 Setup Instructions:"
echo "======================"
echo ""
echo "1. Add this to your application startup (e.g., in bin/control-panel.js):"
echo "   require('dotenv').config({ path: '$ENV_FILE' });"
echo ""
echo "2. Or export these environment variables in your shell:"
echo "   source $ENV_FILE"
echo ""
echo "3. Test the setup by running:"
echo "   node -e \"const {SecureKeyStorage} = require('./src/utils/secureKeyStorage'); new SecureKeyStorage(); console.log('✅ Secure storage initialized successfully');\""
echo ""

# Set ownership if system-wide
if [[ $SYSTEM_WIDE == true ]]; then
    echo "4. Set proper ownership (replace 'brainstorm' with your app user):"
    echo "   chown -R brainstorm:brainstorm $CONFIG_DIR"
    echo "   chown -R brainstorm:brainstorm $STORAGE_DIR"
    echo ""
fi

echo "🔒 Security Notes:"
echo "=================="
echo "• The master key is stored in: $MASTER_KEY_FILE"
echo "• Keep this key secure and backed up safely"
echo "• The storage directory has 700 permissions (owner-only access)"
echo "• Private keys are encrypted with AES-256-GCM before storage"
echo ""

echo "✅ Secure storage setup complete!"
echo ""
echo "Available storage backends:"
echo "• encrypted-file: Local encrypted files (default, no dependencies)"
echo "• sqlite: SQLite with SQLCipher (requires better-sqlite3 + sqlcipher)"
echo "• vault: HashiCorp Vault (requires vault server setup)"
echo ""
echo "To change storage backend, edit RELAY_KEY_STORAGE in $ENV_FILE"
