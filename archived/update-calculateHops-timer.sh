#!/bin/bash

# Source the configuration file
source /etc/hasenpfeffr.conf

# Set default value if not defined
CALCULATE_HOPS_TIMER=${CALCULATE_HOPS_TIMER:-"24h"}

# Create the timer file
cat > /etc/systemd/system/calculateHops.timer << EOF
[Unit]
Description=Run calculateHops periodically
After=network.target neo4j.service

[Timer]
OnBootSec=15min
OnUnitActiveSec=${CALCULATE_HOPS_TIMER}
RandomizedDelaySec=30min

[Install]
WantedBy=timers.target
EOF

# Reload systemd and restart the timer
systemctl daemon-reload
systemctl restart calculateHops.timer

echo "calculateHops timer updated to run every ${CALCULATE_HOPS_TIMER}"
