## Update Process

### Option 1: Full Update Script (Recommended)

The easiest way to update is to use the built-in update script:

```bash
cd ~/brainstorm
sudo npm run update
```

** 17 April 2025: currently may break -- recommend option 2 **

NOTE: The update script preserves your owner pubkey, your relay nsec, your URL, and your Neo4j password, but erases your blacklist and whitelist files. However, strfry or Neo4j databases are not affected.

### Option 2: Manual Update Process

If you prefer to do a manual update, follow these steps below. NOTE: this overwrites your initial configuration, including your pubkey, relay nsec, URL, Neo4j password, as well as your blacklist and whitelist. However, strfry or Neo4j databases are not affected.

#### Step 1: Uninstall Current Version

```bash
cd ~

# Stop services
sudo systemctl stop brainstorm-control-panel
sudo systemctl stop addToQueue
sudo systemctl stop processQueue
sudo systemctl stop strfry-router
sudo systemctl stop processAllTasks.timer
sudo systemctl stop reconcile.timer
sudo systemctl stop calculateHops.timer
sudo systemctl stop calculatePersonalizedPageRank.timer
sudo systemctl stop calculatePersonalizedGrapeRank.timer

# Disable services
sudo systemctl disable brainstorm-control-panel
sudo systemctl disable addToQueue
sudo systemctl disable processQueue
sudo systemctl disable strfry-router
sudo systemctl disable processAllTasks.timer
sudo systemctl disable reconcile.timer
sudo systemctl disable calculateHops.timer
sudo systemctl disable calculatePersonalizedPageRank.timer
sudo systemctl disable calculatePersonalizedGrapeRank.timer

# Remove service files
sudo rm /etc/systemd/system/brainstorm-control-panel.service
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
sudo rm /etc/systemd/system/calculatePersonalizedGrapeRank.service

# Remove configuration files
sudo rm /etc/brainstorm.conf
sudo rm /etc/blacklist.conf
sudo rm /etc/whitelist.conf
sudo rm /etc/graperank.conf
sudo rm /etc/strfry-router.config

# Remove data and application files
sudo rm -r /var/lib/brainstorm
sudo rm -r /usr/local/lib/node_modules/brainstorm
sudo rm -r /usr/local/lib/strfry

sudo rm /usr/local/bin/brainstorm-control-panel
sudo rm /usr/local/bin/brainstorm-strfry-stats
sudo rm /usr/local/bin/brainstorm-negentropy-sync
sudo rm /usr/local/bin/brainstorm-update-config
sudo rm /usr/local/bin/brainstorm-generate
sudo rm /usr/local/bin/brainstorm-install
sudo rm /usr/local/bin/brainstorm-node
sudo rm /usr/local/bin/brainstorm-publish

sudo rm /var/lock/processQueue.lock

# Remove home directory files
sudo rm -r ~/brainstorm
```

Optional: uninstall neo4j

```bash
sudo neo4j stop
sudo systemctl stop neo4j
sudo systemctl disable neo4j
sudo rm /lib/systemd/system/neo4j.service
sudo rm -rf /var/lib/neo4j
sudo rm -rf /etc/neo4j # includes several configuration files including neo4j.conf
```

**Optional - use one of the following; untested; use with extreme caution!!**

```bash
sudo apt purge neo4j 
sudo apt remove neo4j
sudo apt autoremove neo4j
```

**Optional - uninstall strfry - the following steps are untested; use with extreme caution!!**

```bash
sudo systemctl stop strfry
sudo systemctl disable strfry
sudo rm /lib/systemd/system/strfry.service

sudo apt remove strfry
sudo rm /etc/strfry.conf
sudo rm /etc/systemd/system/strfry.service
sudo rm -rf ~/strfry
sudo rm -rf /usr/local/lib/strfry # contains plugins, node_modules
sudo rm -rf /usr/local/bin/strfry # contains strfry executable
sudo rm -rf /var/lib/strfry # contains lmdb database
```

#### Step 2 (optional): Update System Packages

```bash
# Update system packages
sudo apt update
sudo apt upgrade -y
```

#### Step 3: Install New Version

```bash
# Clone the Brainstorm repository
cd ~
# git clone --single-branch --branch graperank-library https://github.com/Pretty-Good-Freedom-Tech/brainstorm.git
git clone https://github.com/Pretty-Good-Freedom-Tech/brainstorm.git
cd brainstorm
# Install dependencies
npm install
# Run the installation script
sudo npm run install-brainstorm
```