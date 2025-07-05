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
sudo bash ${BASE_DIR}/calculateMutesUpdates.sh
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


log "Step 3: Comparing relationships and creating delta files"
START_TIME=$(date +%s)
node "${BASE_DIR}/compareRelationships.js" \
  --csvDir="${CSV_DIR}" \
  --logFile="${LOG_FILE}"
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
log "Completed comparing relationships in ${DURATION} seconds"
check_disk_space "After comparison"

# Step 4: Apply changes to Neo4j
log "Step 4: Applying changes to Neo4j"

# 4.1: Create new NostrUser nodes
log "4.1: Creating new NostrUser nodes"
START_TIME=$(date +%s)
cat "${APOC_COMMANDS_DIR}/createNostrUsers.cypher" | \
  cypher-shell -u "${NEO4J_USER}" -p "${NEO4J_PASSWORD}" -a "${NEO4J_URI}" --format plain
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
log "Completed creating NostrUser nodes in ${DURATION} seconds"

# 4.2: Create new FOLLOWS relationships
log "4.2: Creating new FOLLOWS relationships"
START_TIME=$(date +%s)
cat "${APOC_COMMANDS_DIR}/createFollows.cypher" | \
  cypher-shell -u "${NEO4J_USER}" -p "${NEO4J_PASSWORD}" -a "${NEO4J_URI}" --format plain
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
log "Completed creating FOLLOWS relationships in ${DURATION} seconds"

# 4.3: Remove deprecated FOLLOWS relationships
log "4.3: Removing deprecated FOLLOWS relationships"
START_TIME=$(date +%s)
cat "${APOC_COMMANDS_DIR}/deleteFollows.cypher" | \
  cypher-shell -u "${NEO4J_USER}" -p "${NEO4J_PASSWORD}" -a "${NEO4J_URI}" --format plain
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
log "Completed removing FOLLOWS relationships in ${DURATION} seconds"

# 4.4: Create new MUTES relationships
log "4.4: Creating new MUTES relationships"
START_TIME=$(date +%s)
cat "${APOC_COMMANDS_DIR}/createMutes.cypher" | \
  cypher-shell -u "${NEO4J_USER}" -p "${NEO4J_PASSWORD}" -a "${NEO4J_URI}" --format plain
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
log "Completed creating MUTES relationships in ${DURATION} seconds"

# 4.5: Remove deprecated MUTES relationships
log "4.5: Removing deprecated MUTES relationships"
START_TIME=$(date +%s)
cat "${APOC_COMMANDS_DIR}/deleteMutes.cypher" | \
  cypher-shell -u "${NEO4J_USER}" -p "${NEO4J_PASSWORD}" -a "${NEO4J_URI}" --format plain
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
log "Completed removing MUTES relationships in ${DURATION} seconds"

# 4.6: Create new REPORTS relationships
log "4.6: Creating new REPORTS relationships"
START_TIME=$(date +%s)
cat "${APOC_COMMANDS_DIR}/createReports.cypher" | \
  cypher-shell -u "${NEO4J_USER}" -p "${NEO4J_PASSWORD}" -a "${NEO4J_URI}" --format plain
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
log "Completed creating REPORTS relationships in ${DURATION} seconds"

# Step 5: Log final stats
log "Step 5: Logging final statistics"
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
