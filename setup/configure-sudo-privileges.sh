#!/bin/bash
#
# Configure sudo privileges for hasenpfeffr user
# This script adds the hasenpfeffr user to the sudoers file
# with NOPASSWD option to allow sudo without password
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

# Create a temporary file for the sudoers entry
SUDOERS_TMP=$(mktemp)

# Create the sudoers entry
echo "$USERNAME ALL=(ALL) NOPASSWD: ALL" > "$SUDOERS_TMP"

# Check syntax of the sudoers entry
visudo -c -f "$SUDOERS_TMP"
if [ $? -ne 0 ]; then
  echo "Error: Invalid sudoers syntax" >&2
  rm -f "$SUDOERS_TMP"
  exit 1
fi

# Create a sudoers.d file for the user
SUDOERS_FILE="/etc/sudoers.d/$USERNAME"
mv "$SUDOERS_TMP" "$SUDOERS_FILE"
chmod 440 "$SUDOERS_FILE"

echo "Successfully configured sudo privileges for $USERNAME without password"
echo "The user can now run sudo commands without being prompted for a password"

# Set permissions for Hasenpfeffr scripts
sudo chmod +x /usr/local/lib/node_modules/hasenpfeffr/src/algos/personalizedGrapeRank/*.sh
sudo chmod +x /usr/local/lib/node_modules/hasenpfeffr/src/algos/personalizedGrapeRank/*.js

# set ownershiup for configuration files 
sudo chown root:hasenpfeffr /etc/hasenpfeffr.conf
sudo chown root:hasenpfeffr /etc/graperank.conf
sudo chown root:hasenpfeffr /etc/blacklist.conf
sudo chown root:hasenpfeffr /etc/strfry-router.conf
