#!/bin/bash

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_OWNER_PUBKEY, BRAINSTORM_LOG_DIR, BRAINSTORM_MODULE_ALGOS_DIR

# Source structured logging utilities
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

# Check if customer_pubkey, customer_id, and customer_name are provided
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then
    echo "Usage: $0 <customer_pubkey> <customer_id> <customer_name>"
    exit 1
fi

# Get customer_pubkey
CUSTOMER_PUBKEY="$1"

# Get customer_id
CUSTOMER_ID="$2"

# Get customer_name
CUSTOMER_NAME="$3"

# Get log directory
LOG_DIR="$BRAINSTORM_LOG_DIR/customers/$CUSTOMER_NAME"

# Create log directory if it doesn't exist; chown to brainstorm:brainstorm
mkdir -p "$LOG_DIR"
sudo chown brainstorm:brainstorm "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/personalizedGrapeRank.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

echo "$(date): Starting personalizedGrapeRank for CUSTOMER_NAME: $CUSTOMER_NAME CUSTOMER_ID: $CUSTOMER_ID CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY"
echo "$(date): Starting personalizedGrapeRank for CUSTOMER_NAME: $CUSTOMER_NAME CUSTOMER_ID: $CUSTOMER_ID CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY" >> ${LOG_FILE}

# Emit structured event for task start
emit_task_event "TASK_START" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
    "customer_id": "'$CUSTOMER_ID'",
    "customer_pubkey": "'$CUSTOMER_PUBKEY'",
    "customer_name": "'$CUSTOMER_NAME'",
    "message": "Starting customer-specific GrapeRank calculation",
    "task_type": "customer_algorithm",
    "algorithm": "personalized_graperank",
    "scope": "customer",
    "child_processes": 5,
    "phases": ["csv_initialization", "ratings_interpretation", "scorecards_initialization", "graperank_calculation", "neo4j_update"],
    "category": "algorithms",
    "parent_task": "updateAllScoresForSingleCustomer"
}'

# initialize raw data csv files. Note that this step is not customer-specific, i.e. it is the same for all customers
# First determine whether the csv files already exist in location: /var/lib/brainstorm/algos/personalizedGrapeRank/tmp
# If files already exist, echo that we are skipping this step
if [ ! -f /var/lib/brainstorm/algos/personalizedGrapeRank/tmp/follows.csv ] && [ ! -f /var/lib/brainstorm/algos/personalizedGrapeRank/tmp/mutes.csv ] && [ ! -f /var/lib/brainstorm/algos/personalizedGrapeRank/tmp/reports.csv ] && [ ! -f /var/lib/brainstorm/algos/personalizedGrapeRank/tmp/ratees.csv ]; then
    echo "$(date): Continuing personalizedGrapeRank; starting initializeRawDataCsv.sh"
    echo "$(date): Continuing personalizedGrapeRank; starting initializeRawDataCsv.sh" >> ${LOG_FILE}
    
    # Emit structured event for CSV initialization start
    emit_task_event "PROGRESS" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
        "customer_id": "'$CUSTOMER_ID'",
        "customer_pubkey": "'$CUSTOMER_PUBKEY'",
        "customer_name": "'$CUSTOMER_NAME'",
        "message": "Starting CSV data initialization",
        "phase": "csv_initialization",
        "step": "initialize_raw_data_csv",
        "child_script": "initializeRawDataCsv.sh",
        "algorithm": "personalized_graperank"
    }'
    
    if sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/personalizedGrapeRank/initializeRawDataCsv.sh; then
        # Emit structured event for CSV initialization success
        emit_task_event "PROGRESS" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
            "customer_id": "'$CUSTOMER_ID'",
            "customer_pubkey": "'$CUSTOMER_PUBKEY'",
            "customer_name": "'$CUSTOMER_NAME'",
            "message": "CSV data initialization completed successfully",
            "phase": "csv_initialization",
            "step": "initialize_raw_data_csv_complete",
            "child_script": "initializeRawDataCsv.sh",
            "status": "success",
            "algorithm": "personalized_graperank"
        }'
    else
        # Emit structured event for CSV initialization failure
        emit_task_event "TASK_ERROR" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
            "customer_id": "'$CUSTOMER_ID'",
            "customer_pubkey": "'$CUSTOMER_PUBKEY'",
            "customer_name": "'$CUSTOMER_NAME'",
            "message": "CSV data initialization failed",
            "status": "failed",
            "task_type": "customer_algorithm",
            "algorithm": "personalized_graperank",
            "child_script": "initializeRawDataCsv.sh",
            "error_reason": "child_script_failure",
            "category": "algorithms",
            "scope": "customer",
            "parent_task": "updateAllScoresForSingleCustomer"
        }'
        exit 1
    fi
