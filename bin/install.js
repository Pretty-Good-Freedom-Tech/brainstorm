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
const { getConfigFromFile } = require('../src/utils/config');

// Check if running in update mode
const isUpdateMode = process.env.UPDATE_MODE === 'true' || process.env.UPDATE_MODE === 'TRUE' || process.env.UPDATE_MODE === '1' || process.env.UPDATE_MODE === 'yes' || process.env.UPDATE_MODE === 'Y';
console.log('\x1b[32m=== UPDATE_MODE env var: "' + process.env.UPDATE_MODE + '" ===\x1b[0m');
console.log(isUpdateMode ? '\x1b[32m=== Running in Update Mode ===\x1b[0m' : '\x1b[32m=== Running in Fresh Installation Mode ===\x1b[0m');

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

// Define system directories
const systemdServiceDir = '/etc/systemd/system';

// Configuration paths
const configPaths = {
  systemdServiceDir: systemdServiceDir,
  hasenpfeffrConfDestination: '/etc/hasenpfeffr.conf',
  strfryRouterConfigDestination: `/etc/strfry-router.config`,
  setupDir: path.join(packageRoot, 'setup'),
  strfryRouterConfigSource: path.join(packageRoot, 'setup', 'strfry-router-install.config'),
  neo4jInstallScript: path.join(packageRoot, 'setup', 'install-neo4j.sh'),
  neo4jConstraintsAndIndexesScript: path.join(packageRoot, 'setup', 'neo4jConstraintsAndIndexes.sh'),

  strfryInstallScript: path.join(packageRoot, 'setup', 'install-strfry.sh'),
  controlPanelInstallScript: path.join(packageRoot, 'setup', 'install-control-panel.sh'),
  createNostrIdentityScript: path.join(packageRoot, 'setup','create_nostr_identity.sh'),
  apocConf: path.join(packageRoot, 'setup', 'apoc.conf'),

  pipelineInstallScript: path.join(packageRoot, 'setup', 'install-pipeline.sh'),
  sudoPrivilegesScript: path.join(packageRoot, 'setup', 'configure-sudo-privileges.sh'),
  controlPanelSudoScript: path.join(packageRoot, 'setup', 'configure-control-panel-sudo.sh'),

  controlPanelServiceFileSource: path.join(packageRoot, 'systemd', 'hasenpfeffr-control-panel.service'),
  strfryRouterServiceFileSource: path.join(packageRoot, 'systemd', 'strfry-router.service'),
  addToQueueServiceFileSource: path.join(packageRoot, 'systemd', 'addToQueue.service'),
  processQueueServiceFileSource: path.join(packageRoot, 'systemd', 'processQueue.service'),

  controlPanelServiceFileDestination: path.join(systemdServiceDir, 'hasenpfeffr-control-panel.service'),
  strfryRouterServiceFileDestination: path.join(systemdServiceDir, 'strfry-router.service'),
  addToQueueServiceFileDestination: path.join(systemdServiceDir, 'addToQueue.service'),
  processQueueServiceFileDestination: path.join(systemdServiceDir, 'processQueue.service'),

  reconcileServiceFileSource: path.join(packageRoot, 'systemd', 'reconcile.service'),
  reconcileTimerFileSource: path.join(packageRoot, 'systemd', 'reconcile.timer'),
  reconcileServiceFileDestination: path.join(systemdServiceDir, 'reconcile.service'),
  reconcileTimerFileDestination: path.join(systemdServiceDir, 'reconcile.timer'),

  processAllTasksServiceFileSource: path.join(packageRoot, 'systemd', 'processAllTasks.service'),
  processAllTasksTimerFileSource: path.join(packageRoot, 'systemd', 'processAllTasks.timer'),
  processAllTasksServiceFileDestination: path.join(systemdServiceDir, 'processAllTasks.service'),
  processAllTasksTimerFileDestination: path.join(systemdServiceDir, 'processAllTasks.timer'),

  calculateHopsServiceFileSource: path.join(packageRoot, 'systemd', 'calculateHops.service'),
  calculateHopsTimerFileSource: path.join(packageRoot, 'systemd', 'calculateHops.timer'),
  calculateHopsServiceFileDestination: path.join(systemdServiceDir, 'calculateHops.service'),
  calculateHopsTimerFileDestination: path.join(systemdServiceDir, 'calculateHops.timer'),

  calculatePersonalizedPageRankServiceFileSource: path.join(packageRoot, 'systemd', 'calculatePersonalizedPageRank.service'),
  calculatePersonalizedPageRankTimerFileSource: path.join(packageRoot, 'systemd', 'calculatePersonalizedPageRank.timer'),
  calculatePersonalizedPageRankServiceFileDestination: path.join(systemdServiceDir, 'calculatePersonalizedPageRank.service'),
  calculatePersonalizedPageRankTimerFileDestination: path.join(systemdServiceDir, 'calculatePersonalizedPageRank.timer'),
  calculatePersonalizedGrapeRankServiceFileSource: path.join(packageRoot, 'systemd', 'calculatePersonalizedGrapeRank.service'),
  calculatePersonalizedGrapeRankTimerFileSource: path.join(packageRoot, 'systemd', 'calculatePersonalizedGrapeRank.timer'),
  calculatePersonalizedGrapeRankServiceFileDestination: path.join(systemdServiceDir, 'calculatePersonalizedGrapeRank.service'),
  calculatePersonalizedGrapeRankTimerFileDestination: path.join(systemdServiceDir, 'calculatePersonalizedGrapeRank.timer')
};

