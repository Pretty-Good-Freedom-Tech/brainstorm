#!/bin/bash

# reconciliation.sh
# Main orchestration script for the Neo4j database reconciliation process

# Source environment configuration
source /etc/brainstorm.conf

# Create necessary directory structure
# SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
# BASE_DIR="${SCRIPT_DIR}"
BASE_DIR_RECONCILIATION="/usr/local/lib/node_modules/brainstorm/src/pipeline/reconciliation"
# TODO: define BASE_DIR_RECONCILIATION in brainstorm.conf
BASE_DIR=${BASE_DIR_RECONCILIATION:-"/usr/local/lib/node_modules/brainstorm/src/pipeline/reconciliation"}
LOG_DIR=${BRAINSTORM_LOG_DIR:-"/var/log/brainstorm"}
APOC_COMMANDS_DIR="${BASE_DIR}/apocCypherCommands"

# Make sure directories exist
# mkdir -p "${LOG_DIR}"
mkdir -p "${APOC_COMMANDS_DIR}"

# Log file path
LOG_FILE="${LOG_DIR}/reconciliation.log"

# Create log file and set permissions
touch $LOG_FILE
sudo chown brainstorm:brainstorm $LOG_FILE

# Function for logging
log() {
  echo "$(date): $1" | tee -a "${LOG_FILE}"
}

# Function to check disk space
check_disk_space() {
  local label=$1
  log "${label} - Checking disk space"
  
  # Overall disk usage
  log "${label} - Overall disk usage:"
  df -h / | tee -a "${LOG_FILE}"
  
  # Neo4j data directory size
  log "${label} - Neo4j data directory size:"
  du -sh /var/lib/neo4j/data | tee -a "${LOG_FILE}"
  
  # Neo4j transaction logs size
  log "${label} - Neo4j transaction logs size:"
  du -sh /var/lib/neo4j/data/transactions | tee -a "${LOG_FILE}"
}

# create function for cleaning up
function cleanup() {
  # clean up neo4j import folder
  # clean up mutes
  sudo rm /var/lib/neo4j/import/mutesToAddToNeo4j.json
  sudo rm /var/lib/neo4j/import/allKind10000EventsStripped.json
  sudo rm /var/lib/neo4j/import/mutesToDeleteFromNeo4j.json
  # clean up follows
  sudo rm /var/lib/neo4j/import/followsToAddToNeo4j.json
  sudo rm /var/lib/neo4j/import/allKind3EventsStripped.json
  sudo rm /var/lib/neo4j/import/followsToDeleteFromNeo4j.json
  # clean up reports
  sudo rm /var/lib/neo4j/import/reportsToAddToNeo4j.json
  sudo rm /var/lib/neo4j/import/allKind1984EventsStripped.json
  # sudo rm /var/lib/neo4j/import/reportsToDeleteFromNeo4j.json

  # clean up current relationships from base directory
  sudo rm $BASE_DIR/currentMutesFromStrfry.json
  sudo rm $BASE_DIR/currentFollowsFromStrfry.json
  sudo rm $BASE_DIR/currentReportsFromStrfry.json

  # clean up reconciliation/currentRelationshipsFromStrfry
  sudo rm -rf $BASE_DIR/currentRelationshipsFromStrfry
  # recreate currentRelationshipsFromStrfry/follows, currentRelationshipsFromStrfry/mutes, and currentRelationshipsFromStrfry/reports
  sudo mkdir -p $BASE_DIR/currentRelationshipsFromStrfry/follows
  sudo mkdir -p $BASE_DIR/currentRelationshipsFromStrfry/mutes
  sudo mkdir -p $BASE_DIR/currentRelationshipsFromStrfry/reports

  sudo chown -R brainstorm:brainstorm $BASE_DIR/currentRelationshipsFromStrfry

  # clean up reconciliation/currentRelationshipsFromNeo4j
  sudo rm -rf $BASE_DIR/currentRelationshipsFromNeo4j
  # recreate currentRelationshipsFromNeo4j/follows, currentRelationshipsFromNeo4j/mutes, and currentRelationshipsFromNeo4j/reports
  sudo mkdir -p $BASE_DIR/currentRelationshipsFromNeo4j/follows
  sudo mkdir -p $BASE_DIR/currentRelationshipsFromNeo4j/mutes
  sudo mkdir -p $BASE_DIR/currentRelationshipsFromNeo4j/reports

  sudo chown -R brainstorm:brainstorm $BASE_DIR/currentRelationshipsFromNeo4j

  log "Completed cleanup"
}

