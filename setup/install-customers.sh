#!/bin/bash

# This script installs the customers directory and its default contents
# This includes the monitoring directory for neo4j metrics

set -e  # Exit on error

sourceCustomersDir='/usr/local/lib/node_modules/brainstorm/customers';
# create customers directories
targetCustomersDir='/var/lib/brainstorm/customers';
echo "Creating directory: ${targetCustomersDir}";
mkdir -p ${targetCustomersDir};

echo "Copying default customers from ${sourceCustomersDir} to ${targetCustomersDir}";
cp -r ${sourceCustomersDir}/* ${targetCustomersDir}/;
sudo chown -R brainstorm:brainstorm ${targetCustomersDir};
sudo chmod -R 644 ${targetCustomersDir};

targetMonitoringDir='/var/lib/brainstorm/monitoring';
echo "Creating directory: ${targetMonitoringDir}";
mkdir -p ${targetMonitoringDir};
sudo chown -R neo4j:brainstorm ${targetMonitoringDir};
sudo chmod -R 755 ${targetMonitoringDir};

# create a default relay pubkey for each customer
# run createAllCustomerRelays.js
# echo "Creating default relay pubkey for each customer (if not already done)..."
# sudo node /usr/local/lib/node_modules/brainstorm/src/manage/customers/createAllCustomerRelays.js
