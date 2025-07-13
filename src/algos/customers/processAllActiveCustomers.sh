#!/bin/bash

# processAllActiveCustomers.sh
# logs start and finish and calls javascript processAllActiveCustomers.js

# Source configuration
source /etc/brainstorm.conf # BRAINSTORM_MODULE_ALGOS_DIR, BRAINSTORM_LOG_DIR

echo "$(date): Starting processAllActiveCustomers"
echo "$(date): Starting processAllActiveCustomers" >> ${BRAINSTORM_LOG_DIR}/processAllActiveCustomers.log

ALGOS_DIR="${BRAINSTORM_MODULE_ALGOS_DIR}"

# Run the JavaScript script
node $ALGOS_DIR/customers/processAllActiveCustomers.js

echo "$(date): Finished processAllActiveCustomers"
echo "$(date): Finished processAllActiveCustomers" >> ${BRAINSTORM_LOG_DIR}/processAllActiveCustomers.log
