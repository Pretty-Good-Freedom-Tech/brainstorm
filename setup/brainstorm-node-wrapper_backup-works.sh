#!/bin/bash
#
# Brainstorm Node.js Wrapper Script
# This script ensures Node.js commands use the NVM-installed version
#

# Load NVM environment
export NVM_DIR="/home/brainstorm/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Execute node with all arguments passed to this script
exec node "$@"