else
    echo "$(date): Continuing personalizedGrapeRank; skipping initializeRawDataCsv because csv files already exist"
    echo "$(date): Continuing personalizedGrapeRank; skipping initializeRawDataCsv because csv files already exist" >> ${LOG_FILE}
    
    # Emit structured event for CSV initialization skip
    emit_task_event "PROGRESS" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
        "customer_id": "'$CUSTOMER_ID'",
        "customer_pubkey": "'$CUSTOMER_PUBKEY'",
        "customer_name": "'$CUSTOMER_NAME'",
        "message": "CSV data initialization skipped - files already exist",
        "phase": "csv_initialization",
        "step": "skip_existing_csv_files",
        "status": "skipped",
        "algorithm": "personalized_graperank"
    }'
fi

echo "$(date): Continuing personalizedGrapeRank; starting interpretRatings.js"
echo "$(date): Continuing personalizedGrapeRank; starting interpretRatings.js" >> ${LOG_FILE}

# Emit structured event for ratings interpretation start
emit_task_event "PROGRESS" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
    "customer_id": "'$CUSTOMER_ID'",
    "customer_pubkey": "'$CUSTOMER_PUBKEY'",
    "customer_name": "'$CUSTOMER_NAME'",
    "message": "Starting ratings interpretation",
    "phase": "ratings_interpretation",
    "step": "interpret_ratings",
    "child_script": "interpretRatings.js",
    "algorithm": "personalized_graperank"
}'

# Interpret ratings. Pass CUSTOMER_PUBKEY, CUSTOMER_ID, and CUSTOMER_NAME as arguments to interpretRatings.js
if sudo node $BRAINSTORM_MODULE_ALGOS_DIR/customers/personalizedGrapeRank/interpretRatings.js $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME; then
    # Emit structured event for ratings interpretation success
    emit_task_event "PROGRESS" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
        "customer_id": "'$CUSTOMER_ID'",
        "customer_pubkey": "'$CUSTOMER_PUBKEY'",
        "customer_name": "'$CUSTOMER_NAME'",
        "message": "Ratings interpretation completed successfully",
        "phase": "ratings_interpretation",
        "step": "interpret_ratings_complete",
        "child_script": "interpretRatings.js",
        "status": "success",
        "algorithm": "personalized_graperank"
    }'
else
    # Emit structured event for ratings interpretation failure
    emit_task_event "TASK_ERROR" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
        "customer_id": "'$CUSTOMER_ID'",
        "customer_pubkey": "'$CUSTOMER_PUBKEY'",
        "customer_name": "'$CUSTOMER_NAME'",
        "message": "Ratings interpretation failed",
        "status": "failed",
        "task_type": "customer_algorithm",
        "algorithm": "personalized_graperank",
        "child_script": "interpretRatings.js",
        "error_reason": "child_script_failure",
        "category": "algorithms",
        "scope": "customer",
        "parent_task": "updateAllScoresForSingleCustomer"
    }'
    exit 1
fi

echo "$(date): Continuing personalizedGrapeRank; starting initializeScorecards.js"
echo "$(date): Continuing personalizedGrapeRank; starting initializeScorecards.js" >> ${LOG_FILE}

# Emit structured event for scorecards initialization start
emit_task_event "PROGRESS" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
    "customer_id": "'$CUSTOMER_ID'",
    "customer_pubkey": "'$CUSTOMER_PUBKEY'",
    "customer_name": "'$CUSTOMER_NAME'",
    "message": "Starting scorecards initialization",
    "phase": "scorecards_initialization",
    "step": "initialize_scorecards",
    "child_script": "initializeScorecards.js",
    "algorithm": "personalized_graperank"
}'

# Initialize scorecards
# TODO: initialize from neo4j if scores already exist
# TODO: edit test changes to this file. scorecards_init.json should be in the customer-specific directory
if sudo node $BRAINSTORM_MODULE_ALGOS_DIR/customers/personalizedGrapeRank/initializeScorecards.js $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME; then
    # Emit structured event for scorecards initialization success
    emit_task_event "PROGRESS" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
        "customer_id": "'$CUSTOMER_ID'",
        "customer_pubkey": "'$CUSTOMER_PUBKEY'",
        "customer_name": "'$CUSTOMER_NAME'",
        "message": "Scorecards initialization completed successfully",
        "phase": "scorecards_initialization",
        "step": "initialize_scorecards_complete",
        "child_script": "initializeScorecards.js",
        "status": "success",
        "algorithm": "personalized_graperank"
    }'
else
    # Emit structured event for scorecards initialization failure
    emit_task_event "TASK_ERROR" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
        "customer_id": "'$CUSTOMER_ID'",
        "customer_pubkey": "'$CUSTOMER_PUBKEY'",
        "customer_name": "'$CUSTOMER_NAME'",
        "message": "Scorecards initialization failed",
        "status": "failed",
        "task_type": "customer_algorithm",
        "algorithm": "personalized_graperank",
        "child_script": "initializeScorecards.js",
        "error_reason": "child_script_failure",
        "category": "algorithms",
        "scope": "customer",
        "parent_task": "updateAllScoresForSingleCustomer"
    }'
    exit 1
fi

echo "$(date): Continuing personalizedGrapeRank; starting calculateGrapeRank.js"
echo "$(date): Continuing personalizedGrapeRank; starting calculateGrapeRank.js" >> ${LOG_FILE}

