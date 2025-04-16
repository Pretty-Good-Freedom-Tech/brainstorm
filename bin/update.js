#!/usr/bin/env node

/**
 * Brainstorm Update Script
 * 
 * This script manages the update process for Brainstorm. It:
 * 1. Backs up important configuration values
 * 2. Stops running services
 * 3. Removes old configuration and service files
 * 4. Installs the new version
 * 5. Cleans up temporary files
 * 
 * When run with --uninstall flag, it will remove Brainstorm without installing a new version.
 */

const fs = require('fs');
const { execSync } = require('child_process');
const { getConfigFromFile } = require('../src/utils/config');

// Parse command line arguments
const args = process.argv.slice(2);
const isUninstall = args.includes('--uninstall');

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
// Removed this function as it's now centralized in getConfigFromFile

// Backup important configuration values
function backupConfiguration() {
  console.log('Backing up critical configuration...');
  
  const backupData = {
    BRAINSTORM_RELAY_URL: getConfigFromFile('BRAINSTORM_RELAY_URL', ''),
    BRAINSTORM_OWNER_PUBKEY: getConfigFromFile('BRAINSTORM_OWNER_PUBKEY', ''),
    BRAINSTORM_RELAY_PUBKEY: getConfigFromFile('BRAINSTORM_RELAY_PUBKEY', ''),
    BRAINSTORM_RELAY_NPUB: getConfigFromFile('BRAINSTORM_RELAY_NPUB', ''),
    BRAINSTORM_RELAY_PRIVKEY: getConfigFromFile('BRAINSTORM_RELAY_PRIVKEY', ''),
    NEO4J_PASSWORD: getConfigFromFile('NEO4J_PASSWORD', 'neo4j'),
    BRAINSTORM_DEFAULT_FRIEND_RELAYS: getConfigFromFile('BRAINSTORM_DEFAULT_FRIEND_RELAYS', '[]')
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
  if (!fs.existsSync('/tmp/brainstorm-update')) {
    fs.mkdirSync('/tmp/brainstorm-update', { recursive: true });
  }
  
  // Write backup data to temporary file
  fs.writeFileSync('/tmp/brainstorm-update/config-backup.json', JSON.stringify(backupData, null, 2));
  console.log('Configuration backed up to /tmp/brainstorm-update/config-backup.json');
}

// Stop all services
function stopServices() {
  console.log('Stopping Brainstorm services...');
  const services = [
    'brainstorm-control-panel',
    'addToQueue',
    'processQueue',
    'strfry-router',
    'processAllTasks.timer',
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

  let homeDir;
  if (process.env.SUDO_USER) {
    const originalUser = process.env.SUDO_USER;
    homeDir = `/home/${originalUser}`;
  } else if (process.env.USER === 'root' && fs.existsSync('/home/ubuntu')) {
    homeDir = '/home/ubuntu';
  } else {
    homeDir = process.env.HOME || '/home/ubuntu';
  }

  const configFiles = [
    '/etc/brainstorm.conf',
    '/etc/blacklist.conf',
    '/etc/whitelist.conf',
    '/etc/graperank.conf',
    '/etc/strfry-router.config'
  ];
  
  const serviceFiles = [
    '/etc/systemd/system/brainstorm-control-panel.service',
    '/etc/systemd/system/addToQueue.service',
    '/etc/systemd/system/processQueue.service',
    '/etc/systemd/system/strfry-router.service',
    '/etc/systemd/system/processAllTasks.service',
    '/etc/systemd/system/processAllTasks.timer',
    '/etc/systemd/system/reconcile.service',
    '/etc/systemd/system/reconcile.timer',
    '/etc/systemd/system/calculateHops.service',
    '/etc/systemd/system/calculateHops.timer',
    '/etc/systemd/system/calculatePersonalizedPageRank.service',
    '/etc/systemd/system/calculatePersonalizedPageRank.timer',
    '/etc/systemd/system/calculatePersonalizedGrapeRank.service',
    '/etc/systemd/system/calculatePersonalizedGrapeRank.timer'
  ];

  const dataAndApplicationFiles = [
    '/usr/local/bin/brainstorm-control-panel',
    '/usr/local/bin/brainstorm-strfry-stats',
    '/usr/local/bin/brainstorm-negentropy-sync',
    '/usr/local/bin/brainstorm-update-config',
    '/usr/local/bin/brainstorm-generate',
    '/usr/local/bin/brainstorm-install',
    '/usr/local/bin/brainstorm-node',
    '/usr/local/bin/brainstorm-publish',
    '/var/lock/processQueue.lock'
  ];
  
  const directories = [
    // '/usr/local/lib/strfry',
    '/var/lib/brainstorm',
    '/usr/local/lib/node_modules/brainstorm',
    `${homeDir}/brainstorm`
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

  // Remove data and application files
  for (const file of dataAndApplicationFiles) {
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
  const backupData = JSON.parse(fs.readFileSync('/tmp/brainstorm-update/config-backup.json', 'utf8'));
  
  // Set environment variables from backup
  Object.keys(backupData).forEach(key => {
    // Don't set the config file content as env vars
    if (key !== 'GRAPERANK_CONFIG' && key !== 'BLACKLIST_CONFIG') {
      process.env[key] = backupData[key];
    }
  });
  
  // Set update mode environment variable
  process.env.UPDATE_MODE = 'true';
  
  // Determine home directory - same logic as in cloneRepository
  let homeDir;
  if (process.env.SUDO_USER) {
    const originalUser = process.env.SUDO_USER;
    homeDir = `/home/${originalUser}`;
  } else if (process.env.USER === 'root' && fs.existsSync('/home/ubuntu')) {
    homeDir = '/home/ubuntu';
  } else {
    homeDir = process.env.HOME || '/home/ubuntu';
  }
  
  const brainstormDir = `${homeDir}/brainstorm`;
  console.log(`Using project directory: ${brainstormDir}`);
  
  // Install dependencies first
  console.log('Installing dependencies...');
  executeCommand('npm install', {
    cwd: brainstormDir,
    exitOnError: true
  });
  
  // Run the installation script from the correct directory
  console.log('Running installation script...');
  executeCommand('sudo -E npm run install-brainstorm', { 
    cwd: brainstormDir,
    env: { ...process.env }
  });
  
  // Restore GrapeRank configuration if it was backed up
  if (backupData.GRAPERANK_CONFIG) {
    console.log('Restoring GrapeRank configuration...');
    fs.writeFileSync('/tmp/brainstorm-update/graperank.conf', backupData.GRAPERANK_CONFIG);
    executeCommand('sudo cp /tmp/brainstorm-update/graperank.conf /etc/graperank.conf');
    executeCommand('sudo chown root:brainstorm /etc/graperank.conf');
    executeCommand('sudo chmod 644 /etc/graperank.conf');
  }
  
  // Restore blacklist configuration if it was backed up
  if (backupData.BLACKLIST_CONFIG) {
    console.log('Restoring blacklist configuration...');
    fs.writeFileSync('/tmp/brainstorm-update/blacklist.conf', backupData.BLACKLIST_CONFIG);
    executeCommand('sudo cp /tmp/brainstorm-update/blacklist.conf /etc/blacklist.conf');
    executeCommand('sudo chown root:brainstorm /etc/blacklist.conf');
    executeCommand('sudo chmod 644 /etc/blacklist.conf');
  }
}

// Clone the latest repository from GitHub
function cloneRepository() {
  console.log('Cloning the latest Brainstorm repository from GitHub...');
  
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
  if (fs.existsSync(`${homeDir}/brainstorm`)) {
    executeCommand(`rm -rf ${homeDir}/brainstorm`, { exitOnError: false });
  }
  
  // Clone the repository directly to the home directory
  executeCommand('git clone https://github.com/Pretty-Good-Freedom-Tech/brainstorm.git', {
    cwd: homeDir,
    exitOnError: true
  });
  
  // Create the npm link to the new version
  executeCommand('npm link', {
    cwd: `${homeDir}/brainstorm`,
    exitOnError: true
  });
  
  console.log('Repository cloned successfully');
}

// Clean up temporary files
function cleanup() {
  console.log('Cleaning up...');
  executeCommand('sudo rm -r /tmp/brainstorm-update', { exitOnError: false });
}

// Update system packages and ensure dependencies are installed
function prepareSystem() {
  console.log('\x1b[36m=== Updating System Packages ===\x1b[0m');
  console.log('Updating system packages and checking dependencies...');
  
  // Update system packages
  executeCommand('sudo apt update', { exitOnError: false });
  executeCommand('sudo apt upgrade -y', { exitOnError: false });
  
  // Check if Node.js is installed and at the correct version
  try {
    const nodeVersion = execSync('node --version').toString().trim();
    console.log(`Node.js version: ${nodeVersion}`);
    
    // Check if version is 18.x or greater
    const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0], 10);
    if (majorVersion < 18) {
      console.log('\x1b[33mWarning: Node.js version is below 18.x, updating Node.js...\x1b[0m');
      executeCommand('curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -', { exitOnError: false });
      executeCommand('sudo apt install -y nodejs', { exitOnError: false });
    }
  } catch (error) {
    console.log('\x1b[33mNode.js not found, installing...\x1b[0m');
    executeCommand('sudo apt install -y curl', { exitOnError: false });
    executeCommand('curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -', { exitOnError: false });
    executeCommand('sudo apt install -y nodejs', { exitOnError: false });
  }
  
  // Check if Git is installed
  try {
    const gitVersion = execSync('git --version').toString().trim();
    console.log(`Git version: ${gitVersion}`);
  } catch (error) {
    console.log('\x1b[33mGit not found, installing...\x1b[0m');
    executeCommand('sudo apt install -y git', { exitOnError: false });
  }
  
  // Check if pv is installed
  try {
    const pvVersion = execSync('pv --version').toString().trim();
    console.log(`Progress Viewer version: ${pvVersion}`);
  } catch (error) {
    console.log('\x1b[33mpv not found, installing...\x1b[0m');
    executeCommand('sudo apt install -y pv', { exitOnError: false });
  }
  
  console.log('System preparation complete.');
}

// Main update function
async function update() {
  if (isUninstall) {
    console.log('Starting Brainstorm uninstallation...');
  } else {
    console.log('Starting Brainstorm update...');
  }
  
  // Ask if user wants to update system packages (skip this question in uninstall mode)
  let updateSystemPackages = false;
  
  if (!isUninstall) {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
      
    const answer = await new Promise(resolve => {
      rl.question('\x1b[33mDo you want to update system packages and check dependencies? (y/n): \x1b[0m', answer => {
        resolve(answer.trim().toLowerCase());
      });
    });
      
    rl.close();
      
    updateSystemPackages = (answer === 'y' || answer === 'yes');
  }

  if (updateSystemPackages) {
    // Prepare system (update packages and check dependencies)
    prepareSystem();
  } else {
    console.log('Skipping system preparation...');
  }
  
  // Backup configuration
  backupConfiguration();
  
  // Stop services
  stopServices();
  
  // Remove old files
  removeFiles();
  
  // Only clone and install if not in uninstall mode
  if (!isUninstall) {
    // Clone the latest repository from GitHub
    cloneRepository();
    
    // Check and configure sudo privileges if needed (also check here in case installation fails)
    // if (!checkSudoPrivileges()) {
    //   configureSudoPrivileges();
    // }
    
    // Install new version
    installNewVersion();
  } else {
    console.log('\x1b[33mSkipping installation as we are in uninstall mode\x1b[0m');
    console.log('\x1b[33mBrainstorm has been removed from your system\x1b[0m');
  }
  
  // Clean up
  cleanup();
  
  if (isUninstall) {
    console.log('Brainstorm uninstallation completed successfully');
  } else {
    console.log('Brainstorm update completed successfully');
  }
}

// Run the update
update().catch(error => {
  console.error('Update failed:', error);
  process.exit(1);
});
