#!/bin/bash

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# Change to the directory containing the script
cd /usr/local/lib/node_modules/brainstorm/src/pipeline/batch/

# Run the optimized Node.js script
node kind3EventsToFollows.js

# Move files to Neo4j import directory
sudo mv followsToAddToNeo4j.json /var/lib/neo4j/import/followsToAddToNeo4j.json
sudo mv allKind3EventsStripped.json /var/lib/neo4j/import/allKind3EventsStripped.json