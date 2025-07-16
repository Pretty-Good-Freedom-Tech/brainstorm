#!/bin/bash

# npubManager.sh - Main orchestrator for ensuring all NostrUser nodes have npub property
# This script coordinates the workflow to query, generate, and update npub values in Neo4j

# Source configuration
source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR, NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Log file for npub manager operations
LOG_FILE="$BRAINSTORM_LOG_DIR/npubManager.log"

# Temporary files
TEMP_DIR="/tmp/npub_manager_$$"
QUERY_RESULTS="$TEMP_DIR/missing_npubs.json"
GENERATED_NPUBS="$TEMP_DIR/generated_npubs.json"
NEO4J_IMPORT_FILE="/var/lib/neo4j/import/npub_updates.json"

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"

# Create temporary directory
mkdir -p "$TEMP_DIR"

# Function to log messages
log_message() {
    local message="$1"
    echo "$(date): $message"
    echo "$(date): $message" >> "$LOG_FILE"
}

# Function to cleanup temporary files
cleanup() {
    log_message "Cleaning up temporary files"
    rm -rf "$TEMP_DIR"
    sudo rm -f "$NEO4J_IMPORT_FILE" 2>/dev/null
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Start processing
log_message "Starting npubManager workflow"

# Step 1: Query Neo4j for NostrUsers missing npub property
log_message "Step 1: Querying Neo4j for users missing npub property"
if ! "$SCRIPT_DIR/queryMissingNpubs.sh" "$QUERY_RESULTS"; then
    log_message "ERROR: Failed to query missing npubs from Neo4j"
    exit 1
fi

# Check if we have any results
if [ ! -f "$QUERY_RESULTS" ] || [ ! -s "$QUERY_RESULTS" ]; then
    log_message "No users found missing npub property. Exiting."
    exit 0
fi

# Count records to process
RECORD_COUNT=$(jq length "$QUERY_RESULTS" 2>/dev/null || echo "0")
log_message "Found $RECORD_COUNT users missing npub property"

if [ "$RECORD_COUNT" -eq 0 ]; then
    log_message "No records to process. Exiting."
    exit 0
fi

# Step 2: Generate npubs using JavaScript
log_message "Step 2: Generating npubs using nip19.npubEncode"
if ! node "$SCRIPT_DIR/generateNpubs.js" "$QUERY_RESULTS" "$GENERATED_NPUBS"; then
    log_message "ERROR: Failed to generate npubs"
    exit 1
fi

# Validate generated file
if [ ! -f "$GENERATED_NPUBS" ] || [ ! -s "$GENERATED_NPUBS" ]; then
    log_message "ERROR: Generated npubs file is empty or missing"
    exit 1
fi

# Validate JSON structure
if ! jq empty "$GENERATED_NPUBS" 2>/dev/null; then
    log_message "ERROR: Generated npubs file contains invalid JSON"
    exit 1
fi

GENERATED_COUNT=$(jq length "$GENERATED_NPUBS" 2>/dev/null || echo "0")
log_message "Successfully generated $GENERATED_COUNT npubs"

# Step 3: Move file to Neo4j import directory
log_message "Step 3: Moving generated npubs to Neo4j import directory"
if ! sudo cp "$GENERATED_NPUBS" "$NEO4J_IMPORT_FILE"; then
    log_message "ERROR: Failed to copy file to Neo4j import directory"
    exit 1
fi

# Set proper permissions
sudo chown neo4j:neo4j "$NEO4J_IMPORT_FILE"
sudo chmod 644 "$NEO4J_IMPORT_FILE"

# Step 4: Update Neo4j with generated npubs
log_message "Step 4: Updating Neo4j with generated npubs"
if ! "$SCRIPT_DIR/updateNpubsInNeo4j.sh"; then
    log_message "ERROR: Failed to update npubs in Neo4j"
    exit 1
fi

# Step 5: Verify updates
log_message "Step 5: Verifying updates were successful"
UPDATED_COUNT=$(cypher-shell -u "$NEO4J_USERNAME" -p "$NEO4J_PASSWORD" \
    "MATCH (u:NostrUser) WHERE u.npub IS NOT NULL AND u.pubkey IS NOT NULL RETURN count(u) as total" \
    --format plain 2>/dev/null | tail -n 1 | tr -d '"' || echo "0")

log_message "Total NostrUsers with npub property: $UPDATED_COUNT"
log_message "npubManager workflow completed successfully"

exit 0
