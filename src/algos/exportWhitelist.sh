#!/bin/bash

source /etc/hasenpfeffr.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

echo "Running exportWhiteList. This script updates /usr/local/lib/node_modules/hasenpfeffr/plugins/whitelist_pubkeys.json based on personalizedPageRank scores stored in neo4j."

CYPHER1="
MATCH (n:NostrUser) WHERE n.influence > 0.1
RETURN n.influence, n.pubkey
ORDER BY n.influence DESC
"

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1" | tail -n +2 > /usr/local/lib/node_modules/hasenpfeffr/src/algos/whitelistQueryOutput.txt

# create whitelist

touch /usr/local/lib/node_modules/hasenpfeffr/src/algos/whitelist_pubkeys.json

echo "{" >> /usr/local/lib/node_modules/hasenpfeffr/src/algos/whitelist_pubkeys.json

# iterate through all pubkeys and add to json file

numLines=$(wc -l /usr/local/lib/node_modules/hasenpfeffr/src/algos/whitelistQueryOutput.txt | awk '{print $1}')

whichLine=1
while read -r p;
do
  IFS=','
  read -ra array1 <<< "$p"
  IFS='"'
  read -ra array2 <<< "$p"
  if [ "$whichLine" -lt "$numLines" ]; then
    echo "  \"${array2[1]}\": true," >> /usr/local/lib/node_modules/hasenpfeffr/src/algos/whitelist_pubkeys.json
  else
    echo "  \"${array2[1]}\": true" >> /usr/local/lib/node_modules/hasenpfeffr/src/algos/whitelist_pubkeys.json
  fi
  ((whichLine++))
done < /usr/local/lib/node_modules/hasenpfeffr/src/algos/whitelistQueryOutput.txt

echo "}" >> /usr/local/lib/node_modules/hasenpfeffr/src/algos/whitelist_pubkeys.json

sudo mv /usr/local/lib/node_modules/hasenpfeffr/src/algos/whitelist_pubkeys.json /usr/local/lib/node_modules/hasenpfeffr/plugins/whitelist_pubkeys.json

# clean up
sudo rm /usr/local/lib/node_modules/hasenpfeffr/src/algos/whitelistQueryOutput.txt