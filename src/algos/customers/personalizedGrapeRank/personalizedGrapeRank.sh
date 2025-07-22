#!/bin/bash

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_OWNER_PUBKEY, BRAINSTORM_LOG_DIR, BRAINSTORM_MODULE_ALGOS_DIR

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
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

# Log file
LOG_FILE="$LOG_DIR/personalizedGrapeRank.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

echo "$(date): Starting personalizedGrapeRank for CUSTOMER_NAME: $CUSTOMER_NAME CUSTOMER_ID: $CUSTOMER_ID CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY"
echo "$(date): Starting personalizedGrapeRank for CUSTOMER_NAME: $CUSTOMER_NAME CUSTOMER_ID: $CUSTOMER_ID CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY" >> ${LOG_FILE}

# initialize raw data csv files. Note that this step is not customer-specific, i.e. it is the same for all customers
# First determine whether the csv files already exist in location: /var/lib/brainstorm/algos/personalizedGrapeRank/tmp
# If files already exist, echo that we are skipping this step
if [ ! -f /var/lib/brainstorm/algos/personalizedGrapeRank/tmp/follows.csv ] && [ ! -f /var/lib/brainstorm/algos/personalizedGrapeRank/tmp/mutes.csv ] && [ ! -f /var/lib/brainstorm/algos/personalizedGrapeRank/tmp/reports.csv ] && [ ! -f /var/lib/brainstorm/algos/personalizedGrapeRank/tmp/ratees.csv ]; then
    echo "$(date): Continuing personalizedGrapeRank; starting initializeRawDataCsv.sh"
    echo "$(date): Continuing personalizedGrapeRank; starting initializeRawDataCsv.sh" >> ${LOG_FILE}
    sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/personalizedGrapeRank/initializeRawDataCsv.sh
else
    echo "$(date): Continuing personalizedGrapeRank; skipping initializeRawDataCsv because csv files already exist"
    echo "$(date): Continuing personalizedGrapeRank; skipping initializeRawDataCsv because csv files already exist" >> ${LOG_FILE}
fi

echo "$(date): Continuing personalizedGrapeRank; starting interpretRatings.js"
echo "$(date): Continuing personalizedGrapeRank; starting interpretRatings.js" >> ${LOG_FILE}

# Interpret ratings. Pass CUSTOMER_PUBKEY, CUSTOMER_ID, and CUSTOMER_NAME as arguments to interpretRatings.js
sudo node $BRAINSTORM_MODULE_ALGOS_DIR/customers/personalizedGrapeRank/interpretRatings.js $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME

echo "$(date): Continuing personalizedGrapeRank; starting initializeScorecards.js"
echo "$(date): Continuing personalizedGrapeRank; starting initializeScorecards.js" >> ${LOG_FILE}

# Initialize scorecards
# TODO: initialize from neo4j if scores already exist
# TODO: edit test changes to this file. scorecards_init.json should be in the customer-specific directory
sudo node $BRAINSTORM_MODULE_ALGOS_DIR/customers/personalizedGrapeRank/initializeScorecards.js $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME

echo "$(date): Continuing personalizedGrapeRank; starting calculateGrapeRank.js"
echo "$(date): Continuing personalizedGrapeRank; starting calculateGrapeRank.js" >> ${LOG_FILE}

# Calculate GrapeRank
sudo node $BRAINSTORM_MODULE_ALGOS_DIR/customers/personalizedGrapeRank/calculateGrapeRank.js $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME

echo "$(date): Continuing personalizedGrapeRank; starting updateNeo4j.js"
echo "$(date): Continuing personalizedGrapeRank; starting updateNeo4j.js" >> ${LOG_FILE}

# update Neo4j
sudo node $BRAINSTORM_MODULE_ALGOS_DIR/customers/personalizedGrapeRank/updateNeo4j.js $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME

echo "$(date): Finished personalizedGrapeRank for CUSTOMER_NAME: $CUSTOMER_NAME CUSTOMER_ID: $CUSTOMER_ID CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY"
echo "$(date): Finished personalizedGrapeRank for CUSTOMER_NAME: $CUSTOMER_NAME CUSTOMER_ID: $CUSTOMER_ID CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY" >> ${LOG_FILE}