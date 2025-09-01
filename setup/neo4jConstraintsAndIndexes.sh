#!/bin/bash
set -e          # Exit immediately on command failure
set -o pipefail # Fail if any pipeline command fails

# Brainstorm Neo4j Constraints and Indexes Setup
# This script sets up the necessary constraints and indexes for the Brainstorm project

source /etc/brainstorm.conf

# Source structured logging utilities
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

touch ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log

echo "$(date): Starting neo4jConstraintsAndIndexes"
echo "$(date): Starting neo4jConstraintsAndIndexes" >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log

# Emit structured event for task start
emit_task_event "TASK_START" "neo4jConstraintsAndIndexes" "system" '{
    "message": "Starting Neo4j constraints and indexes setup",
    "task_type": "database_maintenance",
    "database": "neo4j",
    "operation": "constraints_and_indexes_setup",
    "category": "maintenance",
    "scope": "system",
    "parent_task": "processAllTasks"
}'

NEO4J_URI="bolt://localhost:7687"
NEO4J_USER="neo4j"
# Get the Neo4j password from the Brainstorm configuration
if [ -f "/etc/brainstorm.conf" ]; then
  source /etc/brainstorm.conf
  NEO4J_PASSWORD=${NEO4J_PASSWORD:-neo4j}
else
  NEO4J_PASSWORD="neo4j"
  echo "Warning: /etc/brainstorm.conf not found, using default Neo4j password"
fi

# Cypher command to set up constraints and indexes

CYPHER_COMMAND="
CREATE CONSTRAINT nostrUser_pubkey IF NOT EXISTS FOR (n:NostrUser) REQUIRE n.pubkey IS UNIQUE;
CREATE INDEX nostrUser_hops IF NOT EXISTS FOR (n:NostrUser) ON (n.hops);
CREATE INDEX nostrUser_personalizedPageRank IF NOT EXISTS FOR (n:NostrUser) ON (n.personalizedPageRank);

CREATE INDEX nostrUser_influence IF NOT EXISTS FOR (n:NostrUser) ON (n.influence);

CREATE INDEX nostrUser_verifiedFollowerCount IF NOT EXISTS FOR (n:NostrUser) ON (n.verifiedFollowerCount);
CREATE INDEX nostrUser_verifiedMuterCount IF NOT EXISTS FOR (n:NostrUser) ON (n.verifiedMuterCount);
CREATE INDEX nostrUser_verifiedReporterCount IF NOT EXISTS FOR (n:NostrUser) ON (n.verifiedReporterCount);

CREATE INDEX nostrUser_followerInput IF NOT EXISTS FOR (n:NostrUser) ON (n.followerInput);

CREATE CONSTRAINT SetOfNostrUserWotMetricsCards_observee_pubkey IF NOT EXISTS FOR (n:SetOfNostrUserWotMetricsCards) REQUIRE n.observee_pubkey IS UNIQUE;
CREATE CONSTRAINT nostrUserWotMetricsCard_unique_combination_1 IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) REQUIRE (n.customer_id, n.observee_pubkey) IS UNIQUE;
CREATE CONSTRAINT nostrUserWotMetricsCard_unique_combination_2 IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) REQUIRE (n.observer_pubkey, n.observee_pubkey) IS UNIQUE;
CREATE INDEX nostrUserWotMetricsCard_customer_id IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.customer_id);
CREATE INDEX nostrUserWotMetricsCard_observer_pubkey IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.observer_pubkey);
CREATE INDEX nostrUserWotMetricsCard_observee_pubkey IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.observee_pubkey);

CREATE INDEX nostrUserWotMetricsCard_hops IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.hops);
CREATE INDEX nostrUserWotMetricsCard_personalizedPageRank IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.personalizedPageRank);
CREATE INDEX nostrUserWotMetricsCard_influence IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.influence);

CREATE INDEX nostrUserWotMetricsCard_verifiedFollowerCount IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.verifiedFollowerCount);
CREATE INDEX nostrUserWotMetricsCard_verifiedMuterCount IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.verifiedMuterCount);
CREATE INDEX nostrUserWotMetricsCard_verifiedReporterCount IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.verifiedReporterCount);

CREATE INDEX nostrUserWotMetricsCard_followerInput IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.followerInput);
"

# Emit structured event for constraint/index creation phase
emit_task_event "PROGRESS" "neo4jConstraintsAndIndexes" "system" '{
    "message": "Creating Neo4j constraints and indexes",
    "phase": "creation",
    "step": "cypher_execution",
    "database": "neo4j",
    "operation": "constraints_and_indexes_setup",
    "auth_method": "stored_password"
}'

# Run Cypher commands with stored password
echo "$(date): Running Cypher commands to create constraints and indexes..." >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_COMMAND" >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log 2>&1
STORED_PASSWORD_RESULT=$?

