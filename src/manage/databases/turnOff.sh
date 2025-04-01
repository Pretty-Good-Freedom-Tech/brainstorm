#!/bin/bash

# Script to turn off the strfry and Neo4j databases

echo "Stopping databases..."

# Stop strfry
sudo systemctl stop strfry
sleep 3

# Stop Neo4j
sudo systemctl stop neo4j
sleep 5

echo "Databases stopped successfully."

exit 0
