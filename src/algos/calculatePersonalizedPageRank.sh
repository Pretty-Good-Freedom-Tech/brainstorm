#!/bin/bash
set -e          # Exit immediately on command failure
set -o pipefail # Fail if any pipeline command fails

# Calculates personalized PageRank using BRAINSTORM_OWNER_PUBKEY as the reference user
# Results are written to neo4j database and stored in each NostrUser node using the personalizedPageRank property

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_OWNER_PUBKEY, BRAINSTORM_LOG_DIR, BRAINSTORM_MODULE_ALGOS_DIR

# Source structured logging utilities
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

touch ${BRAINSTORM_LOG_DIR}/calculatePersonalizedPageRank.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculatePersonalizedPageRank.log

echo "$(date): Starting calculatePersonalizedPageRank"
echo "$(date): Starting calculatePersonalizedPageRank" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedPageRank.log

# Emit structured event for task start
emit_task_event "TASK_START" "calculateOwnerPageRank" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Starting owner-level personalized PageRank calculation",
    "task_type": "owner_algorithm",
    "algorithm": "personalized_pagerank",
    "scope": "owner",
    "reference_user": "'$BRAINSTORM_OWNER_PUBKEY'",
    "max_iterations": 20,
    "damping_factor": 0.85,
    "scaler": "MinMax",
    "phases": ["graph_projection", "pagerank_calculation", "graph_cleanup"],
    "database": "neo4j",
    "gds_enabled": true,
    "category": "algorithms",
    "parent_task": "processAllTasks"
}'

CYPHER1="
MATCH (source:NostrUser)-[r:FOLLOWS]->(target:NostrUser)
RETURN gds.graph.project(
  'personalizedPageRank_$BRAINSTORM_OWNER_PUBKEY',
  source,
  target
)
"

CYPHER2="
MATCH (refUser:NostrUser {pubkey: '$BRAINSTORM_OWNER_PUBKEY'})
CALL gds.pageRank.write('personalizedPageRank_$BRAINSTORM_OWNER_PUBKEY', {
  maxIterations: 20,
  dampingFactor: 0.85,
  scaler: 'MinMax',
  writeProperty: 'personalizedPageRank',
  sourceNodes: [refUser]
})
YIELD nodePropertiesWritten, ranIterations
RETURN nodePropertiesWritten, ranIterations
"

CYPHER3="CALL gds.graph.drop('personalizedPageRank_$BRAINSTORM_OWNER_PUBKEY') YIELD graphName"

# Emit structured event for graph projection start
emit_task_event "PROGRESS" "calculateOwnerPageRank" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Starting graph projection for PageRank",
    "phase": "graph_projection",
    "step": "create_gds_graph",
    "algorithm": "personalized_pagerank",
    "graph_name": "personalizedPageRank_'$BRAINSTORM_OWNER_PUBKEY'",
    "relationship_type": "FOLLOWS",
    "database": "neo4j"
}'

if sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1"; then
    # Emit structured event for graph projection success
    emit_task_event "PROGRESS" "calculateOwnerPageRank" "$BRAINSTORM_OWNER_PUBKEY" '{
        "message": "Graph projection completed successfully",
        "phase": "graph_projection",
        "step": "create_gds_graph_complete",
        "algorithm": "personalized_pagerank",
        "graph_name": "personalizedPageRank_'$BRAINSTORM_OWNER_PUBKEY'",
        "status": "success",
        "database": "neo4j"
    }'
else
    # Emit structured event for graph projection failure
    emit_task_event "TASK_ERROR" "calculateOwnerPageRank" "$BRAINSTORM_OWNER_PUBKEY" '{
        "message": "Graph projection failed",
        "status": "failed",
        "task_type": "owner_algorithm",
        "algorithm": "personalized_pagerank",
        "phase": "graph_projection",
        "error_reason": "cypher_query_failure",
        "database": "neo4j",
        "category": "algorithms",
        "scope": "owner",
        "parent_task": "processAllTasks"
    }'
    exit 1
fi

echo "$(date): Continuing calculatePersonalizedPageRank ... finished CYPHER1"
echo "$(date): Continuing calculatePersonalizedPageRank ... finished CYPHER1" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedPageRank.log

