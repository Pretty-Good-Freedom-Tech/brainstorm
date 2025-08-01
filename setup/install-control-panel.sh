#!/bin/bash

# Brainstorm Control Panel Installation Script
# This script sets up the Brainstorm Control Panel service and creates
# the necessary symlinks and user accounts.

set -e  # Exit on error

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

echo "=== Brainstorm Control Panel Installation ==="

# Configuration variables
BRAINSTORM_USER="brainstorm"
BRAINSTORM_GROUP="brainstorm"
CONTROL_PANEL_SCRIPT="/usr/local/bin/brainstorm-control-panel"
BRAINSTORM_INSTALL_DIR="/usr/local/lib/node_modules/brainstorm"
SYSTEMD_SERVICE_DIR="/etc/systemd/system"
SYSTEMD_SERVICE_FILE="brainstorm-control-panel.service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Step 1: Create brainstorm user and group if they don't exist
echo "=== Creating brainstorm user ==="
if ! id -u $BRAINSTORM_USER >/dev/null 2>&1; then
  useradd -m -s /bin/bash $BRAINSTORM_USER
  echo "User $BRAINSTORM_USER created"
else
  echo "User $BRAINSTORM_USER already exists"
fi

# Step 2: Create the wrapper script for the control panel
echo "=== Creating control panel wrapper script ==="
cat > "$CONTROL_PANEL_SCRIPT" << 'EOF'
#!/bin/bash

# Wrapper script for Brainstorm Control Panel
# This script finds and executes the control-panel.js script

# Note: The bin/control-panel.js is the primary script used in production
SCRIPT_PATH="/usr/local/lib/node_modules/brainstorm/bin/control-panel.js"

# Execute the script with node
exec node "$SCRIPT_PATH" "$@"
EOF

chmod +x "$CONTROL_PANEL_SCRIPT"
chown $BRAINSTORM_USER:$BRAINSTORM_GROUP "$CONTROL_PANEL_SCRIPT"
echo "Created wrapper script at $CONTROL_PANEL_SCRIPT"

