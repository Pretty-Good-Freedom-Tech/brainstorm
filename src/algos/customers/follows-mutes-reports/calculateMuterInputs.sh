#!/bin/bash
# to run:
# sudo bash calculateMuterInputs.sh e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f 0 straycat
# sudo bash calculateMuterInputs.sh  7cc328a08ddb2afdf9f9be77beff4c83489ff979721827d628a542f32a247c0e 1 cloudfodder

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

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

# DIR_NAME is customer_ + the first 8 digits of the customer pubkey
DIR_NAME="customer_$(echo $CUSTOMER_PUBKEY | cut -c1-8)"

# Get customer preferences
CUSTOMER_DIR="/var/lib/brainstorm/customers/$DIR_NAME"
source $CUSTOMER_DIR/preferences/whitelist.conf
source $CUSTOMER_DIR/preferences/blacklist.conf
source $CUSTOMER_DIR/preferences/graperank.conf # VERIFIED_FOLLOWERS_INFLUENCE_CUTOFF

# Get log directory
LOG_DIR="$BRAINSTORM_LOG_DIR/customers/$DIR_NAME"

# Create log directory if it doesn't exist; chown to brainstorm user
mkdir -p "$LOG_DIR"
sudo chown brainstorm:brainstorm "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/calculateMuterInputs.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

echo "$(date): Starting calculateMuterInputs"
echo "$(date): Starting calculateMuterInputs" >> ${LOG_FILE}

# Emit structured event for task start
emit_task_event "TASK_START" "calculateMuterInputs" \
    "customer_id=$CUSTOMER_ID" \
    "customer_pubkey=$CUSTOMER_PUBKEY" \
    "customer_name=$CUSTOMER_NAME" \
    "message=Starting muter inputs calculation"

set -e  # Exit on error

# Configuration
NEO4J_USERNAME="neo4j"
NEO4J_PASSWORD="neo4j"
if [ -f "/etc/brainstorm.conf" ]; then
  source /etc/brainstorm.conf
  NEO4J_PASSWORD=${NEO4J_PASSWORD:-neo4j}
else
  NEO4J_PASSWORD="neo4j"
  echo "Warning: /etc/brainstorm.conf not found, using default Neo4j password"
fi

# This one handles all cases, including zero followers
CYPHER1="
MATCH (muteeCard:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})
MATCH (mutee:NostrUser) WHERE muteeCard.observee_pubkey = mutee.pubkey
OPTIONAL MATCH (muter:NostrUser)-[f:MUTES]->(mutee)
OPTIONAL MATCH (muterCard:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID}) WHERE muterCard.observee_pubkey = muter.pubkey
WITH muteeCard, SUM(muterCard.influence) AS muterInput
SET muteeCard.muterInput = muterInput
RETURN COUNT(muteeCard) AS numCardsUpdated
"

# Emit structured event for calculation start
emit_task_event "PROGRESS" "calculateMuterInputs" \
    "customer_id=$CUSTOMER_ID" \
    "customer_name=$CUSTOMER_NAME" \
    "step=influence_calculation" \
    "message=Calculating muter influence inputs for all users"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated"
echo "$(date): numUsersUpdated: $numUsersUpdated" >> ${LOG_FILE}

# Emit structured event for calculation completion
emit_task_event "PROGRESS" "calculateMuterInputs" \
    "customer_id=$CUSTOMER_ID" \
    "customer_name=$CUSTOMER_NAME" \
    "step=influence_calculation_complete" \
    "users_updated=$numUsersUpdated" \
    "message=Completed muter influence inputs calculation"

echo "$(date): Finished calculateMuterInputs"
echo "$(date): Finished calculateMuterInputs" >> ${LOG_FILE}

# Emit structured event for task completion
emit_task_event "TASK_END" "calculateMuterInputs" \
    "customer_id=$CUSTOMER_ID" \
    "customer_pubkey=$CUSTOMER_PUBKEY" \
    "customer_name=$CUSTOMER_NAME" \
    "status=success" \
    "users_updated=$numUsersUpdated" \
    "algorithm=muter_inputs" \
    "calculation_type=influence_aggregation" \
    "message=Muter inputs calculation completed successfully"  
