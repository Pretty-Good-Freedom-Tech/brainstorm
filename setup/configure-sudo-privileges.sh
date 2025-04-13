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
# deprecating this block; now doing all executables recursively
# sudo chmod +x /usr/local/lib/node_modules/hasenpfeffr/src/manage/negentropySync/*.sh
# sudo chmod +x /usr/local/lib/node_modules/hasenpfeffr/src/manage/batchTransfer/*.sh
# sudo chmod +x /usr/local/lib/node_modules/hasenpfeffr/src/manage/*.sh
# sudo chmod +x /usr/local/lib/node_modules/hasenpfeffr/src/algos/personalizedGrapeRank/*.sh
# sudo chmod +x /usr/local/lib/node_modules/hasenpfeffr/src/algos/personalizedGrapeRank/*.js
# sudo chmod +x /usr/local/lib/node_modules/hasenpfeffr/src/algos/nip85/*.sh
# sudo chmod +x /usr/local/lib/node_modules/hasenpfeffr/src/algos/nip85/*.js
# sudo chmod +x /usr/local/lib/node_modules/hasenpfeffr/src/algos/nip85/*.mjs

# set ownershiup for configuration files 
sudo chown root:hasenpfeffr /etc/hasenpfeffr.conf
sudo chown root:hasenpfeffr /etc/graperank.conf
sudo chown root:hasenpfeffr /etc/strfry-router.config

# Set permissions for all Hasenpfeffr scripts recursively
echo "Setting executable permissions for all scripts..."
INSTALL_DIR="/usr/local/lib/node_modules/hasenpfeffr"

# Make all .sh files executable
sudo find "$INSTALL_DIR" -type f -name "*.sh" -exec chmod +x {} \;

# Make all .js files executable
sudo find "$INSTALL_DIR" -type f -name "*.js" -exec chmod +x {} \;

# Make all .mjs files executable
sudo find "$INSTALL_DIR" -type f -name "*.mjs" -exec chmod +x {} \;

# Make all .js and .mjs files executable that have a shebang line
# sudo find "$INSTALL_DIR" -type f \( -name "*.js" -o -name "*.mjs" \) -exec grep -l "^#!/" {} \; | xargs -r sudo chmod +x