# Start reconciliation process
log "Starting reconciliation"
check_disk_space "Before reconciliation"

# cleanup, to cover possibility that the prior reconciliation process was interrupted
cleanup

#############################################
# A: PROCESS MUTES
#############################################

# Step 1A: Extract current mutes from Neo4j
# populates currentRelationshipsFromNeo4j/mutes
log "Step 1A: Extracting current mutes from Neo4j"
START_TIME=$(date +%s)
node "${BASE_DIR}/getCurrentMutesFromNeo4j.js" \
  --neo4jUri="${NEO4J_URI}" \
  --neo4jUser="${NEO4J_USER}" \
  --neo4jPassword="${NEO4J_PASSWORD}" \
  --logFile="${LOG_FILE}"
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
log "Completed extracting Neo4j mutes in ${DURATION} seconds"
# check_disk_space "After Neo4j mutes extraction"

# Step 2A: convert kind 10000 events to mutes
# populates currentRelationshipsFromStrfry/mutes
log "Step 2A: Converting kind 10000 events to mutes"
sudo bash ${BASE_DIR}/strfryToKind10000Events.sh
node "${BASE_DIR}/kind10000EventsToMutes.js"
log "Completed converting kind 10000 events to mutes"
# check_disk_space "After kind 10000 events to mutes"

# Step 3A: create json files for adding and deleting mutes
# populates json/mutesToAddToNeo4j.json and json/mutesToDeleteFromNeo4j.json
log "Step 3A: Creating json files for adding and deleting mutes"
sudo node "${BASE_DIR}/calculateMutesUpdates.js"
log "Completed creating json files for adding and deleting mutes"
# check_disk_space "After creating json files for adding and deleting mutes"

# Step 4A: Apply mutes to Neo4j
log "Step 4A: Applying mutes to Neo4j"
# add MUTES relationships from mutesToAddToNeo4j.json
# move mutesToAddToNeo4j.json from json folder to /var/lib/neo4j/import
sudo mv $BASE_DIR/json/mutesToAddToNeo4j.json /var/lib/neo4j/import/mutesToAddToNeo4j.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand1_mutesToAddToNeo4j" > /dev/null
# delete MUTES relationships from mutesToDeleteFromNeo4j.json
sudo mv $BASE_DIR/json/mutesToDeleteFromNeo4j.json /var/lib/neo4j/import/mutesToDeleteFromNeo4j.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand1_mutesToDeleteFromNeo4j" > /dev/null
# move allKind10000EventsStripped.json from base folder to /var/lib/neo4j/import
sudo mv $BASE_DIR/allKind10000EventsStripped.json /var/lib/neo4j/import/allKind10000EventsStripped.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand2_mutes" > /dev/null
log "Step 4A completed applying mutes to Neo4j"

#############################################
# C: PROCESS REPORTS
#############################################

# Step 1C: Extract current reports from Neo4j
# populates currentRelationshipsFromNeo4j/reports
log "Step 1C: Extracting current reports from Neo4j"
START_TIME=$(date +%s)
node "${BASE_DIR}/getCurrentReportsFromNeo4j.js" \
  --neo4jUri="${NEO4J_URI}" \
  --neo4jUser="${NEO4J_USER}" \
  --neo4jPassword="${NEO4J_PASSWORD}" \
  --logFile="${LOG_FILE}"
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
log "Completed extracting Neo4j reports in ${DURATION} seconds"
# check_disk_space "After Neo4j reports extraction"

# Step 2C: convert kind 1984 events to reports
# populates currentRelationshipsFromStrfry/reports
log "Step 2C: Converting kind 1984 events to reports"
sudo bash ${BASE_DIR}/strfryToKind1984Events.sh
node "${BASE_DIR}/kind1984EventsToReports.js"
log "Completed converting kind 1984 events to reports"
# check_disk_space "After kind 1984 events to reports"

