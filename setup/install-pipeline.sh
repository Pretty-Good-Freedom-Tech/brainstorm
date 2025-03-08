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
chmod +x */*.sh
chmod +x */*.js
chmod +x */*.mjs

echo "=== Webs of Trust Calculations Installation ==="

mkdir -p /var/log/hasenpfeffr
touch /var/log/hasenpfeffr/calculateHops.log
cd /usr/local/lib/node_modules/hasenpfeffr/src/algos
chmod +x *.sh
chmod +x *.js
chmod +x *.mjs

echo "=== Plugins Installation ==="
cd /usr/local/lib/node_modules/hasenpfeffr/src/plugins
chmod +x *.js