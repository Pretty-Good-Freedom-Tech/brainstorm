#!/bin/bash
# to run:
# sudo bash calculateFollowerInputs.sh e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f 0 straycat
# sudo bash calculateFollowerInputs.sh  7cc328a08ddb2afdf9f9be77beff4c83489ff979721827d628a542f32a247c0e 1 cloudfodder

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
LOG_FILE="$LOG_DIR/calculateFollowerInputs.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

echo "$(date): Starting calculateFollowerInputs"
echo "$(date): Starting calculateFollowerInputs" >> ${LOG_FILE}

# Emit structured event for task start
emit_task_event "TASK_START" "calculateFollowerInputs" \
    "customer_id=$CUSTOMER_ID" \
    "customer_pubkey=$CUSTOMER_PUBKEY" \
    "customer_name=$CUSTOMER_NAME" \
    "message=Starting follower inputs calculation"

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

CYPHER1_TEST_TO_SPEED_UP="
MATCH (followeeCard:NostrUserWotMetricsCard {customer_id: 1})
MATCH (followee:NostrUser) WHERE followeeCard.observee_pubkey = followee.pubkey
OPTIONAL MATCH (follower:NostrUser)-[f:FOLLOWS]->(followee)
OPTIONAL MATCH (followerCard:NostrUserWotMetricsCard {customer_id: 1}) WHERE followerCard.observee_pubkey = follower.pubkey
WITH followeeCard, SUM(followerCard.influence) AS followerInput
SET followeeCard.followerInput = followerInput
RETURN COUNT(followeeCard) AS numCardsUpdated
"

CYPHER1_WORKS="
MATCH (followee:NostrUser)<-[f:FOLLOWS]-(follower:NostrUser)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(followerCard:NostrUserWotMetricsCard {customer_id: 1})
WHERE followerCard.observee_pubkey = follower.pubkey
OPTIONAL MATCH (followee)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(followeeCard:NostrUserWotMetricsCard {customer_id: 1})
WITH followeeCard, count(f) AS verifiedFollowerCount, SUM(followerCard.influence) AS followerInput
RETURN followeeCard.observee_pubkey AS followeePubkey, verifiedFollowerCount, followerInput ORDER BY followerInput DESC LIMIT 10
"

CYPHER1_WORKS2="
MATCH (followee:NostrUser)<-[f:FOLLOWS]-(follower:NostrUser)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(followerCard:NostrUserWotMetricsCard {customer_id: 1})
WHERE followerCard.observee_pubkey = follower.pubkey
OPTIONAL MATCH (followee)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(followeeCard:NostrUserWotMetricsCard {customer_id: 1})
WITH followeeCard, SUM(followerCard.influence) AS followerInput
RETURN COUNT(followeeCard) AS numCardsUpdated
"

CYPHER1_TESTb="
MATCH (followee:NostrUser)<-[f:FOLLOWS]-(follower:NostrUser)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(followerCard:NostrUserWotMetricsCard {customer_id: 1})
OPTIONAL MATCH (followee)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(followeeCard:NostrUserWotMetricsCard {customer_id: 1})
WITH followeeCard, SUM(followerCard.influence) AS followerInput
RETURN COUNT(followeeCard) AS numCardsUpdated
"

CYPHER1_RETIRING="
MATCH (followee:NostrUser)<-[f:FOLLOWS]-(follower:NostrUser)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(followerCard:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})
OPTIONAL MATCH (followee)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(followeeCard:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})
WITH followeeCard, SUM(followerCard.influence) AS followerInput
SET followeeCard.followerInput = followerInput
RETURN COUNT(followeeCard) AS numCardsUpdated
"

# Logic is that if there are zero followers, then followerInput should be set to 0
# This may miss some cases where a followee is followed by followers with zero influence; in that case, followerInput should be set to 0
# TODO: check if this is correct
# deprecating; unnecessary bc cypher1 handles all cases
CYPHER2_RETIRING="
MATCH (n:NostrUser)
OPTIONAL MATCH (n)<-[f:FOLLOWS]-(m:NostrUser)
WITH n, count(f) as followerCount
WHERE followerCount = 0
SET n.followerInput = 0
RETURN count(n) AS numUsersUpdated
"

# This one handles all cases, including zero followers
CYPHER1="
MATCH (followeeCard:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})
MATCH (followee:NostrUser) WHERE followeeCard.observee_pubkey = followee.pubkey
OPTIONAL MATCH (follower:NostrUser)-[f:FOLLOWS]->(followee)
OPTIONAL MATCH (followerCard:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID}) WHERE followerCard.observee_pubkey = follower.pubkey
WITH followeeCard, SUM(followerCard.influence) AS followerInput
SET followeeCard.followerInput = followerInput
RETURN COUNT(followeeCard) AS numCardsUpdated
"

# Emit structured event for calculation start
emit_task_event "PROGRESS" "calculateFollowerInputs" \
    "customer_id=$CUSTOMER_ID" \
    "customer_name=$CUSTOMER_NAME" \
    "step=influence_calculation" \
    "message=Calculating follower influence inputs for all users"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated"
echo "$(date): numUsersUpdated: $numUsersUpdated" >> ${LOG_FILE}

# Emit structured event for calculation completion
emit_task_event "PROGRESS" "calculateFollowerInputs" \
    "customer_id=$CUSTOMER_ID" \
    "customer_name=$CUSTOMER_NAME" \
    "step=influence_calculation_complete" \
    "users_updated=$numUsersUpdated" \
    "message=Completed follower influence inputs calculation"

echo "$(date): Finished calculateFollowerInputs"
echo "$(date): Finished calculateFollowerInputs" >> ${LOG_FILE}

# Emit structured event for task completion
emit_task_event "TASK_END" "calculateFollowerInputs" \
    "customer_id=$CUSTOMER_ID" \
    "customer_pubkey=$CUSTOMER_PUBKEY" \
    "customer_name=$CUSTOMER_NAME" \
    "status=success" \
    "users_updated=$numUsersUpdated" \
    "algorithm=follower_inputs" \
    "calculation_type=influence_aggregation" \
    "message=Follower inputs calculation completed successfully"  
