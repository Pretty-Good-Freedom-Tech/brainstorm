# Installation of Brainstorm

We assume you have a registered domain that you will point to a remote server running Brainstorm. Alternatively, you can run Brainstorm locally for testing purposes.

The following instructions are for setting up a new Amazon AWS EC2 instance to test the Brainstorm installation process. They can be adapted for other Linux distributions.

## 1. Launch a New EC2 Instance

### Recommended specifications:

- t2.large (working on making it run on t2.medium)
- 20GB at least; 50GB recommended

### Instructions

1. Go to the AWS Management Console and navigate to EC2
2. Click "Launch Instance"
3. Choose a name for your instance (e.g., "brainstorm-test")
4. Select "Ubuntu Server 22.04 LTS" as the AMI
5. Choose an instance type (t2.large or larger recommended for Neo4j and Strfry)
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
   - Allow custom TCP (port 7778) for Brainstorm Control Panel
9. Review and launch
10. Select or create a key pair for SSH access
11. Launch the instance
12. Associate an Elastic IP (optional but recommended) and point your domain to it

## 2. Connect to the Instance

```bash
ssh -i /path/to/your-key.pem ubuntu@your-ec2-public-dns
```

Your instance console has a "Connect" button that will provide you with the connection command.

## 3. Install Brainstorm

Have the following 3 pieces of information ready:

1. Your domain name (e.g., "relay.myCoolDomain.com"). This will be used for:
   - relay websocket:`wss://relay.myCoolDomain.com`
   - Strfry information: `https://relay.myCoolDomain.com`
   - Neo4j browser: `http://relay.myCoolDomain.com:7474` (note: not https!!)
   - Brainstorm control panel: `https://relay.myCoolDomain.com/control`
2. Your pubkey, e.g. `e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f`, i.e. the "owner" of the personal Webs of Trust relay. (TODO: give option of entering npub instead)
3. A Neo4j password. Important! After installation, the first thing you will do is change the Neo4j password in the Neo4j browser (initial login: neo4j / neo4j). Brainstorm will need to know what this is. (TODO: ability to change password in the control panel.)

### Step 1: System Preparation

```bash
# Update system packages
sudo apt update
sudo apt upgrade -y

# Install necessary dependencies
sudo apt install -y curl git pv

# Install a minimal Node.js/npm to bootstrap our installation
# This will be replaced by the NVM installation
sudo apt install -y nodejs npm
```

### Step 2: Install Brainstorm

```bash
# Clone the Brainstorm repository
git clone https://github.com/Pretty-Good-Freedom-Tech/brainstorm.git
cd brainstorm

# Install dependencies and set up NVM for your user (WITHOUT sudo)
npm install

# Run the installation script (WITH sudo; system installation components require root privileges)
# You will need to enter your domain name, owner pubkey, and a Neo4j password
sudo npm run install-brainstorm
```

After you enter the above-mentioned 3 pieces of information, get some coffee. This takes a while! (About 8 minutes in total for me using an AWS EC2 t2.large instance.)

## 4. Verify successful installation

### In the browser

1. Access the strfry relay at `https://your-domain`
2. Access the Neo4j Browser at `http://your-domain:7474` (note: not https!!)
   - Default credentials: `neo4j` / `neo4j`
   - Change password after first login to the password that you entered during installation
3. Access the Brainstorm Control Panel at: `https://your-domain/control/index.html`

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

3. Brainstorm Control Panel:
   ```bash
   sudo systemctl status brainstorm-control-panel
   ```

## 5. Setup

After successful installation, go to the Setup page and follow the instructions.

## 6. Troubleshooting

If you encounter any issues:

1. Check the logs:
   ```bash
   sudo journalctl -u neo4j
   sudo journalctl -u strfry
   sudo journalctl -u brainstorm-control-panel
   ```

2. Verify the configuration files:
   ```bash
   sudo cat /etc/brainstorm.conf
   sudo cat /etc/graperank.conf
   sudo cat /etc/blacklist.conf
   sudo cat /etc/whitelist.conf

   sudo cat /etc/strfry.conf
   sudo cat /etc/neo4j/neo4j.conf
   sudo cat /etc/neo4j/apoc.conf
   ```

3. Check for any error messages in the installation output

## 6. Update

To update Brainstorm, see the [update instructions](docs/UPDATE_INSTRUCTIONS.md).


