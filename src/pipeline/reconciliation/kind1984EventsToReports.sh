#!/bin/bash

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# Change to the directory containing the script
cd /usr/local/lib/node_modules/brainstorm/src/pipeline/reconciliation/

# Run the optimized Node.js script
node kind1984EventsToReports.js

# Move files to currentRelationshipsFromStrfry directory
sudo mv reportsToAddToNeo4j.json currentRelationshipsFromStrfry/reportsToAddToNeo4j.json
sudo mv allKind1984EventsStripped.json currentRelationshipsFromStrfry/allKind1984EventsStripped.json