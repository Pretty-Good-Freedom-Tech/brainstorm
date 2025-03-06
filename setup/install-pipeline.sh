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

# Configuration variables
HASENPFEFFR_USER="hasenpfeffr"
HASENPFEFFR_GROUP="hasenpfeffr"
HASENPFEFFR_INSTALL_DIR="/usr/local/lib/node_modules/hasenpfeffr"
SYSTEMD_SERVICE_DIR="/etc/systemd/system"

# chmod +x all scripts
cd ~/hasenpfeffr/src/pipeline
chmod +x */*.sh
chmod +x */*.js
chmod +x */*.mjs

# move folder from src to HASENPFEFFR_INSTALL_DIR
cd ~/hasenpfeffr/src
mv -r pipeline $HASENPFEFFR_INSTALL_DIR
