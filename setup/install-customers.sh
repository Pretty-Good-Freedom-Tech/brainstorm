#!/bin/bash

# This script installs the customers directory and its default contents

set -e  # Exit on error

sourceCustomersDir='/usr/local/lib/node_modules/brainstorm/customers';
# create customers directories
targetCustomersDir='/var/lib/brainstorm/customers';
echo "Creating directory: ${targetCustomersDir}";
mkdir -p ${targetCustomersDir};

echo "Copying default customers from ${sourceCustomersDir} to ${targetCustomersDir}";
cp -r ${sourceCustomersDir}/* ${targetCustomersDir}/;
sudo chown -R brainstorm:brainstorm ${targetCustomersDir};
sudo chmod -R 644 ${targetCustomersDir}/*.*;
