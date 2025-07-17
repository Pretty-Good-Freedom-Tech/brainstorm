#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateFollowerMuterReporterInputs.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateFollowerMuterReporterInputs.log

echo "$(date): Starting calculateFollowerMuterReporterInputs"
echo "$(date): Starting calculateFollowerMuterReporterInputs" >> ${BRAINSTORM_LOG_DIR}/calculateFollowerMuterReporterInputs.log  

set -e  # Exit on error

# Configuration
NEO4J_USERNAME="neo4j"
NEO4J_PASSWORD="neo4j"
if [ -f "/etc/brainstorm.conf" ]; then
  source /etc/brainstorm.conf
  NEO4J_PASSWORD=${NEO4J_PASSWORD:-neo4j}
else
  NEO4J_PASSWORD="neo4j"
  echo "Warning: /etc/brainstorm.conf not found, using default Neo4j password"
fi

# Cypher query to calculate followedInput, mutedInput, and reportedInput for all NostrUsers
CALCULATE_INPUTS_QUERY1=$(cat <<EOF
// Reset all input values
MATCH (n:NostrUser)
SET n.followedInput = 0, n.mutedInput = 0, n.reportedInput = 0, n.blacklisted = 0;
EOF
)
CALCULATE_INPUTS_QUERY2=$(cat <<EOF
// Calculate followedInput
MATCH (follower:NostrUser)-[f:FOLLOWS]->(followed:NostrUser)
WITH followed, follower, follower.influence as influence
WHERE influence IS NOT NULL
WITH followed, SUM(influence) as followedInput
SET followed.followedInput = followedInput;
EOF
)
CALCULATE_INPUTS_QUERY3=$(cat <<EOF
// Calculate mutedInput
MATCH (muter:NostrUser)-[m:MUTES]->(muted:NostrUser)
WITH muted, muter, muter.influence as influence
WHERE influence IS NOT NULL
WITH muted, SUM(influence) as mutedInput
SET muted.mutedInput = mutedInput;
EOF
)
CALCULATE_INPUTS_QUERY4=$(cat <<EOF
// Calculate reportedInput
MATCH (reporter:NostrUser)-[r:REPORTS]->(reported:NostrUser)
WITH reported, reporter, reporter.influence as influence
WHERE influence IS NOT NULL
WITH reported, SUM(influence) as reportedInput
SET reported.reportedInput = reportedInput;
EOF
)

echo "$(date): Continuing calculateFollowerMuterReporterInputs ... finished defining cypher queries; about to run calculation queries"
echo "$(date): Continuing calculateFollowerMuterReporterInputs ... finished defining cypher queries; about to run calculation queries" >> ${BRAINSTORM_LOG_DIR}/calculateFollowerMuterReporterInputs.log  

# Run the calculation queries
echo "Calculating input values and blacklist status..."
# Run each query in sequence
CALCULATE_INPUTS_QUERY1_OUTPUT=$(cypher-shell -u "$NEO4J_USERNAME" -p "$NEO4J_PASSWORD" --format plain "$CALCULATE_INPUTS_QUERY1" | tail -n 1)

echo "CALCULATE_INPUTS_QUERY1_OUTPUT: $CALCULATE_INPUTS_QUERY1_OUTPUT."
echo "$(date): Continuing calculateFollowerMuterReporterInputs ... finished CALCULATE_INPUTS_QUERY1_OUTPUT"
echo "$(date): Continuing calculateFollowerMuterReporterInputs ... finished CALCULATE_INPUTS_QUERY1_OUTPUT" >> ${BRAINSTORM_LOG_DIR}/calculateFollowerMuterReporterInputs.log  

CALCULATE_INPUTS_QUERY2_OUTPUT=$(cypher-shell -u "$NEO4J_USERNAME" -p "$NEO4J_PASSWORD" --format plain "$CALCULATE_INPUTS_QUERY2" | tail -n 1)

echo "CALCULATE_INPUTS_QUERY2_OUTPUT: $CALCULATE_INPUTS_QUERY2_OUTPUT."
echo "$(date): Continuing calculateFollowerMuterReporterInputs ... finished CALCULATE_INPUTS_QUERY2_OUTPUT"
echo "$(date): Continuing calculateFollowerMuterReporterInputs ... finished CALCULATE_INPUTS_QUERY2_OUTPUT" >> ${BRAINSTORM_LOG_DIR}/calculateFollowerMuterReporterInputs.log  

CALCULATE_INPUTS_QUERY3_OUTPUT=$(cypher-shell -u "$NEO4J_USERNAME" -p "$NEO4J_PASSWORD" --format plain "$CALCULATE_INPUTS_QUERY3" | tail -n 1)

echo "CALCULATE_INPUTS_QUERY3_OUTPUT: $CALCULATE_INPUTS_QUERY3_OUTPUT."
echo "$(date): Continuing calculateFollowerMuterReporterInputs ... finished CALCULATE_INPUTS_QUERY3_OUTPUT"
echo "$(date): Continuing calculateFollowerMuterReporterInputs ... finished CALCULATE_INPUTS_QUERY3_OUTPUT" >> ${BRAINSTORM_LOG_DIR}/calculateFollowerMuterReporterInputs.log  

CALCULATE_INPUTS_QUERY4_OUTPUT=$(cypher-shell -u "$NEO4J_USERNAME" -p "$NEO4J_PASSWORD" --format plain "$CALCULATE_INPUTS_QUERY4" | tail -n 1)

echo "CALCULATE_INPUTS_QUERY4_OUTPUT: $CALCULATE_INPUTS_QUERY4_OUTPUT."
echo "$(date): Continuing calculateFollowerMuterReporterInputs ... finished CALCULATE_INPUTS_QUERY4_OUTPUT"
echo "$(date): Continuing calculateFollowerMuterReporterInputs ... finished CALCULATE_INPUTS_QUERY4_OUTPUT" >> ${BRAINSTORM_LOG_DIR}/calculateFollowerMuterReporterInputs.log  

echo "$(date): Finished calculateFollowerMuterReporterInputs"
echo "$(date): Finished calculateFollowerMuterReporterInputs" >> ${BRAINSTORM_LOG_DIR}/calculateFollowerMuterReporterInputs.log  
