#!/bin/bash

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# Change to the directory containing the script
cd /usr/local/lib/node_modules/brainstorm/src/pipeline/reconciliation/

# Run the optimized Node.js script
node kind10000EventsToMutes.js

# Move files to currentRelationshipsFromStrfry directory
sudo mv currentMutesFromStrfry.json currentRelationshipsFromStrfry/mutes/currentMutesFromStrfry.json
sudo mv allKind10000EventsStripped.json currentRelationshipsFromStrfry/mutes/allKind10000EventsStripped.json