#!/bin/bash

# This script installs the ETL pipeline scripts that synchronize Neo4j with strfry
# This includes batch, reconciliation, and streaming pipelines

set -e  # Exit on error

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

echo "=== Hasenpfeffr ETL Pipeline Installation ==="

# chmod +x all scripts
cd /usr/local/lib/node_modules/hasenpfeffr/src/pipeline
sudo chmod +x */*.sh
sudo chmod +x */*.js
sudo chmod +x */*.mjs

echo "=== Webs of Trust Calculations Installation ==="

mkdir -p /var/log/hasenpfeffr
touch /var/log/hasenpfeffr/calculateHops.log
cd /usr/local/lib/node_modules/hasenpfeffr/src/algos
sudo chmod +x *.sh
sudo chmod +x *.js
sudo chmod +x *.mjs

echo "=== GrapeRank and Blacklist Installation ==="

# Set up GrapeRank
cd /usr/local/lib/node_modules/hasenpfeffr/src/algos/personalizedGrapeRank
sudo chmod +x *.sh
sudo chmod +x *.js

# Set up Personalized Blacklist
cd /usr/local/lib/node_modules/hasenpfeffr/src/algos/personalizedBlacklist
sudo chmod +x *.sh

# Create empty blacklist file if it doesn't exist
mkdir -p /usr/local/lib/node_modules/hasenpfeffr/plugins
BLACKLIST_FILE="/usr/local/lib/node_modules/hasenpfeffr/plugins/blacklist_pubkeys.json"
if [ ! -f "$BLACKLIST_FILE" ]; then
  echo "{}" > "$BLACKLIST_FILE"
  chmod 644 "$BLACKLIST_FILE"
fi

# Copy configuration files if they don't exist
if [ ! -f "/etc/blacklist.conf" ]; then
  cp /usr/local/lib/node_modules/hasenpfeffr/config/blacklist.conf.template /etc/blacklist.conf
  sudo chmod 644 /etc/blacklist.conf
  sudo chown root:hasenpfeffr /etc/blacklist.conf
fi

echo "=== Plugins Installation ==="
cd /usr/local/lib/node_modules/hasenpfeffr/plugins
sudo chmod +x *.js

cd /var/lib
sudo chown -R hasenpfeffr:hasenpfeffr hasenpfeffr
sudo chmod -R 755 hasenpfeffr
cd /var/log
sudo chown -R hasenpfeffr:hasenpfeffr hasenpfeffr
