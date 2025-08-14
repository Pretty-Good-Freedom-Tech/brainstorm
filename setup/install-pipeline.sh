#!/bin/bash

# This script installs the ETL pipeline scripts that synchronize Neo4j with strfry
# This includes batch, reconciliation, and streaming pipelines

set -e  # Exit on error

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

echo "=== Brainstorm ETL Pipeline Installation ==="

# chmod +x all scripts
cd /usr/local/lib/node_modules/brainstorm/src/pipeline
sudo chmod +x */*.sh
sudo chmod +x */*.js
sudo chmod +x */*.mjs

echo "=== Webs of Trust Calculations Installation ==="

mkdir -p /var/log/brainstorm
sudo chown brainstorm:brainstorm -R /var/log/brainstorm
sudo chmod 644 /var/log/brainstorm
touch /var/log/brainstorm/calculateHops.log
cd /usr/local/lib/node_modules/brainstorm/src/algos
sudo chmod +x *.sh

echo "=== GrapeRank Installation ==="

# Set up GrapeRank
cd /usr/local/lib/node_modules/brainstorm/src/algos/personalizedGrapeRank
sudo chmod +x *.sh
sudo chmod +x *.js

echo "=== Personalized Whitelist Installation ==="

# Create empty whitelist file if it doesn't exist
mkdir -p /usr/local/lib/node_modules/brainstorm/plugins
WHITELIST_FILE="/usr/local/lib/node_modules/brainstorm/plugins/whitelist_pubkeys.json"
if [ ! -f "$WHITELIST_FILE" ]; then
  echo "{}" > "$WHITELIST_FILE"
  chmod 644 "$WHITELIST_FILE"
fi

# Copy configuration files if they don't exist
if [ ! -f "/etc/whitelist.conf" ]; then
  cp /usr/local/lib/node_modules/brainstorm/config/whitelist.conf.template /etc/whitelist.conf
  sudo chmod 644 /etc/whitelist.conf
  sudo chown root:brainstorm /etc/whitelist.conf
fi

echo "=== Personalized Blacklist Installation ==="

# Set up Personalized Blacklist
cd /usr/local/lib/node_modules/brainstorm/src/algos/personalizedBlacklist
sudo chmod +x *.sh

# Create empty blacklist file if it doesn't exist
mkdir -p /usr/local/lib/node_modules/brainstorm/plugins
BLACKLIST_FILE="/usr/local/lib/node_modules/brainstorm/plugins/blacklist_pubkeys.json"
if [ ! -f "$BLACKLIST_FILE" ]; then
  echo "{}" > "$BLACKLIST_FILE"
  chmod 644 "$BLACKLIST_FILE"
fi

# Copy configuration files if they don't exist
if [ ! -f "/etc/blacklist.conf" ]; then
  cp /usr/local/lib/node_modules/brainstorm/config/blacklist.conf.template /etc/blacklist.conf
  sudo chmod 644 /etc/blacklist.conf
  sudo chown root:brainstorm /etc/blacklist.conf
fi

echo "=== Plugins Installation ==="
cd /usr/local/lib/node_modules/brainstorm/plugins
sudo chmod +x *.js

echo "=== /var/lib/brainstorm files Installation ==="

sudo mkdir -p /var/lib/brainstorm/pipeline/stream
sudo mkdir -p /var/lib/brainstorm/pipeline/reconcile
sudo mkdir -p /var/lib/brainstorm/data/published
sudo mkdir -p /var/lib/brainstorm/algos/personalizedGrapeRank/tmp
cd /var/lib
sudo chown -R brainstorm:brainstorm brainstorm
sudo chmod -R 755 brainstorm

cd /var/log
sudo chown -R brainstorm:brainstorm brainstorm

echo "=== Brainstorm ETL Pipeline Installation Completed ==="
