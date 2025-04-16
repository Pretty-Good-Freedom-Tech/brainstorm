#!/bin/bash
#
# Setup NVM for brainstorm user
# This script installs NVM for the brainstorm user and configures Node.js 18.x
#

echo "=== Setting up NVM for brainstorm user ==="

# Check if brainstorm user exists
if ! id -u brainstorm &>/dev/null; then
  echo "Error: brainstorm user does not exist."
  echo "Please run the installation script first."
  exit 1
fi

# Function to run commands as brainstorm user
run_as_brainstorm() {
  sudo -u brainstorm bash -c "$1"
}

# Install NVM for brainstorm user
echo "Installing NVM for brainstorm user..."
run_as_brainstorm "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"

# Add NVM to brainstorm's .bashrc if not already there
if ! sudo grep -q "NVM_DIR" /home/brainstorm/.bashrc; then
  echo "Adding NVM initialization to brainstorm's .bashrc..."
  sudo tee -a /home/brainstorm/.bashrc > /dev/null << 'EOF'

# NVM Configuration
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
EOF
fi

# Load NVM and install Node.js 18.x
echo "Installing Node.js 18.x..."
run_as_brainstorm "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\" && nvm install 18 && nvm alias default 18"

# Verify installation
NODE_VERSION=$(run_as_brainstorm "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\" && node -v")
NPM_VERSION=$(run_as_brainstorm "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\" && npm -v")

echo "=== NVM setup complete ==="
echo "Node.js version: $NODE_VERSION"
echo "npm version: $NPM_VERSION"
echo "The brainstorm user now has Node.js 18.x installed via NVM."
