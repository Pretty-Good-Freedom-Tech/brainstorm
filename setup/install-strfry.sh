#!/bin/bash

# Hasenpfeffr Strfry Installation Script
# This script automates the installation and configuration of Strfry Nostr relay
# for the Hasenpfeffr project.

set -e  # Exit on error

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

echo "=== Hasenpfeffr Strfry Installation ==="
echo "This script will install and configure Strfry Nostr relay"
echo ""

# Configuration variables
STRFRY_REPO="https://github.com/hoytech/strfry.git"
STRFRY_DATA_DIR="/var/lib/strfry"
STRFRY_CONF="/etc/strfry.conf"
STRFRY_SERVICE="/etc/systemd/system/strfry.service"
NGINX_CONF="/etc/nginx/sites-available/default"
HASENPFEFFR_CONF="/etc/hasenpfeffr.conf"
DOMAIN_NAME=""

# Try to get domain name from config file
if [ -f "$HASENPFEFFR_CONF" ]; then
  source "$HASENPFEFFR_CONF"
  if [ ! -z "$STRFRY_DOMAIN" ]; then
    DOMAIN_NAME="$STRFRY_DOMAIN"
    echo "Using domain name from configuration: $DOMAIN_NAME"
  fi
fi

# If domain name is still empty, ask for it
if [ -z "$DOMAIN_NAME" ]; then
  read -p "Enter your relay domain name (e.g., relay.yourdomain.com): " DOMAIN_NAME
  if [ -z "$DOMAIN_NAME" ]; then
    echo "Domain name is required. Exiting."
    exit 1
  fi
fi

# Step 1: Install dependencies
echo "=== Installing dependencies ==="
apt update
apt install -y git build-essential libyaml-perl libtemplate-perl libregexp-grammars-perl \
  libssl-dev zlib1g-dev liblmdb-dev libflatbuffers-dev libsecp256k1-dev libzstd-dev \
  ufw nginx certbot python3-certbot-nginx

# Step 2: Clone and build strfry
echo "=== Cloning and building strfry ==="
STRFRY_SRC_DIR="/home/$SUDO_USER/strfry"
if [ ! -d "$STRFRY_SRC_DIR" ]; then
  git clone "$STRFRY_REPO" "$STRFRY_SRC_DIR"
  chown -R $SUDO_USER:$SUDO_USER "$STRFRY_SRC_DIR"
fi
cd "$STRFRY_SRC_DIR"
git submodule update --init
make setup-golpe
make -j2

# Step 3: Install strfry
echo "=== Installing strfry ==="
cp strfry /usr/local/bin/
chmod +x /usr/local/bin/strfry

# Step 4: Create strfry user and data directory
echo "=== Creating strfry user and data directory ==="
useradd -M -s /usr/sbin/nologin strfry 2>/dev/null || true
mkdir -p "$STRFRY_DATA_DIR"
chown strfry:strfry "$STRFRY_DATA_DIR"
chmod 755 "$STRFRY_DATA_DIR"

# Step 5: Configure strfry
echo "=== Configuring strfry ==="
# Backup existing config if it exists
if [ -f "$STRFRY_CONF" ]; then
  cp "$STRFRY_CONF" "${STRFRY_CONF}.backup"
fi

# Get relay pubkey from config if available
RELAY_PUBKEY=""
if [ -f "$HASENPFEFFR_CONF" ]; then
  source "$HASENPFEFFR_CONF"
  if [ ! -z "$HASENPFEFFR_RELAY_PUBKEY" ]; then
    RELAY_PUBKEY="$HASENPFEFFR_RELAY_PUBKEY"
    echo "Using relay pubkey from configuration"
  fi
fi

# Copy the default strfry.conf from the repository and modify it
cp "$STRFRY_SRC_DIR/strfry.conf" "$STRFRY_CONF"

# Modify the config file to set nofiles to 0 and update other necessary settings
sed -i "s|^  db = .*|  db = \"$STRFRY_DATA_DIR\"|" "$STRFRY_CONF"
sed -i "s|^  nofiles = .*|  nofiles = 0|" "$STRFRY_CONF"
sed -i "s|^  bind = .*|  bind = \"127.0.0.1:7777\"|" "$STRFRY_CONF"

