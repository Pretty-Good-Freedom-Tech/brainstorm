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

# Get log directory
LOG_DIR="$BRAINSTORM_LOG_DIR/customers/$CUSTOMER_NAME"

# Create log directory if it doesn't exist; chown to brainstorm user
mkdir -p "$LOG_DIR"
sudo chown brainstorm:brainstorm ${LOG_DIR}

# Log file
LOG_FILE="$LOG_DIR/calculateVerifiedFollowerCounts.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

echo "$(date): Starting calculateVerifiedFollowerCounts"
echo "$(date): Starting calculateVerifiedFollowerCounts" >> ${LOG_FILE}

# calculate verified followers for a given customer and store temporarily in NostrUser node
CYPHER1="
MATCH (c1:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})<-[:SPECIFIC_INSTANCE]-(:SetOfNostrUserWotMetricsCards)<-[:WOT_METRICS_CARDS]-(f:NostrUser)-[:FOLLOWS]->(u:NostrUser)
WHERE c1.observee_pubkey = f.pubkey AND c1.influence > 0.01
WITH u, count(f) AS verifiedFollowerCount
SET u.customer_verifiedFollowerCount=verifiedFollowerCount
RETURN count(u) AS numUsersUpdated
"
# optional: RETURN u.pubkey AS nostrUser, verifiedFollowerCount ORDER BY verifiedFollowerCount DESC

# update NostrUserWotMetricsCard node with verified followers count
CYPHER2="
MATCH (c1:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})<-[:SPECIFIC_INSTANCE]-(:SetOfNostrUserWotMetricsCards)<-[:WOT_METRICS_CARDS]-(f:NostrUser)
WHERE c1.observee_pubkey = f.pubkey
WITH f, c1, count(f) AS verifiedFollowerCount
SET c1.verifiedFollowerCount=f.customer_verifiedFollowerCount
RETURN count(c1) AS numCardsUpdated
"

# update NostrUser node by setting customer_verifiedFollowerCount to NULL
CYPHER3="
MATCH (u:NostrUser)
WHERE u.customer_verifiedFollowerCount IS NOT NULL
SET u.customer_verifiedFollowerCount = NULL
RETURN count(u) AS numUsersUpdated
"

cypherResults1=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")

echo "$(date): continuing calculateVerifiedFollowerCounts; cypherResults1: $cypherResults1"
echo "$(date): continuing calculateVerifiedFollowerCounts; cypherResults1: $cypherResults1" >> ${LOG_FILE}

cypherResults2=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2")

echo "$(date): continuing calculateVerifiedFollowerCounts; cypherResults2: $cypherResults2"
echo "$(date): continuing calculateVerifiedFollowerCounts; cypherResults2: $cypherResults2" >> ${LOG_FILE}

cypherResults3=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3")

echo "$(date): continuing calculateVerifiedFollowerCounts; cypherResults3: $cypherResults3"
echo "$(date): continuing calculateVerifiedFollowerCounts; cypherResults3: $cypherResults3" >> ${LOG_FILE}

echo "$(date): Finished calculateVerifiedFollowerCounts"
echo "$(date): Finished calculateVerifiedFollowerCounts" >> ${LOG_FILE}