#!/usr/bin/env node

/**
 * Brainstorm Update Script
 * 
 * This script performs a complete update of Brainstorm by:
 * 1. Creating a backup of the current configuration
 * 2. Installing/updating the application with default config
 * 3. Restoring the backed-up configuration
 * 
 * Usage:
 *   sudo npm run update
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

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

// Install with default configuration
function installWithDefaultConfig() {
  log('Installing Brainstorm with default configuration...', colors.cyan);
  try {
    execSync('node bin/install.js --use-default-config', { 
      cwd: packageRoot,
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

// Main function
async function main() {
  log('Starting Brainstorm update process', colors.bright + colors.magenta);
  
  try {
    // Check if running as root
    checkRoot();
    
    // Step 1: Backup
    const backupDir = createBackup();
    
    // Step 2: Install with default config
    installWithDefaultConfig();
    
    // Step 3: Restore from backup
    restoreFromBackup(backupDir);
    
    // Step 4: Restart services
    restartServices();
    
    log('Update process completed successfully!', colors.bright + colors.green);
  } catch (error) {
    log(`Update process failed: ${error.message}`, colors.bright + colors.red);
    process.exit(1);
  }
}

// Run the main function
main();
