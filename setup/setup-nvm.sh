#!/bin/bash
#
# Brainstorm NVM Setup Script
# This script installs and configures NVM (Node Version Manager) for user-level Node.js
# It installs Node.js 18.x without requiring sudo privileges
#

echo "=== Setting up NVM (Node Version Manager) ==="

# Check if NVM is already installed
if [ -d "$HOME/.nvm" ] && [ -s "$HOME/.nvm/nvm.sh" ]; then
  echo "NVM is already installed."
else
  echo "Installing NVM..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  
  echo "Adding NVM to current shell..."
fi

# Load NVM in the current shell
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Check if NVM was properly loaded
if ! command -v nvm &> /dev/null; then
  echo "NVM installation appears to have failed or isn't available in this shell session."
  echo "You may need to close and reopen your terminal, then run this script again."
  exit 1
fi

# Install Node.js 18.x if it's not already installed
if ! nvm ls 18 | grep -q "v18"; then
  echo "Installing Node.js 18.x..."
  nvm install 18
  
  # Set 18.x as the default
  nvm alias default 18
  
  echo "Node.js 18.x has been installed and set as default."
else
  echo "Node.js 18.x is already installed."
  # Ensure 18.x is the default
  nvm use 18
fi

# Verify Node.js and npm are working
NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v)

echo "=== Node.js Environment Ready ==="
echo "Node.js version: $NODE_VERSION"
echo "npm version: $NPM_VERSION"
echo "NVM has been configured to use Node.js 18.x"
echo "====================================="
