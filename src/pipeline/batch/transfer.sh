#!/bin/bash

# This takes several hours and loads all kind 3 events into strfry from scratch
# The basic command transfers ALL kind 3 events.
# sudo ./transfer.sh
# optional parameters: --recent followed by an integer which is how far back. eg to transfer all events from the past 24 hours, execute:
# sudo ./transfer.sh --recent 86400
# Notably, this script will not delete FOLLOWS that need to be deleted due to unfollowing. For that, use the reconcile module.

source /etc/hasenpfeffr.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

touch ${HASENPFEFFR_LOG_DIR}/batchTransfer.log
sudo chown hasenpfeffr:hasenpfeffr ${HASENPFEFFR_LOG_DIR}/batchTransfer.log

echo "$(date): Starting batchTransfer" 
echo "$(date): Starting batchTransfer" >> ${HASENPFEFFR_LOG_DIR}/batchTransfer.log

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

######################## FOLLOWS ###########################
echo "$(date): Continuing batchTransfer ... starting to process follows"
echo "$(date): Continuing batchTransfer ... starting to process follows" >> ${HASENPFEFFR_LOG_DIR}/batchTransfer.log

# Execute the scripts with full paths
sudo "$SCRIPT_DIR/strfryToKind3Events.sh" "$1" "$2"
sudo "$SCRIPT_DIR/kind3EventsToFollows.sh"

# add FOLLOWS relationships from followsToAddToNeo4j.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$SCRIPT_DIR/apocCypherCommand1_follows" > /dev/null

# update NostrUser kind3EventId and kind3CreatedAt properties by iterating through allKind3EventsStripped.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$SCRIPT_DIR/apocCypherCommand2_follows" > /dev/null

# clean up follows

sudo rm /var/lib/neo4j/import/followsToAddToNeo4j.json
sudo rm /var/lib/neo4j/import/allKind3EventsStripped.json

######################## MUTES ###########################
echo "$(date): Continuing batchTransfer ... finished processing follows, starting to process mutes"
echo "$(date): Continuing batchTransfer ... finished processing follows, starting to process mutes" >> ${HASENPFEFFR_LOG_DIR}/batchTransfer.log

# Execute the scripts with full paths
sudo "$SCRIPT_DIR/strfryToKind10000Events.sh" "$1" "$2"
sudo "$SCRIPT_DIR/kind10000EventsToMutes.sh"

# add MUTES relationships from mutesToAddToNeo4j.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$SCRIPT_DIR/apocCypherCommand1_mutes" > /dev/null

# update NostrUser kind10000EventId and kind10000CreatedAt properties by iterating through allKind10000EventsStripped.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$SCRIPT_DIR/apocCypherCommand2_mutes" > /dev/null

# clean up mutes

sudo rm /var/lib/neo4j/import/mutesToAddToNeo4j.json
sudo rm /var/lib/neo4j/import/allKind10000EventsStripped.json

######################## REPORTS ###########################
echo "$(date): Continuing batchTransfer ... finished processing mutes, starting to process reports"
echo "$(date): Continuing batchTransfer ... finished processing mutes, starting to process reports" >> ${HASENPFEFFR_LOG_DIR}/batchTransfer.log

# Execute the scripts with full paths
sudo "$SCRIPT_DIR/strfryToKind1984Events.sh" "$1" "$2"
sudo "$SCRIPT_DIR/kind1984EventsToReports.sh"

# add REPORTS relationships from reportsToAddToNeo4j.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$SCRIPT_DIR/apocCypherCommand1_reports" > /dev/null

# update NostrUser kind1984EventId and kind1984CreatedAt properties by iterating through allKind1984EventsStripped.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$SCRIPT_DIR/apocCypherCommand2_reports" > /dev/null

# clean up reports

sudo rm /var/lib/neo4j/import/reportsToAddToNeo4j.json
sudo rm /var/lib/neo4j/import/allKind1984EventsStripped.json

######################## END ###########################

echo "$(date): Finished batchTransfer" 
echo "$(date): Finished batchTransfer" >> ${HASENPFEFFR_LOG_DIR}/batchTransfer.log