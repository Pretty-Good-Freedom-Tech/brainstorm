To update: 

```bash
cd ~/hasenpfeffr
sudo npm run update
```

NOTE: the update script preserves your owner pubkey, your relay nsec, your URL, and your Neo4j password, but erases your blacklist and whitelist files.

If the update script doesn't work, you can try the following. NOTE: this will remove your pubkey, relay nsec, URL, Neo4j password, as well as your blacklist and whitelist.

```bash
#!/bin/bash

cd ~
sudo rm /etc/hasenpfeffr.conf
sudo rm /etc/blacklist.conf
sudo rm /etc/graperank.conf
sudo rm /etc/strfry-router.config
sudo rm -r /usr/local/lib/strfry
sudo systemctl stop hasenpfeffr-control-panel
sudo systemctl stop addToQueue
sudo systemctl stop processQueue
sudo systemctl stop strfry-router
sudo systemctl stop processAllTasks.timer
sudo systemctl stop reconcile.timer
sudo systemctl stop calculateHops.timer
sudo systemctl stop calculatePersonalizedPageRank.timer
sudo systemctl daemon-reload
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
sudo rm -r /var/lib/hasenpfeffr
sudo rm -r ~/hasenpfeffr
sudo rm -r /usr/local/lib/node_modules/hasenpfeffr
sudo rm /usr/local/bin/hasenpfeffr-control-panel
sudo rm /usr/local/bin/hasenpfeffr-strfry-stats
sudo rm /usr/local/bin/hasenpfeffr-negentropy-sync
sudo rm /usr/local/bin/hasenpfeffr-update-config

######## START HERE WHEN INSTALLING FROM SCRATCH ########
# Update system packages
sudo apt update
sudo apt upgrade -y
# Install Node.js and npm
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
# Install Git
sudo apt install -y git
# Install pv
sudo apt install pv
# Clone the Hasenpfeffr repository
cd ~
# git clone --single-branch --branch graperank-library https://github.com/Pretty-Good-Freedom-Tech/hasenpfeffr.git
git clone https://github.com/Pretty-Good-Freedom-Tech/hasenpfeffr.git
cd hasenpfeffr
# Install dependencies
sudo npm install
# Run the installation script
sudo npm run install-hasenpfeffr
```