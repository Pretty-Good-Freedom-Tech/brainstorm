#!/bin/bash
#
# Configure sudo privileges for the control panel
# This script adds a sudoers configuration to allow the user running the control panel
# to execute systemctl commands without a password
#

set -e  # Exit on error

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
  echo "This script must be run as root" >&2
  exit 1
fi

# Get the user running the control panel service
CONTROL_PANEL_USER=$(systemctl show -p User hasenpfeffr-control-panel.service | cut -d= -f2)

# If no user is specified, default to hasenpfeffr
if [ -z "$CONTROL_PANEL_USER" ]; then
  CONTROL_PANEL_USER="hasenpfeffr"
  echo "No user found in service file, defaulting to 'hasenpfeffr'"
fi

echo "Configuring sudo privileges for user: $CONTROL_PANEL_USER"

# Create a temporary file for the sudoers entry
SUDOERS_TMP=$(mktemp)

# Create the sudoers entry - only allow systemctl commands for specific services
cat > "$SUDOERS_TMP" << EOF
# Allow $CONTROL_PANEL_USER to manage Hasenpfeffr systemd services without password
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl start neo4j
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl stop neo4j
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart neo4j
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl is-active neo4j

$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl start strfry
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl stop strfry
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart strfry
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl is-active strfry

$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl start hasenpfeffr-control-panel
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl stop hasenpfeffr-control-panel
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart hasenpfeffr-control-panel
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl is-active hasenpfeffr-control-panel

$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl start strfry-router
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl stop strfry-router
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart strfry-router
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl is-active strfry-router

$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl start addToQueue
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl stop addToQueue
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart addToQueue
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl is-active addToQueue

$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl start processQueue
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl stop processQueue
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart processQueue
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl is-active processQueue

$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl start processAllTasks.timer
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl stop processAllTasks.timer
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart processAllTasks.timer
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl is-active processAllTasks.timer

$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl start reconcile.timer
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl stop reconcile.timer
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart reconcile.timer
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl is-active reconcile.timer

$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl start calculateHops.timer
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl stop calculateHops.timer
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart calculateHops.timer
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl is-active calculateHops.timer

$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl start calculatePersonalizedPageRank.timer
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl stop calculatePersonalizedPageRank.timer
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart calculatePersonalizedPageRank.timer
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl is-active calculatePersonalizedPageRank.timer

$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl start calculatePersonalizedGrapeRank.timer
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl stop calculatePersonalizedGrapeRank.timer
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart calculatePersonalizedGrapeRank.timer
$CONTROL_PANEL_USER ALL=(ALL) NOPASSWD: /bin/systemctl is-active calculatePersonalizedGrapeRank.timer
EOF

# Check syntax of the sudoers entry
visudo -c -f "$SUDOERS_TMP"
if [ $? -ne 0 ]; then
  echo "Error: Invalid sudoers syntax" >&2
  rm -f "$SUDOERS_TMP"
  exit 1
fi

# Create a sudoers.d file for the control panel
SUDOERS_FILE="/etc/sudoers.d/hasenpfeffr-control-panel"
mv "$SUDOERS_TMP" "$SUDOERS_FILE"
chmod 440 "$SUDOERS_FILE"

echo "Successfully configured sudo privileges for $CONTROL_PANEL_USER to manage systemd services"
echo "The control panel can now control services without password prompts"
