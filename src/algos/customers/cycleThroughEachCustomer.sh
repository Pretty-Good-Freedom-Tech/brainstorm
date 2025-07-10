#!/bin/bash

# This script cycles through each customer and runs calculateAllScores.sh for each one
# It will pass the customer_id as an argument to calculateAllScores.sh

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE" # BRAINSTORM_MODULE_ALGOS_DIR

SCRIPTS_DIR="$BRAINSTORM_MODULE_ALGOS_DIR/customers/"

# cycle through cloudfodder
sudo bash $SCRIPTS_DIR/calculateAllScores.sh cloudfodder

# cycle through dawn
sudo bash $SCRIPTS_DIR/calculateAllScores.sh dawn

# cycle through ManiMe
sudo bash $SCRIPTS_DIR/calculateAllScores.sh manime

