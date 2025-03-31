#!/usr/bin/env node

/**
 * Hasenpfeffr Update Script
 * 
 * This script manages the update process for Hasenpfeffr. It:
 * 1. Backs up important configuration values
 * 2. Stops running services
 * 3. Removes old configuration and service files
 * 4. Installs the new version
 * 5. Cleans up temporary files
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Function to safely execute commands and handle errors
function executeCommand(command, options = {}) {
  console.log(`Executing: ${command}`);
  try {
    return execSync(command, { stdio: 'inherit', ...options });
  } catch (error) {
    console.error(`Command failed: ${command}`);
    console.error(error.message);
    if (options.exitOnError !== false) {
      process.exit(1);
    }
    return null;
  }
}

// Function to get configuration from existing file
function getConfigFromFile(varName, defaultValue = null) {
  try {
    const confFile = '/etc/hasenpfeffr.conf';
    if (fs.existsSync(confFile)) {
      const fileContent = fs.readFileSync(confFile, 'utf8');
      const regex = new RegExp(`${varName}=[\"\\'](.*?)[\"\\'](\\s|$)`, 'gm');
      const match = regex.exec(fileContent);
      
      if (match && match[1]) {
        return match[1];
      }
      
      // Try with source command as fallback
      try {
        const result = execSync(`source ${confFile} && echo $${varName}`, { shell: true }).toString().trim();
        return result || defaultValue;
      } catch (e) {
        console.error(`Error running source command for ${varName}:`, e);
        return defaultValue;
      }
    }
    return defaultValue;
  } catch (error) {
    console.error(`Error getting config value for ${varName}:`, error);
    return defaultValue;
  }
}

// Backup important configuration values
function backupConfiguration() {
  console.log('Backing up critical configuration...');
  
  const backupData = {
    HASENPFEFFR_RELAY_URL: getConfigFromFile('HASENPFEFFR_RELAY_URL', ''),
    HASENPFEFFR_OWNER_PUBKEY: getConfigFromFile('HASENPFEFFR_OWNER_PUBKEY', ''),
    HASENPFEFFR_RELAY_PUBKEY: getConfigFromFile('HASENPFEFFR_RELAY_PUBKEY', ''),
    HASENPFEFFR_RELAY_NPUB: getConfigFromFile('HASENPFEFFR_RELAY_NPUB', ''),
    HASENPFEFFR_RELAY_NSEC: getConfigFromFile('HASENPFEFFR_RELAY_NSEC', ''),
    NEO4J_PASSWORD: getConfigFromFile('NEO4J_PASSWORD', 'neo4j'),
    HASENPFEFFR_DEFAULT_FRIEND_RELAYS: getConfigFromFile('HASENPFEFFR_DEFAULT_FRIEND_RELAYS', '[]')
  };
  
  // Also backup GrapeRank configuration if it exists
  if (fs.existsSync('/etc/graperank.conf')) {
    backupData.GRAPERANK_CONFIG = fs.readFileSync('/etc/graperank.conf', 'utf8');
  }
  
  // Also backup blacklist configuration if it exists
  if (fs.existsSync('/etc/blacklist.conf')) {
    backupData.BLACKLIST_CONFIG = fs.readFileSync('/etc/blacklist.conf', 'utf8');
  }
  
  // Create temp directory if it doesn't exist
  if (!fs.existsSync('/tmp/hasenpfeffr-update')) {
    fs.mkdirSync('/tmp/hasenpfeffr-update', { recursive: true });
  }
  
  // Write backup data to temporary file
  fs.writeFileSync('/tmp/hasenpfeffr-update/config-backup.json', JSON.stringify(backupData, null, 2));
  console.log('Configuration backed up to /tmp/hasenpfeffr-update/config-backup.json');
}

// Stop all services
function stopServices() {
  console.log('Stopping Hasenpfeffr services...');
  const services = [
    'hasenpfeffr-control-panel',
    'addToQueue',
    'processQueue',
    'strfry-router',
    'processAllScores.timer',
    'reconcile.timer',
    'calculateHops.timer',
    'calculatePersonalizedPageRank.timer',
    'calculatePersonalizedGrapeRank.timer'
  ];
  
  for (const service of services) {
    executeCommand(`sudo systemctl stop ${service}`, { exitOnError: false });
  }
  
  executeCommand('sudo systemctl daemon-reload');
}

// Remove configuration and service files
function removeFiles() {
  console.log('Removing old configuration and service files...');
  const configFiles = [
    '/etc/hasenpfeffr.conf',
    '/etc/blacklist.conf',
    '/etc/graperank.conf',
    '/etc/strfry-router.config'
  ];
  
  const serviceFiles = [
    '/etc/systemd/system/hasenpfeffr-control-panel.service',
    '/etc/systemd/system/addToQueue.service',
    '/etc/systemd/system/processQueue.service',
    '/etc/systemd/system/strfry-router.service',
    '/etc/systemd/system/processAllScores.service',
    '/etc/systemd/system/processAllScores.timer',
    '/etc/systemd/system/reconcile.service',
    '/etc/systemd/system/reconcile.timer',
    '/etc/systemd/system/calculateHops.service',
    '/etc/systemd/system/calculateHops.timer',
    '/etc/systemd/system/calculatePersonalizedPageRank.service',
    '/etc/systemd/system/calculatePersonalizedPageRank.timer',
    '/etc/systemd/system/calculatePersonalizedGrapeRank.service',
    '/etc/systemd/system/calculatePersonalizedGrapeRank.timer'
  ];
  
  const directories = [
    '/usr/local/lib/strfry',
    '/home/ubuntu/hasenpfeffr',
    '/usr/local/lib/node_modules/hasenpfeffr'
  ];
  
  // Remove config files
  for (const file of configFiles) {
    if (fs.existsSync(file)) {
      executeCommand(`sudo rm ${file}`, { exitOnError: false });
    }
  }
  
  // Remove service files
  for (const file of serviceFiles) {
    if (fs.existsSync(file)) {
      executeCommand(`sudo rm ${file}`, { exitOnError: false });
    }
  }
  
  // Remove directories
  for (const dir of directories) {
    if (fs.existsSync(dir)) {
      executeCommand(`sudo rm -r ${dir}`, { exitOnError: false });
    }
  }
}

// Install the new version
function installNewVersion() {
  console.log('Installing new version...');
  
  // Get backup data
  const backupData = JSON.parse(fs.readFileSync('/tmp/hasenpfeffr-update/config-backup.json', 'utf8'));
  
  // Set environment variables from backup
  Object.keys(backupData).forEach(key => {
    // Don't set the config file content as env vars
    if (key !== 'GRAPERANK_CONFIG' && key !== 'BLACKLIST_CONFIG') {
      process.env[key] = backupData[key];
    }
  });
  
  // Set update mode environment variable
  process.env.UPDATE_MODE = 'true';
  
  // Run the installation script
  executeCommand('sudo npm run install-hasenpfeffr', { 
    env: { ...process.env }
  });
  
  // Restore GrapeRank configuration if it was backed up
  if (backupData.GRAPERANK_CONFIG) {
    fs.writeFileSync('/tmp/hasenpfeffr-update/graperank.conf', backupData.GRAPERANK_CONFIG);
    executeCommand('sudo cp /tmp/hasenpfeffr-update/graperank.conf /etc/graperank.conf');
    executeCommand('sudo chown root:hasenpfeffr /etc/graperank.conf');
    executeCommand('sudo chmod 644 /etc/graperank.conf');
  }
  
  // Restore blacklist configuration if it was backed up
  if (backupData.BLACKLIST_CONFIG) {
    fs.writeFileSync('/tmp/hasenpfeffr-update/blacklist.conf', backupData.BLACKLIST_CONFIG);
    executeCommand('sudo cp /tmp/hasenpfeffr-update/blacklist.conf /etc/blacklist.conf');
    executeCommand('sudo chown root:hasenpfeffr /etc/blacklist.conf');
    executeCommand('sudo chmod 644 /etc/blacklist.conf');
  }
}

// Clone the latest repository from GitHub
function cloneRepository() {
  console.log('Cloning the latest Hasenpfeffr repository from GitHub...');
  
  // Determine home directory - handle sudo execution correctly
  let homeDir;
  if (process.env.SUDO_USER) {
    // If running under sudo, use the original user's home directory
    const originalUser = process.env.SUDO_USER;
    homeDir = `/home/${originalUser}`;
  } else if (process.env.USER === 'root' && fs.existsSync('/home/ubuntu')) {
    // Default to /home/ubuntu for AWS EC2 if running as root and the directory exists
    homeDir = '/home/ubuntu';
  } else {
    // Fall back to the current HOME environment variable
    homeDir = process.env.HOME || '/home/ubuntu';
  }
  
  console.log(`Using home directory: ${homeDir}`);
  
  // Remove old repository directory if it exists
  if (fs.existsSync(`${homeDir}/hasenpfeffr`)) {
    executeCommand(`rm -rf ${homeDir}/hasenpfeffr`, { exitOnError: false });
  }
  
  // Clone the repository directly to the home directory
  executeCommand('git clone https://github.com/Pretty-Good-Freedom-Tech/hasenpfeffr.git', {
    cwd: homeDir,
    exitOnError: true
  });
  
  // Create the npm link to the new version
  executeCommand('npm link', {
    cwd: `${homeDir}/hasenpfeffr`,
    exitOnError: true
  });
  
  console.log('Repository cloned successfully');
}

// Clean up temporary files
function cleanup() {
  console.log('Cleaning up...');
  executeCommand('sudo rm -r /tmp/hasenpfeffr-update', { exitOnError: false });
}

// Main update function
async function update() {
  console.log('Starting Hasenpfeffr update...');
  
  // Backup configuration
  backupConfiguration();
  
  // Stop services
  stopServices();
  
  // Remove old files
  removeFiles();
  
  // Clone the latest repository from GitHub
  cloneRepository();
  
  // Install new version
  installNewVersion();
  
  // Clean up
  cleanup();
  
  console.log('Hasenpfeffr update completed successfully');
}

// Run the update
update().catch(error => {
  console.error('Update failed:', error);
  process.exit(1);
});
