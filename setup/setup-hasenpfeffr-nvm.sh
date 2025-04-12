#!/bin/bash
#
# Setup NVM for hasenpfeffr user
# This script installs NVM for the hasenpfeffr user and configures Node.js 18.x
#

echo "=== Setting up NVM for hasenpfeffr user ==="

# Check if hasenpfeffr user exists
if ! id -u hasenpfeffr &>/dev/null; then
  echo "Error: hasenpfeffr user does not exist."
  echo "Please run the installation script first."
  exit 1
fi

# Function to run commands as hasenpfeffr user
run_as_hasenpfeffr() {
  sudo -u hasenpfeffr bash -c "$1"
}

# Install NVM for hasenpfeffr user
echo "Installing NVM for hasenpfeffr user..."
run_as_hasenpfeffr "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"

# Add NVM to hasenpfeffr's .bashrc if not already there
if ! sudo grep -q "NVM_DIR" /home/hasenpfeffr/.bashrc; then
  echo "Adding NVM initialization to hasenpfeffr's .bashrc..."
  sudo tee -a /home/hasenpfeffr/.bashrc > /dev/null << 'EOF'

# NVM Configuration
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
EOF
fi

# Load NVM and install Node.js 18.x
echo "Installing Node.js 18.x..."
run_as_hasenpfeffr "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\" && nvm install 18 && nvm alias default 18"

# Verify installation
NODE_VERSION=$(run_as_hasenpfeffr "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\" && node -v")
NPM_VERSION=$(run_as_hasenpfeffr "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\" && npm -v")

echo "=== NVM setup complete ==="
echo "Node.js version: $NODE_VERSION"
echo "npm version: $NPM_VERSION"
echo "The hasenpfeffr user now has Node.js 18.x installed via NVM."