# Step 3: Set up the installation directory if it doesn't exist
if [ ! -d "$BRAINSTORM_INSTALL_DIR" ]; then
  echo "=== Setting up installation directory ==="
  mkdir -p "$BRAINSTORM_INSTALL_DIR"
  
  # Determine the source directory (where this script is located)
  SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  
  # Copy the project files to the installation directory
  echo "Copying files from $SOURCE_DIR to $BRAINSTORM_INSTALL_DIR"
  cp -r "$SOURCE_DIR"/* "$BRAINSTORM_INSTALL_DIR/"
  
  # Set proper ownership
  chown -R $BRAINSTORM_USER:$BRAINSTORM_GROUP "$BRAINSTORM_INSTALL_DIR"
fi

# Step 4: Install the negentropy-sync script
echo "=== Installing negentropy-sync script ==="
cat > /usr/local/bin/brainstorm-negentropy-sync << 'EOF'
#!/bin/bash

# Brainstorm Negentropy Sync Script
# This script uses strfry's negentropy implementation to sync FOLLOWS, MUTES and REPORTS data

echo "Starting Negentropy sync with relay.brainstorm.com..."

# Run strfry sync with negentropy
sudo strfry sync wss://relay.hasenpfeffr.com --filter '{"kinds":[3, 1984, 10000]}' --dir down

echo "Negentropy sync completed!"
EOF
chmod +x /usr/local/bin/brainstorm-negentropy-sync
chown $BRAINSTORM_USER:$BRAINSTORM_GROUP /usr/local/bin/brainstorm-negentropy-sync

# Step 5: Install the strfry-stats script
echo "=== Installing strfry-stats script ==="
cat > /usr/local/bin/brainstorm-strfry-stats << 'EOF'
#!/bin/bash

# Brainstorm Strfry Stats Script
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
chmod +x /usr/local/bin/brainstorm-strfry-stats
chown $BRAINSTORM_USER:$BRAINSTORM_GROUP /usr/local/bin/brainstorm-strfry-stats

# Install configuration file if it doesn't exist
if [ ! -f /etc/brainstorm.conf ]; then
    echo "Installing configuration file..."
    cp $SCRIPT_DIR/../config/brainstorm.conf.template /etc/brainstorm.conf
    
    # Set secure permissions
    chown root:$BRAINSTORM_GROUP /etc/brainstorm.conf
    chmod 664 /etc/brainstorm.conf
    
    echo "Configuration file installed at /etc/brainstorm.conf"
    echo "Please update it with your specific settings using bin/update-config.sh"
else
    echo "Configuration file already exists at /etc/brainstorm.conf"
fi

# Install graperank configuration file if it doesn't exist
if [ ! -f /etc/graperank.conf ]; then
    echo "Installing graperank configuration file..."
    cp $SCRIPT_DIR/../config/graperank.conf.template /etc/graperank.conf
    
    # Set secure permissions
    chown root:$BRAINSTORM_GROUP /etc/graperank.conf
    chmod 644 /etc/graperank.conf
    
    echo "GrapeRank configuration file installed at /etc/graperank.conf"
else
    echo "GrapeRank configuration file already exists at /etc/graperank.conf"
fi

# Install configuration update script
echo "Installing configuration update script..."
cp $SCRIPT_DIR/../bin/update-config.sh /usr/local/bin/brainstorm-update-config
chmod +x /usr/local/bin/brainstorm-update-config
chown $BRAINSTORM_USER:$BRAINSTORM_GROUP /usr/local/bin/brainstorm-update-config
echo "Configuration update script installed at /usr/local/bin/brainstorm-update-config"

# Step 6: Copy and enable the systemd service
echo "=== Setting up systemd service ==="
if [ -f "$SCRIPT_DIR/../systemd/$SYSTEMD_SERVICE_FILE" ]; then
  cp "$SCRIPT_DIR/../systemd/$SYSTEMD_SERVICE_FILE" "$SYSTEMD_SERVICE_DIR/"
else
  cp "$BRAINSTORM_INSTALL_DIR/systemd/$SYSTEMD_SERVICE_FILE" "$SYSTEMD_SERVICE_DIR/"
fi

# Reload systemd daemon
sudo systemctl daemon-reload

# Enable and start the service
sudo systemctl enable $SYSTEMD_SERVICE_FILE
sudo systemctl restart $SYSTEMD_SERVICE_FILE

# Check if service is running
if sudo systemctl is-active --quiet $SYSTEMD_SERVICE_FILE; then
  echo "Brainstorm Control Panel service is running"
else
  echo "Warning: Brainstorm Control Panel service failed to start"
  echo "Check logs with: journalctl -u $SYSTEMD_SERVICE_FILE"
fi

# Step 7: Set up sudoers file for strfry commands
echo "=== Setting up sudoers file for strfry commands ==="
if [ -f "$SCRIPT_DIR/../setup/brainstorm-sudoers" ]; then
  cp "$SCRIPT_DIR/../setup/brainstorm-sudoers" /etc/sudoers.d/brainstorm
  chmod 440 /etc/sudoers.d/brainstorm
  echo "Sudoers file installed to allow strfry commands without password"
else
  echo "Warning: Sudoers file not found at $SCRIPT_DIR/../setup/brainstorm-sudoers"
  echo "You may need to manually configure sudo to allow the brainstorm user to run strfry commands without a password"
fi

echo ""
echo "=== Brainstorm Control Panel Installation Complete ==="
echo "You can access the control panel at: http://localhost:7778"
echo "If you've set up Nginx with Strfry, you can also access it at: https://your-domain/control/"
echo ""
echo "To check the status of the service, run:"
echo "sudo systemctl is-active $SYSTEMD_SERVICE_FILE"
echo ""
echo "To view logs, run:"
echo "sudo journalctl -u $SYSTEMD_SERVICE_FILE"
