#!/usr/bin/env node

/**
 * Brainstorm Update Script
 * 
 * This script performs a complete update of Brainstorm by:
 * 1. Creating a backup of the current configuration
 * 2. Uninstalling the current version
 * 3. Downloading a fresh copy of the code to ~/brainstorm
 * 4. Installing dependencies
 * 5. Installing Brainstorm with default config
 * 6. Restoring the backed-up configuration
 * 7. Restarting services
 * 
 * Usage:
 *   sudo npm run update
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Get package root directory
const packageRoot = path.resolve(__dirname, '..');

// Get the actual user's home directory, even when run with sudo
function getActualUserHome() {
  if (process.env.SUDO_USER) {
    try {
      const username = process.env.SUDO_USER;
      const homeDir = execSync(`getent passwd ${username} | cut -d: -f6`).toString().trim();
      if (homeDir) {
        return homeDir;
      }
    } catch (error) {
      console.warn(`Warning: Could not determine home directory for ${process.env.SUDO_USER}: ${error.message}`);
    }
  }
  
  return os.homedir();
}

// Get user's home directory and set repo dir
const userHome = getActualUserHome();
const repoDir = path.join(userHome, 'brainstorm');

// Parse command-line arguments for specific configuration values
const configArgs = {
  domainName: null,
  ownerPubkey: null,
  neo4jPassword: null
};

// Extract values from command-line arguments
process.argv.forEach(arg => {
  if (arg.startsWith('--domainName=')) {
    configArgs.domainName = arg.split('=')[1];
  } else if (arg.startsWith('--ownerPubkey=')) {
    configArgs.ownerPubkey = arg.split('=')[1];
  } else if (arg.startsWith('--neo4jPassword=')) {
    configArgs.neo4jPassword = arg.split('=')[1];
  }
});

// Timestamp for logging
function timestamp() {
  return new Date().toISOString();
}

// Log with timestamp and color
function log(message, color = colors.reset) {
  console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${color}${message}${colors.reset}`);
}

// Check if running as root
function checkRoot() {
  const isRoot = process.getuid && process.getuid() === 0;
  if (!isRoot) {
    log('This script must be run as root. Please use: sudo npm run update', colors.red);
    process.exit(1);
  }
}

// Create a backup
function createBackup() {
  log('Creating backup of current configuration...', colors.cyan);
  try {
    const backupOutput = execSync('node bin/backup.js', { 
      cwd: packageRoot,
      stdio: 'pipe' 
    }).toString();
    
    // Extract backup directory from output
    const backupDirMatch = backupOutput.match(/Backup created in: (.*)/);
    const backupDir = backupDirMatch ? backupDirMatch[1].trim() : null;
    
    log(`Backup complete${backupDir ? `: ${backupDir}` : ''}`, colors.green);
    return backupDir;
  } catch (error) {
    log(`Backup failed: ${error.message}`, colors.red);
    throw new Error('Backup step failed');
  }
}

// Uninstall existing version
function uninstallExisting() {
  log('Uninstalling existing Brainstorm installation...', colors.cyan);
  try {
    execSync('npm run uninstall', {
      cwd: packageRoot,
      stdio: 'inherit'
    });
    log('Uninstallation complete', colors.green);
  } catch (error) {
    log(`Uninstallation failed: ${error.message}`, colors.red);
    throw new Error('Uninstallation step failed');
  }
}

// Clone fresh repository
function cloneFreshRepo() {
  log(`Downloading fresh copy of Brainstorm to ${repoDir}...`, colors.cyan);
  try {
    // Get the username of the actual user who ran sudo
    const username = process.env.SUDO_USER;
    
    // Remove existing directory if it exists
    if (fs.existsSync(repoDir)) {
      log(`Removing existing directory at ${repoDir}...`, colors.cyan);
      if (username) {
        execSync(`sudo -u ${username} rm -rf "${repoDir}"`, { stdio: 'pipe' });
      } else {
        execSync(`rm -rf "${repoDir}"`, { stdio: 'pipe' });
      }
    }
    
    // Create directory and set correct ownership
    log(`Creating directory ${repoDir}...`, colors.cyan);
    fs.mkdirSync(repoDir, { recursive: true });
    
    if (username) {
      log(`Setting ownership of directory to ${username}...`, colors.cyan);
      execSync(`chown -R ${username}:${username} "${repoDir}"`, { stdio: 'pipe' });
      
      // Clone as the regular user
      execSync(`cd "${userHome}" && sudo -u ${username} git clone https://github.com/Pretty-Good-Freedom-Tech/brainstorm.git brainstorm`, {
        stdio: 'inherit'
      });
    } else {
      // Fallback if SUDO_USER is not available
      execSync(`cd "${userHome}" && git clone https://github.com/Pretty-Good-Freedom-Tech/brainstorm.git brainstorm`, {
        stdio: 'inherit'
      });
    }
    
    log('Repository cloned successfully', colors.green);
    return repoDir;
  } catch (error) {
    log(`Repository cloning failed: ${error.message}`, colors.red);
    throw new Error('Repository cloning step failed');
  }
}

// Install dependencies
function installDependencies() {
  log('Installing dependencies...', colors.cyan);
  try {
    // Get username of the actual user who ran sudo
    const username = process.env.SUDO_USER;
    
    if (username) {
      // Run npm install as the regular user, not as root
      execSync(`sudo -u ${username} npm install`, {
        cwd: repoDir,
        stdio: 'inherit'
      });
    } else {
      // Fallback if SUDO_USER is not available
      execSync('npm install', {
        cwd: repoDir,
        stdio: 'inherit'
      });
    }
    
    log('Dependencies installed successfully', colors.green);
  } catch (error) {
    log(`Dependencies installation failed: ${error.message}`, colors.red);
    throw new Error('Dependencies installation step failed');
  }
}

// Install with default configuration
function installBrainstorm() {
  log('Installing Brainstorm with configuration...', colors.cyan);
  try {
    // Build the installation command with any provided configuration options
    let installCommand = 'npm run install-brainstorm -- --use-empty-config';
    
    // Add any provided config options to the command
    if (configArgs.domainName) {
      installCommand += ` --domainName=${configArgs.domainName}`;
      log(`Using domain name: ${configArgs.domainName}`, colors.cyan);
    }
    
    if (configArgs.ownerPubkey) {
      installCommand += ` --ownerPubkey=${configArgs.ownerPubkey}`;
      log('Using provided owner pubkey', colors.cyan);
    }
    
    if (configArgs.neo4jPassword) {
      installCommand += ` --neo4jPassword=${configArgs.neo4jPassword}`;
      log('Using provided Neo4j password', colors.cyan);
    }
    
    execSync(installCommand, { 
      cwd: repoDir,
      stdio: 'inherit',
      env: { ...process.env, UPDATE_MODE: 'true' } 
    });
    
    log('Installation with configuration complete', colors.green);
  } catch (error) {
    log(`Installation failed: ${error.message}`, colors.red);
    throw new Error('Installation step failed');
  }
}

// Restore from backup
function restoreFromBackup(backupDir) {
  log('Restoring configuration from backup...', colors.cyan);
  
  try {
    let restoreCommand = 'node bin/restore-from-backup.js';
    
    // If we have a specific backup directory, use it
    if (backupDir) {
      const backupName = path.basename(backupDir);
      restoreCommand += ` --backup=${backupName}`;
    }
    
    execSync(restoreCommand, { 
      cwd: repoDir,
      stdio: 'inherit' 
    });
    
    log('Restore complete', colors.green);
  } catch (error) {
    log(`Restore failed: ${error.message}`, colors.red);
    throw new Error('Restore step failed');
  }
}

// Restart services
function restartServices() {
  log('Restarting services...', colors.cyan);
  
  try {
    execSync('systemctl restart strfry.service', { stdio: 'inherit' });
    log('Strfry service restarted', colors.green);
  } catch (error) {
    log(`Failed to restart strfry service: ${error.message}`, colors.yellow);
  }
  
  try {
    execSync('systemctl restart brainstorm-control-panel.service', { stdio: 'inherit' });
    log('Brainstorm control panel service restarted', colors.green);
  } catch (error) {
    log(`Failed to restart brainstorm-control-panel service: ${error.message}`, colors.yellow);
  }
}

// Main function
async function main() {
  log('Starting Brainstorm update process', colors.bright + colors.magenta);
  
  try {
    // Check if running as root
    checkRoot();
    
    // Step 1: Backup
    const backupDir = createBackup();
    
    // Step 2: Uninstall existing version
    uninstallExisting();
    
    // Step 3: Clone fresh repository
    cloneFreshRepo();
    
    // Step 4: Install dependencies
    installDependencies();
    
    // Step 5: Install Brainstorm with default config
    installBrainstorm();
    
    // Step 6: Restore from backup
    restoreFromBackup(backupDir);
    
    // Step 7: Restart services
    restartServices();
    
    log('Update process completed successfully!', colors.bright + colors.green);
  } catch (error) {
    log(`Update process failed: ${error.message}`, colors.bright + colors.red);
    process.exit(1);
  }
}

// Run the main function
main();
