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
  hasenpfeffrConfDestination: '/etc/hasenpfeffr.conf',
  strfryRouterConfigDestination: `/etc/strfry-router.config`,
  setupDir: path.join(packageRoot, 'setup'),
  strfryRouterConfigContent: path.join(packageRoot, 'setup', 'strfry-router.config'),
  neo4jInstallScript: path.join(packageRoot, 'setup', 'install-neo4j.sh'),
  neo4jIndicesScript: path.join(packageRoot, 'setup', 'neo4jCommandsAndIndices.sh'),

  strfryInstallScript: path.join(packageRoot, 'setup', 'install-strfry.sh'),
  controlPanelInstallScript: path.join(packageRoot, 'setup', 'install-control-panel.sh'),
  createNostrIdentityScript: path.join(packageRoot, 'setup','create_nostr_identity.sh'),
  apocConf: path.join(packageRoot, 'setup', 'apoc.conf'),

  pipelineInstallScript: path.join(packageRoot, 'setup', 'install-pipeline.sh'),
  systemdServiceDir: '/etc/systemd/system',

  controlPanelServiceFileContent: path.join(packageRoot, 'systemd', 'hasenpfeffr-control-panel.service'),
  strfryRouterServiceFileContent: path.join(packageRoot, 'systemd', 'strfry-router.service'),
  addToQueueServiceFileContent: path.join(packageRoot, 'systemd', 'addToQueue.service'),
  processQueueServiceFileContent: path.join(packageRoot, 'systemd', 'processQueue.service'),

  controlPanelServiceFileDestination: path.join(systemdServiceDir, 'hasenpfeffr-control-panel.service'),
  strfryRouterServiceFileDestination: path.join(systemdServiceDir, 'strfry-router.service'),
  addToQueueServiceFileDestination: path.join(systemdServiceDir, 'addToQueue.service'),
  processQueueServiceFileDestination: path.join(systemdServiceDir, 'processQueue.service')
};

