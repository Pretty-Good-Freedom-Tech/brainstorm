#!/bin/bash

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# Change to the directory containing the script
cd /usr/local/lib/node_modules/brainstorm/src/pipeline/reconciliation/

# Run the optimized Node.js script
node kind3EventsToFollows.js

# Move files to currentRelationshipsFromStrfry directory
sudo mv currentFollowsFromStrfry.json currentRelationshipsFromStrfry/follows/currentFollowsFromStrfry.json
sudo mv allKind3EventsStripped.json currentRelationshipsFromStrfry/follows/allKind3EventsStripped.json