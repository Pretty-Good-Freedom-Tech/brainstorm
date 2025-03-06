#!/bin/bash

# Hasenpfeffr Control Panel Installation Script
# This script sets up the Hasenpfeffr Control Panel service and creates
# the necessary symlinks and user accounts.

set -e  # Exit on error

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

echo "=== Hasenpfeffr Control Panel Installation ==="

# Configuration variables
HASENPFEFFR_USER="hasenpfeffr"
HASENPFEFFR_GROUP="hasenpfeffr"
CONTROL_PANEL_SCRIPT="/usr/local/bin/hasenpfeffr-control-panel"
HASENPFEFFR_INSTALL_DIR="/usr/local/lib/node_modules/hasenpfeffr"
SYSTEMD_SERVICE_DIR="/etc/systemd/system"
SYSTEMD_SERVICE_FILE="hasenpfeffr-control-panel.service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Step 1: Create hasenpfeffr user and group if they don't exist
echo "=== Creating hasenpfeffr user ==="
if ! id -u $HASENPFEFFR_USER >/dev/null 2>&1; then
  useradd -m -s /bin/bash $HASENPFEFFR_USER
  echo "User $HASENPFEFFR_USER created"
else
  echo "User $HASENPFEFFR_USER already exists"
fi

# Step 2: Create the wrapper script for the control panel
echo "=== Creating control panel wrapper script ==="
cat > "$CONTROL_PANEL_SCRIPT" << 'EOF'
#!/bin/bash

# Wrapper script for Hasenpfeffr Control Panel
# This script finds and executes the control-panel.js script

# Try to find the control-panel.js script in various locations
# Note: The bin/control-panel.js is the primary script used in production
SCRIPT_PATH="/usr/local/lib/node_modules/hasenpfeffr/bin/control-panel.js"

#if [ -f "/usr/local/lib/node_modules/hasenpfeffr/bin/control-panel.js" ]; then
#  SCRIPT_PATH="/usr/local/lib/node_modules/hasenpfeffr/bin/control-panel.js"
#elif [ -f "/usr/lib/node_modules/hasenpfeffr/bin/control-panel.js" ]; then
#  SCRIPT_PATH="/usr/lib/node_modules/hasenpfeffr/bin/control-panel.js"
#elif [ -f "/opt/hasenpfeffr/bin/control-panel.js" ]; then
#  SCRIPT_PATH="/opt/hasenpfeffr/bin/control-panel.js"
#else
#  echo "Error: Could not find bin/control-panel.js script"
#  exit 1
#fi

# Execute the script with node
exec node "$SCRIPT_PATH" "$@"
EOF

chmod +x "$CONTROL_PANEL_SCRIPT"
echo "Created wrapper script at $CONTROL_PANEL_SCRIPT"

