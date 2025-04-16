#!/bin/bash

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, STRFRY_PLUGINS_DATA
source /etc/whitelist.conf

WHITELIST_OUTPUT_DIR=${STRFRY_PLUGINS_DATA}

touch ${BRAINSTORM_LOG_DIR}/exportWhitelist.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/exportWhitelist.log

echo "$(date): Starting exportWhitelist" >> ${BRAINSTORM_LOG_DIR}/exportWhitelist.log

echo "Running exportWhiteList. This script updates ${WHITELIST_OUTPUT_DIR}/whitelist_pubkeys.json based on personalizedPageRank scores stored in neo4j."

CYPHER1="
MATCH (n:NostrUser) WHERE n.personalizedPageRank > 0.000001
RETURN n.personalizedPageRank, n.pubkey
ORDER BY n.personalizedPageRank DESC
"

CYPHER2="MATCH (n:NostrUser) "

# Add condition based on combination logic
if [ "$COMBINATION_LOGIC" = "AND" ]; then
    CYPHER2+="WHERE (n.influence >= $INFLUENCE_CUTOFF AND n.hops <= $HOPS_CUTOFF)"
else
    CYPHER2+="WHERE (n.influence >= $INFLUENCE_CUTOFF OR n.hops <= $HOPS_CUTOFF)"
fi

# Add blacklist condition if needed
if [ "$INCORPORATE_BLACKLIST" = "true" ]; then
    CYPHER2+=" AND (n.blacklisted IS NULL OR n.blacklisted = 0)"
fi
        
CYPHER2+="
RETURN n.influence, n.pubkey
ORDER BY n.influence DESC
"

echo "$CYPHER2" >> ${BRAINSTORM_LOG_DIR}/exportWhitelist.log

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2" | tail -n +2 > ${WHITELIST_OUTPUT_DIR}/whitelistQueryOutput.txt

# create whitelist

touch ${WHITELIST_OUTPUT_DIR}/whitelist_pubkeys.json

echo "{" > ${WHITELIST_OUTPUT_DIR}/whitelist_pubkeys.json

# iterate through all pubkeys and add to json file

numLines=$(wc -l ${WHITELIST_OUTPUT_DIR}/whitelistQueryOutput.txt | awk '{print $1}')

whichLine=1
while read -r p;
do
  IFS=','
  read -ra array1 <<< "$p"
  IFS='"'
  read -ra array2 <<< "$p"
  if [ "$whichLine" -lt "$numLines" ]; then
    echo "  \"${array2[1]}\": true," >> ${WHITELIST_OUTPUT_DIR}/whitelist_pubkeys.json
  else
    echo "  \"${array2[1]}\": true" >> ${WHITELIST_OUTPUT_DIR}/whitelist_pubkeys.json
  fi
  ((whichLine++))
done < ${WHITELIST_OUTPUT_DIR}/whitelistQueryOutput.txt

echo "}" >> ${WHITELIST_OUTPUT_DIR}/whitelist_pubkeys.json

sudo chown brainstorm:brainstorm ${WHITELIST_OUTPUT_DIR}/whitelist_pubkeys.json

# clean up
sudo rm ${WHITELIST_OUTPUT_DIR}/whitelistQueryOutput.txt

echo "$(date): Finished exportWhitelist" >> ${BRAINSTORM_LOG_DIR}/exportWhitelist.log