#!/bin/bash

# This script will calculate the number of mutes that need to be added and deleted
# It will create two files: mutesToAddToNeo4j.json and mutesToDeleteFromNeo4j.json
# It will use the files in currentRelationshipsFromStrfry and currentRelationshipsFromNeo4j directories

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# Step 1: Calculate the number of mutes that need to be added
# This will create a file to the json directory called mutesToAddToNeo4j.json
# It will cycle through each pubkey, one at a time, in currentRelationshipsFromStrfry.
# For each pubkey, it will cycle through each muted pubkey, one at a time, in currentRelationshipsFromStrfry.
# If the muted pubkey is not in currentRelationshipsFromNeo4j, it will add it to mutesToAddToNeo4j.json.


# Step 2: Calculate the number of mutes that need to be deleted
# This will create a file to the json directory called mutesToDeleteFromNeo4j.json
# It will cycle through each pubkey, one at a time, in currentRelationshipsFromNeo4j.
# For each pubkey, it will cycle through each muted pubkey, one at a time, in currentRelationshipsFromNeo4j.
# If the muted pubkey is not in currentRelationshipsFromStrfry, it will add it to mutesToDeleteFromNeo4j.json.
