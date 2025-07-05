#!/bin/bash

# This script will calculate the number of follows that need to be added and deleted
# It will create two files: followsToAddToNeo4j.json and followsToDeleteFromNeo4j.json
# It will use the files in currentRelationshipsFromStrfry and currentRelationshipsFromNeo4j directories

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# Step 1: Calculate the number of follows that need to be added
# This will create a file to the json directory called followsToAddToNeo4j.json
# It will cycle through each pubkey, one at a time, in currentRelationshipsFromStrfry.
# For each pubkey, it will cycle through each followee, one at a time, in currentRelationshipsFromStrfry.
# If the followee is not in currentRelationshipsFromNeo4j, it will add it to followsToAddToNeo4j.json.


# Step 2: Calculate the number of follows that need to be deleted
# This will create a file to the json directory called followsToDeleteFromNeo4j.json
# It will cycle through each pubkey, one at a time, in currentRelationshipsFromNeo4j.
# For each pubkey, it will cycle through each followee, one at a time, in currentRelationshipsFromNeo4j.
# If the followee is not in currentRelationshipsFromStrfry, it will add it to followsToDeleteFromNeo4j.json.
