#!/bin/bash

# This script cycles through each customer and runs calculateAllScores.sh for each one
# It will pass the customer_id as an argument to calculateAllScores.sh

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE" # BRAINSTORM_MODULE_ALGOS_DIR

SCRIPTS_DIR="$BRAINSTORM_MODULE_ALGOS_DIR/customers/"

CUSTOMERS_DIR="/var/lib/brainstorm/customers"

CUSTOMERS_JSON="$CUSTOMERS_DIR/customers.json"

# cycle through each customer in customers.json
# determine which customers are active
# for each active customer, run calculateAllScores.sh <customer_name>


# cycle through cloudfodder
sudo bash $SCRIPTS_DIR/calculateAllScores.sh cloudfodder

# cycle through dawn
sudo bash $SCRIPTS_DIR/calculateAllScores.sh dawn

# cycle through ManiMe
sudo bash $SCRIPTS_DIR/calculateAllScores.sh manime