# Step 3: Set up the installation directory if it doesn't exist
if [ ! -d "$HASENPFEFFR_INSTALL_DIR" ]; then
  echo "=== Setting up installation directory ==="
  mkdir -p "$HASENPFEFFR_INSTALL_DIR"
  
  # Determine the source directory (where this script is located)
  SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  
  # Copy the project files to the installation directory
  echo "Copying files from $SOURCE_DIR to $HASENPFEFFR_INSTALL_DIR"
  cp -r "$SOURCE_DIR"/* "$HASENPFEFFR_INSTALL_DIR/"
  
  # Set proper ownership
  chown -R $HASENPFEFFR_USER:$HASENPFEFFR_GROUP "$HASENPFEFFR_INSTALL_DIR"
fi

# Step 4: Install the negentropy-sync script
echo "=== Installing negentropy-sync script ==="
cat > /usr/local/bin/hasenpfeffr-negentropy-sync << 'EOF'
#!/bin/bash

# Hasenpfeffr Negentropy Sync Script
# This script uses strfry's negentropy implementation to sync FOLLOWS, MUTES and REPORTS data

echo "Starting Negentropy sync with relay.hasenpfeffr.com..."

# Run strfry sync with negentropy
sudo strfry sync wss://relay.hasenpfeffr.com --filter '{"kinds":[3, 1984, 10000]}' --dir down

echo "Negentropy sync completed!"
EOF
chmod +x /usr/local/bin/hasenpfeffr-negentropy-sync
chown $HASENPFEFFR_USER:$HASENPFEFFR_GROUP /usr/local/bin/hasenpfeffr-negentropy-sync

# Step 5: Install the strfry-stats script
echo "=== Installing strfry-stats script ==="
cat > /usr/local/bin/hasenpfeffr-strfry-stats << 'EOF'
#!/bin/bash

# Hasenpfeffr Strfry Stats Script
# This script retrieves event statistics from the strfry database

# Function to get event count for a specific filter
get_event_count() {
    local filter="$1"
    local filter_json
    
    if [ -z "$filter" ]; then
        filter_json="{}"
    else
        filter_json="{ \"kinds\": [$filter]}"
    fi
    
    # Try to run strfry scan with sudo
    count=$(sudo strfry scan --count "$filter_json")
    
    # If count is empty, set it to 0
    if [ -z "$count" ]; then
        count=0
    fi
    
    echo "$count"
}

# Get total event count
total=$(get_event_count "")
kind3=$(get_event_count "3")
kind1984=$(get_event_count "1984")
kind10000=$(get_event_count "10000")

# Output as JSON
echo "{"
echo "  \"total\": $total,"
echo "  \"kind3\": $kind3,"
echo "  \"kind1984\": $kind1984,"
echo "  \"kind10000\": $kind10000"
echo "}"
EOF
chmod +x /usr/local/bin/hasenpfeffr-strfry-stats
chown $HASENPFEFFR_USER:$HASENPFEFFR_GROUP /usr/local/bin/hasenpfeffr-strfry-stats

# Install configuration file if it doesn't exist
if [ ! -f /etc/hasenpfeffr.conf ]; then
    echo "Installing configuration file..."
    cp $SCRIPT_DIR/../config/hasenpfeffr.conf.template /etc/hasenpfeffr.conf
    
    # Set secure permissions
    chown root:$HASENPFEFFR_GROUP /etc/hasenpfeffr.conf
    chmod 640 /etc/hasenpfeffr.conf
    
    echo "Configuration file installed at /etc/hasenpfeffr.conf"
    echo "Please update it with your specific settings using bin/update-config.sh"
else
    echo "Configuration file already exists at /etc/hasenpfeffr.conf"
fi

# Install configuration update script
echo "Installing configuration update script..."
cp $SCRIPT_DIR/../bin/update-config.sh /usr/local/bin/hasenpfeffr-update-config
chmod +x /usr/local/bin/hasenpfeffr-update-config
echo "Configuration update script installed at /usr/local/bin/hasenpfeffr-update-config"

# Step 6: Copy and enable the systemd service
echo "=== Setting up systemd service ==="
if [ -f "$SCRIPT_DIR/../systemd/$SYSTEMD_SERVICE_FILE" ]; then
  cp "$SCRIPT_DIR/../systemd/$SYSTEMD_SERVICE_FILE" "$SYSTEMD_SERVICE_DIR/"
else
  cp "$HASENPFEFFR_INSTALL_DIR/systemd/$SYSTEMD_SERVICE_FILE" "$SYSTEMD_SERVICE_DIR/"
fi

# Reload systemd daemon
systemctl daemon-reload

# Enable and start the service
systemctl enable $SYSTEMD_SERVICE_FILE
systemctl restart $SYSTEMD_SERVICE_FILE

# Check if service is running
if systemctl is-active --quiet $SYSTEMD_SERVICE_FILE; then
  echo "Hasenpfeffr Control Panel service is running"
else
  echo "Warning: Hasenpfeffr Control Panel service failed to start"
  echo "Check logs with: journalctl -u $SYSTEMD_SERVICE_FILE"
fi

# Step 7: Set up sudoers file for strfry commands
echo "=== Setting up sudoers file for strfry commands ==="
if [ -f "$SCRIPT_DIR/../setup/hasenpfeffr-sudoers" ]; then
  cp "$SCRIPT_DIR/../setup/hasenpfeffr-sudoers" /etc/sudoers.d/hasenpfeffr
  chmod 440 /etc/sudoers.d/hasenpfeffr
  echo "Sudoers file installed to allow strfry commands without password"
else
  echo "Warning: Sudoers file not found at $SCRIPT_DIR/../setup/hasenpfeffr-sudoers"
  echo "You may need to manually configure sudo to allow the hasenpfeffr user to run strfry commands without a password"
fi

echo ""
echo "=== Hasenpfeffr Control Panel Installation Complete ==="
echo "You can access the control panel at: http://localhost:7778"
echo "If you've set up Nginx with Strfry, you can also access it at: https://your-domain/control/"
echo ""
echo "To check the status of the service, run:"
echo "sudo systemctl is-active $SYSTEMD_SERVICE_FILE"
echo ""
echo "To view logs, run:"
echo "sudo journalctl -u $SYSTEMD_SERVICE_FILE"