# Step 3C: create json files for adding and deleting reports
# populates json/reportsToAddToNeo4j.json and json/reportsToDeleteFromNeo4j.json
log "Step 3C: Creating json files for adding and deleting reports"
sudo node "${BASE_DIR}/calculateReportsUpdates.js"
log "Completed creating json files for adding and deleting reports"
# check_disk_space "After creating json files for adding and deleting reports"

# Step 4C: Apply reports to Neo4j
log "Step 4C: Applying reports to Neo4j"
# add REPORTS relationships from reportsToAddToNeo4j.json
# move reportsToAddToNeo4j.json from json folder to /var/lib/neo4j/import
sudo mv $BASE_DIR/json/reportsToAddToNeo4j.json /var/lib/neo4j/import/reportsToAddToNeo4j.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand1_reportsToAddToNeo4j" > /dev/null
# delete REPORTS relationships from reportsToDeleteFromNeo4j.json
# sudo mv $BASE_DIR/json/reportsToDeleteFromNeo4j.json /var/lib/neo4j/import/reportsToDeleteFromNeo4j.json
# sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand1_reportsToDeleteFromNeo4j" > /dev/null
# move allKind1984EventsStripped.json from base folder to /var/lib/neo4j/import
sudo mv $BASE_DIR/allKind1984EventsStripped.json /var/lib/neo4j/import/allKind1984EventsStripped.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand2_reports" > /dev/null
log "Step 4C completed applying reports to Neo4j"

#############################################
# B: PROCESS FOLLOWS
#############################################

# Step 1B: Extract current follows from Neo4j
# populates currentRelationshipsFromNeo4j/follows
log "Step 1B: Extracting current follows from Neo4j"
START_TIME=$(date +%s)
node "${BASE_DIR}/getCurrentFollowsFromNeo4j.js" \
  --neo4jUri="${NEO4J_URI}" \
  --neo4jUser="${NEO4J_USER}" \
  --neo4jPassword="${NEO4J_PASSWORD}" \
  --logFile="${LOG_FILE}"
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
log "Completed extracting Neo4j follows in ${DURATION} seconds"
# check_disk_space "After Neo4j follows extraction"

# Step 2B: convert kind 3 events to follows
# populates currentRelationshipsFromStrfry/follows
log "Step 2B: Converting kind 3 events to follows"
sudo bash ${BASE_DIR}/strfryToKind3Events.sh
node "${BASE_DIR}/kind3EventsToFollows.js"
log "Completed converting kind 3 events to follows"
# check_disk_space "After kind 3 events to follows"

# Step 3B: create json files for adding and deleting follows
# populates json/followsToAddToNeo4j.json and json/followsToDeleteFromNeo4j.json
log "Step 3B: Creating json files for adding and deleting follows"
sudo node "${BASE_DIR}/calculateFollowsUpdates.js"
log "Completed creating json files for adding and deleting follows"
# check_disk_space "After creating json files for adding and deleting follows"

# Step 4B: Apply follows to Neo4j
log "Step 4B: Applying follows to Neo4j"
# add FOLLOWS relationships from followsToAddToNeo4j.json
# move followsToAddToNeo4j.json from json folder to /var/lib/neo4j/import
sudo mv $BASE_DIR/json/followsToAddToNeo4j.json /var/lib/neo4j/import/followsToAddToNeo4j.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand1_followsToAddToNeo4j" > /dev/null
# delete FOLLOWS relationships from followsToDeleteFromNeo4j.json
sudo mv $BASE_DIR/json/followsToDeleteFromNeo4j.json /var/lib/neo4j/import/followsToDeleteFromNeo4j.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand1_followsToDeleteFromNeo4j" > /dev/null
# move allKind3EventsStripped.json from base folder to /var/lib/neo4j/import
sudo mv $BASE_DIR/allKind3EventsStripped.json /var/lib/neo4j/import/allKind3EventsStripped.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand2_follows" > /dev/null
log "Step 4B completed applying follows to Neo4j"

# CLEAN UP

cleanup

: <<'COMMENT_BLOCK'
# foo
COMMENT_BLOCK

check_disk_space "At end of reconciliation"

log "Finished reconciliation"
