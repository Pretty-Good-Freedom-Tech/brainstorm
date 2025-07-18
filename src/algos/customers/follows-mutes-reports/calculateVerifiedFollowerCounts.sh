#!/bin/bash
# to run:
# sudo bash calculateVerifiedFollowerCounts.sh e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f 0 straycat
# sudo bash calculateVerifiedFollowerCounts.sh  7cc328a08ddb2afdf9f9be77beff4c83489ff979721827d628a542f32a247c0e 1 cloudfodder

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

# If VERIFIED_FOLLOWERS_INFLUENCE_CUTOFF is not set, then default it to 0.01
if [ -z "$VERIFIED_FOLLOWERS_INFLUENCE_CUTOFF" ]; then
    VERIFIED_FOLLOWERS_INFLUENCE_CUTOFF=0.01
fi

# Get log directory
LOG_DIR="$BRAINSTORM_LOG_DIR/customers/$CUSTOMER_NAME"

# Create log directory if it doesn't exist; chown to brainstorm user
mkdir -p "$LOG_DIR"
sudo chown brainstorm:brainstorm "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/calculateVerifiedFollowerCounts.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

echo "$(date): Starting calculateVerifiedFollowerCounts"
echo "$(date): Starting calculateVerifiedFollowerCounts" >> ${LOG_FILE}

CYPHER1="
MATCH (followee:NostrUser)<-[f:FOLLOWS]-(follower:NostrUser)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(followerCard:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})
WHERE followerCard.observee_pubkey = follower.pubkey AND followerCard.influence > $VERIFIED_FOLLOWERS_INFLUENCE_CUTOFF
OPTIONAL MATCH (followee)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(followeeCard:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})
WITH followeeCard, count(f) AS verifiedFollowerCount
SET followeeCard.verifiedFollowerCount = verifiedFollowerCount
RETURN COUNT(followeeCard) AS numCardsUpdated"

CYPHER2="
MATCH (followee:NostrUser)
OPTIONAL MATCH (followee)<-[f:FOLLOWS]-(follower:NostrUser)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(followerCard:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})
WHERE followerCard.observee_pubkey = follower.pubkey AND followerCard.influence > $VERIFIED_FOLLOWERS_INFLUENCE_CUTOFF
OPTIONAL MATCH (followee)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(followeeCard:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})
WITH followeeCard, count(f) AS verifiedFollowerCount
WHERE verifiedFollowerCount = 0
SET followeeCard.verifiedFollowerCount = 0
RETURN COUNT(followeeCard) AS numCardsUpdated"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero verifiedFollowerCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero verifiedFollowerCount)" >> ${LOG_FILE}

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with zero verifiedFollowerCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with zero verifiedFollowerCount)" >> ${LOG_FILE}

echo "$(date): Finished calculateVerifiedFollowerCounts"
echo "$(date): Finished calculateVerifiedFollowerCounts" >> ${LOG_FILE}