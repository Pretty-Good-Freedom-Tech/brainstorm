#!/bin/bash

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# Change to the directory containing the script
cd /usr/local/lib/node_modules/brainstorm/src/pipeline/batch/

# Run the optimized Node.js script
node kind1984EventsToReports.js

# Move files to Neo4j import directory
sudo mv reportsToAddToNeo4j.json /var/lib/neo4j/import/reportsToAddToNeo4j.json
sudo mv allKind1984EventsStripped.json /var/lib/neo4j/import/allKind1984EventsStripped.json