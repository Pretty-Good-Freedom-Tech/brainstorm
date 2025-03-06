#!/bin/bash

# Script to generate nip85.json file with NostrUser data from Neo4j
# This extracts data for users with hops < 100 and hops not null

# Source the configuration file
source /etc/hasenpfeffr.conf

# Directory setup
SCRIPT_DIR="/home/ubuntu/hasenpfeffr/algos"
cd "$SCRIPT_DIR"

# Install required Node.js dependencies if not already installed
if [ ! -f "package.json" ]; then
    echo "Initializing npm project..."
    echo '{"name":"hasenpfeffr-nip85","version":"1.0.0","private":true}' > package.json
fi

echo "Checking for required dependencies..."
if ! npm list | grep -q "neo4j-driver"; then
    echo "Installing neo4j-driver..."
    npm install --save neo4j-driver
fi

# Run the JavaScript script
echo "Generating nip85.json..."
node "$SCRIPT_DIR/generateNip85.js"

# Check if the generation was successful
if [ -f "$SCRIPT_DIR/nip85.json" ]; then
    echo "nip85.json has been successfully generated at $SCRIPT_DIR/nip85.json"
    
    # Display a sample of the generated file
    echo "Sample of the generated file (first 5 lines):"
    head -n 5 "$SCRIPT_DIR/nip85.json"
    
    # Display file stats
    echo "Total number of records:"
    wc -l "$SCRIPT_DIR/nip85.json"
    
    echo "File size:"
    du -h "$SCRIPT_DIR/nip85.json"
else
    echo "Error: Failed to generate nip85.json"
    exit 1
fi

echo "nip85.json generation complete!"
