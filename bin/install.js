#!/usr/bin/env node

/**
 * Hasenpfeffr Installation Script
 * 
 * This script handles the installation and setup of Hasenpfeffr,
 * including Neo4j, Strfry, and associated tools.
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Check if running as root
const isRoot = process.getuid && process.getuid() === 0;
if (!isRoot) {
  console.log('\x1b[33mWarning: This script should be run as root for full functionality.\x1b[0m');
  console.log('You can run it with: sudo hasenpfeffr-install');
  console.log('Continuing with limited functionality...\n');
}

// Get package root directory
const packageRoot = path.resolve(__dirname, '..');

// Configuration paths
const configPaths = {
  hasenpfeffrConf: '/etc/hasenpfeffr.conf',
  setupDir: path.join(packageRoot, 'setup'),
  neo4jInstallScript: path.join(packageRoot, 'setup', 'install-neo4j.sh'),
  neo4jIndicesScript: path.join(packageRoot, 'setup', 'neo4jCommandsAndIndices.sh'),
  strfryInstallScript: path.join(packageRoot, 'setup', 'install-strfry.sh'),
  apocConf: path.join(packageRoot, 'setup', 'apoc.conf'),
  systemdServiceDir: '/etc/systemd/system',
  systemdServiceFile: path.join(packageRoot, 'systemd', 'hasenpfeffr-control-panel.service')
};

// Main installation function
async function install() {
  console.log('\x1b[32m=== Hasenpfeffr Installation ===\x1b[0m');
  
  try {
    // Step 1: Create configuration file
    await createConfigFile();
    
    // Step 2: Install Neo4j and plugins
    await installNeo4j();
    
    // Step 3: Install Strfry Nostr relay
    await installStrfry();
    
    // Step 4: Set up systemd service
    await setupSystemdService();
    
    // Step 5: Final setup and instructions
    await finalSetup();
    
    console.log('\x1b[32m=== Installation Complete ===\x1b[0m');
    console.log('Hasenpfeffr has been successfully installed and configured.');
    console.log('You can access the control panel at: http://your-server-ip:7778');
    console.log('or at: https://your-server-domain/control/ (if configured with Nginx)');
    
    rl.close();
  } catch (error) {
    console.error('\x1b[31mError during installation:\x1b[0m', error.message);
    rl.close();
    process.exit(1);
  }
}

// Create configuration file
async function createConfigFile() {
  console.log('\x1b[36m=== Creating Configuration File ===\x1b[0m');
  
  // Check if config file already exists
  if (fs.existsSync(configPaths.hasenpfeffrConf)) {
    console.log(`Configuration file ${configPaths.hasenpfeffrConf} already exists.`);
    return;
  }
  
  // Get configuration values from user
  const relayUrl = await askQuestion('Enter your Nostr relay URL (e.g., wss://relay.example.com): ');
  const relayPubkey = await askQuestion('Enter your relay pubkey: ');
  const relayNsec = await askQuestion('Enter your relay private key (nsec): ');
  const neo4jPassword = await askQuestion('Enter a password for Neo4j (or press Enter to use "neo4j"): ') || 'neo4j';
  const domainName = await askQuestion('Enter your domain name for the Strfry relay (e.g., relay.example.com): ');
  
  // Create configuration content
  const configContent = `# Hasenpfeffr Configuration
# Created during installation

# Relay configuration
export HASENPFEFFR_RELAY_URL="${relayUrl}"
export HASENPFEFFR_RELAY_PUBKEY="${relayPubkey}"
export HASENPFEFFR_RELAY_NSEC="${relayNsec}"

# Neo4j configuration
export NEO4J_PASSWORD="${neo4jPassword}"

# Strfry configuration
export STRFRY_DOMAIN="${domainName}"

# Reference pubkey for PageRank calculations
export GRAPEVINE_REFERENCE_PUBKEY="${relayPubkey}"
`;
  
  // Write configuration file
  if (isRoot) {
    fs.writeFileSync(configPaths.hasenpfeffrConf, configContent);
    execSync(`chmod 600 ${configPaths.hasenpfeffrConf}`);
    console.log(`Configuration file created at ${configPaths.hasenpfeffrConf}`);
  } else {
    console.log('\x1b[33mCannot create configuration file without root privileges.\x1b[0m');
    console.log('Please manually create the file with the following content:');
    console.log('---');
    console.log(configContent);
    console.log('---');
    console.log(`Save it to: ${configPaths.hasenpfeffrConf}`);
    console.log('And set permissions: chmod 600 ' + configPaths.hasenpfeffrConf);
    
    // Wait for user acknowledgment
    await askQuestion('Press Enter to continue...');
  }
}

// Install Neo4j and plugins
async function installNeo4j() {
  console.log('\x1b[36m=== Installing Neo4j and Plugins ===\x1b[0m');
  
  if (!isRoot) {
    console.log('\x1b[33mCannot install Neo4j without root privileges.\x1b[0m');
    console.log(`Please manually run the installation script: sudo ${configPaths.neo4jInstallScript}`);
    
    // Wait for user acknowledgment
    await askQuestion('Press Enter to continue...');
    return;
  }
  
  try {
    // Make scripts executable
    execSync(`chmod +x ${configPaths.neo4jInstallScript}`);
    execSync(`chmod +x ${configPaths.neo4jIndicesScript}`);
    
    // Run Neo4j installation script
    console.log('Installing Neo4j (this may take a few minutes)...');
    execSync(configPaths.neo4jInstallScript, { stdio: 'inherit' });
    
    console.log('Neo4j installation completed successfully.');
  } catch (error) {
    console.error('\x1b[31mError installing Neo4j:\x1b[0m', error.message);
    throw new Error('Neo4j installation failed');
  }
}

// Install Strfry Nostr relay
async function installStrfry() {
  console.log('\x1b[36m=== Installing Strfry Nostr Relay ===\x1b[0m');
  
  if (!isRoot) {
    console.log('\x1b[33mCannot install Strfry without root privileges.\x1b[0m');
    console.log(`Please manually run the installation script: sudo ${configPaths.strfryInstallScript}`);
    
    // Wait for user acknowledgment
    await askQuestion('Press Enter to continue...');
    return;
  }
  
  const installStrfry = await askQuestion('Would you like to install Strfry Nostr relay? (y/n): ');
  if (installStrfry.toLowerCase() !== 'y') {
    console.log('Skipping Strfry installation.');
    return;
  }
  
  try {
    // Make script executable
    execSync(`chmod +x ${configPaths.strfryInstallScript}`);
    
    // Run Strfry installation script
    console.log('Installing Strfry (this may take a few minutes)...');
    execSync(configPaths.strfryInstallScript, { stdio: 'inherit' });
    
    console.log('Strfry installation completed successfully.');
  } catch (error) {
    console.error('\x1b[31mError installing Strfry:\x1b[0m', error.message);
    throw new Error('Strfry installation failed');
  }
}

// Set up systemd service
async function setupSystemdService() {
  console.log('\x1b[36m=== Setting Up Systemd Service ===\x1b[0m');
  
  if (!isRoot) {
    console.log('\x1b[33mCannot set up systemd service without root privileges.\x1b[0m');
    console.log(`Please manually copy the service file: sudo cp ${configPaths.systemdServiceFile} ${configPaths.systemdServiceDir}/`);
    console.log('Then run: sudo systemctl enable hasenpfeffr-control-panel.service');
    console.log('And: sudo systemctl start hasenpfeffr-control-panel.service');
    
    // Wait for user acknowledgment
    await askQuestion('Press Enter to continue...');
    return;
  }
  
  try {
    // Copy systemd service file
    execSync(`cp ${configPaths.systemdServiceFile} ${configPaths.systemdServiceDir}/`);
    
    // Reload systemd daemon
    execSync('systemctl daemon-reload');
    
    // Enable and start service
    execSync('systemctl enable hasenpfeffr-control-panel.service');
    execSync('systemctl start hasenpfeffr-control-panel.service');
    
    console.log('Systemd service set up successfully.');
  } catch (error) {
    console.error('\x1b[31mError setting up systemd service:\x1b[0m', error.message);
    throw new Error('Systemd service setup failed');
  }
}

// Final setup and instructions
async function finalSetup() {
  console.log('\x1b[36m=== Final Setup ===\x1b[0m');
  
  console.log('Hasenpfeffr is now installed and configured.');
  console.log('\nNginx Configuration:');
  console.log('If you installed Strfry, Nginx has been configured to serve both the Strfry relay');
  console.log('and the Hasenpfeffr control panel. The control panel is available at:');
  console.log('https://your-domain/control/');
  console.log('\nIf you did not install Strfry and want to access the control panel through Nginx,');
  console.log('add the following to your server block:');
  console.log('```');
  console.log('location /control/ {');
  console.log('    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
  console.log('    proxy_set_header Host $host;');
  console.log('    proxy_pass http://127.0.0.1:7778/;');
  console.log('    proxy_http_version 1.1;');
  console.log('}');
  console.log('```');
  
  // Wait for user acknowledgment
  await askQuestion('Press Enter to continue...');
}

// Helper function to ask questions
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Start installation
install();
