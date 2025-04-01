#!/bin/bash

source /etc/hasenpfeffr.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, STRFRY_PLUGINS_DATA

WHITELIST_OUTPUT_DIR=${STRFRY_PLUGINS_DATA}

touch ${HASENPFEFFR_LOG_DIR}/exportWhitelist.log
sudo chown hasenpfeffr:hasenpfeffr ${HASENPFEFFR_LOG_DIR}/exportWhitelist.log

echo "$(date): Starting exportWhitelist" >> ${HASENPFEFFR_LOG_DIR}/exportWhitelist.log

echo "Running exportWhiteList. This script updates ${WHITELIST_OUTPUT_DIR}/whitelist_pubkeys.json based on personalizedPageRank scores stored in neo4j."

CYPHER1="
MATCH (n:NostrUser) WHERE n.personalizedPageRank > 0.000001
RETURN n.personalizedPageRank, n.pubkey
ORDER BY n.personalizedPageRank DESC
"

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1" | tail -n +2 > ${WHITELIST_OUTPUT_DIR}/whitelistQueryOutput.txt

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

sudo chown hasenpfeffr:hasenpfeffr ${WHITELIST_OUTPUT_DIR}/whitelist_pubkeys.json

# clean up
sudo rm ${WHITELIST_OUTPUT_DIR}/whitelistQueryOutput.txt

echo "$(date): Finished exportWhitelist" >> ${HASENPFEFFR_LOG_DIR}/exportWhitelist.log