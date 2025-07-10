#!/bin/bash

# This script adds SetOfNostrUserWotMetricsCards nodes to the neo4j database for a given customer.
# It is called with a command like:
# sudo bash addSetsOfMetricsCards.sh

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_LOG_DIR

CYPHER1="MATCH (n:NostrUser)
WHERE NOT (n) -[:WOT_METRICS_CARDS]-> (:Set:SetOfNostrUserWotMetricsCards)
LIMIT 100000
MERGE (n) -[:WOT_METRICS_CARDS]-> (s:Set:SetOfNostrUserWotMetricsCards)
SET s.observee_pubkey = n.pubkey"

echo "$(date): Starting addSetsOfMetricsCards" >> ${BRAINSTORM_LOG_DIR}/addSetsOfMetricsCards.log

# Iterate CYPHER1 until numSets is zero or for a maximum of 20 iterations
numSets=1
while [[ "$numSets" -gt 0 ]] && [[ "$numSets" -lt 20 ]]; do
    cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
    numSets="${cypherResults:11}"
    echo "$(date): numSets = $numSets" >> ${BRAINSTORM_LOG_DIR}/addSetsOfMetricsCards.log
    sleep 1
    ((numSets++))
done