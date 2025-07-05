#!/bin/bash

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# Change to the directory containing the script
cd /usr/local/lib/node_modules/brainstorm/src/pipeline/reconciliation/

# Run the optimized Node.js script
node kind1984EventsToReports.js

# Move files to currentRelationshipsFromStrfry directory
sudo mv currentReportsFromStrfry.json currentRelationshipsFromStrfry/reports/currentReportsFromStrfry.json
sudo mv allKind1984EventsStripped.json currentRelationshipsFromStrfry/reports/allKind1984EventsStripped.json