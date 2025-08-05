#!/bin/bash
#
# Brainstorm Node.js Wrapper Script
# This script ensures Node.js commands use the NVM-installed version
#

# Preserve the current user and group context
CURRENT_USER=$(id -un)
CURRENT_GROUP=$(id -gn)

# Load NVM environment
export NVM_DIR="/home/brainstorm/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Ensure we're still running as the correct user/group
if [ "$CURRENT_USER" = "brainstorm" ] && [ "$CURRENT_GROUP" = "brainstorm" ]; then
    # Execute node with all arguments passed to this script
    exec node "$@"
else
    # If context changed, explicitly run as brainstorm:brainstorm
    exec sudo -u brainstorm -g brainstorm node "$@"
fi