## Update Process

### Option 1: Full Update Script (Recommended)

The easiest way to update is to use the built-in update script:

```bash
cd ~/hasenpfeffr
sudo npm run update
```

NOTE: the update script preserves your owner pubkey, your relay nsec, your URL, and your Neo4j password, but erases your blacklist and whitelist files.

### Option 2: Manual Update Process

If you prefer to do a manual update, follow these steps below. NOTE: this overwrites your initial configuration, including your pubkey, relay nsec, URL, Neo4j password, as well as your blacklist and whitelist.

#### Step 1: Uninstall Current Version

```bash
cd ~

# Stop services
sudo systemctl stop hasenpfeffr-control-panel
sudo systemctl stop addToQueue
sudo systemctl stop processQueue
sudo systemctl stop strfry-router
sudo systemctl stop processAllTasks.timer
sudo systemctl stop reconcile.timer
sudo systemctl stop calculateHops.timer
sudo systemctl stop calculatePersonalizedPageRank.timer
sudo systemctl stop calculatePersonalizedGrapeRank.timer

# Remove configuration files
sudo rm /etc/hasenpfeffr.conf
sudo rm /etc/blacklist.conf
sudo rm /etc/graperank.conf
sudo rm /etc/strfry-router.config

# Remove service files
sudo rm /etc/systemd/system/hasenpfeffr-control-panel.service
sudo rm /etc/systemd/system/addToQueue.service
sudo rm /etc/systemd/system/processQueue.service
sudo rm /etc/systemd/system/strfry-router.service
sudo rm /etc/systemd/system/processAllTasks.service
sudo rm /etc/systemd/system/processAllTasks.timer
sudo rm /etc/systemd/system/reconcile.service
sudo rm /etc/systemd/system/reconcile.timer
sudo rm /etc/systemd/system/calculateHops.service
sudo rm /etc/systemd/system/calculateHops.timer
sudo rm /etc/systemd/system/calculatePersonalizedPageRank.service
sudo rm /etc/systemd/system/calculatePersonalizedPageRank.timer
sudo rm /etc/systemd/system/calculatePersonalizedGrapeRank.service
sudo rm /etc/systemd/system/calculatePersonalizedGrapeRank.timer

# Remove data and application files
sudo rm -r /var/lib/hasenpfeffr
sudo rm -r /usr/local/lib/node_modules/hasenpfeffr
sudo rm -r /usr/local/lib/strfry
sudo rm /usr/local/bin/hasenpfeffr-control-panel
sudo rm /usr/local/bin/hasenpfeffr-strfry-stats
sudo rm /usr/local/bin/hasenpfeffr-negentropy-sync
sudo rm /usr/local/bin/hasenpfeffr-update-config

# Remove home directory files
sudo rm -r ~/hasenpfeffr
```

#### Step 2: Install New Version

```bash
#!/bin/bash

# Update system packages
sudo apt update
sudo apt upgrade -y

# Clone the Hasenpfeffr repository
cd ~
# git clone --single-branch --branch graperank-library https://github.com/Pretty-Good-Freedom-Tech/hasenpfeffr.git
git clone https://github.com/Pretty-Good-Freedom-Tech/hasenpfeffr.git
cd hasenpfeffr
# Install dependencies
npm install
# Run the installation script
sudo npm run install-hasenpfeffr
```