# Emit structured event for GrapeRank calculation start
emit_task_event "PROGRESS" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
    "customer_id": "'$CUSTOMER_ID'",
    "customer_pubkey": "'$CUSTOMER_PUBKEY'",
    "customer_name": "'$CUSTOMER_NAME'",
    "message": "Starting GrapeRank calculation",
    "phase": "graperank_calculation",
    "step": "calculate_graperank",
    "child_script": "calculateGrapeRank.js",
    "algorithm": "personalized_graperank"
}'

# Calculate GrapeRank
if sudo node $BRAINSTORM_MODULE_ALGOS_DIR/customers/personalizedGrapeRank/calculateGrapeRank.js $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME; then
    # Emit structured event for GrapeRank calculation success
    emit_task_event "PROGRESS" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
        "customer_id": "'$CUSTOMER_ID'",
        "customer_pubkey": "'$CUSTOMER_PUBKEY'",
        "customer_name": "'$CUSTOMER_NAME'",
        "message": "GrapeRank calculation completed successfully",
        "phase": "graperank_calculation",
        "step": "calculate_graperank_complete",
        "child_script": "calculateGrapeRank.js",
        "status": "success",
        "algorithm": "personalized_graperank"
    }'
else
    # Emit structured event for GrapeRank calculation failure
    emit_task_event "TASK_ERROR" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
        "customer_id": "'$CUSTOMER_ID'",
        "customer_pubkey": "'$CUSTOMER_PUBKEY'",
        "customer_name": "'$CUSTOMER_NAME'",
        "message": "GrapeRank calculation failed",
        "status": "failed",
        "task_type": "customer_algorithm",
        "algorithm": "personalized_graperank",
        "child_script": "calculateGrapeRank.js",
        "error_reason": "child_script_failure",
        "category": "algorithms",
        "scope": "customer",
        "parent_task": "updateAllScoresForSingleCustomer"
    }'
    exit 1
fi

echo "$(date): Continuing personalizedGrapeRank; starting updateNeo4jWithApoc.js"
echo "$(date): Continuing personalizedGrapeRank; starting updateNeo4jWithApoc.js" >> ${LOG_FILE}

# Emit structured event for Neo4j update start
emit_task_event "PROGRESS" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
    "customer_id": "'$CUSTOMER_ID'",
    "customer_pubkey": "'$CUSTOMER_PUBKEY'",
    "customer_name": "'$CUSTOMER_NAME'",
    "message": "Starting Neo4j database update",
    "phase": "neo4j_update",
    "step": "update_neo4j_with_apoc",
    "child_script": "updateNeo4jWithApoc.js",
    "algorithm": "personalized_graperank"
}'

# update Neo4j
if sudo node $BRAINSTORM_MODULE_ALGOS_DIR/customers/personalizedGrapeRank/updateNeo4jWithApoc.js $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME; then
    # Emit structured event for Neo4j update success
    emit_task_event "PROGRESS" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
        "customer_id": "'$CUSTOMER_ID'",
        "customer_pubkey": "'$CUSTOMER_PUBKEY'",
        "customer_name": "'$CUSTOMER_NAME'",
        "message": "Neo4j database update completed successfully",
        "phase": "neo4j_update",
        "step": "update_neo4j_with_apoc_complete",
        "child_script": "updateNeo4jWithApoc.js",
        "status": "success",
        "algorithm": "personalized_graperank"
    }'
else
    # Emit structured event for Neo4j update failure
    emit_task_event "TASK_ERROR" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
        "customer_id": "'$CUSTOMER_ID'",
        "customer_pubkey": "'$CUSTOMER_PUBKEY'",
        "customer_name": "'$CUSTOMER_NAME'",
        "message": "Neo4j database update failed",
        "status": "failed",
        "task_type": "customer_algorithm",
        "algorithm": "personalized_graperank",
        "child_script": "updateNeo4jWithApoc.js",
        "error_reason": "child_script_failure",
        "category": "algorithms",
        "scope": "customer",
        "parent_task": "updateAllScoresForSingleCustomer"
    }'
    exit 1
fi

# Emit structured event for successful completion
emit_task_event "TASK_END" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" '{
    "customer_id": "'$CUSTOMER_ID'",
    "customer_pubkey": "'$CUSTOMER_PUBKEY'",
    "customer_name": "'$CUSTOMER_NAME'",
    "message": "Customer-specific GrapeRank calculation completed successfully",
    "status": "success",
    "task_type": "customer_algorithm",
    "algorithm": "personalized_graperank",
    "phases_completed": ["csv_initialization", "ratings_interpretation", "scorecards_initialization", "graperank_calculation", "neo4j_update"],
    "child_processes_completed": 5,
    "category": "algorithms",
    "scope": "customer",
    "parent_task": "updateAllScoresForSingleCustomer"
}'

echo "$(date): Finished personalizedGrapeRank for CUSTOMER_NAME: $CUSTOMER_NAME CUSTOMER_ID: $CUSTOMER_ID CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY"
echo "$(date): Finished personalizedGrapeRank for CUSTOMER_NAME: $CUSTOMER_NAME CUSTOMER_ID: $CUSTOMER_ID CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY" >> ${LOG_FILE}