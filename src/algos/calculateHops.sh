#!/bin/bash

# This calculates number of hops from scratch starting with GRAPEVINE_REFERENCE_PUBKEY which by definition is 0 hops away
# The resuls are stored in neo4j using the property: hops

source /etc/hasenpfeffr.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, GRAPEVINE_REFERENCE_PUBKEY

CYPHER1="MATCH (u:NostrUser) SET u.hops=999"
CYPHER2="MATCH (u:NostrUser {pubkey:'$GRAPEVINE_REFERENCE_PUBKEY'}) SET u.hops=0"
CYPHER3="MATCH (u1:NostrUser)-[:FOLLOWS]->(u2:NostrUser) WHERE u2.hops - u1.hops > 1 SET u2.hops = u1.hops + 1 RETURN count(u2) as numUpdates"

numHops=1

echo "$(date): Starting calculateHops" >> /var/log/hasenpfeffr/calculateHops.log

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1"
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2"
cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3")
numUpdates="${cypherResults:11}"

while [[ "$numUpdates" -gt 0 ]] && [[ "$numHops" -lt 12 ]];
do
    ((numHops++))
    cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3")
    numUpdates="${cypherResults:11}"
done

echo "$(date): Finished calculateHops" >> /var/log/hasenpfeffr/calculateHops.log