# If stored password failed, try with default password
if [ $STORED_PASSWORD_RESULT -ne 0 ]; then
    # Emit structured event for password fallback
    emit_task_event "PROGRESS" "neo4jConstraintsAndIndexes" "system" '{
        "message": "Stored password failed, trying default password",
        "phase": "creation",
        "step": "password_fallback",
        "database": "neo4j",
        "auth_method": "default_password",
        "fallback_reason": "stored_password_failed"
    }'
    
    echo "$(date): First attempt failed, trying with default password..." >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p neo4j "$CYPHER_COMMAND" >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log 2>&1
    DEFAULT_PASSWORD_RESULT=$?
else
    DEFAULT_PASSWORD_RESULT=0
fi

# Emit structured event for verification phase
emit_task_event "PROGRESS" "neo4jConstraintsAndIndexes" "system" '{
    "message": "Verifying constraints and indexes creation",
    "phase": "verification",
    "step": "constraint_index_check",
    "database": "neo4j",
    "operation": "verification"
}'

# Verify that constraints and indexes were created successfully
echo "$(date): Verifying constraints and indexes were created successfully..." >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log

# Check for the primary constraint that should exist
# VERIFY_COMMAND="MATCH (n:NostrUser) WHERE n.pubkey = 'verification_check' RETURN n LIMIT 1;"
SHOW_CONSTRAINTS="SHOW CONSTRAINTS;"
SHOW_INDEXES="SHOW INDEXES;"

# Try with stored password first
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$SHOW_CONSTRAINTS" > /tmp/neo4j_constraints.txt 2>&1
SHOW_CONSTRAINTS_RESULT=$?

# If that fails, try with default password
if [ $SHOW_CONSTRAINTS_RESULT -ne 0 ]; then
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p neo4j "$SHOW_CONSTRAINTS" > /tmp/neo4j_constraints.txt 2>&1
    SHOW_CONSTRAINTS_RESULT=$?
fi

# Check if the primary constraint exists
CONSTRAINT_COUNT_USER=$(grep -c "nostrUser_pubkey" /tmp/neo4j_constraints.txt 2>/dev/null || echo "0")
CONSTRAINT_COUNT_EVENT=$(grep -c "nostrEvent_event_id" /tmp/neo4j_constraints.txt 2>/dev/null || echo "0")
# Clean up any whitespace/newlines and ensure we have valid numbers
CONSTRAINT_COUNT_USER=$(echo "$CONSTRAINT_COUNT_USER" | tr -d '\n\r' | grep -o '[0-9]*' | head -1)
CONSTRAINT_COUNT_EVENT=$(echo "$CONSTRAINT_COUNT_EVENT" | tr -d '\n\r' | grep -o '[0-9]*' | head -1)
# Set defaults if empty
CONSTRAINT_COUNT_USER=${CONSTRAINT_COUNT_USER:-0}
CONSTRAINT_COUNT_EVENT=${CONSTRAINT_COUNT_EVENT:-0}
CONSTRAINT_COUNT=$((CONSTRAINT_COUNT_USER + CONSTRAINT_COUNT_EVENT))

# Show the indexes
if [ $SHOW_CONSTRAINTS_RESULT -eq 0 ]; then
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$SHOW_INDEXES" > /tmp/neo4j_indexes.txt 2>&1 || \
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p neo4j "$SHOW_INDEXES" > /tmp/neo4j_indexes.txt 2>&1
    
    # Count indexes
    INDEX_COUNT_USER=$(grep -c "nostrUser_" /tmp/neo4j_indexes.txt 2>/dev/null || echo "0")
    INDEX_COUNT_EVENT=$(grep -c "nostrEvent_" /tmp/neo4j_indexes.txt 2>/dev/null || echo "0")
    # Clean up any whitespace/newlines and ensure we have valid numbers
    INDEX_COUNT_USER=$(echo "$INDEX_COUNT_USER" | tr -d '\n\r' | grep -o '[0-9]*' | head -1)
    INDEX_COUNT_EVENT=$(echo "$INDEX_COUNT_EVENT" | tr -d '\n\r' | grep -o '[0-9]*' | head -1)
    # Set defaults if empty
    INDEX_COUNT_USER=${INDEX_COUNT_USER:-0}
    INDEX_COUNT_EVENT=${INDEX_COUNT_EVENT:-0}
    INDEX_COUNT=$((INDEX_COUNT_USER + INDEX_COUNT_EVENT))
else
    INDEX_COUNT=0
fi

# Clean up temporary files
rm -f /tmp/neo4j_constraints.txt /tmp/neo4j_indexes.txt

# Emit structured event for verification results
oMetadata=$(jq -n \
    --arg message "Verification results obtained" \
    --arg phase "verification" \
    --arg step "results_analysis" \
    --arg database "neo4j" \
    --argjson constraints_found "$CONSTRAINT_COUNT" \
    --argjson indexes_found "$INDEX_COUNT" \
    --argjson constraint_count_user "$CONSTRAINT_COUNT_USER" \
    --argjson constraint_count_event "$CONSTRAINT_COUNT_EVENT" \
    --argjson index_count_user "$INDEX_COUNT_USER" \
    --argjson index_count_event "$INDEX_COUNT_EVENT" \
    '{
        "message": $message,
        "phase": $phase,
        "step": $step,
        "database": $database,
        "constraints_found": $constraints_found,
        "indexes_found": $indexes_found,
        "constraint_count_user": $constraint_count_user,
        "constraint_count_event": $constraint_count_event,
        "index_count_user": $index_count_user,
        "index_count_event": $index_count_event
    }')