# Update relay info if pubkey is available
if [ ! -z "$RELAY_PUBKEY" ]; then
  sed -i "s|^    name = .*|    name = \"Hasenpfeffr Relay\"|" "$STRFRY_CONF"
  sed -i "s|^    description = .*|    description = \"Hasenpfeffr Nostr relay for NIP-85 Trusted Assertions\"|" "$STRFRY_CONF"
  sed -i "s|^    contact = .*|    contact = \"admin@${DOMAIN_NAME}\"|" "$STRFRY_CONF"
  sed -i "s|^    pubkey = .*|    pubkey = \"${RELAY_PUBKEY}\"|" "$STRFRY_CONF"
fi

chown strfry:strfry "$STRFRY_CONF"

# Step 6: Configure systemd service
echo "=== Setting up systemd service ==="
cat > "$STRFRY_SERVICE" << EOF
[Unit]
Description=strfry relay service

[Service]
User=strfry
ExecStart=/usr/local/bin/strfry relay
Restart=on-failure
RestartSec=5
ProtectHome=yes
NoNewPrivileges=yes
ProtectSystem=full
LimitCORE=1000000000

[Install]
WantedBy=multi-user.target
EOF

# Step 7: Configure Nginx
echo "=== Configuring Nginx ==="
cat > "$NGINX_CONF" << EOF
server {
    server_name $DOMAIN_NAME;
    
    location / {
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header Host \$host;
        proxy_pass http://127.0.0.1:7777;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    
    # Hasenpfeffr Control Panel
    location /control/ {
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header Host \$host;
        proxy_pass http://127.0.0.1:7778/;
        proxy_http_version 1.1;
    }
}
EOF

# Step 8: Configure firewall
echo "=== Configuring firewall ==="
ufw allow 'Nginx Full'
ufw allow 22/tcp # allow incoming SSH traffic
ufw allow 7474/tcp # allow Neo4j Browser access
ufw allow 7687/tcp # allow Neo4j Bolt access

# IMPORTANT: Allow incoming by default to ensure Neo4j access works
ufw default allow incoming
ufw default allow outgoing
ufw --force enable

# Step 9: Enable and start services
echo "=== Starting services ==="
systemctl daemon-reload
systemctl enable strfry.service
systemctl start strfry.service
systemctl restart nginx

# Check if strfry service is running
echo "Checking Strfry service status..."
if systemctl is-active --quiet strfry; then
  echo "Strfry service is running"
else
  echo "Strfry service failed to start"
  echo "Check logs with: journalctl -u strfry"
  # Don't exit with error as this is not critical
fi

# Step 10: Set up SSL certificate
echo "=== Setting up SSL certificate ==="
# Use a non-interactive approach with environment variable
export DEBIAN_FRONTEND=noninteractive

# Default email for SSL certificate
SSL_EMAIL="admin@${DOMAIN_NAME}"

# Ask for SSL setup with a timeout to prevent hanging
echo "Would you like to set up an SSL certificate now? (y/n)"
read -t 30 -r setup_ssl || { echo "Timed out waiting for input. Defaulting to 'n'"; setup_ssl="n"; }

if [ "$setup_ssl" = "y" ] || [ "$setup_ssl" = "Y" ]; then
  echo "Setting up SSL certificate for $DOMAIN_NAME with email $SSL_EMAIL"
  certbot --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos --email "$SSL_EMAIL" || {
    echo "SSL certificate setup failed. You can run this later with:"
    echo "sudo certbot --nginx -d $DOMAIN_NAME"
  }
else
  echo "Skipping SSL certificate setup. You can run this later with:"
  echo "sudo certbot --nginx -d $DOMAIN_NAME"
fi

echo ""
echo "=== Strfry Installation Complete ==="
echo "Strfry is now installed and configured for Hasenpfeffr"
echo "You can access your relay at: https://$DOMAIN_NAME"
echo "You can access the control panel at: https://$DOMAIN_NAME/control/"
echo ""
echo "To check the status of the strfry service, run:"
echo "sudo systemctl is-active strfry"
echo ""
echo "To view logs, run:"
echo "sudo journalctl -u strfry"
