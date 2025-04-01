#!/bin/bash

# Script to turn on the strfry and Neo4j databases

echo "Starting databases..."

# Start strfry
sudo systemctl start strfry
sleep 3

# Start Neo4j
sudo systemctl start neo4j
sleep 5

echo "Databases started successfully."

exit 0
