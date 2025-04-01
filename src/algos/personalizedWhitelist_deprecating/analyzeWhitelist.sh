#!/bin/bash

# Whitelist Analysis Script
# Provides statistics and debugging information about the personalized whitelist

# Load configuration
source /etc/hasenpfeffr.conf
source /etc/whitelist.conf

# Configuration
WHITELIST_OUTPUT_DIR=${STRFRY_PLUGINS_DATA}
WHITELIST_OUTPUT_FILE="$WHITELIST_OUTPUT_DIR/whitelist_pubkeys.json"
NEO4J_USERNAME="$NEO4J_USER"
NEO4J_PASSWORD="$NEO4J_PASSWORD"
NEO4J_URI="$NEO4J_URI"
LOG_FILE="$HASENPFEFFR_LOG_DIR/personalizedWhitelist.log"

# Log function
log() {
    echo "$(date +'%Y-%m-%d %H:%M:%S') - $1" | sudo tee -a "$LOG_FILE"
}

# Check if whitelist file exists
if [ ! -f "$WHITELIST_OUTPUT_FILE" ]; then
    echo "Error: Whitelist file does not exist at $WHITELIST_OUTPUT_FILE"
    exit 1
fi

# Count pubkeys in the whitelist
PUBKEY_COUNT=$(grep -o '"[^"]*": true' "$WHITELIST_OUTPUT_FILE" | wc -l)
echo "Whitelist contains $PUBKEY_COUNT pubkeys"

# Get current parameter info
echo "Current Whitelist Parameters:"
echo "----------------------------"
echo "Influence Cutoff: $INFLUENCE_CUTOFF"
echo "Hops Cutoff: $HOPS_CUTOFF"
echo "Combination Logic: $COMBINATION_LOGIC"
echo "Incorporate Blacklist: $INCORPORATE_BLACKLIST"

# When was it last generated
if [ -n "$WHEN_LAST_CALCULATED" ] && [ "$WHEN_LAST_CALCULATED" != "0" ]; then
    LAST_CALC_DATE=$(date -r "$WHEN_LAST_CALCULATED" '+%Y-%m-%d %H:%M:%S')
    echo "Last calculated: $LAST_CALC_DATE"
else
    echo "Last calculated: Never or unknown"
fi

# Show sample of pubkeys (first 5)
echo -e "\nSample pubkeys from whitelist:"
echo "----------------------------"
grep -o '"[^"]*": true' "$WHITELIST_OUTPUT_FILE" | head -n 5 | sed 's/": true//'

# Get breakdown of influence and hops criteria
echo -e "\nBreakdown of matching criteria from Neo4j:"
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USERNAME" -p "$NEO4J_PASSWORD" "
MATCH (n:NostrUser)
WHERE n.pubkey IN [pubkey IN keys(apoc.convert.fromJsonMap('$(cat $WHITELIST_OUTPUT_FILE)')) WHERE apoc.convert.fromJsonMap('$(cat $WHITELIST_OUTPUT_FILE)')[pubkey] = true]
WITH n
RETURN 
  'Total in whitelist' as Category, 
  count(n) as Count
UNION
MATCH (n:NostrUser)
WHERE n.pubkey IN [pubkey IN keys(apoc.convert.fromJsonMap('$(cat $WHITELIST_OUTPUT_FILE)')) WHERE apoc.convert.fromJsonMap('$(cat $WHITELIST_OUTPUT_FILE)')[pubkey] = true]
  AND n.influence >= $INFLUENCE_CUTOFF
RETURN 
  'Influence >= $INFLUENCE_CUTOFF' as Category, 
  count(n) as Count
UNION
MATCH (n:NostrUser)
WHERE n.pubkey IN [pubkey IN keys(apoc.convert.fromJsonMap('$(cat $WHITELIST_OUTPUT_FILE)')) WHERE apoc.convert.fromJsonMap('$(cat $WHITELIST_OUTPUT_FILE)')[pubkey] = true]
  AND n.hops <= $HOPS_CUTOFF
RETURN 
  'Hops <= $HOPS_CUTOFF' as Category, 
  count(n) as Count
UNION
MATCH (n:NostrUser)
WHERE n.pubkey IN [pubkey IN keys(apoc.convert.fromJsonMap('$(cat $WHITELIST_OUTPUT_FILE)')) WHERE apoc.convert.fromJsonMap('$(cat $WHITELIST_OUTPUT_FILE)')[pubkey] = true]
  AND n.blacklisted = 0
RETURN 
  'Not blacklisted' as Category, 
  count(n) as Count
ORDER BY Category
"

# Exit with success
exit 0
