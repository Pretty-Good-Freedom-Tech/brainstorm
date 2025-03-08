#!/bin/bash
#
# Setup Queue Directories for Hasenpfeffr
# This script creates queue directories in /var/lib/hasenpfeffr
# which is a standard location for variable data that won't be
# affected by systemd's ProtectSystem directive
#

set -e  # Exit on error

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
  echo "This script must be run as root" >&2
  exit 1
fi

# Define the username
USERNAME="hasenpfeffr"

# Check if user exists
if ! id "$USERNAME" &>/dev/null; then
  echo "Error: User $USERNAME does not exist. Please create the user first." >&2
  exit 1
fi

# Create the base directory structure
BASE_DIR="/var/lib/hasenpfeffr"
STREAM_DIR="$BASE_DIR/pipeline/stream"
RECONCILE_DIR="$BASE_DIR/pipeline/reconcile"

# Create directories
mkdir -p "$STREAM_DIR/queue"
mkdir -p "$STREAM_DIR/queue_tmp"
mkdir -p "$RECONCILE_DIR/queue"
mkdir -p "$RECONCILE_DIR/queue_temp"

# Set ownership
chown -R "$USERNAME:$USERNAME" "$BASE_DIR"

# Set permissions
chmod -R 755 "$BASE_DIR"

echo "Successfully created queue directories in $BASE_DIR"
echo "You will need to update your scripts to use these new locations."
