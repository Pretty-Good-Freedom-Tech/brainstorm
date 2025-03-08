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

// Define system directories
const systemdServiceDir = '/etc/systemd/system';

// Configuration paths
const configPaths = {
  systemdServiceDir: systemdServiceDir,
  hasenpfeffrConfDestination: '/etc/hasenpfeffr.conf',
  strfryRouterConfigDestination: `/etc/strfry-router.config`,
  setupDir: path.join(packageRoot, 'setup'),
  strfryRouterConfigSource: path.join(packageRoot, 'setup', 'strfry-router.config'),
  neo4jInstallScript: path.join(packageRoot, 'setup', 'install-neo4j.sh'),
  neo4jIndicesScript: path.join(packageRoot, 'setup', 'neo4jCommandsAndIndices.sh'),

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

  calculateHopsServiceFileSource: path.join(packageRoot, 'systemd', 'calculateHops.service'),
  calculateHopsTimerFileSource: path.join(packageRoot, 'systemd', 'calculateHops.timer'),
  calculateHopsServiceFileDestination: path.join(systemdServiceDir, 'calculateHops.service'),
  calculateHopsTimerFileDestination: path.join(systemdServiceDir, 'calculateHops.timer'),

  calculatePersonalizedPageRankServiceFileSource: path.join(packageRoot, 'systemd', 'calculatePersonalizedPageRank.service'),
  calculatePersonalizedPageRankTimerFileSource: path.join(packageRoot, 'systemd', 'calculatePersonalizedPageRank.timer'),
  calculatePersonalizedPageRankServiceFileDestination: path.join(systemdServiceDir, 'calculatePersonalizedPageRank.service'),
  calculatePersonalizedPageRankTimerFileDestination: path.join(systemdServiceDir, 'calculatePersonalizedPageRank.timer')
};

// Configure sudo privileges for hasenpfeffr user and control panel
async function configureSudoPrivileges() {
  console.log('\x1b[36m=== Configuring Sudo Privileges ===\x1b[0m');
  
  // Check if running as root
  if (!isRoot) {
    console.log('\x1b[33mWarning: Not running as root. Sudo privileges configuration will be skipped.\x1b[0m');
    console.log('To configure sudo privileges later, run:');
    console.log(`sudo ${configPaths.sudoPrivilegesScript}`);
    console.log(`sudo ${configPaths.controlPanelSudoScript}`);
    return;
  }
  
  try {
    // Configure general sudo privileges for hasenpfeffr user
    console.log('Configuring sudo privileges for hasenpfeffr user...');
    execSync(`bash ${configPaths.sudoPrivilegesScript}`, { stdio: 'inherit' });
    
    // Configure specific sudo privileges for control panel
    console.log('Configuring sudo privileges for control panel...');
    execSync(`bash ${configPaths.controlPanelSudoScript}`, { stdio: 'inherit' });
    
    console.log('\x1b[32mSudo privileges configured successfully.\x1b[0m');
  } catch (error) {
    console.error('\x1b[31mError configuring sudo privileges:\x1b[0m', error.message);
    console.log('You can configure sudo privileges manually later by running:');
    console.log(`sudo ${configPaths.sudoPrivilegesScript}`);
    console.log(`sudo ${configPaths.controlPanelSudoScript}`);
  }
}

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
    await setupCalculatePersonalizedPageRankService();
    await setupCalculateHopsService();

    // Step 5: Setup Strfry Neo4j Pipeline
    await installPipeline();
    
    // Step 6: Configure sudo privileges
    await configureSudoPrivileges();
    
    // Step 7: Final setup and instructions
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
    // Read the content of the source file
    const configFileContent = fs.readFileSync(configPaths.strfryRouterConfigSource, 'utf8');

    // Write the content to the destination file
    fs.writeFileSync(configPaths.strfryRouterConfigDestination, configFileContent);

    execSync(`chmod 644 ${configPaths.strfryRouterConfigDestination}`);
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
# This file should be installed at /etc/hasenpfeffr.conf
# with proper permissions: chmod 640 /etc/hasenpfeffr.conf
# and ownership: chown root:hasenpfeffr /etc/hasenpfeffr.conf

# File paths
export HASENPFEFFR_FILES_SRC="/usr/local/lib/node_modules/hasenpfeffr/src/"

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
export NEO4J_URI="bolt://localhost:7687"
export NEO4J_USER="neo4j"
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
        execSync(`chmod +x ${destPluginFile}`);
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
      const jsonFiles = ['whitelist_pubkeys.json', 'blacklist_pubkeys.json', 'whitelist_kinds.json'];
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
    execSync(`systemctl enable calculate-personalized-page-rank.service`);
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
    execSync(`systemctl enable calculate-hops.timer`);
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
    
    // Set appropriate permissions
    console.log('Setting appropriate permissions...');
    execSync(`chown -R hasenpfeffr:hasenpfeffr ${baseDir}`);
    execSync(`chmod -R 755 ${baseDir}`);
    
    console.log('Pipeline directories setup completed successfully.');
  } catch (error) {
    console.error('\x1b[31mError setting up pipeline directories:\x1b[0m', error.message);
    console.log('You can set up pipeline directories manually later.');
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
  
  // Sudo privileges reminder
  console.log('\nSudo Privileges:');
  console.log('If sudo privileges configuration was skipped or failed, you can set it up later with:');
  console.log(`sudo ${configPaths.sudoPrivilegesScript}`);
  console.log(`sudo ${configPaths.controlPanelSudoScript}`);
  console.log('These scripts are required for the control panel to manage systemd services.');
  
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
