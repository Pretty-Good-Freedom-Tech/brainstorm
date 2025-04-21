#!/bin/bash

# Brainstorm Uninstall Script
# This script handles the uninstallation of Brainstorm,
# including stopping services and removing installed files.

# Enable error reporting
set -e

# Print with colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Log function
log() {
  echo -e "${GREEN}[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $1${NC}"
}

warn() {
  echo -e "${YELLOW}[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] WARNING: $1${NC}"
}

error() {
  echo -e "${RED}[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] ERROR: $1${NC}"
}

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
  error "This script must be run as root"
  exit 1
fi

log "Starting Brainstorm uninstallation..."

# Services to stop and disable
SERVICES=(
  "brainstorm-control-panel"
  "addToQueue"
  "processQueue"
  "strfry-router"
  "strfry"
  "processAllTasks.timer"
  "reconcile.timer"
  "calculateHops.timer"
  "calculatePersonalizedPageRank.timer"
  "calculatePersonalizedGrapeRank.timer"
)

# Stop services
log "Stopping services..."
for service in "${SERVICES[@]}"; do
  if systemctl is-active --quiet "$service"; then
    log "Stopping $service..."
    systemctl stop "$service" || warn "Failed to stop $service"
  else
    warn "$service is not running"
  fi
done

# Disable services
log "Disabling services..."
for service in "${SERVICES[@]}"; do
  if systemctl is-enabled --quiet "$service" 2>/dev/null; then
    log "Disabling $service..."
    systemctl disable "$service" || warn "Failed to disable $service"
  else
    warn "$service is not enabled"
  fi
done

# Remove systemd service files
log "Removing systemd service files..."
for service in "${SERVICES[@]}"; do
  SERVICE_PATH="/etc/systemd/system/$service"
  if [ -f "$SERVICE_PATH" ] || [ -f "$SERVICE_PATH.service" ]; then
    log "Removing $SERVICE_PATH..."
    rm -f "$SERVICE_PATH" "$SERVICE_PATH.service" || warn "Failed to remove $SERVICE_PATH"
  fi
  # Remove timer files if service string ends with .timer
  if [[ "$service" == *.timer ]]; then
    # remove timer path
    TIMER_PATH="/etc/systemd/system/$service"
    if [ -f "$TIMER_PATH" ]; then
      log "Removing $TIMER_PATH..."
      rm -f "$TIMER_PATH" || warn "Failed to remove $TIMER_PATH"
    fi
    # also need to remove service path. To calculate service path, first we remove .timer from service string, then add .service
    SERVICE_PATH="/etc/systemd/system/${service%.timer}.service"
    if [ -f "$SERVICE_PATH" ]; then
      log "Removing $SERVICE_PATH..."
      rm -f "$SERVICE_PATH" || warn "Failed to remove $SERVICE_PATH"
    fi
  fi
done

# Reload systemd
log "Reloading systemd daemon..."
systemctl daemon-reload

# Remove configuration files
log "Removing configuration files..."
CONFIG_FILES=(
  "/etc/brainstorm.conf"
  "/etc/strfry.conf"
  "/etc/strfry-router.config"
  "/etc/graperank.conf"
  "/etc/whitelist.conf"
  "/etc/blacklist.conf"
)

for config in "${CONFIG_FILES[@]}"; do
  if [ -f "$config" ]; then
    log "Removing $config..."
    rm -f "$config" || warn "Failed to remove $config"
  fi
done

# Remove Brainstorm directories
log "Removing Brainstorm directories..."
DIRECTORIES=(
  "/usr/local/lib/node_modules/brainstorm"
  "/var/lib/brainstorm"
  "/var/log/brainstorm"
  "/usr/local/lib/strfry"
)

for dir in "${DIRECTORIES[@]}"; do
  if [ -d "$dir" ]; then
    log "Removing $dir..."
    rm -rf "$dir" || warn "Failed to remove $dir"
  fi
done

# Remove the user's brainstorm directory if it exists
# Use the actual user's home if running with sudo
if [ -n "$SUDO_USER" ]; then
  USER_HOME=$(eval echo ~$SUDO_USER)
  BRAINSTORM_USER_DIR="$USER_HOME/brainstorm"
  
  if [ -d "$BRAINSTORM_USER_DIR" ]; then
    log "Removing $BRAINSTORM_USER_DIR..."
    rm -rf "$BRAINSTORM_USER_DIR" || warn "Failed to remove $BRAINSTORM_USER_DIR"
  fi
  
  # Note: We intentionally don't remove brainstorm-backups by default
  # as they may be needed for later restoration
  log "NOTE: ~/brainstorm-backups directory is preserved for future restoration"
fi

# Remove lock files
log "Removing lock files..."
LOCK_FILES=(
  "/var/lock/processQueue.lock"
  "/var/lock/brainstorm-*.lock"
)

for lock in "${LOCK_FILES[@]}"; do
  # Use find for wildcard patterns
  if [[ "$lock" == *"*"* ]]; then
    find "$(dirname "$lock")" -name "$(basename "$lock")" -type f -exec rm -f {} \; 2>/dev/null || true
  elif [ -f "$lock" ]; then
    log "Removing $lock..."
    rm -f "$lock" || warn "Failed to remove $lock"
  fi
done

# Remove executables
log "Removing executable links..."
EXECUTABLES=(
  "/usr/local/bin/brainstorm-node"
  "/usr/local/bin/brainstorm-install"
  "/usr/local/bin/brainstorm-control-panel"
  "/usr/local/bin/brainstorm-strfry-stats"
  "/usr/local/bin/brainstorm-negentropy-sync"
  "/usr/local/bin/brainstorm-update-config"
  "/usr/local/bin/brainstorm-publish"
)

for exe in "${EXECUTABLES[@]}"; do
  if [ -L "$exe" ] || [ -f "$exe" ]; then
    log "Removing $exe..."
    rm -f "$exe" || warn "Failed to remove $exe"
  fi
done

log "Brainstorm uninstallation completed"

# Suggest reboot if needed
log "You may want to reboot your system to ensure all changes take effect"
exit 0
