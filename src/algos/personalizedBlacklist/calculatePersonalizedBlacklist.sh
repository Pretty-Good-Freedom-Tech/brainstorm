#!/bin/bash

# Hasenpfeffr Personalized Blacklist Calculator
# This script calculates personalized blacklists based on follows, mutes, and reports data in Neo4j
# It updates the blacklist_pubkeys.json file used by the strfry plugin

source /etc/hasenpfeffr.conf # HASENPFEFFR_LOG_DIR

touch ${HASENPFEFFR_LOG_DIR}/exportBlacklist.log
sudo chown hasenpfeffr:hasenpfeffr ${HASENPFEFFR_LOG_DIR}/exportBlacklist.log

echo "$(date): Starting exportBlacklist"
echo "$(date): Starting exportBlacklist" >> ${HASENPFEFFR_LOG_DIR}/exportBlacklist.log  

set -e  # Exit on error

# Configuration
BLACKLIST_CONF="/etc/blacklist.conf"
BLACKLIST_OUTPUT_DIR=${STRFRY_PLUGINS_DATA}
BLACKLIST_OUTPUT_FILE="$BLACKLIST_OUTPUT_DIR/blacklist_pubkeys.json"
NEO4J_USERNAME="neo4j"
NEO4J_PASSWORD="neo4j"
if [ -f "/etc/hasenpfeffr.conf" ]; then
  source /etc/hasenpfeffr.conf
  NEO4J_PASSWORD=${NEO4J_PASSWORD:-neo4j}
else
  NEO4J_PASSWORD="neo4j"
  echo "Warning: /etc/hasenpfeffr.conf not found, using default Neo4j password"
fi

# Load blacklist configuration
if [ -f "$BLACKLIST_CONF" ]; then
    source "$BLACKLIST_CONF"
else
    echo "Error: Blacklist configuration file not found at $BLACKLIST_CONF"
    exit 1
fi

echo "Starting personalized blacklist calculation..."
echo "Using parameters:"
echo "  WEIGHT_FOLLOWED = $WEIGHT_FOLLOWED"
echo "  WEIGHT_MUTED = $WEIGHT_MUTED"
echo "  WEIGHT_REPORTED = $WEIGHT_REPORTED"
echo "  BLACKLIST_ABSOLUTE_CUTOFF = $BLACKLIST_ABSOLUTE_CUTOFF"
echo "  BLACKLIST_RELATIVE_CUTOFF = $BLACKLIST_RELATIVE_CUTOFF"

# Cypher query to calculate followedInput, mutedInput, and reportedInput for all NostrUsers
CALCULATE_INPUTS_QUERY=$(cat <<EOF
// Reset all input values
MATCH (n:NostrUser)
SET n.followedInput = 0, n.mutedInput = 0, n.reportedInput = 0, n.blacklisted = 0;

// Calculate followedInput
MATCH (follower:NostrUser)-[f:FOLLOWS]->(followed:NostrUser)
WITH followed, follower, follower.influence as influence
WHERE influence IS NOT NULL
WITH followed, SUM(influence * $WEIGHT_FOLLOWED) as followedInput
SET followed.followedInput = followedInput;

// Calculate mutedInput
MATCH (muter:NostrUser)-[m:MUTES]->(muted:NostrUser)
WITH muted, muter, muter.influence as influence
WHERE influence IS NOT NULL
WITH muted, SUM(influence * $WEIGHT_MUTED) as mutedInput
SET muted.mutedInput = mutedInput;

// Calculate reportedInput
MATCH (reporter:NostrUser)-[r:REPORTS]->(reported:NostrUser)
WITH reported, reporter, reporter.influence as influence
WHERE influence IS NOT NULL
WITH reported, SUM(influence * $WEIGHT_REPORTED) as reportedInput
SET reported.reportedInput = reportedInput;

// Calculate blacklisted status
MATCH (n:NostrUser)
WHERE (n.mutedInput + n.reportedInput) > $BLACKLIST_ABSOLUTE_CUTOFF
  AND n.followedInput < $BLACKLIST_RELATIVE_CUTOFF * (n.mutedInput + n.reportedInput)
SET n.blacklisted = 1
RETURN COUNT(n) as blacklistedCount;
EOF
)

