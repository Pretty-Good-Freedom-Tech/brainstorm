#!/bin/bash
# to run:
# sudo bash calculateVerifiedMuterCounts.sh e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f 0 straycat
# sudo bash calculateVerifiedMuterCounts.sh  7cc328a08ddb2afdf9f9be77beff4c83489ff979721827d628a542f32a247c0e 1 cloudfodder

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

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/calculateVerifiedMuterCounts.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

echo "$(date): Starting calculateVerifiedMuterCounts"
echo "$(date): Starting calculateVerifiedMuterCounts" >> ${LOG_FILE}

# calculate verified muters for a given customer and store temporarily in NostrUser node
CYPHER1="
MATCH (c1:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})<-[:SPECIFIC_INSTANCE]-(:SetOfNostrUserWotMetricsCards)<-[:WOT_METRICS_CARDS]-(f:NostrUser)-[:MUTES]->(u:NostrUser)
WHERE c1.observee_pubkey = f.pubkey AND c1.influence > 0.01
WITH u, count(f) AS verifiedMuterCount
SET u.customer_verifiedMuterCount=verifiedMuterCount
RETURN count(u) AS numUsersUpdated
"
# optional: RETURN u.pubkey AS nostrUser, verifiedMuterCount ORDER BY verifiedMuterCount DESC

# update NostrUserWotMetricsCard node with verified muters count
CYPHER2="
MATCH (c1:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})<-[:SPECIFIC_INSTANCE]-(:SetOfNostrUserWotMetricsCards)<-[:WOT_METRICS_CARDS]-(f:NostrUser)
WHERE c1.observee_pubkey = f.pubkey
WITH f, c1, count(f) AS verifiedMuterCount
SET c1.verifiedMuterCount=f.customer_verifiedMuterCount
RETURN count(c1) AS numCardsUpdated
"

# update NostrUser node by setting customer_verifiedMuterCount to NULL
CYPHER3="
MATCH (u:NostrUser)
WHERE u.customer_verifiedMuterCount IS NOT NULL
SET u.customer_verifiedMuterCount = NULL
RETURN count(u) AS numUsersUpdated
"

cypherResults1=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")

echo "$(date): continuing calculateVerifiedMuterCounts; cypherResults1: $cypherResults1"
echo "$(date): continuing calculateVerifiedMuterCounts; cypherResults1: $cypherResults1" >> ${LOG_FILE}

cypherResults2=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2")

echo "$(date): continuing calculateVerifiedMuterCounts; cypherResults2: $cypherResults2"
echo "$(date): continuing calculateVerifiedMuterCounts; cypherResults2: $cypherResults2" >> ${LOG_FILE}

cypherResults3=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3")

echo "$(date): continuing calculateVerifiedMuterCounts; cypherResults3: $cypherResults3"
echo "$(date): continuing calculateVerifiedMuterCounts; cypherResults3: $cypherResults3" >> ${LOG_FILE}

echo "$(date): Finished calculateVerifiedMuterCounts"
echo "$(date): Finished calculateVerifiedMuterCounts" >> ${LOG_FILE}