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
if [ ! -d "/tmp/strfry" ]; then
  git clone "$STRFRY_REPO" /tmp/strfry
fi
cd /tmp/strfry
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

# Get system hard limit for file descriptors
NOFILES=$(ulimit -Hn)

# Get relay pubkey from config if available
RELAY_PUBKEY=""
if [ -f "$HASENPFEFFR_CONF" ]; then
  source "$HASENPFEFFR_CONF"
  if [ ! -z "$HASENPFEFFR_RELAY_PUBKEY" ]; then
    RELAY_PUBKEY="$HASENPFEFFR_RELAY_PUBKEY"
    echo "Using relay pubkey from configuration"
  fi
fi

# Create strfry.conf
cat > "$STRFRY_CONF" << EOF
# strfry relay configuration

relay {
  # Directory where the database will be stored
  db = "$STRFRY_DATA_DIR"

  # IP/port binding for the main relay
  bind = "127.0.0.1:7777"

  # Maximum file descriptors (0 = use system default)
  nofiles = $NOFILES

  # Information for the relay's NIP-11 document
  info {
    # Relay name
    name = "Hasenpfeffr Relay"
    
    # Description shown in NIP-11
    description = "Hasenpfeffr Nostr relay for NIP-85 Trusted Assertions"
    
    # Public contact
    contact = "admin@${DOMAIN_NAME}"
    
    # Pubkey for the relay admin
    pubkey = "${RELAY_PUBKEY}"
    
    # Supported NIPs
    supported_nips = [1, 2, 4, 9, 11, 12, 15, 16, 20, 22, 28, 33, 40]
    
    # Software info
    software = "https://github.com/hoytech/strfry"
    version = "0.9.5"
  }
}
EOF

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
echo "Would you like to set up an SSL certificate now? (y/n)"
read -r setup_ssl
if [ "$setup_ssl" = "y" ] || [ "$setup_ssl" = "Y" ]; then
  certbot --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos --email "admin@${DOMAIN_NAME}"
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