# Cypher query to get all blacklisted pubkeys
GET_BLACKLISTED_QUERY=$(cat <<EOF
MATCH (n:NostrUser)
WHERE n.blacklisted = 1
RETURN n.pubkey as pubkey
ORDER BY n.pubkey;
EOF
)

# Run the calculation query
echo "Calculating input values and blacklist status..."
BLACKLISTED_COUNT=$(cypher-shell -u "$NEO4J_USERNAME" -p "$NEO4J_PASSWORD" --format plain "$CALCULATE_INPUTS_QUERY" | tail -n 1)
echo "Blacklisted $BLACKLISTED_COUNT users."

# Get the blacklisted pubkeys
echo "Retrieving blacklisted pubkeys..."
BLACKLISTED_PUBKEYS=$(cypher-shell -u "$NEO4J_USERNAME" -p "$NEO4J_PASSWORD" --format plain "$GET_BLACKLISTED_QUERY" | grep -v "pubkey" | grep -v "^$")

echo "$(date): Continuing exportBlacklist ... finished cypher queries; about to create blacklist.json"
echo "$(date): Continuing exportBlacklist ... finished cypher queries; about to create blacklist.json" >> ${HASENPFEFFR_LOG_DIR}/exportBlacklist.log  

# Create the blacklist JSON file
echo "Creating blacklist JSON file..."
echo "{" > "$BLACKLIST_OUTPUT_FILE.tmp"
FIRST=true
for PUBKEY in $BLACKLISTED_PUBKEYS; do
    if [ "$FIRST" = true ]; then
        FIRST=false
    else
        echo "," >> "$BLACKLIST_OUTPUT_FILE.tmp"
    fi
    echo "  $PUBKEY: true" >> "$BLACKLIST_OUTPUT_FILE.tmp"
done
echo "}" >> "$BLACKLIST_OUTPUT_FILE.tmp"

# Move the temporary file to the final location
mv "$BLACKLIST_OUTPUT_FILE.tmp" "$BLACKLIST_OUTPUT_FILE"
sudo chmod 644 "$BLACKLIST_OUTPUT_FILE"
sudo chown hasenpfeffr:hasenpfeffr "$BLACKLIST_OUTPUT_FILE"

echo "$(date): Continuing exportBlacklist ... about to update blacklist.conf"
echo "$(date): Continuing exportBlacklist ... about to update blacklist.conf" >> ${HASENPFEFFR_LOG_DIR}/exportBlacklist.log  

# Update the WHEN_LAST_CALCULATED timestamp in the configuration file
TIMESTAMP=$(date +%s)
TMP_CONF=$(mktemp)
cat "$BLACKLIST_CONF" | sed "s/^export WHEN_LAST_CALCULATED=.*$/export WHEN_LAST_CALCULATED=$TIMESTAMP/" > "$TMP_CONF"
sudo cp "$TMP_CONF" "$BLACKLIST_CONF"
sudo chmod 644 "$BLACKLIST_CONF"
sudo chown root:hasenpfeffr "$BLACKLIST_CONF"
rm "$TMP_CONF"

echo "Personalized blacklist calculation completed."
echo "Blacklist file updated at $BLACKLIST_OUTPUT_FILE"
echo "Total blacklisted pubkeys: $BLACKLISTED_COUNT"
echo "Timestamp updated in $BLACKLIST_CONF"

# Restart the strfry service to apply the new blacklist
# echo "Restarting strfry service to apply the new blacklist..."
# sudo systemctl restart strfry

echo "Done!"

echo "$(date): Finished exportBlacklist"
echo "$(date): Finished exportBlacklist" >> ${HASENPFEFFR_LOG_DIR}/exportBlacklist.log  
