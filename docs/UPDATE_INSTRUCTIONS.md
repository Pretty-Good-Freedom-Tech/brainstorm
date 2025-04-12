To update: 

## Update Process

### Option 1: Full Update Script (Recommended)

The easiest way to update is to use the built-in update script:

```bash
# Run update script
cd ~/hasenpfeffr
npm run update
```

### Option 2: Manual Update Process

If you prefer to do a manual update, follow these steps:

#### Step 1: Backup Configuration

```bash
# Backup your configuration
sudo cp /etc/hasenpfeffr.conf /etc/hasenpfeffr.conf.backup
```

#### Step 2: Uninstall Current Version

```bash
# Stop services
sudo systemctl stop hasenpfeffr-control-panel
sudo systemctl stop addToQueue.service
sudo systemctl stop processQueue.service

# Remove configuration files
sudo rm /etc/hasenpfeffr.conf
sudo rm /etc/systemd/system/hasenpfeffr-control-panel.service
sudo rm /etc/systemd/system/processQueue.service
sudo rm /etc/systemd/system/addToQueue.service
sudo rm /etc/systemd/system/calculatePersonalizedPageRank.service
sudo rm /etc/systemd/system/calculatePersonalizedPageRank.timer
sudo rm /etc/systemd/system/calculatePersonalizedGrapeRank.service
sudo rm /etc/systemd/system/calculatePersonalizedGrapeRank.timer
sudo rm -r /var/lib/hasenpfeffr
sudo rm -r ~/hasenpfeffr
sudo rm -r /usr/local/lib/node_modules/hasenpfeffr
sudo rm /usr/local/bin/hasenpfeffr-control-panel
sudo rm /usr/local/bin/hasenpfeffr-strfry-stats
sudo rm /usr/local/bin/hasenpfeffr-negentropy-sync
sudo rm /usr/local/bin/hasenpfeffr-update-config
```

#### Step 3: Install New Version

```bash
# Ensure you have a minimal Node.js/npm to bootstrap the installation
sudo apt install -y nodejs npm

# Clone the repository
git clone https://github.com/Pretty-Good-Freedom-Tech/hasenpfeffr.git
cd hasenpfeffr

# The preinstall script will automatically set up NVM and install Node.js 18.x
# This will replace the system Node.js with a user-level installation
npm install

# Run the installation script (no sudo required with NVM)
npm run install-hasenpfeffr
```

#### Step 4: Restore Configuration

```bash
# Copy your backed up configuration
sudo cp /etc/hasenpfeffr.conf.backup /etc/hasenpfeffr.conf
```

#### Step 5: Restart Services

```bash
# Reload systemd and restart services
sudo systemctl daemon-reload
sudo systemctl start hasenpfeffr-control-panel
sudo systemctl start addToQueue.service
sudo systemctl start processQueue.service
```

NOTE: the update script preserves your owner pubkey, your relay nsec, your URL, and your Neo4j password, but erases your blacklist and whitelist files.

If the update script doesn't work, you can try the following. NOTE: this will remove your pubkey, relay nsec, URL, Neo4j password, as well as your blacklist and whitelist.

######## START HERE WHEN INSTALLING FROM SCRATCH ########
# Update system packages
sudo apt update
sudo apt upgrade -y
# Install Git
sudo apt install -y git
# Install pv
sudo apt install pv
# Clone the Hasenpfeffr repository
cd ~
# git clone --single-branch --branch graperank-library https://github.com/Pretty-Good-Freedom-Tech/hasenpfeffr.git
git clone https://github.com/Pretty-Good-Freedom-Tech/hasenpfeffr.git
cd hasenpfeffr
# The preinstall script will automatically set up NVM and install Node.js 18.x
npm install
# Run the installation script (no sudo required with NVM)
npm run install-hasenpfeffr