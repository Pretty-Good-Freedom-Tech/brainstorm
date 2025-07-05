#!/bin/bash

# reconciliation.sh
# Main orchestration script for the Neo4j database reconciliation process

# Source environment configuration
source /etc/brainstorm.conf

# Create necessary directory structure
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
BASE_DIR="${SCRIPT_DIR}"
CSV_DIR="${BASE_DIR}/csv"
LOG_DIR=${BRAINSTORM_LOG_DIR:-"/var/log/brainstorm"}
APOC_COMMANDS_DIR="${BASE_DIR}/apocCypherCommands"

# Make sure directories exist
mkdir -p "${CSV_DIR}"
mkdir -p "${LOG_DIR}"
mkdir -p "${APOC_COMMANDS_DIR}"

# Log file path
LOG_FILE="${LOG_DIR}/reconciliation.log"

# Function for logging
log() {
  local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
  echo "${timestamp} - $1" | tee -a "${LOG_FILE}"
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
  
  # CSV directory size
  log "${label} - CSV directory size:"
  du -sh "${CSV_DIR}" | tee -a "${LOG_FILE}"
}

# Start reconciliation process
log "Starting reconciliation process"
check_disk_space "Before reconciliation"

# Step 1A: Extract current mutes from Neo4j
# populates currentRelationshipsFromNeo4j/mutes
log "Step 1A: Extracting current mutes from Neo4j"
START_TIME=$(date +%s)
node "${BASE_DIR}/getCurrentMutesFromNeo4j.js" \
  --neo4jUri="${NEO4J_URI}" \
  --neo4jUser="${NEO4J_USER}" \
  --neo4jPassword="${NEO4J_PASSWORD}" \
  --csvDir="${CSV_DIR}" \
  --logFile="${LOG_FILE}"
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
log "Completed extracting Neo4j mutes in ${DURATION} seconds"
check_disk_space "After Neo4j mutes extraction"

# Step 1B: Extract current follows from Neo4j
# populates currentRelationshipsFromNeo4j/follows
: <<'COMMENT_BLOCK'
log "Step 1B: Extracting current follows from Neo4j"
START_TIME=$(date +%s)
node "${BASE_DIR}/getCurrentFollowsFromNeo4j.js" \
  --neo4jUri="${NEO4J_URI}" \
  --neo4jUser="${NEO4J_USER}" \
  --neo4jPassword="${NEO4J_PASSWORD}" \
  --csvDir="${CSV_DIR}" \
  --logFile="${LOG_FILE}"
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
log "Completed extracting Neo4j follows in ${DURATION} seconds"
check_disk_space "After Neo4j follows extraction"
COMMENT_BLOCK

# Step 2A: convert kind 10000 events to mutes
# populates currentRelationshipsFromStrfry/mutes
log "Step 2A: Converting kind 10000 events to mutes"
sudo bash ${BASE_DIR}/strfryToKind10000Events.sh
node "${BASE_DIR}/kind10000EventsToMutes.js"
log "Completed converting kind 10000 events to mutes"
check_disk_space "After kind 10000 events to mutes"

# Step 2B: convert kind 3 events to follows
# populates currentRelationshipsFromStrfry/follows
: <<'COMMENT_BLOCK'
log "Step 2B: Converting kind 3 events to follows"
sudo bash ${BASE_DIR}/strfryToKind3Events.sh
node "${BASE_DIR}/kind3EventsToFollows.js"
log "Completed converting kind 3 events to follows"
check_disk_space "After kind 3 events to follows"
COMMENT_BLOCK

# Step 3: Compare relationships and create delta files
# Step 3A: create json files for adding and deleting mutes
# populates json/mutesToAddToNeo4j.json and json/mutesToDeleteFromNeo4j.json
log "Step 3A: Creating json files for adding and deleting mutes"
sudo node "${BASE_DIR}/calculateMutesUpdates.js"
log "Completed creating json files for adding and deleting mutes"
check_disk_space "After creating json files for adding and deleting mutes"

: <<'COMMENT_BLOCK'
# Step 3B: create json files for adding and deleting follows
# populates json/followsToAddToNeo4j.json and json/followsToDeleteFromNeo4j.json
log "Step 3B: Creating json files for adding and deleting follows"
sudo bash ${BASE_DIR}/calculateFollowsUpdates.sh
log "Completed creating json files for adding and deleting follows"
check_disk_space "After creating json files for adding and deleting follows"
COMMENT_BLOCK

# Step 4: Apply changes to Neo4j
log "Step 4: Applying changes to Neo4j"
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

: <<'COMMENT_BLOCK'
# Step 5: clean up
# clean up neo4j import folder
# clean up mutes
sudo rm /var/lib/neo4j/import/mutesToAddToNeo4j.json
sudo rm /var/lib/neo4j/import/allKind10000EventsStripped.json
sudo rm /var/lib/neo4j/import/mutesToDeleteFromNeo4j.json
# clean up reconciliation/json
# clean up reconciliation/currentRelationshipsFromStrfry
# clean up reconciliation/currentRelationshipsFromNeo4j
COMMENT_BLOCK

# Step 6: Log final stats
log "Step 6: Logging final statistics"
START_TIME=$(date +%s)
node "${BASE_DIR}/logFinalStats.js" \
  --neo4jUri="${NEO4J_URI}" \
  --neo4jUser="${NEO4J_USER}" \
  --neo4jPassword="${NEO4J_PASSWORD}" \
  --strfryDir="${STRFRY_DB_DIR}" \
  --logFile="${LOG_FILE}"
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
log "Completed logging final stats in ${DURATION} seconds"
check_disk_space "After reconciliation"

# Make script executable
chmod +x "${BASE_DIR}/reconciliation.sh"

log "Reconciliation process completed successfully"
