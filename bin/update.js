#!/usr/bin/env node

/**
 * Brainstorm Update Script
 * 
 * This script performs a complete update of Brainstorm by:
 * 1. Creating a backup of the current configuration
 * 2. Uninstalling the current version
 * 3. Downloading a fresh copy of the code
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

// Get temp directory for cloning
const tempDir = path.join(os.tmpdir(), 'brainstorm-update-' + Date.now());

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
  log('Downloading fresh copy of Brainstorm...', colors.cyan);
  try {
    // Create temp directory
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Get the username of the actual user who ran sudo
    const username = process.env.SUDO_USER;
    
    // Change ownership of temp directory to the actual user
    if (username) {
      log(`Setting ownership of temp directory to ${username}...`, colors.cyan);
      execSync(`chown -R ${username}:${username} "${tempDir}"`, { stdio: 'pipe' });
    }
    
    // Clone the repository
    if (username) {
      // Clone as the regular user
      execSync(`sudo -u ${username} git clone https://github.com/Pretty-Good-Freedom-Tech/brainstorm.git .`, {
        cwd: tempDir,
        stdio: 'inherit'
      });
    } else {
      // Fallback if SUDO_USER is not available
      execSync('git clone https://github.com/Pretty-Good-Freedom-Tech/brainstorm.git .', {
        cwd: tempDir,
        stdio: 'inherit'
      });
    }
    
    log('Repository cloned successfully', colors.green);
    return tempDir;
  } catch (error) {
    log(`Repository cloning failed: ${error.message}`, colors.red);
    throw new Error('Repository cloning step failed');
  }
}

// Install dependencies
function installDependencies(repoDir) {
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
function installBrainstorm(repoDir) {
  log('Installing Brainstorm with default configuration...', colors.cyan);
  try {
    execSync('npm run install-brainstorm -- --use-default-config', { 
      cwd: repoDir,
      stdio: 'inherit',
      env: { ...process.env, UPDATE_MODE: 'true' } 
    });
    log('Installation with default configuration complete', colors.green);
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
      cwd: packageRoot,
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

// Clean up temp directory
function cleanUp(tempDir) {
  if (tempDir && fs.existsSync(tempDir)) {
    log('Cleaning up temporary files...', colors.cyan);
    try {
      execSync(`rm -rf "${tempDir}"`, { stdio: 'pipe' });
      log('Cleanup complete', colors.green);
    } catch (error) {
      log(`Cleanup failed: ${error.message}`, colors.yellow);
    }
  }
}

// Main function
async function main() {
  log('Starting Brainstorm update process', colors.bright + colors.magenta);
  
  let tempRepoDir = null;
  
  try {
    // Check if running as root
    checkRoot();
    
    // Step 1: Backup
    const backupDir = createBackup();
    
    // Step 2: Uninstall existing version
    uninstallExisting();
    
    // Step 3: Clone fresh repository
    tempRepoDir = cloneFreshRepo();
    
    // Step 4: Install dependencies
    installDependencies(tempRepoDir);
    
    // Step 5: Install Brainstorm with default config
    installBrainstorm(tempRepoDir);
    
    // Step 6: Restore from backup
    restoreFromBackup(backupDir);
    
    // Step 7: Restart services
    restartServices();
    
    // Step 8: Clean up
    cleanUp(tempRepoDir);
    
    log('Update process completed successfully!', colors.bright + colors.green);
  } catch (error) {
    log(`Update process failed: ${error.message}`, colors.bright + colors.red);
    
    // Still try to clean up temp directory if it exists
    if (tempRepoDir) {
      cleanUp(tempRepoDir);
    }
    
    process.exit(1);
  }
}

// Run the main function
main();
