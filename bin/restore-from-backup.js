#!/usr/bin/env node

/**
 * Brainstorm Restore from Backup Script
 * 
 * This script restores backups of important configuration files and data created by the backup.js script.
 * By default, it restores from the most recent backup, but a specific backup can be specified.
 * 
 * Usage:
 *   node restore-from-backup.js             # Restore from most recent backup
 *   node restore-from-backup.js --backup=backup-2025-04-20T00-00-00Z  # Restore from specific backup
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Parse command line arguments
const args = process.argv.slice(2);
let specificBackup = null;

// Check for --backup flag
for (const arg of args) {
  if (arg.startsWith('--backup=')) {
    specificBackup = arg.split('=')[1];
  }
}

// Configuration - these should match what's in backup.js
const TARGET_FILES = [
  '/etc/strfry.conf',
  '/etc/strfry-router.config',
  '/etc/brainstorm.conf',
  '/etc/graperank.conf',
  '/etc/whitelist.conf',
  '/etc/blacklist.conf'
];

const TARGET_DIRS = [
  '/usr/local/lib/strfry/plugins/data/',
  '/var/log/brainstorm'
];

// Determine the actual user's home directory, even when run with sudo
function getActualUserHome() {
  // Check if running with sudo
  if (process.env.SUDO_USER) {
    try {
      // Get the actual user's home directory
      const username = process.env.SUDO_USER;
      // Use the getent command to get the user's home directory
      const homeDir = execSync(`getent passwd ${username} | cut -d: -f6`).toString().trim();
      if (homeDir) {
        return homeDir;
      }
    } catch (error) {
      console.warn(`Warning: Could not determine home directory for ${process.env.SUDO_USER}: ${error.message}`);
      console.warn('Falling back to current user home directory.');
    }
  }
  
  // Default to os.homedir() if SUDO_USER is not set or if there was an error
  return os.homedir();
}

// Get user home directory
const userHome = getActualUserHome();
const backupsDir = path.join(userHome, 'brainstorm-backups');

/**
 * Find the most recent backup directory
 */
function findMostRecentBackup() {
  try {
    if (!fs.existsSync(backupsDir)) {
      console.error(`Error: Backup directory ${backupsDir} does not exist.`);
      process.exit(1);
    }
    
    const backupDirs = fs.readdirSync(backupsDir)
      .filter(name => name.startsWith('backup-'))
      .map(name => {
        return {
          name,
          path: path.join(backupsDir, name),
          time: fs.statSync(path.join(backupsDir, name)).mtime.getTime()
        };
      })
      .sort((a, b) => b.time - a.time); // Sort by time, newest first
    
    if (backupDirs.length === 0) {
      console.error(`Error: No backups found in ${backupsDir}`);
      process.exit(1);
    }
    
    return backupDirs[0].path;
  } catch (error) {
    console.error(`Error finding most recent backup: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Find a specific backup directory by name
 */
function findSpecificBackup(backupName) {
  const backupPath = path.join(backupsDir, backupName);
  
  if (!fs.existsSync(backupPath)) {
    console.error(`Error: Specific backup ${backupPath} does not exist.`);
    process.exit(1);
  }
  
  return backupPath;
}

/**
 * Create a directory if it doesn't exist
 */
function ensureDirectoryExists(directory) {
  if (!fs.existsSync(directory)) {
    try {
      execSync(`sudo mkdir -p "${directory}"`);
      console.log(`Created directory: ${directory}`);
    } catch (error) {
      console.error(`Error creating directory ${directory}: ${error.message}`);
      process.exit(1);
    }
  }
}

/**
 * Restore a file from the backup to its original location
 */
function restoreFile(backupPath, targetPath) {
  try {
    // Check if the backup file exists
    if (!fs.existsSync(backupPath)) {
      console.warn(`Warning: Backup file ${backupPath} does not exist. Skipping.`);
      return;
    }
    
    // Create the directory structure if needed
    ensureDirectoryExists(path.dirname(targetPath));
    
    // Copy the file with sudo
    execSync(`sudo cp -f "${backupPath}" "${targetPath}"`);
    console.log(`Restored: ${backupPath} -> ${targetPath}`);
  } catch (error) {
    console.error(`Error restoring ${backupPath}: ${error.message}`);
  }
}

/**
 * Recursively restore a directory from backup
 */
function restoreDirectory(backupDir, targetDir) {
  try {
    // Check if the backup directory exists
    if (!fs.existsSync(backupDir)) {
      console.warn(`Warning: Backup directory ${backupDir} does not exist. Skipping.`);
      return;
    }
    
    // For clarity on directories being restored
    console.log(`Restoring directory: ${targetDir}`);
    
    // Create the target directory if it doesn't exist
    ensureDirectoryExists(targetDir);
    
    // Use rsync with sudo for more efficient directory copying with permission preservation
    try {
      execSync(`sudo rsync -av "${backupDir}/" "${targetDir}/"`);
      console.log(`Successfully restored directory contents: ${targetDir}`);
    } catch (error) {
      console.error(`Error restoring directory ${targetDir}: ${error.message}`);
    }
  } catch (error) {
    console.error(`Error restoring directory ${targetDir}: ${error.message}`);
  }
}

/**
 * Main restore function
 */
function performRestore() {
  // Determine which backup to use
  let backupDir;
  if (specificBackup) {
    console.log(`Using specific backup: ${specificBackup}`);
    backupDir = findSpecificBackup(specificBackup);
  } else {
    console.log('Using most recent backup');
    backupDir = findMostRecentBackup();
  }
  
  console.log(`Restoring from backup: ${backupDir}`);
  
  // Confirm before proceeding
  try {
    console.log('\nWARNING: This will overwrite existing configuration files.');
    console.log('Press Ctrl+C to cancel or wait 5 seconds to continue...');
    execSync('sleep 5');
  } catch (error) {
    console.log('\nRestore cancelled.');
    process.exit(0);
  }
  
  try {
    // Restore individual configuration files
    console.log('\nRestoring configuration files:');
    TARGET_FILES.forEach(file => {
      const fileName = path.basename(file);
      const backupPath = path.join(backupDir, 'etc', fileName);
      restoreFile(backupPath, file);
    });
    
    // Restore directories
    console.log('\nRestoring directories:');
    TARGET_DIRS.forEach(dir => {
      // Remove trailing slash if present
      const trimmedDir = dir.endsWith('/') ? dir.slice(0, -1) : dir;
      const dirName = path.basename(trimmedDir);
      // Backup location might have paths like usr/local/lib/...
      const backupSourceDir = path.join(backupDir, 'usr/local/lib/strfry/plugins/data');
      
      // Check if this path format exists
      if (fs.existsSync(backupSourceDir)) {
        restoreDirectory(backupSourceDir, trimmedDir);
      } else {
        // Try alternative path format (just the basename)
        const altBackupDir = path.join(backupDir, dirName);
        if (fs.existsSync(altBackupDir)) {
          restoreDirectory(altBackupDir, trimmedDir);
        } else {
          console.warn(`Warning: Could not find backup for directory ${dir} in ${backupDir}`);
        }
      }
    });
    
    console.log('\nRestore completed successfully.');
    console.log('You may need to restart services for changes to take effect:');
    console.log('  sudo systemctl restart strfry');
    console.log('  sudo systemctl restart brainstorm-control-panel');
  } catch (error) {
    console.error(`Restore failed: ${error.message}`);
    process.exit(1);
  }
}

// Run the restore
performRestore();