emit_task_event "PROGRESS" "neo4jConstraintsAndIndexes" "system" "$oMetadata"

# Log results
echo "$(date): Constraint check result: $CONSTRAINT_COUNT constraints found" >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log
echo "$(date): Index check result: $INDEX_COUNT indexes found" >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log

# Update timestamp only if the commands were successful and the constraints/indexes exist
if [ $STORED_PASSWORD_RESULT -eq 0 -o $DEFAULT_PASSWORD_RESULT -eq 0 ] && [ $CONSTRAINT_COUNT -gt 0 ] && [ $INDEX_COUNT -gt 0 ]; then
    # Emit structured event for configuration update
    emit_task_event "PROGRESS" "neo4jConstraintsAndIndexes" "system" '{
        "message": "Updating configuration timestamp",
        "phase": "configuration_update",
        "step": "timestamp_update",
        "config_file": "/etc/brainstorm.conf",
        "config_key": "BRAINSTORM_CREATED_CONSTRAINTS_AND_INDEXES"
    }'
    
    # Update BRAINSTORM_CREATED_CONSTRAINTS_AND_INDEXES in brainstorm.conf with current timestamp
    CURRENT_TIMESTAMP=$(date +%s)
    echo "$(date): Setting BRAINSTORM_CREATED_CONSTRAINTS_AND_INDEXES=$CURRENT_TIMESTAMP in /etc/brainstorm.conf" >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log

    # Use sed to replace the line in brainstorm.conf
    sudo sed -i "s/^export BRAINSTORM_CREATED_CONSTRAINTS_AND_INDEXES=.*$/export BRAINSTORM_CREATED_CONSTRAINTS_AND_INDEXES=$CURRENT_TIMESTAMP/" /etc/brainstorm.conf
    
    # Emit structured event for successful completion
    oMetadata=$(jq -n \
        --arg message "Neo4j constraints and indexes setup completed successfully" \
        --arg status "success" \
        --arg task_type "database_maintenance" \
        --arg database "neo4j" \
        --argjson constraints_created "$CONSTRAINT_COUNT" \
        --argjson indexes_created "$INDEX_COUNT" \
        --argjson config_updated true \
        --argjson timestamp "$CURRENT_TIMESTAMP" \
        --arg category "maintenance" \
        --arg scope "system" \
        --arg parent_task "processAllTasks" \
        '{
            "message": $message,
            "status": $status,
            "task_type": $task_type,
            "database": $database,
            "constraints_created": $constraints_created,
            "indexes_created": $indexes_created,
            "config_updated": $config_updated,
            "timestamp": $timestamp,
            "category": $category,
            "scope": $scope,
            "parent_task": $parent_task
        }')
    emit_task_event "TASK_END" "neo4jConstraintsAndIndexes" "system" "$oMetadata"
    
    echo "Neo4j constraints and indexes have been set up successfully."
    echo "$(date): Finished neo4jConstraintsAndIndexes - SUCCESS" >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log
    exit 0  # Explicit success exit code for parent script orchestration
else
    # Emit structured event for failed completion
    oMetadata=$(jq -n \
        --arg message "Neo4j constraints and indexes setup failed" \
        --arg status "failed" \
        --arg task_type "database_maintenance" \
        --arg database "neo4j" \
        --argjson stored_password_result "$STORED_PASSWORD_RESULT" \
        --argjson default_password_result "$DEFAULT_PASSWORD_RESULT" \
        --argjson constraints_found "$CONSTRAINT_COUNT" \
        --argjson indexes_found "$INDEX_COUNT" \
        --arg error_reason "insufficient_constraints_or_indexes" \
        --arg category "maintenance" \
        --arg scope "system" \
        --arg parent_task "processAllTasks" \
        '{
            "message": $message,
            "status": $status,
            "task_type": $task_type,
            "database": $database,
            "stored_password_result": $stored_password_result,
            "default_password_result": $default_password_result,
            "constraints_found": $constraints_found,
            "indexes_found": $indexes_found,
            "error_reason": $error_reason,
            "category": $category,
            "scope": $scope,
            "parent_task": $parent_task
        }')
    emit_task_event "TASK_ERROR" "neo4jConstraintsAndIndexes" "system" "$oMetadata"
    
    echo "Failed to set up Neo4j constraints and indexes. Check the log at ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log"
    echo "$(date): Finished neo4jConstraintsAndIndexes - FAILED" >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log
    exit 1
fi

echo "You can verify by running 'SHOW CONSTRAINTS;' and 'SHOW INDEXES;' in the Neo4j Browser."
echo "$(date): Finished neo4jConstraintsAndIndexes - SUCCESS" >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log
exit 0

