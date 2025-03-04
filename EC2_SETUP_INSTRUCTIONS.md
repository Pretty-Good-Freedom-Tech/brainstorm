# Setting Up a New EC2 Instance for Testing

Follow these steps to create a new EC2 instance to test the Hasenpfeffr installation process:

## 1. Launch a New EC2 Instance

1. Go to the AWS Management Console and navigate to EC2
2. Click "Launch Instance"
3. Choose a name for your instance (e.g., "hasenpfeffr-test")
4. Select "Ubuntu Server 22.04 LTS" as the AMI
5. Choose an instance type (t2.medium or larger recommended for Neo4j and Strfry)
6. Configure instance details:
   - Network: Default VPC
   - Subnet: Any availability zone
   - Auto-assign Public IP: Enable
7. Add storage (at least 20GB)
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

# Clone the Hasenpfeffr repository
git clone https://github.com/Pretty-Good-Freedom-Tech/hasenpfeffr.git
cd hasenpfeffr

# Install dependencies
npm install

# Run the installation script
sudo npm run install-hasenpfeffr
```

## 4. Testing the Installation

After the installation is complete, verify that:

1. Neo4j is running:
   ```bash
   sudo systemctl status neo4j
   ```

2. Strfry is running (if installed):
   ```bash
   sudo systemctl status strfry
   ```

3. Hasenpfeffr Control Panel is running:
   ```bash
   sudo systemctl status hasenpfeffr-control-panel
   ```

4. Access the Neo4j Browser at `http://your-ec2-public-dns:7474`

5. Access the Hasenpfeffr Control Panel:
   - If using Nginx: `https://your-domain/control/`
   - If not using Nginx: `http://your-ec2-public-dns:7778`

## 5. Troubleshooting

If you encounter any issues:

1. Check the logs:
   ```bash
   sudo journalctl -u neo4j
   sudo journalctl -u strfry
   sudo journalctl -u hasenpfeffr-control-panel
   ```

2. Verify the configuration file:
   ```bash
   sudo cat /etc/hasenpfeffr.conf
   ```

3. Check for any error messages in the installation output
