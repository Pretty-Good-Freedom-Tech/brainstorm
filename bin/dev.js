#!/usr/bin/env node

/**
 * Brainstorm Development Script
 * 
 * This script sets up a local development environment for Brainstorm with HTTPS enabled.
 * It automatically handles certificate generation and proper environment variables.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const SSL_DIR = path.join(os.homedir(), '.ssl');
const KEY_PATH = path.join(SSL_DIR, 'localhost.key');
const CERT_PATH = path.join(SSL_DIR, 'localhost.crt');
const SYSTEMD_SERVICE = 'brainstorm-control-panel';

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

/**
 * Check if SSL certificates exist and generate them if needed
 */
function ensureCertificates() {
  console.log(`${colors.blue}Checking for SSL certificates...${colors.reset}`);
  
  if (!fs.existsSync(SSL_DIR)) {
    console.log(`${colors.yellow}Creating SSL directory: ${SSL_DIR}${colors.reset}`);
    fs.mkdirSync(SSL_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(KEY_PATH) || !fs.existsSync(CERT_PATH)) {
    console.log(`${colors.yellow}Generating self-signed certificates for local development...${colors.reset}`);
    try {
      execSync(`openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ${KEY_PATH} -out ${CERT_PATH} -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`, 
        { stdio: 'inherit' }
      );
      
      // Set proper permissions
      fs.chmodSync(KEY_PATH, 0o600);
      fs.chmodSync(CERT_PATH, 0o644);
      
      console.log(`${colors.green}Certificates generated successfully!${colors.reset}`);
    } catch (error) {
      console.error(`${colors.red}Failed to generate certificates: ${error.message}${colors.reset}`);
      console.error(`${colors.yellow}Please generate them manually:
      mkdir -p ~/.ssl
      openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ~/.ssl/localhost.key -out ~/.ssl/localhost.crt -subj "/CN=localhost"${colors.reset}`);
      process.exit(1);
    }
  } else {
    console.log(`${colors.green}Certificates already exist.${colors.reset}`);
  }
}

/**
 * Check if the systemd service is running and stop it if needed
 */
function checkAndStopSystemdService() {
  console.log(`${colors.blue}Checking if systemd service is running...${colors.reset}`);
  
  try {
    // Check if systemd is available (Linux only)
    try {
      execSync('systemctl --version', { stdio: 'ignore' });
    } catch (error) {
      console.log(`${colors.yellow}Systemd not detected. Skipping service check.${colors.reset}`);
      return;
    }
    
    // Check if our service exists
    try {
      execSync(`systemctl status ${SYSTEMD_SERVICE}`, { stdio: 'ignore' });
    } catch (error) {
      console.log(`${colors.yellow}Service ${SYSTEMD_SERVICE} not found. Skipping.${colors.reset}`);
      return;
    }
    
    // Check if service is active
    const isActive = execSync(`systemctl is-active ${SYSTEMD_SERVICE}`).toString().trim() === 'active';
    
    if (isActive) {
      console.log(`${colors.yellow}Stopping ${SYSTEMD_SERVICE} service to avoid port conflicts...${colors.reset}`);
      
      try {
        execSync(`sudo systemctl stop ${SYSTEMD_SERVICE}`, { stdio: 'inherit' });
        console.log(`${colors.green}Service stopped successfully.${colors.reset}`);
      } catch (error) {
        console.error(`${colors.red}Failed to stop service. You may need to run:${colors.reset}`);
        console.error(`${colors.yellow}  sudo systemctl stop ${SYSTEMD_SERVICE}${colors.reset}`);
        console.error(`${colors.red}Then try running this script again.${colors.reset}`);
        process.exit(1);
      }
    } else {
      console.log(`${colors.green}Service ${SYSTEMD_SERVICE} is not running. Continuing.${colors.reset}`);
    }
  } catch (error) {
    console.warn(`${colors.yellow}Warning: Could not check systemd service: ${error.message}${colors.reset}`);
    console.warn(`${colors.yellow}If you encounter port conflicts, manually stop the service:${colors.reset}`);
    console.warn(`${colors.yellow}  sudo systemctl stop ${SYSTEMD_SERVICE}${colors.reset}`);
  }
}

/**
 * Start the control panel in development mode
 */
function startControlPanel() {
  console.log(`${colors.blue}Starting Brainstorm control panel in development mode (HTTPS)...${colors.reset}`);
  console.log(`${colors.magenta}Access at: ${colors.bright}https://localhost:7778${colors.reset}`);
  console.log(`${colors.yellow}Note: You will need to accept the self-signed certificate in your browser${colors.reset}`);
  
  // Set environment variables for the child process
  const env = {
    ...process.env,
    USE_HTTPS: 'true',
    NODE_ENV: 'development'
  };
  
  // Start the control panel process
  const controlPanel = spawn('node', [path.join(__dirname, 'control-panel.js')], {
    env,
    stdio: 'inherit'
  });
  
  // Handle process events
  controlPanel.on('error', (err) => {
    console.error(`${colors.red}Failed to start control panel: ${err.message}${colors.reset}`);
  });
  
  controlPanel.on('exit', (code) => {
    if (code !== 0) {
      console.error(`${colors.red}Control panel exited with code ${code}${colors.reset}`);
    }
  });
  
  // Handle termination signals
  process.on('SIGINT', () => {
    console.log(`${colors.yellow}Stopping development server...${colors.reset}`);
    controlPanel.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    console.log(`${colors.yellow}Stopping development server...${colors.reset}`);
    controlPanel.kill('SIGTERM');
  });
}

/**
 * Main function
 */
function main() {
  console.log(`${colors.bright}${colors.magenta}==============================================${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}  BRAINSTORM - Development Mode${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}==============================================${colors.reset}`);
  
  try {
    // Check and stop systemd service if running
    checkAndStopSystemdService();
    
    // Ensure we have SSL certificates
    ensureCertificates();
    
    // Start the control panel
    startControlPanel();
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run the script
main();
