#!/bin/bash

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
LOG_FILE="$LOG_DIR/calculateVerifiedFollowers.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

echo "$(date): Starting calculateVerifiedFollowers"
echo "$(date): Starting calculateVerifiedFollowers" >> ${LOG_FILE}

CYPHER1="
MATCH (c:NostrUserWotMetricsCards {customer_id: '$CUSTOMER_ID'})<-[:SPECIFIC_INSTANCE]-(:SetOfNostrUserWotMetricsCards)<-[:WOT_METRICS_CARD]-(f:NostrUser)-[:FOLLOWS]->(u:NostrUser)
WHERE c.influence > 0.1 AND c.observee_pubkey = f.pubkey
WITH u, COUNT(f) AS verifiedFollowers
SET u.verifiedFollowerCount = verifiedFollowers
RETURN COUNT(u) AS usersUpdated, SUM(verifiedFollowers) AS totalVerifiedFollowersSet"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:11}"
numVerifiedFollowersSet="${cypherResults:33}"

echo "$(date): numUsersUpdated: $numUsersUpdated; numVerifiedFollowersSet: $numVerifiedFollowersSet"
echo "$(date): numUsersUpdated: $numUsersUpdated; numVerifiedFollowersSet: $numVerifiedFollowersSet" >> ${LOG_FILE}

echo "$(date): Finished calculateVerifiedFollowers"
echo "$(date): Finished calculateVerifiedFollowers" >> ${LOG_FILE}