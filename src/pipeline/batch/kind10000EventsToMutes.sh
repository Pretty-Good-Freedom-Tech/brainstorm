#!/bin/bash

source /etc/hasenpfeffr.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# Change to the directory containing the script
cd /usr/local/lib/node_modules/hasenpfeffr/src/pipeline/batch/

# Run the optimized Node.js script
node kind10000EventsToMutes.js

# Move files to Neo4j import directory
sudo mv mutesToAddToNeo4j.json /var/lib/neo4j/import/mutesToAddToNeo4j.json
sudo mv allKind10000EventsStripped.json /var/lib/neo4j/import/allKind10000EventsStripped.json