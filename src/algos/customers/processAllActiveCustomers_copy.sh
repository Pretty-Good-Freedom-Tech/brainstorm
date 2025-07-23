#!/bin/bash

# processAllActiveCustomers.sh
# logs start and finish and calls javascript processAllActiveCustomers.js

# Source configuration
source /etc/brainstorm.conf # BRAINSTORM_MODULE_ALGOS_DIR, BRAINSTORM_LOG_DIR

# Create log directory if it doesn't exist; chown to brainstorm:brainstorm
mkdir -p "$BRAINSTORM_LOG_DIR"
sudo chown brainstorm:brainstorm "$BRAINSTORM_LOG_DIR"

# Log file
LOG_FILE="$BRAINSTORM_LOG_DIR/processAllActiveCustomers.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

echo "$(date): Starting processAllActiveCustomers"
echo "$(date): Starting processAllActiveCustomers" >> ${LOG_FILE}

ALGOS_DIR="${BRAINSTORM_MODULE_ALGOS_DIR}"

# Run the JavaScript script
sudo node $ALGOS_DIR/customers/processAllActiveCustomers.js

echo "$(date): Continuing processAllActiveCustomers; clean up personalizedGrapeRank tmp files"
echo "$(date): Continuing processAllActiveCustomers; clean up personalizedGrapeRank tmp files" >> ${LOG_FILE}

# clean up personalizedGrapeRank tmp files
sudo rm -rf /var/lib/brainstorm/algos/personalizedGrapeRank/tmp

echo "$(date): Finished processAllActiveCustomers"
echo "$(date): Finished processAllActiveCustomers" >> ${LOG_FILE}
