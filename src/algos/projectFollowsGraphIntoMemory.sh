#!/bin/bash

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_OWNER_PUBKEY, BRAINSTORM_LOG_DIR, BRAINSTORM_MODULE_ALGOS_DIR

echo "$(date): Starting projectFollowsGraphIntoMemory"
echo "$(date): Starting projectFollowsGraphIntoMemory" >> ${BRAINSTORM_LOG_DIR}/projectFollowsGraphIntoMemory.log

CYPHER0="
CALL gds.graph.list()
YIELD graphName, creationTime, modificationTime
RETURN graphName, creationTime, modificationTime
"

# format of CYPHER0_RESULTS:
# graphName, creationTime, modificationTime
# "followsGraph", 2025-07-16T15:38:32.827528161Z[Etc/UTC], 2025-07-16T15:38:32.827528161Z[Etc/UTC]

CYPHER1="
MATCH (source:NostrUser)-[r:FOLLOWS]->(target:NostrUser)
RETURN gds.graph.project(
  'followsGraph',
  source,
  target
)
"

CYPHER2="CALL gds.graph.drop('followsGraph') YIELD graphName"

CYPHER0_RESULTS=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER0")
echo "$CYPHER0_RESULTS"

# Iterate over each line in CYPHER0_RESULTS, extract graphName, creationTime, modificationTime
RUN_GRAPH_PROJECT=true
while IFS=',' read -r graphName creationTime modificationTime; do
    if [[ "$graphName" == '"followsGraph"' ]]; then
        # if followsGraph exists, log graphName, creationTime, modificationTime
        echo "$(date): followsGraph exists"
        echo "$(date): followsGraph exists" >> ${BRAINSTORM_LOG_DIR}/projectFollowsGraphIntoMemory.log
        echo "$graphName, $creationTime, $modificationTime"
        echo "$graphName, $creationTime, $modificationTime" >> ${BRAINSTORM_LOG_DIR}/projectFollowsGraphIntoMemory.log
        # if followsGraph exists and was modified more than 4 hours ago, project it into memory using CYPHER1
        # if less than 4 hours ago, log followsGraph exists and was modified less than 4 hours ago
        if [[ "$modificationTime" -lt $(date -d "4 hours ago" +%s) ]]; then
            RUN_GRAPH_PROJECT=true
            echo "$(date): followsGraph exists and was modified more than 4 hours ago; need to reproject it"
            echo "$(date): followsGraph exists and was modified more than 4 hours ago; need to reproject it" >> ${BRAINSTORM_LOG_DIR}/projectFollowsGraphIntoMemory.log
        else
            RUN_GRAPH_PROJECT=false
            echo "$(date): followsGraph exists and was modified less than 4 hours ago; no need to reproject it"
            echo "$(date): followsGraph exists and was modified less than 4 hours ago; no need to reproject it" >> ${BRAINSTORM_LOG_DIR}/projectFollowsGraphIntoMemory.log
        fi
    fi
done <<< "$CYPHER0_RESULTS"

if [ "$RUN_GRAPH_PROJECT" = true ]; then
    # run CYPHER2 to drop the old followsGraph if it exists
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2"
    echo "$(date): followsGraph dropped"
    echo "$(date): followsGraph dropped" >> ${BRAINSTORM_LOG_DIR}/projectFollowsGraphIntoMemory.log
    # run CYPHER1 to project the new followsGraph into memory
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1"
    echo "$(date): followsGraph projected into memory"
    echo "$(date): followsGraph projected into memory" >> ${BRAINSTORM_LOG_DIR}/projectFollowsGraphIntoMemory.log
fi

echo "$(date): Finished projectFollowsGraphIntoMemory"
echo "$(date): Finished projectFollowsGraphIntoMemory" >> ${BRAINSTORM_LOG_DIR}/projectFollowsGraphIntoMemory.log
