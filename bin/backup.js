#!/usr/bin/env node

/**
 * Brainstorm Backup Script
 * 
 * This script creates backups of important configuration files and data:
 * - All files in /usr/local/lib/strfry/plugins/data/
 * - Customer data in /var/lib/brainstorm/customers/
 * - Secure relay keys in /var/lib/brainstorm/secure-keys/
 * - Log files in /var/log/brainstorm/
 * - System configuration files:
 *   - /etc/strfry.conf
 *   - /etc/strfry-router.config
 *   - /etc/brainstorm.conf
 *   - /etc/graperank.conf
 *   - /etc/whitelist.conf
 *   - /etc/blacklist.conf
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Configuration
const SOURCE_FILES = [
  '/etc/strfry.conf',
  '/etc/strfry-router.config',
  '/etc/brainstorm.conf',
  '/etc/graperank.conf',
  '/etc/whitelist.conf',
  '/etc/blacklist.conf'
];

const SOURCE_DIRS = [
  '/usr/local/lib/strfry/plugins/data/',
  '/var/log/brainstorm',
  '/var/lib/brainstorm/customers',
  '/var/lib/brainstorm/secure-keys'
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

// Create timestamp for the backup folder
const now = new Date();
const timestamp = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
const userHome = getActualUserHome();
const backupDir = path.join(userHome, 'brainstorm-backups', `backup-${timestamp}`);

// Log where we're backing up to
console.log(`Using home directory: ${userHome}`);

/**
 * Create a directory if it doesn't exist
 */
function ensureDirectoryExists(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
    console.log(`Created directory: ${directory}`);
  }
}

/**
 * Copy a file to the backup directory, preserving its relative path
 */
function backupFile(sourcePath, basePath = '/') {
  try {
    // Check if the source file exists
    if (!fs.existsSync(sourcePath)) {
      console.warn(`Warning: Source file ${sourcePath} does not exist. Skipping.`);
      return;
    }
    
    // Determine the destination path in the backup directory
    const relativePath = sourcePath.replace(basePath, '');
    const destinationPath = path.join(backupDir, relativePath);
    
    // Create the directory structure if needed
    ensureDirectoryExists(path.dirname(destinationPath));
    
    // Copy the file
    fs.copyFileSync(sourcePath, destinationPath);
    console.log(`Backed up: ${sourcePath} -> ${destinationPath}`);
  } catch (error) {
    console.error(`Error backing up ${sourcePath}: ${error.message}`);
  }
}

/**
 * Recursively backup all files in a directory
 */
function backupDirectory(sourceDir) {
  try {
    // Check if the source directory exists
    if (!fs.existsSync(sourceDir)) {
      console.warn(`Warning: Source directory ${sourceDir} does not exist. Skipping.`);
      return;
    }
    
    // For clarity on directories being backed up
    console.log(`Backing up directory: ${sourceDir}`);
    
    // Create the base directory in the backup location
    const baseDir = path.dirname(sourceDir);
    const destDir = path.join(backupDir, sourceDir.replace(baseDir === '/' ? '' : baseDir, ''));
    ensureDirectoryExists(destDir);
    
    // Use rsync for more efficient directory copying with permission preservation
    try {
      execSync(`rsync -avR "${sourceDir}" "${backupDir}"`);
      console.log(`Successfully backed up directory contents: ${sourceDir}`);
    } catch (error) {
      // If rsync fails, fall back to manual file copying
      console.warn(`Warning: rsync failed, falling back to manual file copying: ${error.message}`);
      
      // Get all files in the directory recursively
      const files = getAllFiles(sourceDir);
      files.forEach(file => {
        backupFile(file, baseDir);
      });
    }
  } catch (error) {
    console.error(`Error backing up directory ${sourceDir}: ${error.message}`);
  }
}

/**
 * Get all files in a directory recursively
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  });
  
  return arrayOfFiles;
}

/**
 * Main backup function
 */
function performBackup() {
  try {
    console.log(`Starting Brainstorm backup to: ${backupDir}`);
    ensureDirectoryExists(backupDir);
    
    // Backup individual configuration files
    console.log('Backing up configuration files:');
    SOURCE_FILES.forEach(file => {
      backupFile(file);
    });
    
    // Backup directories
    console.log('\nBacking up directories:');
    SOURCE_DIRS.forEach(dir => {
      backupDirectory(dir);
    });
    
    console.log(`\nBackup completed successfully: ${backupDir}`);
    console.log('Consider copying this backup to external storage for safekeeping.');
  } catch (error) {
    console.error(`Backup failed: ${error.message}`);
    process.exit(1);
  }
}

// Run the backup
performBackup();