// Configure sudo privileges for hasenpfeffr user and control panel
async function configureSudoPrivileges() {
  console.log('\x1b[36m=== Configuring Sudo Privileges ===\x1b[0m');
  
  // Check if running as root
  if (!isRoot) {
    console.log('\x1b[33mWarning: Not running as root. Sudo privileges configuration will be skipped.\x1b[0m');
    console.log('To configure sudo privileges later, run:');
    console.log(`sudo bash ${configPaths.sudoPrivilegesScript}`);
    console.log(`sudo bash ${configPaths.controlPanelSudoScript}`);
    return;
  }
  
  try {
    // Configure general sudo privileges for hasenpfeffr user
    console.log('Configuring sudo privileges for hasenpfeffr user...');
    execSync(`sudo bash ${configPaths.sudoPrivilegesScript}`, { stdio: 'inherit' });
    
    // Configure specific sudo privileges for control panel
    console.log('Configuring sudo privileges for control panel...');
    execSync(`sudo bash ${configPaths.controlPanelSudoScript}`, { stdio: 'inherit' });
    
    console.log('\x1b[32mSudo privileges configured successfully.\x1b[0m');
  } catch (error) {
    console.error('\x1b[31mError configuring sudo privileges:\x1b[0m', error.message);
    console.log('You can configure sudo privileges manually later by running:');
    console.log(`sudo bash ${configPaths.sudoPrivilegesScript}`);
    console.log(`sudo bash ${configPaths.controlPanelSudoScript}`);
  }
}

// Main installation function
async function install() {
  console.log('\x1b[32m=== Hasenpfeffr ' + (isUpdateMode ? 'Update' : 'Installation') + ' ===\x1b[0m');
  
  try {
    // Step 1: Create hasenpfeffr and strfry-router configuration files
    await createHasenpfeffrConfigFile();
    await createStrfryRouterConfigFile();
    
    // Step 2: Install Neo4j and plugins
    // Skip Neo4j installation in update mode to preserve data
    if (!isUpdateMode) {
      await installNeo4j();
    } else {
      console.log('\x1b[36m=== Preserving existing Neo4j database ===\x1b[0m');
    }
    
    // Step 3: Install Strfry Nostr relay
    // In update mode, preserve the strfry database
    if (!isUpdateMode) {
      await installStrfry();
    } else {
      console.log('\x1b[36m=== Preserving existing Strfry database ===\x1b[0m');
    }
    
    // Step 4: Set up Strfry plugins
    await setupStrfryPlugins();
    
    // Step 5: Create pipeline directories
    await setupPipelineDirectories();
    
    // Step 6: Set up systemd services
    await setupControlPanelService();
    await setupStrfryRouterService();
    await setupAddToQueueService();
    await setupProcessQueueService();
    await setupReconcileService();
    await setupProcessAllScoresService();
    await setupCalculatePersonalizedPageRankService();
    await setupCalculateHopsService();
    await setupCalculatePersonalizedGrapeRankService();

    // Step 7: Setup Strfry Neo4j Pipeline
    await installPipeline();
    
    // Step 8: Configure sudo privileges
    await configureSudoPrivileges();
    
    // Step 9: Final setup and instructions
    await finalSetup();
    
    console.log('\x1b[32m=== ' + (isUpdateMode ? 'Update' : 'Installation') + ' Complete ===\x1b[0m');
    console.log('Hasenpfeffr has been successfully ' + (isUpdateMode ? 'updated' : 'installed and configured') + '.');
    
    if (!isUpdateMode) {
      console.log('You can access the control panel at: http://your-server-ip:7778');
      console.log('or at: https://your-server-domain/control/ (if configured with Nginx)');
    } else {
      console.log('The control panel should be available at the same location as before.');
    }
    
    rl.close();
  } catch (error) {
    console.error('\x1b[31mError during ' + (isUpdateMode ? 'update' : 'installation') + ':\x1b[0m', error.message);
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
    // Read the content of the source file
    let configFileContent = fs.readFileSync(configPaths.strfryRouterConfigSource, 'utf8');
    
    // Get owner pubkey from hasenpfeffr.conf
    const hasenpfeffrConfContent = fs.readFileSync(configPaths.hasenpfeffrConfDestination, 'utf8');
    const ownerPubkeyMatch = hasenpfeffrConfContent.match(/HASENPFEFFR_OWNER_PUBKEY="([^"]+)"/);
    const ownerPubkey = ownerPubkeyMatch ? ownerPubkeyMatch[1] : '';
    
    if (ownerPubkey) {
      // Add personalContent section after baselineWoT section
      const personalContentSection = `
    personalContent {
        dir = "down"

        filter = { "authors": ["${ownerPubkey}"], "limit": 5 }

        urls = [
            "wss://relay.primal.net",
            "wss://relay.hasenpfeffr.com",
            "wss://profiles.nostr1.com",
            "wss://relay.damus.io",
            "wss://relay.nostr.band"
        ]
    }`;
      
      // Insert the personalContent section before the closing brace of the streams section
      configFileContent = configFileContent.replace(/(\s*\}\s*)$/, `${personalContentSection}$1`);
      
      console.log(`Added personalContent section with owner pubkey: ${ownerPubkey}`);
    } else {
      console.log('\x1b[33mWarning: Could not find HASENPFEFFR_OWNER_PUBKEY in configuration. Personal content stream not added.\x1b[0m');
    }

    // Write the modified content to the destination file
    fs.writeFileSync(configPaths.strfryRouterConfigDestination, configFileContent);

    execSync(`sudo chmod 644 ${configPaths.strfryRouterConfigDestination}`);
    console.log(`Configuration file created at ${configPaths.strfryRouterConfigDestination}`);

  } else {
    console.log('\x1b[33mCannot create strfry router configuration file without root privileges.\x1b[0m');
    console.log('Please manually create the file with the following content:');
    console.log('---');
    console.log(configPaths.strfryRouterConfigSource);
    console.log('---');
    console.log(`Save it to: ${configPaths.strfryRouterConfigDestination}`);
    console.log('And set permissions: chmod 644 ' + configPaths.strfryRouterConfigDestination);
  }
}

