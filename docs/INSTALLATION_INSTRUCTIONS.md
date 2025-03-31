# Installation of Hasenpfeffr

The following instructions are for setting up a new Amazon AWS EC2 instance to test the Hasenpfeffr installation process. They can be adapted for other Linux distributions.

## 1. Launch a New EC2 Instance

### Recommended specifications:

- t2.medium or larger
- 20GB at least; 50GB recommended

### Instructions

1. Go to the AWS Management Console and navigate to EC2
2. Click "Launch Instance"
3. Choose a name for your instance (e.g., "hasenpfeffr-test")
4. Select "Ubuntu Server 22.04 LTS" as the AMI
5. Choose an instance type (t2.medium or larger recommended for Neo4j and Strfry)
6. Configure instance details:
   - Network: Default VPC
   - Subnet: Any availability zone
   - Auto-assign Public IP: Enable
7. Add storage (at least 20GB, recommended 50GB)
8. Configure security group:
   - Allow SSH (port 22) from your IP
   - Allow HTTP (port 80) from anywhere
   - Allow HTTPS (port 443) from anywhere
   - Allow custom TCP (port 7474) for Neo4j Browser
   - Allow custom TCP (port 7687) for Neo4j Bolt
   - Allow custom TCP (port 7778) for Hasenpfeffr Control Panel
9. Review and launch
10. Select or create a key pair for SSH access
11. Launch the instance

## 2. Connect to the Instance

```bash
ssh -i /path/to/your-key.pem ubuntu@your-ec2-public-dns
```

## 3. Install Hasenpfeffr

During installation, you will be prompted to enter the following 3 pieces of information:

1. Your domain name (e.g., "relay.myCoolDomain.com"). This will be used for:
   - relay websocket:`wss://relay.myCoolDomain.com`
   - Strfry information: `https://relay.myCoolDomain.com`
   - Neo4j browser: `http://relay.myCoolDomain.com:7474` (note: not https!!)
   - Hasenpfeffr control panel: `https://relay.myCoolDomain.com/control`
2. Your pubkey, e.g. `e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f`, i.e. the "owner" of the personal Webs of Trust relay.
3. The Neo4j password that you will later be asked to enter when you access the Neo4j browser for the first time.

```bash
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
git clone https://github.com/Pretty-Good-Freedom-Tech/hasenpfeffr.git
cd hasenpfeffr

# Install dependencies
npm install

# Run the installation script
sudo npm run install-hasenpfeffr
```

## 4. Verify successful installation

### In the browser

1. Access the strfry relay at `https://your-domain`
2. Access the Neo4j Browser at `http://your-domain:7474` (note: not https!!)
   - Default credentials: `neo4j` / `neo4j`
   - Change password after first login to the password that you entered during installation
3. Access the Hasenpfeffr Control Panel at: `https://your-domain/control/index.html`

### At the command line, 

Upon installation, three systemd services should be running:

1. Neo4j:
   ```bash
   sudo systemctl status neo4j
   ```

2. Strfry:
   ```bash
   sudo systemctl status strfry
   ```

   Verify events are being input (only do this after loading up strfry with some events using the control panel):

   ```bash
   sudo strfry scan --count '{"kinds":[3, 1984, 10000]}'
   ```

3. Hasenpfeffr Control Panel:
   ```bash
   sudo systemctl status hasenpfeffr-control-panel
   ```

## 5. Activate Strfry and Neo4j

After successful installation, perform the following actions:

1. Access the Neo4j Browser at `http://your-domain:7474` (note: not https!!). You will be prompted to change the password. This should match the password that you entered during installation.

2. After changing the Neo4j password, go to the Neo4j Control Panel at `http://your-domain/control/neo4j-control-panel.html` and click the Setup Constraints and Indexes button. These will make your Neo4j database run more effectively and efficiently. Then click the Check Neo4j Status button. At this point, there should be zero nodes and relationships, but Constraints and Indexes should be set up.

3. Access the Strfry relay at `https://your-domain` to verify it is working.

4. Access the Hasenpfeffr main page at `https://your-domain/control/index.html` and sign in via NIP-07.

5. Batch loading of data: 
- Use Negentropy to import kinds 3, 1984, and 10000 events to strfry in batch from `wss://relay.hasenpfeffr.com`. Note that you can use this tool to import from other relays and using other filters. This can also be repeated to import any events that may have been missed. Monitor importation progress and verify successful import using the control panel, by checking the strfry logs, or at the command line `journalctl -u strfry.service` or `sudo strfry scan --count '{"kinds": [3, 1984, 10000]}'`.
- Use Negentropy to import all personal events from the primal relay.
- Batch transfer from strfry to Neo4j. This should create 200 to 300 thousand NostrUser nodes and approximately 8 million FOLLOWS, MUTES, and REPORTS relationships. Monitor progress and verify successful transfer using the control panel or at the Neo4j browser: `http://your-domain:7474`.

6. At the control panel, turn on ETL pipeline systemd services, including:
- strfry-router, which will stream events in real time to strfry from a hardcoded list of relays (todo: edit relays)
- addToQueue and processQueue, which will stream events in real time from strfry to Neo4j.
- reconcile.timer, which will periodically check for discrepancies between strfry and Neo4j and will import any events from strfry to Neo4j that may have been missed

7. Calculate Webs of Trust by hand: 
- hops (needs a button!)
- personalized PageRank
- personalized GrapeRank

8. Export NIP-85 by clicking the export buttons in the NIP-85 control panel. These buttons should publish 10^5 kind 30382 events to your WoT relay, and one kind 10040 event to multiple relays. The NIP-85 control panel should indicate statistics on kind 30382 events, and you can also verify them at the command line. 

9. Activate Strfry Plugin (if desired), which streams content in real time to your relay, filtered by your whitelist and blacklist. You should only activate this is once your whitelist has been created and you have verified that it is working correctly. Once activated, you and your friends can use your relay as a normal Nostr relay, one that filters out spam and other unwanted content.

10. Turn on Webs of Trust calculation systemd services, including:
- calculateHops.timer, calculatePersonalizedPageRank.timer, and calculatePersonalizedGrapeRank.timer, which will periodically calculate hops, personalized page rank, and personalized grape rank for all NostrUsers.

## 5. Troubleshooting

If you encounter any issues:

1. Check the logs:
   ```bash
   sudo journalctl -u neo4j
   sudo journalctl -u strfry
   sudo journalctl -u hasenpfeffr-control-panel
   ```

2. Verify the configuration files:
   ```bash
   sudo cat /etc/hasenpfeffr.conf
   sudo cat /etc/graperank.conf
   sudo cat /etc/blacklist.conf

   sudo cat /etc/strfry.conf
   sudo cat /etc/neo4j/neo4j.conf
   sudo cat /etc/neo4j/apoc.conf
   ```

3. Check for any error messages in the installation output

## 6. Update

To update Hasenpfeffr, see `docs/UPDATE_INSTRUCTIONS.md`.