# Emit structured event for PageRank calculation start
emit_task_event "PROGRESS" "calculateOwnerPageRank" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Starting personalized PageRank calculation",
    "phase": "pagerank_calculation",
    "step": "run_pagerank_algorithm",
    "algorithm": "personalized_pagerank",
    "max_iterations": 20,
    "damping_factor": 0.85,
    "scaler": "MinMax",
    "reference_user": "'$BRAINSTORM_OWNER_PUBKEY'",
    "write_property": "personalizedPageRank",
    "database": "neo4j"
}'

if sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2"; then
    # Emit structured event for PageRank calculation success
    emit_task_event "PROGRESS" "calculateOwnerPageRank" "$BRAINSTORM_OWNER_PUBKEY" '{
        "message": "Personalized PageRank calculation completed successfully",
        "phase": "pagerank_calculation",
        "step": "run_pagerank_algorithm_complete",
        "algorithm": "personalized_pagerank",
        "status": "success",
        "database": "neo4j"
    }'
else
    # Emit structured event for PageRank calculation failure
    emit_task_event "TASK_ERROR" "calculateOwnerPageRank" "$BRAINSTORM_OWNER_PUBKEY" '{
        "message": "Personalized PageRank calculation failed",
        "status": "failed",
        "task_type": "owner_algorithm",
        "algorithm": "personalized_pagerank",
        "phase": "pagerank_calculation",
        "error_reason": "cypher_query_failure",
        "database": "neo4j",
        "category": "algorithms",
        "scope": "owner",
        "parent_task": "processAllTasks"
    }'
    exit 1
fi

echo "$(date): Continuing calculatePersonalizedPageRank ... finished CYPHER2"
echo "$(date): Continuing calculatePersonalizedPageRank ... finished CYPHER2" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedPageRank.log

# Emit structured event for graph cleanup start
emit_task_event "PROGRESS" "calculateOwnerPageRank" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Starting graph cleanup",
    "phase": "graph_cleanup",
    "step": "drop_gds_graph",
    "algorithm": "personalized_pagerank",
    "graph_name": "personalizedPageRank_'$BRAINSTORM_OWNER_PUBKEY'",
    "database": "neo4j"
}'

if sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3"; then
    # Emit structured event for graph cleanup success
    emit_task_event "PROGRESS" "calculateOwnerPageRank" "$BRAINSTORM_OWNER_PUBKEY" '{
        "message": "Graph cleanup completed successfully",
        "phase": "graph_cleanup",
        "step": "drop_gds_graph_complete",
        "algorithm": "personalized_pagerank",
        "graph_name": "personalizedPageRank_'$BRAINSTORM_OWNER_PUBKEY'",
        "status": "success",
        "database": "neo4j"
    }'
else
    # Emit structured event for graph cleanup failure (non-fatal)
    emit_task_event "PROGRESS" "calculateOwnerPageRank" "$BRAINSTORM_OWNER_PUBKEY" '{
        "message": "Graph cleanup failed (non-fatal)",
        "phase": "graph_cleanup",
        "step": "drop_gds_graph_failed",
        "algorithm": "personalized_pagerank",
        "status": "warning",
        "error_reason": "graph_cleanup_failure",
        "database": "neo4j"
    }'
fi

echo "$(date): Continuing calculatePersonalizedPageRank ... finished CYPHER3"
echo "$(date): Continuing calculatePersonalizedPageRank ... finished CYPHER3" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedPageRank.log

# Emit structured event for successful completion
emit_task_event "TASK_END" "calculateOwnerPageRank" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Owner-level personalized PageRank calculation completed successfully",
    "status": "success",
    "task_type": "owner_algorithm",
    "algorithm": "personalized_pagerank",
    "phases_completed": ["graph_projection", "pagerank_calculation", "graph_cleanup"],
    "max_iterations": 20,
    "damping_factor": 0.85,
    "scaler": "MinMax",
    "reference_user": "'$BRAINSTORM_OWNER_PUBKEY'",
    "write_property": "personalizedPageRank",
    "database": "neo4j",
    "gds_enabled": true,
    "category": "algorithms",
    "scope": "owner",
    "parent_task": "processAllTasks"
}'

# once personalizedPageRank scores are updated in neo4j (above), call the script that updates the plugin whitelist:
# sudo ${BRAINSTORM_MODULE_ALGOS_DIR}/exportWhitelist.sh

echo "$(date): Finished calculatePersonalizedPageRank"
echo "$(date): Finished calculatePersonalizedPageRank" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedPageRank.log

exit 0  # Explicit success exit code for parent script orchestration