// Main installation function
async function install() {
  console.log('\x1b[32m=== Hasenpfeffr Installation ===\x1b[0m');
  
  try {
    // Step 1: Create hasenpfeffr and strfry-router configuration files
    await createHasenpfeffrConfigFile();

    await createStrfryRouterConfigFile();
    
    // Step 2: Install Neo4j and plugins
    await installNeo4j();
    
    // Step 3: Install Strfry Nostr relay
    await installStrfry();
    
    // Step 4: Set up systemd services
    await setupControlPanelService();
    await setupStrfryRouterService();
    await setupAddToQueueService();
    await setupProcessQueueService();

    // Step 5: Setup Strfry Neo4j Pipeline
    await installPipeline();
    
    // Step 6: Final setup and instructions
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

// Create strfry router config file
async function createStrfryRouterConfigFile() {
  console.log('\x1b[36m=== Creating Strfry Router Config File ===\x1b[0m');

  // Check if strfry router config file already exists
  if (fs.existsSync(configPaths.strfryRouterConfigDestination)) {
    console.log(`Strfry router configuration file ${configPaths.strfryRouterConfigDestination} already exists.`);
    return;
  }

  // Write strfry router configuration file
  if (isRoot) {
    fs.writeFileSync(configPaths.strfryRouterConfigDestination, configPaths.strfryRouterConfigContent);
    execSync(`chmod 644 ${configPaths.strfryRouterConfigDestination}`);
    console.log(`Configuration file created at ${configPaths.strfryRouterConfigDestination}`);

  } else {
    console.log('\x1b[33mCannot create strfry router configuration file without root privileges.\x1b[0m');
    console.log('Please manually create the file with the following content:');
    console.log('---');
    console.log(configPaths.strfryRouterConfigContent);
    console.log('---');
    console.log(`Save it to: ${configPaths.strfryRouterConfigDestination}`);
    console.log('And set permissions: chmod 644 ' + configPaths.strfryRouterConfigDestination);
  }
}

// Create hasenpfeffr configuration file
async function createHasenpfeffrConfigFile() {
  console.log('\x1b[36m=== Creating Hasenpfeffr Configuration File ===\x1b[0m');
  
  // Check if config file already exists
  if (fs.existsSync(configPaths.hasenpfeffrConfDestination)) {
    console.log(`Hseenpfeffr configuration file ${configPaths.hasenpfeffrConfDestination} already exists.`);
    return;
  }
  
  // Get configuration values from user
  const relayUrl = await askQuestion('Enter your Nostr relay URL (e.g., wss://relay.example.com): ');
  const ownerPubkey = await askQuestion('Enter your Hasenpfeffr owner pubkey (for PageRank calculations): ');
  const neo4jPassword = await askQuestion('Enter a password for Neo4j (or press Enter to use "neo4j"): ') || 'neo4j';
  const domainName = await askQuestion('Enter your domain name for the Strfry relay (e.g., relay.example.com): ');
  
  // Create hasenpfeffr configuration content
  const hasenpfeffrConfigContent = `# Hasenpfeffr Configuration
# Created during installation

# Performance tuning
export HASENPFEFFR_BATCH_SIZE="100"
export HASENPFEFFR_DELAY_BETWEEN_BATCHES="1000"
export HASENPFEFFR_DELAY_BETWEEN_EVENTS="50"
export HASENPFEFFR_MAX_RETRIES="3"
export HASENPFEFFR_MAX_CONCURRENT_CONNECTIONS="5"

# Relay configuration
export HASENPFEFFR_RELAY_URL="${relayUrl}"
# Relay pubkey and nsec will be generated by create_nostr_identity.sh

# Neo4j configuration
export NEO4J_PASSWORD="${neo4jPassword}"

# Strfry configuration
export STRFRY_DOMAIN="${domainName}"

# Owner pubkey for PageRank calculations
export HASENPFEFFR_OWNER_PUBKEY="${ownerPubkey}"

`;
  
  // Write hasenpfeffr configuration file
  if (isRoot) {
    fs.writeFileSync(configPaths.hasenpfeffrConfDestination, hasenpfeffrConfigContent);
    execSync(`chmod 644 ${configPaths.hasenpfeffrConfDestination}`);
    console.log(`Configuration file created at ${configPaths.hasenpfeffrConfDestination}`);
    
    // Generate Nostr identity
    console.log('\x1b[36m=== Generating Nostr Identity for Relay ===\x1b[0m');
    try {
      execSync(`chmod +x ${configPaths.createNostrIdentityScript}`);
      execSync(configPaths.createNostrIdentityScript, { stdio: 'inherit' });
      console.log('Nostr identity generated successfully.');
    } catch (error) {
      console.error('\x1b[31mError generating Nostr identity:\x1b[0m', error.message);
      console.log('You will need to manually run the create_nostr_identity.sh script later.');
    }
  } else {
    console.log('\x1b[33mCannot create configuration file without root privileges.\x1b[0m');
    console.log('Please manually create the file with the following content:');
    console.log('---');
    console.log(configContent);
    console.log('---');
    console.log(`Save it to: ${configPaths.hasenpfeffrConfDestination}`);
    console.log('And set permissions: chmod 644 ' + configPaths.hasenpfeffrConfDestination);
    console.log('Then run: sudo ' + configPaths.createNostrIdentityScript);
    
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
    
    // Run Neo4j installation script - use script -c to avoid hanging on systemctl status
    console.log('Installing Neo4j (this may take a few minutes)...');
    execSync(`script -q -c "${configPaths.neo4jInstallScript}" /dev/null`, { stdio: 'inherit' });
    
    console.log('Neo4j installation completed successfully.');
  } catch (error) {
    console.error('\x1b[31mError installing Neo4j:\x1b[0m', error.message);
    throw new Error('Neo4j installation failed');
  }
}

async function installPipeline() {
  console.log('\x1b[36m=== Installing Strfry to Neo4j Pipeline ===\x1b[0m');
  
  if (!isRoot) {
    console.log('\x1b[33mCannot install pipeline without root privileges.\x1b[0m');
    console.log(`Please manually run the installation script: sudo ${configPaths.pipelineInstallScript}`);
    
    // Wait for user acknowledgment
    await askQuestion('Press Enter to continue...');
    return;
  }
  
  const installPipeline = await askQuestion('Would you like to install Strfry to neo4j Pipeline? (y/n): ');
  if (installPipeline.toLowerCase() !== 'y') {
    console.log('Skipping pipeline installation.');
    return;
  }
  
  try {
    // Make script executable
    execSync(`chmod +x ${configPaths.pipelineInstallScript}`);
    
    // Run pipeline installation script
    console.log('Installing pipeline (this may take a few minutes)...');
    execSync(`script -q -c "${configPaths.pipelineInstallScript}" /dev/null`, { stdio: 'inherit' });
    
    console.log('Pipeline installation completed successfully.');
  } catch (error) {
    console.error('\x1b[31mError installing pipeline:\x1b[0m', error.message);
    throw new Error('Pipeline installation failed');
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
    
    // Run Strfry installation script - use script -c to avoid hanging on systemctl status
    console.log('Installing Strfry (this may take a few minutes)...');
    execSync(`script -q -c "${configPaths.strfryInstallScript}" /dev/null`, { stdio: 'inherit' });
    
    console.log('Strfry installation completed successfully.');
  } catch (error) {
    console.error('\x1b[31mError installing Strfry:\x1b[0m', error.message);
    throw new Error('Strfry installation failed');
  }
}

// Set up systemd services
async function setupStrfryRouterService() {
  console.log('\x1b[36m=== Setting Up Strfry Router Systemd Service ===\x1b[0m');

  if (!isRoot) {
    console.log('\x1b[33mCannot set up strfry router systemd service without root privileges.\x1b[0m');
    
    // Wait for user acknowledgment
    await askQuestion('Press Enter to continue...');
    return;
  }

  // Check if strfry router service file already exists
  if (fs.existsSync(configPaths.strfryRouterServiceFileDestination)) {
    console.log(`Strfry router service file ${configPaths.strfryRouterServiceFileDestination} already exists.`);
    return;
  }

  // move strfry-router.service to proper folder
  fs.writeFileSync(configPaths.strfryRouterServiceFileDestination, configPaths.strfryRouterServiceFileContent);
  console.log(`Strfry router service file created at ${configPaths.strfryRouterServiceFileDestination}`);

  // enable the service
  execSync(`systemctl enable strfry-router.service`);

  // starting the service will be performed at the control panel
}

async function setupAddToQueueService() {
  console.log('\x1b[36m=== Setting Up AddToQueue Systemd Service ===\x1b[0m');

  if (!isRoot) {
    console.log('\x1b[33mCannot set up AddToQueue systemd service without root privileges.\x1b[0m');
    // Wait for user acknowledgment
    await askQuestion('Press Enter to continue...');
    return;
  }

  // Check if addToQueue service file already exists
  if (fs.existsSync(configPaths.addToQueueServiceFileDestination)) {
    console.log(`addToQueue service file ${configPaths.addToQueueServiceFileDestination} already exists.`);
    return;
  }

  // move addToQueue.service to proper folder
  fs.writeFileSync(configPaths.addToQueueServiceFileDestination, configPaths.addToQueueServiceFileContent);
  console.log(`addToQueue service file created at ${configPaths.addToQueueServiceFileDestination}`);

  // enable the service
  execSync(`systemctl enable addToQueue.service`);

  // starting the service will be performed at the control panel
}

async function setupProcessQueueService() {
  console.log('\x1b[36m=== Setting Up ProcessQueue Systemd Service ===\x1b[0m');

  if (!isRoot) {
    console.log('\x1b[33mCannot set up ProcessQueue systemd service without root privileges.\x1b[0m');
    
    // Wait for user acknowledgment
    await askQuestion('Press Enter to continue...');
    return;
  }

  // Check if processQueue service file already exists
  if (fs.existsSync(configPaths.processQueueServiceFileDestination)) {
    console.log(`processQueue service file ${configPaths.processQueueServiceFileDestination} already exists.`);
    return;
  }

  // move processQueue.service to proper folder
  fs.writeFileSync(configPaths.processQueueServiceFileDestination, configPaths.processQueueServiceFileContent);
  console.log(`processQueue service file created at ${configPaths.processQueueServiceFileDestination}`);

  // enable the service
  execSync(`systemctl enable processQueue.service`);

  // starting the service will be performed at the control panel
}

async function setupControlPanelService() {
  console.log('\x1b[36m=== Setting Up Control Panel Systemd Service ===\x1b[0m');
  
  if (!isRoot) {
    console.log('\x1b[33mCannot set up control panelsystemd service without root privileges.\x1b[0m');
    console.log(`Please manually run the control panel installation script:`);
    console.log(`sudo bash ${configPaths.controlPanelInstallScript}`);
    
    // Wait for user acknowledgment
    await askQuestion('Press Enter to continue...');
    return;
  }
  
  try {
    // Run the control panel installation script
    console.log('Running control panel installation script...');
    execSync(`bash ${configPaths.controlPanelInstallScript}`, { stdio: 'inherit' });
    
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
  
  // Neo4j password update instructions
  console.log('\nNeo4j Configuration:');
  console.log('1. Access the Neo4j Browser at http://your-server-ip:7474');
  console.log('2. Log in with username "neo4j" and password "neo4j"');
  console.log('3. You will be prompted to change the default password');
  console.log('4. After changing the password, update it in your Hasenpfeffr configuration:');
  console.log('   Edit /etc/hasenpfeffr.conf and update the NEO4J_PASSWORD value');
  console.log('5. Run the following commands in the Neo4j Browser to set up constraints and indices:');
  console.log('   CREATE CONSTRAINT IF NOT EXISTS FOR (u:NostrUser) REQUIRE u.pubkey IS UNIQUE;');
  console.log('   CREATE CONSTRAINT IF NOT EXISTS FOR (e:NostrEvent) REQUIRE e.id IS UNIQUE;');
  console.log('   CREATE INDEX IF NOT EXISTS FOR (e:NostrEvent) ON (e.pubkey);');
  console.log('   CREATE INDEX IF NOT EXISTS FOR (e:NostrEvent) ON (e.kind);');
  
  // Nginx configuration instructions
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
  
  // SSL certificate instructions
  console.log('\nSSL Certificate:');
  console.log('If you skipped SSL certificate setup or it failed, you can set it up later with:');
  console.log('sudo certbot --nginx -d your-domain.com');
  
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