// Create hasenpfeffr configuration file
async function createHasenpfeffrConfigFile() {
  console.log('\x1b[36m=== Creating Hasenpfeffr Configuration File ===\x1b[0m');

  console.log('\x1b[36m= isUpdateMode: ' + isUpdateMode + '\x1b[0m');
  
  // Check if config file already exists and we're not in update mode
  if (fs.existsSync(configPaths.hasenpfeffrConfDestination) && !isUpdateMode) {
    console.log(`Hasenpfeffr configuration file ${configPaths.hasenpfeffrConfDestination} already exists.`);
    return;
  }
  
  let domainName, ownerPubkey, neo4jPassword, relayUrl, defaultFriendRelays;
  let relayPubkey, relayNsec, relayNpub, relayPrivkey;
  
  if (isUpdateMode) {
    // In update mode, use environment variables set from the backup
    console.log('Using configuration values from environment variables...');
    
    // Extract values from environment variables
    domainName = process.env.STRFRY_DOMAIN || '';
    if (!domainName && process.env.HASENPFEFFR_RELAY_URL) {
      domainName = process.env.HASENPFEFFR_RELAY_URL.replace(/^wss:\/\//, '');
    }
    
    ownerPubkey = process.env.HASENPFEFFR_OWNER_PUBKEY || '';
    relayPubkey = getConfigFromFile('HASENPFEFFR_RELAY_PUBKEY') || '';
    relayPrivkey = getConfigFromFile('HASENPFEFFR_RELAY_PRIVKEY') || '';
    relayNsec = getConfigFromFile('HASENPFEFFR_RELAY_NSEC') || '';
    relayNpub = getConfigFromFile('HASENPFEFFR_RELAY_NPUB') || '';
    neo4jPassword = process.env.NEO4J_PASSWORD || 'neo4j';
    relayUrl = process.env.HASENPFEFFR_RELAY_URL || '';
    defaultFriendRelays = process.env.HASENPFEFFR_DEFAULT_FRIEND_RELAYS || '["wss://relay.hasenpfeffr.com", "wss://profiles.nostr1.com", "wss://relay.nostr.band", "wss://relay.damus.io", "wss://relay.primal.net"]';
    
    // Log what we found
    console.log(`Found domain name: ${domainName || 'Not found'}`);
    console.log(`Found owner pubkey: ${ownerPubkey ? 'Yes' : 'No'}`);
    console.log(`Found relay pubkey: ${relayPubkey ? 'Yes' : 'No'}`);
    console.log(`Found relay nsec: ${relayNsec ? 'Yes' : 'No'}`);
    
    if (!domainName || !ownerPubkey) {
      console.log('\x1b[33mWarning: Some configuration values missing from environment variables.\x1b[0m');
      console.log('Will ask for missing values...');
    }
  } else {
    // Fresh installation, ask for values
    defaultFriendRelays = '["wss://relay.hasenpfeffr.com", "wss://profiles.nostr1.com", "wss://relay.nostr.band", "wss://relay.damus.io", "wss://relay.primal.net"]';
  }
  
  // Get configuration values from user if not in environment or incomplete
  if (!isUpdateMode || !domainName) {
    domainName = await askQuestion('Enter your domain name for the Strfry relay (e.g., relay.example.com; do not include the wss://): ');
  }
  
  if (!isUpdateMode || !ownerPubkey) {
    ownerPubkey = await askQuestion('Enter your Hasenpfeffr owner pubkey: ');
  }
  
  if (!isUpdateMode || !neo4jPassword) {
    neo4jPassword = await askQuestion('Enter the password that you intend to use for Neo4j: ') || 'neo4j';
  }
  
  if (!relayUrl) {
    relayUrl = `wss://${domainName}`;
  }
  
  // Create hasenpfeffr configuration content
  const hasenpfeffrConfigContent = `# Hasenpfeffr Configuration
# Created during ${isUpdateMode ? 'update' : 'installation'}
# This file should be installed at /etc/hasenpfeffr.conf
# with proper permissions: chmod 640 /etc/hasenpfeffr.conf
# and ownership: chown root:hasenpfeffr /etc/hasenpfeffr.conf

# File paths
HASENPFEFFR_MODULE_BASE_DIR="/usr/local/lib/node_modules/hasenpfeffr/"
HASENPFEFFR_MODULE_SRC_DIR="\${HASENPFEFFR_MODULE_BASE_DIR}src/"
HASENPFEFFR_MODULE_ALGOS_DIR="\${HASENPFEFFR_MODULE_BASE_DIR}src/algos"
HASENPFEFFR_MODULE_MANAGE_DIR="\${HASENPFEFFR_MODULE_BASE_DIR}src/manage"
HASENPFEFFR_NIP85_DIR="\${HASENPFEFFR_MODULE_BASE_DIR}src/algos/nip85"
HASENPFEFFR_MODULE_PIPELINE_DIR="\${HASENPFEFFR_MODULE_BASE_DIR}src/pipeline"
STRFRY_PLUGINS_BASE="/usr/local/lib/strfry/plugins/"
STRFRY_PLUGINS_DATA="\${STRFRY_PLUGINS_BASE}/data/"
HASENPFEFFR_LOG_DIR="/var/log/hasenpfeffr"
HASENPFEFFR_BASE_DIR="/var/lib/hasenpfeffr"

export HASENPFEFFR_MODULE_BASE_DIR
export HASENPFEFFR_MODULE_SRC_DIR
export HASENPFEFFR_MODULE_ALGOS_DIR
export HASENPFEFFR_MODULE_MANAGE_DIR
export HASENPFEFFR_NIP85_DIR
export STRFRY_PLUGINS_BASE
export STRFRY_PLUGINS_DATA
export HASENPFEFFR_LOG_DIR
export HASENPFEFFR_BASE_DIR

# default friend relays
export HASENPFEFFR_DEFAULT_FRIEND_RELAYS='${defaultFriendRelays}'

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
export HASENPFEFFR_NEO4J_BROWSER_URL="http://${domainName}:7474"
export NEO4J_URI="bolt://localhost:7687"
export NEO4J_USER="neo4j"
export NEO4J_PASSWORD="${neo4jPassword}"

# Strfry configuration
export STRFRY_DOMAIN="${domainName}"

# Owner pubkey for PageRank calculations
export HASENPFEFFR_OWNER_PUBKEY="${ownerPubkey}"

# Status of Hasenpfeffr service
# 0 = disabled, 1 = enabled, 2 = starting, 3 = running negentropy sync, 4 = batch transfer to neo4j, 5 = stopping, 6 = error
export HASENPFEFFR_STATUS=0

######################### actions #########################

# whether to send email updates to owner
export HASENPFEFFR_SEND_EMAIL_UPDATES=0

# whether neo4j password has been reset
export HASENPFEFFR_RESET_PASSWORD=0

# whether neo4j constraints and indexes has been created
export HASENPFEFFR_CREATED_CONSTRAINTS_AND_INDEXES=0

`;
  
  // Write hasenpfeffr configuration file
  if (isRoot) {
    fs.writeFileSync(configPaths.hasenpfeffrConfDestination, hasenpfeffrConfigContent);
    execSync(`sudo chmod 644 ${configPaths.hasenpfeffrConfDestination}`);
    // move this to configure-sudo-privileges.sh
    // execSync(`sudo chown root:hasenpfeffr ${configPaths.hasenpfeffrConfDestination}`);
    console.log(`Configuration file created at ${configPaths.hasenpfeffrConfDestination}`);
    
    // Generate Nostr identity if not in update mode or if keys are missing
    if (!isUpdateMode || !relayNsec || !relayPubkey) {
      console.log('\x1b[36m=== Generating Nostr Identity for Relay ===\x1b[0m');
      try {
        execSync(`sudo chmod +x ${configPaths.createNostrIdentityScript}`);
        execSync(configPaths.createNostrIdentityScript, { stdio: 'inherit' });
        console.log('Nostr identity generated successfully.');
      } catch (error) {
        console.error('\x1b[31mError generating Nostr identity:\x1b[0m', error.message);
        console.log('You will need to manually run the create_nostr_identity.sh script later.');
      }
    } else {
      console.log('\x1b[36m=== Using Existing Nostr Identity for Relay ===\x1b[0m');
      // Add the relay keys to the config file
      if (fs.existsSync(configPaths.hasenpfeffrConfDestination)) {
        console.log(`${configPaths.hasenpfeffrConfDestination} already exists, appending relay config...`);
        try {
          const appendContent = `
# Relay pubkey and private keys (from previous installation)
export HASENPFEFFR_RELAY_PUBKEY="${relayPubkey}"
export HASENPFEFFR_RELAY_PRIVKEY="${relayPrivkey}"
export HASENPFEFFR_RELAY_NSEC="${relayNsec}"
export HASENPFEFFR_RELAY_NPUB="${relayNpub || ''}"
`;
          fs.appendFileSync(configPaths.hasenpfeffrConfDestination, appendContent);
          console.log('Existing Nostr identity configured successfully.');
        } catch (error) {
          console.error('\x1b[31mError appending relay config to existing configuration file:\x1b[0m', error.message);
        }
      }
    }
  } else {
    console.log('\x1b[33mCannot create configuration file without root privileges.\x1b[0m');
    console.log('Please manually create the file with the following content:');
    console.log('---');
    console.log(hasenpfeffrConfigContent);
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
    execSync(`sudo chmod +x ${configPaths.neo4jInstallScript}`);
    execSync(`sudo chmod +x ${configPaths.neo4jConstraintsAndIndexesScript}`);
    
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
  
  // const installPipeline = await askQuestion('Would you like to install Strfry to neo4j Pipeline? (y/n): ');
  // if (installPipeline.toLowerCase() !== 'y') {
  //   console.log('Skipping pipeline installation.');
  //   return;
  // }
  
  try {
    // Make script executable
    execSync(`sudo chmod +x ${configPaths.pipelineInstallScript}`);
    
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
  
  // const installStrfry = await askQuestion('Would you like to install Strfry Nostr relay? (y/n): ');
  // if (installStrfry.toLowerCase() !== 'y') {
  //   console.log('Skipping Strfry installation.');
  //   return;
  // }
  
  try {
    // Make script executable
    execSync(`sudo chmod +x ${configPaths.strfryInstallScript}`);
    
    // Run Strfry installation script - use script -c to avoid hanging on systemctl status
    console.log('Installing Strfry (this may take a few minutes)...');
    execSync(`script -q -c "${configPaths.strfryInstallScript}" /dev/null`, { stdio: 'inherit' });
    
    console.log('Strfry installation completed successfully.');
  } catch (error) {
    console.error('\x1b[31mError installing Strfry:\x1b[0m', error.message);
    throw new Error('Strfry installation failed');
  }
}

// Setup Strfry Plugins
async function setupStrfryPlugins() {
  console.log('\x1b[36m=== Setting Up Strfry Plugins ===\x1b[0m');
  
  if (!isRoot) {
    console.log('\x1b[33mCannot set up Strfry plugins without root privileges.\x1b[0m');
    
    // Wait for user acknowledgment
    await askQuestion('Press Enter to continue...');
    return;
  }
  
  try {
    // Create plugins directory
    const pluginsDir = '/usr/local/lib/strfry/plugins';
    if (!fs.existsSync(pluginsDir)) {
      console.log(`Creating plugins directory at ${pluginsDir}...`);
      execSync(`mkdir -p ${pluginsDir}`);
    }
    
    // Copy plugin files
    const sourcePluginDir = path.join(packageRoot, 'plugins');
    if (fs.existsSync(sourcePluginDir)) {
      console.log('Copying plugin files...');
      
      // Copy the main plugin file
      const sourcePluginFile = path.join(sourcePluginDir, 'hasenpfeffr.js');
      const destPluginFile = path.join(pluginsDir, 'hasenpfeffr.js');
      
      if (fs.existsSync(sourcePluginFile)) {
        execSync(`cp ${sourcePluginFile} ${destPluginFile}`);
        execSync(`sudo chmod +x ${destPluginFile}`);
        console.log(`Plugin file copied to ${destPluginFile}`);
      } else {
        console.warn(`Plugin file not found at ${sourcePluginFile}`);
      }
      
      // Create plugin data directory for JSON files
      const pluginDataDir = path.join(pluginsDir, 'data');
      if (!fs.existsSync(pluginDataDir)) {
        execSync(`mkdir -p ${pluginDataDir}`);
      }
      
      // Copy JSON data files if they exist
      const jsonFiles = ['whitelist_pubkeys.json', 'blacklist_pubkeys.json', 'whitelist_kinds_filterPubkeyWhitelist.json', 'whitelist_kinds_acceptAll.json'];
      jsonFiles.forEach(jsonFile => {
        const sourceJsonFile = path.join(sourcePluginDir, jsonFile);
        const destJsonFile = path.join(pluginDataDir, jsonFile);
        
        if (fs.existsSync(sourceJsonFile)) {
          execSync(`cp ${sourceJsonFile} ${destJsonFile}`);
          console.log(`JSON file ${jsonFile} copied to ${destJsonFile}`);
        } else {
          // Create empty JSON files if they don't exist
          if (jsonFile === 'whitelist_pubkeys.json' || jsonFile === 'blacklist_pubkeys.json') {
            fs.writeFileSync(destJsonFile, '[]');
          } else if (jsonFile === 'whitelist_kinds.json') {
            fs.writeFileSync(destJsonFile, '[0,1,2,3,4,5,6,7,8,9,10,40,41,42,43,44,45,46,47,48,49,50]');
          }
          console.log(`Created empty JSON file ${destJsonFile}`);
        }
      });
      
      // Update the plugin file to point to the correct JSON file paths
      if (fs.existsSync(destPluginFile)) {
        let pluginContent = fs.readFileSync(destPluginFile, 'utf8');
        
        // Update paths in the plugin file
        pluginContent = pluginContent.replace(
          /const whitelist_pubkeys = JSON\.parse\(fs\.readFileSync\('.*?', 'utf8'\)\)/,
          `const whitelist_pubkeys = JSON.parse(fs.readFileSync('${pluginDataDir}/whitelist_pubkeys.json', 'utf8'))`
        );
        
        pluginContent = pluginContent.replace(
          /const blacklist_pubkeys = JSON\.parse\(fs\.readFileSync\('.*?', 'utf8'\)\)/,
          `const blacklist_pubkeys = JSON.parse(fs.readFileSync('${pluginDataDir}/blacklist_pubkeys.json', 'utf8'))`
        );
        
        pluginContent = pluginContent.replace(
          /const whitelist_kinds = JSON\.parse\(fs\.readFileSync\('.*?', 'utf8'\)\)/,
          `const whitelist_kinds = JSON.parse(fs.readFileSync('${pluginDataDir}/whitelist_kinds.json', 'utf8'))`
        );
        
        fs.writeFileSync(destPluginFile, pluginContent);
        console.log('Updated plugin file with correct JSON paths');
      }
      
      /*
      // Update strfry.conf to include the plugin (but don't enable it by default)
      const strfryConfPath = '/etc/strfry.conf';
      if (fs.existsSync(strfryConfPath)) {
        let confContent = fs.readFileSync(strfryConfPath, 'utf8');
        
        // Check if plugin setting already exists
        const pluginRegex = /relay\.writePolicy\.plugin\s*=\s*"([^"]*)"/;
        if (!pluginRegex.test(confContent)) {
          // Add the plugin setting but leave it disabled by default
          confContent += '\n# Hasenpfeffr plugin (disabled by default, enable via control panel)\nrelay.writePolicy.plugin = ""\n';
          fs.writeFileSync(strfryConfPath, confContent);
          console.log('Updated strfry.conf with plugin configuration (disabled by default)');
        }
      } else {
        console.warn(`strfry.conf not found at ${strfryConfPath}`);
      }
      */
    } else {
      console.warn(`Source plugin directory not found at ${sourcePluginDir}`);
    }
    
    console.log('Strfry plugins setup completed successfully.');
  } catch (error) {
    console.error('\x1b[31mError setting up Strfry plugins:\x1b[0m', error.message);
    console.log('You can set up Strfry plugins manually later.');
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

  try {
    // Read the content of the source file
    const serviceFileContent = fs.readFileSync(configPaths.strfryRouterServiceFileSource, 'utf8');
    
    // Write the content to the destination file
    fs.writeFileSync(configPaths.strfryRouterServiceFileDestination, serviceFileContent);
    console.log(`Strfry router service file created at ${configPaths.strfryRouterServiceFileDestination}`);

    // enable the service
    execSync(`systemctl enable strfry-router.service`);
    console.log('Strfry router service enabled');

    // starting the service will be performed at the control panel
  } catch (error) {
    console.error(`Error setting up strfry router service: ${error.message}`);
    console.log(`Source file: ${configPaths.strfryRouterServiceFileSource}`);
    console.log(`Destination file: ${configPaths.strfryRouterServiceFileDestination}`);
  }
}

async function setupProcessAllScoresService() {
  console.log('\x1b[36m=== Setting Up Process All Scores Systemd Service ===\x1b[0m');

  if (!isRoot) {
    console.log('\x1b[33mCannot set up process all scores systemd service without root privileges.\x1b[0m');

    // Wait for user acknowledgment
    await askQuestion('Press Enter to continue...');
    return;
  }

  // Check if process all scores service file already exists
  if (fs.existsSync(configPaths.processAllTasksServiceFileDestination)) {
    console.log(`process all scores service file ${configPaths.processAllTasksServiceFileDestination} already exists.`);
    return;
  }

  try {
    // Read the content of the source file
    const serviceFileContent = fs.readFileSync(configPaths.processAllTasksServiceFileSource, 'utf8');
    
    // Write the content to the destination file
    fs.writeFileSync(configPaths.processAllTasksServiceFileDestination, serviceFileContent);
    console.log(`process all scores service file created at ${configPaths.processAllTasksServiceFileDestination}`);

    // enable the service
    execSync(`systemctl enable processAllTasks.service`);
    console.log('Process all scores service enabled');

    // starting the service will be performed at the control panel
  } catch (error) {
    console.error(`Error setting up process all scores service: ${error.message}`);
    console.log(`Source file: ${configPaths.processAllTasksServiceFileSource}`);
    console.log(`Destination file: ${configPaths.processAllTasksServiceFileDestination}`);
  }

  // check if processAllTasks timer file already exists
  if (fs.existsSync(configPaths.processAllTasksTimerFileDestination)) {
    console.log(`process all scores timer file ${configPaths.processAllTasksTimerFileDestination} already exists.`);
    return;
  }

  try {
    // Read the content of the source file
    const timerFileContent = fs.readFileSync(configPaths.processAllTasksTimerFileSource, 'utf8');
    
    // Write the content to the destination file
    fs.writeFileSync(configPaths.processAllTasksTimerFileDestination, timerFileContent);
    console.log(`process all scores timer file created at ${configPaths.processAllTasksTimerFileDestination}`);
  } catch (error) {
    console.error(`Error setting up process all scores timer: ${error.message}`);
    console.log(`Source file: ${configPaths.processAllTasksTimerFileSource}`);
    console.log(`Destination file: ${configPaths.processAllTasksTimerFileDestination}`);
  }
}

async function setupCalculatePersonalizedPageRankService() {
  console.log('\x1b[36m=== Setting Up Calculate Personalized PageRank Systemd Service ===\x1b[0m');

  if (!isRoot) {
    console.log('\x1b[33mCannot set up calculate personalized PageRank systemd service without root privileges.\x1b[0m');

    // Wait for user acknowledgment
    await askQuestion('Press Enter to continue...');
    return;
  }

  // Check if calculate personalized PageRank service file already exists
  if (fs.existsSync(configPaths.calculatePersonalizedPageRankServiceFileDestination)) {
    console.log(`calculate personalized PageRank service file ${configPaths.calculatePersonalizedPageRankServiceFileDestination} already exists.`);
    return;
  }

  try {
    // Read the content of the source file
    const serviceFileContent = fs.readFileSync(configPaths.calculatePersonalizedPageRankServiceFileSource, 'utf8');
    
    // Write the content to the destination file
    fs.writeFileSync(configPaths.calculatePersonalizedPageRankServiceFileDestination, serviceFileContent);
    console.log(`calculate personalized PageRank service file created at ${configPaths.calculatePersonalizedPageRankServiceFileDestination}`);

    // enable the service
    execSync(`systemctl enable calculatePersonalizedPageRank.service`);
    console.log('calculate personalized PageRank service enabled');

    // starting the service will be performed at the control panel
  } catch (error) {
    console.error(`Error setting up calculate personalized PageRank service: ${error.message}`);
    console.log(`Source file: ${configPaths.calculatePersonalizedPageRankServiceFileSource}`);
    console.log(`Destination file: ${configPaths.calculatePersonalizedPageRankServiceFileDestination}`);
  }

  // check if calculatePersonalizedPageRank timer file already exists
  if (fs.existsSync(configPaths.calculatePersonalizedPageRankTimerFileDestination)) {
    console.log(`calculate personalized PageRank timer file ${configPaths.calculatePersonalizedPageRankTimerFileDestination} already exists.`);
    return;
  }

  try {
    // Read the content of the source file
    const timerFileContent = fs.readFileSync(configPaths.calculatePersonalizedPageRankTimerFileSource, 'utf8');
    
    // Write the content to the destination file
    fs.writeFileSync(configPaths.calculatePersonalizedPageRankTimerFileDestination, timerFileContent);
    console.log(`calculate personalized PageRank timer file created at ${configPaths.calculatePersonalizedPageRankTimerFileDestination}`);
  } catch (error) {
    console.error(`Error setting up calculate personalized PageRank timer: ${error.message}`);
    console.log(`Source file: ${configPaths.calculatePersonalizedPageRankTimerFileSource}`);
    console.log(`Destination file: ${configPaths.calculatePersonalizedPageRankTimerFileDestination}`);
  }
}

async function setupCalculateHopsService() {
  console.log('\x1b[36m=== Setting Up CalculateHops Systemd Service ===\x1b[0m');

  if (!isRoot) {
    console.log('\x1b[33mCannot set up calculate hops systemd service without root privileges.\x1b[0m');
    
    // Wait for user acknowledgment
    await askQuestion('Press Enter to continue...');
    return;
  }

  // Check if calculate hop service file already exists
  if (fs.existsSync(configPaths.calculateHopsServiceFileDestination)) {
    console.log(`calculate hop service file ${configPaths.calculateHopsServiceFileDestination} already exists.`);
    return;
  }

  try {
    // Read the content of the source file
    const serviceFileContent = fs.readFileSync(configPaths.calculateHopsServiceFileSource, 'utf8');
    
    // Write the content to the destination file
    fs.writeFileSync(configPaths.calculateHopsServiceFileDestination, serviceFileContent);
    console.log(`calculate hop service file created at ${configPaths.calculateHopsServiceFileDestination}`);

    // starting the service will be performed at the control panel
  } catch (error) {
    console.error(`Error setting up calculate hop service: ${error.message}`);
    console.log(`Source file: ${configPaths.calculateHopsServiceFileSource}`);
    console.log(`Destination file: ${configPaths.calculateHopsServiceFileDestination}`);
  }

  // check if calculateHops timer file already exists
  if (fs.existsSync(configPaths.calculateHopsTimerFileDestination)) {
    console.log(`calculateHops timer file ${configPaths.calculateHopsTimerFileDestination} already exists.`);
    return;
  }

  try {
    // Read the content of the source file
    const timerFileContent = fs.readFileSync(configPaths.calculateHopsTimerFileSource, 'utf8');
    
    // Write the content to the destination file
    fs.writeFileSync(configPaths.calculateHopsTimerFileDestination, timerFileContent);
    console.log(`calculateHops timer file created at ${configPaths.calculateHopsTimerFileDestination}`);

    // enable the timer
    execSync(`systemctl enable calculateHops.timer`);
    console.log('calculateHops timer enabled');
  } catch (error) {
    console.error(`Error setting up calculateHops timer file: ${error.message}`);
    console.log(`Source file: ${configPaths.calculateHopsTimerFileSource}`);
    console.log(`Destination file: ${configPaths.calculateHopsTimerFileDestination}`);
  }
}

async function setupReconcileService() {
  console.log('\x1b[36m=== Setting Up Reconcile Systemd Service ===\x1b[0m');

  if (!isRoot) {
    console.log('\x1b[33mCannot set up reconcile systemd service without root privileges.\x1b[0m');
    
    // Wait for user acknowledgment
    await askQuestion('Press Enter to continue...');
    return;
  }

  // Check if reconcile service file already exists
  if (fs.existsSync(configPaths.reconcileServiceFileDestination)) {
    console.log(`reconcile service file ${configPaths.reconcileServiceFileDestination} already exists.`);
    return;
  }

  try {
    // Read the content of the source file
    const serviceFileContent = fs.readFileSync(configPaths.reconcileServiceFileSource, 'utf8');
    
    // Write the content to the destination file
    fs.writeFileSync(configPaths.reconcileServiceFileDestination, serviceFileContent);
    console.log(`reconcile service file created at ${configPaths.reconcileServiceFileDestination}`);

    // starting the service will be performed at the control panel
  } catch (error) {
    console.error(`Error setting up reconcile service: ${error.message}`);
    console.log(`Source file: ${configPaths.reconcileServiceFileSource}`);
    console.log(`Destination file: ${configPaths.reconcileServiceFileDestination}`);
  }

  // Check if reconcile timer file already exists
  if (fs.existsSync(configPaths.reconcileTimerFileDestination)) {
    console.log(`reconcile timer file ${configPaths.reconcileTimerFileDestination} already exists.`);
    return;
  }

  try {
    // Read the content of the source file
    const timerFileContent = fs.readFileSync(configPaths.reconcileTimerFileSource, 'utf8');
    
    // Write the content to the destination file
    fs.writeFileSync(configPaths.reconcileTimerFileDestination, timerFileContent);
    console.log(`reconcile timer file created at ${configPaths.reconcileTimerFileDestination}`);

    // enable the timer
    execSync(`systemctl enable reconcile.timer`);
    console.log('reconcile timer enabled');
  } catch (error) {
    console.error(`Error setting up reconcile timer file: ${error.message}`);
    console.log(`Source file: ${configPaths.reconcileTimerFileSource}`);
    console.log(`Destination file: ${configPaths.reconcileTimerFileDestination}`);
    return;
  }
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

  try {
    // Read the content of the source file
    const serviceFileContent = fs.readFileSync(configPaths.addToQueueServiceFileSource, 'utf8');
    
    // Write the content to the destination file
    fs.writeFileSync(configPaths.addToQueueServiceFileDestination, serviceFileContent);
    console.log(`addToQueue service file created at ${configPaths.addToQueueServiceFileDestination}`);

    // enable the service
    execSync(`systemctl enable addToQueue.service`);
    console.log('addToQueue service enabled');

    // starting the service will be performed at the control panel
  } catch (error) {
    console.error(`Error setting up addToQueue service: ${error.message}`);
    console.log(`Source file: ${configPaths.addToQueueServiceFileSource}`);
    console.log(`Destination file: ${configPaths.addToQueueServiceFileDestination}`);
  }
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

  try {
    // Read the content of the source file
    const serviceFileContent = fs.readFileSync(configPaths.processQueueServiceFileSource, 'utf8');
    
    // Write the content to the destination file
    fs.writeFileSync(configPaths.processQueueServiceFileDestination, serviceFileContent);
    console.log(`processQueue service file created at ${configPaths.processQueueServiceFileDestination}`);

    // enable the service
    execSync(`systemctl enable processQueue.service`);
    console.log('processQueue service enabled');

    // starting the service will be performed at the control panel
  } catch (error) {
    console.error(`Error setting up processQueue service: ${error.message}`);
    console.log(`Source file: ${configPaths.processQueueServiceFileSource}`);
    console.log(`Destination file: ${configPaths.processQueueServiceFileDestination}`);
  }
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

// Setup Pipeline Directories
async function setupPipelineDirectories() {
  console.log('\x1b[36m=== Setting Up Pipeline Directories ===\x1b[0m');
  
  if (!isRoot) {
    console.log('\x1b[33mCannot set up pipeline directories without root privileges.\x1b[0m');
    
    // Wait for user acknowledgment
    await askQuestion('Press Enter to continue...');
    return;
  }
  
  try {
    // Create the base directory structure
    const baseDir = '/var/lib/hasenpfeffr';
    if (!fs.existsSync(baseDir)) {
      console.log(`Creating base directory at ${baseDir}...`);
      execSync(`mkdir -p ${baseDir}`);
    }
    
    // Create pipeline directories
    const pipelineDirs = [
      '/var/lib/hasenpfeffr/pipeline/stream/queue',
      '/var/lib/hasenpfeffr/pipeline/stream/queue_tmp',
      '/var/lib/hasenpfeffr/pipeline/reconcile/queue',
      '/var/lib/hasenpfeffr/pipeline/reconcile/queue_tmp'
    ];
    
    for (const dir of pipelineDirs) {
      if (!fs.existsSync(dir)) {
        console.log(`Creating directory: ${dir}`);
        execSync(`mkdir -p ${dir}`);
      }
    }
    
    // move this to install-pipeline.sh
    // Set appropriate permissions
    // console.log('Setting appropriate permissions...');
    // execSync(`sudo chown -R hasenpfeffr:hasenpfeffr ${baseDir}`);
    // execSync(`sudo chmod -R 755 ${baseDir}`);
    
    console.log('Pipeline directories setup completed successfully.');
  } catch (error) {
    console.error('\x1b[31mError setting up pipeline directories:\x1b[0m', error.message);
    console.log('You can set up pipeline directories manually later.');
  }
}

async function setupCalculatePersonalizedGrapeRankService() {
  console.log('\x1b[36m=== Setting Up Calculate Personalized GrapeRank Systemd Service ===\x1b[0m');
  
  // Check if we have root privileges
  if (!isRoot) {
    console.log('\x1b[33mCannot set up calculate personalized GrapeRank systemd service without root privileges.\x1b[0m');
    return;
  }
  
  try {
    // Check if calculate personalized GrapeRank service file already exists
    if (fs.existsSync(configPaths.calculatePersonalizedGrapeRankServiceFileDestination)) {
      console.log(`calculate personalized GrapeRank service file ${configPaths.calculatePersonalizedGrapeRankServiceFileDestination} already exists.`);
    } else {
      console.log(`Creating calculate personalized GrapeRank service file...`);
      
      // Read the service file template
      const serviceFileContent = fs.readFileSync(configPaths.calculatePersonalizedGrapeRankServiceFileSource, 'utf8');
      
      // Write the service file
      fs.writeFileSync(configPaths.calculatePersonalizedGrapeRankServiceFileDestination, serviceFileContent);
      console.log(`calculate personalized GrapeRank service file created at ${configPaths.calculatePersonalizedGrapeRankServiceFileDestination}`);
      
      // Enable the service
      execSync(`systemctl enable calculatePersonalizedGrapeRank.service`);
      console.log('calculate personalized GrapeRank service enabled');
    }
  } catch (error) {
    console.error(`Error setting up calculate personalized GrapeRank service: ${error.message}`);
    console.log(`Source file: ${configPaths.calculatePersonalizedGrapeRankServiceFileSource}`);
    console.log(`Destination file: ${configPaths.calculatePersonalizedGrapeRankServiceFileDestination}`);
  }
  
  try {
    // check if calculatePersonalizedGrapeRank timer file already exists
    if (fs.existsSync(configPaths.calculatePersonalizedGrapeRankTimerFileDestination)) {
      console.log(`calculate personalized GrapeRank timer file ${configPaths.calculatePersonalizedGrapeRankTimerFileDestination} already exists.`);
    } else {
      console.log(`Creating calculate personalized GrapeRank timer file...`);
      
      // Read the timer file template
      const timerFileContent = fs.readFileSync(configPaths.calculatePersonalizedGrapeRankTimerFileSource, 'utf8');
      
      // Write the timer file
      fs.writeFileSync(configPaths.calculatePersonalizedGrapeRankTimerFileDestination, timerFileContent);
      console.log(`calculate personalized GrapeRank timer file created at ${configPaths.calculatePersonalizedGrapeRankTimerFileDestination}`);
      
      // Enable the timer
      execSync(`systemctl enable calculatePersonalizedGrapeRank.timer`);
      console.log('calculate personalized GrapeRank timer enabled');
    }
  } catch (error) {
    console.error(`Error setting up calculate personalized GrapeRank timer: ${error.message}`);
    console.log(`Source file: ${configPaths.calculatePersonalizedGrapeRankTimerFileSource}`);
    console.log(`Destination file: ${configPaths.calculatePersonalizedGrapeRankTimerFileDestination}`);
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
  console.log('5. set up Neo4j constraints and indexes at the Neo4j Control Panel or by running the following commands in the Neo4j Browser:');

  console.log('   CREATE CONSTRAINT nostrUser_pubkey IF NOT EXISTS FOR (n:NostrUser) REQUIRE n.pubkey IS UNIQUE;');
  console.log('   CREATE INDEX nostrUser_pubkey IF NOT EXISTS FOR (n:NostrUser) ON (n.pubkey);');
  console.log('   CREATE INDEX nostrUser_kind3EventId IF NOT EXISTS FOR (n:NostrUser) ON (n.kind3EventId);');
  console.log('   CREATE INDEX nostrUser_kind3CreatedAt IF NOT EXISTS FOR (n:NostrUser) ON (n.kind3CreatedAt);');
  console.log('   CREATE INDEX nostrUser_kind1984EventId IF NOT EXISTS FOR (n:NostrUser) ON (n.kind1984EventId);');
  console.log('   CREATE INDEX nostrUser_kind1984CreatedAt IF NOT EXISTS FOR (n:NostrUser) ON (n.kind1984CreatedAt);');
  console.log('   CREATE INDEX nostrUser_kind10000EventId IF NOT EXISTS FOR (n:NostrUser) ON (n.kind10000EventId);');
  console.log('   CREATE INDEX nostrUser_kind10000CreatedAt IF NOT EXISTS FOR (n:NostrUser) ON (n.kind10000CreatedAt);');
  console.log('   CREATE INDEX nostrUser_hops IF NOT EXISTS FOR (n:NostrUser) ON (n.hops);');
  console.log('   CREATE INDEX nostrUser_personalizedPageRank IF NOT EXISTS FOR (n:NostrUser) ON (n.personalizedPageRank);');

  console.log('   CREATE INDEX nostrUser_influence IF NOT EXISTS FOR (n:NostrUser) ON (n.influence);');
  console.log('   CREATE INDEX nostrUser_average IF NOT EXISTS FOR (n:NostrUser) ON (n.average);');
  console.log('   CREATE INDEX nostrUser_confidence IF NOT EXISTS FOR (n:NostrUser) ON (n.confidence);');
  console.log('   CREATE INDEX nostrUser_input IF NOT EXISTS FOR (n:NostrUser) ON (n.input);');

  console.log('   CREATE INDEX nostrUser_followedInput IF NOT EXISTS FOR (n:NostrUser) ON (n.followedInput);');
  console.log('   CREATE INDEX nostrUser_mutedInput IF NOT EXISTS FOR (n:NostrUser) ON (n.mutedInput);');
  console.log('   CREATE INDEX nostrUser_reportedInput IF NOT EXISTS FOR (n:NostrUser) ON (n.reportedInput);');
  console.log('   CREATE INDEX nostrUser_blacklisted IF NOT EXISTS FOR (n:NostrUser) ON (n.blacklisted);');

  console.log('   CREATE CONSTRAINT nostrEvent_event_id IF NOT EXISTS FOR (n:NostrEvent) REQUIRE n.event_id IS UNIQUE;');
  console.log('   CREATE INDEX nostrEvent_event_id IF NOT EXISTS FOR (n:NostrEvent) ON (n.event_id);');
  console.log('   CREATE INDEX nostrEvent_kind IF NOT EXISTS FOR (n:NostrEvent) ON (n.kind);');
  console.log('   CREATE INDEX nostrEvent_created_at IF NOT EXISTS FOR (n:NostrEvent) ON (n.created_at);');
  console.log('   CREATE INDEX nostrEvent_author IF NOT EXISTS FOR (n:NostrEvent) ON (n.author);');
  
  // Nginx configuration instructions
  console.log('\nNginx Configuration:');
  console.log('If you installed Strfry, Nginx has been configured to serve:');
  console.log('- The Hasenpfeffr control panel as the main application at https://your-domain/control');
  console.log('- The Strfry relay at https://your-domain/');
  console.log('\nIf you did not install Strfry and want to access the control panel through Nginx,');
  console.log('add the following to your server block:');
  console.log('```');
  console.log('location / {');
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
  
  // Sudo privileges reminder
  console.log('\nSudo Privileges:');
  console.log('If sudo privileges configuration was skipped or failed, you can set it up later with:');
  console.log(`sudo ${configPaths.sudoPrivilegesScript}`);
  console.log(`sudo ${configPaths.controlPanelSudoScript}`);
  console.log('These scripts are required for the control panel to manage systemd services.');
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