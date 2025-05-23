# Update Process

## Preparation (optional)

### Optional: BACKUP

```bash
sudo npm run backup
```

This creates a backup of your configuration files in `~/brainstorm-backup`, including your owner pubkey, relay nsec, URL, Neo4j password, blacklist, and whitelist. (Restore-from-backup script is not yet implemented.)

## Update

There are multiple options to update Brainstorm, arranged from hands-off to hands-on.

### Easiest option

```bash
cd ~/brainstorm
sudo npm run update
```

This will prompt you to enter your domain name, owner pubkey, and Neo4j password.

Alternatively, you can provide those values directly:

```bash
cd ~/brainstorm
sudo npm run update -- --domainName=your-domain.com --ownerPubkey=your-key --neo4jPassword=your-password
```

Example: 

```bash
cd ~/brainstorm
sudo npm run update -- --domainName=straycat.brainstorm.social --ownerPubkey=e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f --neo4jPassword=XXXXXXXXXX
```

### Manual update

Run without options; prompts will guide you through the process.

```bash
cd ~/brainstorm
sudo npm run backup
sudo npm run uninstall
cd ~
git clone https://github.com/Pretty-Good-Freedom-Tech/brainstorm.git
cd brainstorm
npm install
sudo npm run install-brainstorm
sudo npm run restore-from-backup
```

Alternately, you can provide values directly:

```bash
cd ~/brainstorm
sudo npm run backup
sudo npm run uninstall
cd ~
git clone https://github.com/Pretty-Good-Freedom-Tech/brainstorm.git
cd brainstorm
npm install
sudo npm run install-brainstorm -- --domainName=relay.example.com --ownerPubkey=your-key --neo4jPassword=secure123
sudo npm run restore-from-backup
```

Example: 

```bash
cd ~/brainstorm
sudo npm run backup
sudo npm run uninstall
cd ~
git clone https://github.com/Pretty-Good-Freedom-Tech/brainstorm.git
cd brainstorm
npm install
sudo npm run install-brainstorm -- --domainName=straycat.brainstorm.social --ownerPubkey=e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f --neo4jPassword=XXXXXXXXXX
sudo npm run restore-from-backup
```

### Uninstall then reinstall


#### Step 1: Uninstall

```bash
sudo npm run uninstall
```

This will uninstall Brainstorm but leaves neo4j and strfry databases intact. All configuration files, owner pubkey, relay nsec, URL, Neo4j password, whitelist, and blacklist will be lost. 

Next, install Brainstorm similarly to how you installed it previously (see [installation instructions](INSTALLATION_INSTRUCTIONS.md)). The reinstallation process will proceed faster because strfry and neo4j will not need to be reinstalled.

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
# git clone --single-branch --branch <branch-name> https://github.com/Pretty-Good-Freedom-Tech/brainstorm.git
git clone https://github.com/Pretty-Good-Freedom-Tech/brainstorm.git
cd brainstorm
# Install dependencies
npm install
# Run the installation script
sudo npm run install-brainstorm
```

### Full Manual Update Process

If you prefer to do a manual update, follow these steps below. NOTE: this overwrites your initial configuration, including your pubkey, relay nsec, URL, Neo4j password, as well as your blacklist and whitelist. However, strfry or Neo4j databases are not affected.

#### Step 1: Uninstall Current Version

In theory this should be exactly what `sudo npm run uninstall` does.

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
```

```bash
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
sudo rm -r /var/log/brainstorm

sudo rm /usr/local/bin/brainstorm-control-panel
sudo rm /usr/local/bin/brainstorm-strfry-stats
sudo rm /usr/local/bin/brainstorm-negentropy-sync
sudo rm /usr/local/bin/brainstorm-update-config
sudo rm /usr/local/bin/brainstorm-install
sudo rm /usr/local/bin/brainstorm-node
sudo rm /usr/local/bin/brainstorm-publish

sudo rm /var/lock/processQueue.lock
sudo rm /var/lock/processContentQueue.lock

# Remove home directory files
sudo rm -r ~/brainstorm
```

**Optional: uninstall neo4j**

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
# git clone --single-branch --branch <branch-name> https://github.com/Pretty-Good-Freedom-Tech/brainstorm.git
git clone https://github.com/Pretty-Good-Freedom-Tech/brainstorm.git
cd brainstorm
# Install dependencies
npm install
# Run the installation script
sudo npm run install-brainstorm
```