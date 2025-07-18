#!/bin/bash
# to run:
# sudo bash calculateReporterInputs.sh e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f 0 straycat
# sudo bash calculateReporterInputs.sh  7cc328a08ddb2afdf9f9be77beff4c83489ff979721827d628a542f32a247c0e 1 cloudfodder

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

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

# Get customer preferences
CUSTOMER_DIR="/var/lib/brainstorm/customers/$CUSTOMER_NAME"
source $CUSTOMER_DIR/preferences/whitelist.conf
source $CUSTOMER_DIR/preferences/blacklist.conf
source $CUSTOMER_DIR/preferences/graperank.conf # VERIFIED_FOLLOWERS_INFLUENCE_CUTOFF

# Get log directory
LOG_DIR="$BRAINSTORM_LOG_DIR/customers/$CUSTOMER_NAME"

# Create log directory if it doesn't exist; chown to brainstorm user
mkdir -p "$LOG_DIR"
sudo chown brainstorm:brainstorm "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/calculateReporterInputs.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

echo "$(date): Starting calculateReporterInputs"
echo "$(date): Starting calculateReporterInputs" >> ${LOG_FILE}

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
MATCH (reporteeCard:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})
MATCH (reportee:NostrUser) WHERE reporteeCard.observee_pubkey = reportee.pubkey
OPTIONAL MATCH (reporter:NostrUser)-[f:REPORTS]->(reportee)
OPTIONAL MATCH (reporterCard:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID}) WHERE reporterCard.observee_pubkey = reporter.pubkey
WITH reporteeCard, SUM(reporterCard.influence) AS reporterInput
SET reporteeCard.reporterInput = reporterInput
RETURN COUNT(reporteeCard) AS numCardsUpdated
"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated"
echo "$(date): numUsersUpdated: $numUsersUpdated" >> ${LOG_FILE}

echo "$(date): Finished calculateReporterInputs"
echo "$(date): Finished calculateReporterInputs" >> ${LOG_FILE}  
