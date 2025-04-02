#!/usr/bin/env node

/**
 * Hasenpfeffr Control Panel
 * 
 * This script starts the Hasenpfeffr Control Panel web interface
 * and API server for managing NIP-85 data generation and publication.
 */

const express = require('express');
const neo4j = require('neo4j-driver');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { exec, execSync } = require('child_process');
const WebSocket = require('ws');
const { NDKEvent, NDK } = require('@nostr-dev-kit/ndk');
// Set up WebSocket implementation for NDK in Node.js environment
const { useWebSocketImplementation } = require('nostr-tools/pool');
require('websocket-polyfill');
useWebSocketImplementation(WebSocket);

// Import API modules
const api = require('../src/api');

// Import configuration
let config;
try {
  const configModule = require('../lib/config');
  config = configModule.getAll();
} catch (error) {
  console.warn('Could not load configuration:', error.message);
  config = {};
}

// Function to get configuration values directly from /etc/hasenpfeffr.conf
function getConfigFromFile(varName, defaultValue = null) {
  try {
    const confFile = '/etc/hasenpfeffr.conf';
    if (fs.existsSync(confFile)) {
      // Read the file content directly
      const fileContent = fs.readFileSync(confFile, 'utf8');
      console.log(`Reading config for ${varName} from ${confFile}`);
      
      // Look for the variable in the file content
      const regex = new RegExp(`${varName}=[\"\'](.*?)[\"\']
`, 'gm');
      const match = regex.exec(fileContent);
      
      if (match && match[1]) {
        console.log(`Found ${varName}=${match[1]}`);
        return match[1];
      }
      
      // If not found with regex, try the source command as fallback
      console.log(`Trying source command for ${varName}`);
      const result = execSync(`source ${confFile} && echo $${varName}`).toString().trim();
      console.log(`Source command result for ${varName}: '${result}'`);
      return result || defaultValue;
    }
    console.log(`Config file ${confFile} not found`);
    return defaultValue;
  } catch (error) {
    console.error(`Error getting configuration value ${varName}:`, error.message);
    return defaultValue;
  }
}

// Function to get Neo4j connection details
function getNeo4jConnection() {
  // Try to get from config module first
  if (config && config.neo4j) {
    return config.neo4j;
  }
  
  // Fall back to direct file access
  return {
    uri: getConfigFromFile('NEO4J_URI', 'bolt://localhost:7687'),
    user: getConfigFromFile('NEO4J_USER', 'neo4j'),
    password: getConfigFromFile('NEO4J_PASSWORD')
  };
}

// Create Express app
const app = express();
const port = process.env.CONTROL_PANEL_PORT || 7778;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory with proper MIME types
app.use(express.static(path.join(__dirname, '../public'), {
    setHeaders: (res, path, stat) => {
        if (path.endsWith('.css')) {
            console.log('Setting CSS MIME type for:', path);
            res.set('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            console.log('Setting JS MIME type for:', path);
            res.set('Content-Type', 'text/javascript');
        }
    }
}));

// Also serve /control/ as static files (mirror of public)
app.use('/control', express.static(path.join(__dirname, '../public'), {
    setHeaders: (res, path, stat) => {
        if (path.endsWith('.css')) {
            console.log('Setting CSS MIME type for /control path:', path);
            res.set('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            console.log('Setting JS MIME type for /control path:', path);
            res.set('Content-Type', 'text/javascript');
        }
    }
}));

// Register all API endpoints
api.register(app);

// Session middleware
app.use(session({
    secret: getConfigFromFile('SESSION_SECRET', 'hasenpfeffr-default-session-secret-please-change-in-production'),
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Helper function to serve HTML files
function serveHtmlFile(filename, res) {
    try {
        const filePath = path.join(__dirname, '../public', filename);
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).send('File not found');
        }
    } catch (error) {
        console.error('Error serving HTML file:', error);
        res.status(500).send('Internal server error');
    }
}

// Serve the HTML files
app.get('/', (req, res) => {
    serveHtmlFile('index.html', res);
});

app.get('/overview.html', (req, res) => {
    serveHtmlFile('overview.html', res);
});

app.get('/control/overview.html', (req, res) => {
    serveHtmlFile('overview.html', res);
});

app.get('/control', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/nip85-control-panel.html'));
});

app.get('/control/profiles', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/profiles-control-panel.html'));
});

app.get('/control/profile.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/profile.html'));
});

app.get('/control/nip85-control-panel.html', (req, res) => {
    serveHtmlFile('control/nip85-control-panel.html', res);
});

app.get('/control/sign-in.html', (req, res) => {
    serveHtmlFile('control/sign-in.html', res);
});

// For backward compatibility, redirect old URLs to new ones
app.get('/control-panel.html', (req, res) => {
    res.redirect('/control/nip85-control-panel.html');
});

app.get('/nip85-control-panel.html', (req, res) => {
    res.redirect('/control/nip85-control-panel.html');
});

app.get('/sign-in.html', (req, res) => {
    res.redirect('/control/sign-in.html');
});

// Authentication middleware
const authMiddleware = (req, res, next) => {
    // Skip auth for static resources, sign-in page and auth-related endpoints
    if (req.path === '/sign-in.html' || 
        req.path === '/index.html' ||
        req.path.startsWith('/api/auth/') ||
        req.path === '/' || 
        req.path === '/control-panel.html' ||
        req.path === '/nip85-control-panel.html' ||
        !req.path.startsWith('/api/')) {
        return next();
    }
    
    // Check if user is authenticated for API calls
    if (req.session && req.session.authenticated) {
        return next();
    } else {
        // For API calls that modify data, return unauthorized status
        const writeEndpoints = [
            '/batch-transfer',
            '/generate',
            '/publish',
            '/negentropy-sync',
            '/strfry-plugin',
            '/create-kind10040',
            '/publish-kind10040',
            '/publish-kind30382',
            '/hasenpfeffr-control'
        ];
        
        // Check if the current path is a write endpoint
        const isWriteEndpoint = writeEndpoints.some(endpoint => 
            req.path.includes(endpoint) && (req.method === 'POST' || req.path.includes('?action=enable') || req.path.includes('?action=disable'))
        );
        
        if (isWriteEndpoint) {
            return res.status(401).json({ error: 'Authentication required for this action' });
    }
    
        // Allow read-only API access
        return next();
}
};

// Apply auth middleware
app.use(authMiddleware);

// Define API routes

// API endpoint to check system status
app.get('/api/status', handleStatus);

// API endpoint to get strfry event statistics
app.get('/api/strfry-stats', handleStrfryStats);

// API endpoint to get Neo4j status information
app.get('/api/neo4j-status', handleNeo4jStatus);
app.get('/control/api/neo4j-status', handleNeo4jStatus);

// API endpoint for setting up Neo4j constraints and indexes
app.get('/api/neo4j-setup-constraints', handleNeo4jSetupConstraints);
app.get('/control/api/neo4j-setup-constraints', handleNeo4jSetupConstraints);

// API endpoint for Negentropy sync
app.post('/api/negentropy-sync', handleNegentropySync);

app.post('/api/negentropy-sync-wot', handleNegentropySyncWoT);

app.post('/api/negentropy-sync-personal', handleNegentropySyncPersonal);
app.post('/api/negentropy-sync-profiles', handleNegentropySyncProfiles);

app.get('/api/negentropy-sync-personal', handleNegentropySyncPersonal);
app.post('/control/api/negentropy-sync-personal', handleNegentropySyncPersonal);
app.get('/control/api/negentropy-sync-personal', handleNegentropySyncPersonal);
app.post('/control/api/negentropy-sync-personal', handleNegentropySyncPersonal);

// API endpoint to generate NIP-85 data
app.get('/api/generate-nip85', handleGenerateNip85);
app.post('/api/generate-nip85', handleGenerateNip85);
app.get('/control/api/generate-nip85', handleGenerateNip85);
app.post('/control/api/generate-nip85', handleGenerateNip85);

// API endpoint to generate PageRank data
app.get('/api/generate-pagerank', handleGeneratePageRank);
app.post('/api/generate-pagerank', handleGeneratePageRank);
app.get('/control/api/generate-pagerank', handleGeneratePageRank);
app.post('/control/api/generate-pagerank', handleGeneratePageRank);

// API endpoint to generate GrapeRank data
app.get('/api/generate-graperank', handleGenerateGrapeRank);
app.post('/api/generate-graperank', handleGenerateGrapeRank);
app.get('/control/api/generate-graperank', handleGenerateGrapeRank);
app.post('/control/api/generate-graperank', handleGenerateGrapeRank);

// API endpoint to export Whitelist data
app.get('/api/export-whitelist', handleExportWhitelist);
app.post('/api/export-whitelist', handleExportWhitelist);
app.get('/control/api/export-whitelist', handleExportWhitelist);
app.post('/control/api/export-whitelist', handleExportWhitelist);

// API endpoint to generate Blacklist data
app.get('/api/generate-blacklist', handleGenerateBlacklist);
app.post('/api/generate-blacklist', handleGenerateBlacklist);
app.get('/control/api/generate-blacklist', handleGenerateBlacklist);
app.post('/control/api/generate-blacklist', handleGenerateBlacklist);

// API endpoint to publish NIP-85 events
app.get('/api/publish', handlePublish);
app.post('/api/publish', handlePublish);

// API endpoint for systemd services management
app.get('/api/systemd-services', handleSystemdServices);
app.get('/control/api/systemd-services', handleSystemdServices);

// API endpoint for strfry plugin management
app.get('/api/strfry-plugin', handleStrfryPlugin);
app.get('/control/api/strfry-plugin', handleStrfryPlugin);

// API endpoint for batch transfer
app.get('/api/batch-transfer', handleBatchTransfer);
app.post('/api/batch-transfer', handleBatchTransfer);
app.get('/control/api/batch-transfer', handleBatchTransfer);
app.post('/control/api/batch-transfer', handleBatchTransfer);

// API endpoint for reconciliation
app.get('/api/reconciliation', handleReconciliation);
app.post('/api/reconciliation', handleReconciliation);
app.get('/control/api/reconciliation', handleReconciliation);
app.post('/control/api/reconciliation', handleReconciliation);

// API endpoint to create kind 10040 events
app.post('/api/create-kind10040', handleCreateKind10040);

// API endpoint to get unsigned kind 10040 event
app.get('/api/get-kind10040-event', handleGetKind10040Event);

// API endpoint to publish kind 30382 events
app.get('/api/publish-kind30382', handlePublishKind30382);
app.post('/api/publish-kind30382', handlePublishKind30382);
app.get('/control/api/publish-kind30382', handlePublishKind30382);
app.post('/control/api/publish-kind30382', handlePublishKind30382);

// API endpoint to publish kind 10040 events
app.get('/api/publish-kind10040', handlePublishKind10040);
app.post('/api/publish-kind10040', handlePublishKind10040);
app.get('/control/api/publish-kind10040', handlePublishKind10040);
app.post('/control/api/publish-kind10040', handlePublishKind10040);

// API endpoint for getting relay configuration
app.get('/api/relay-config', handleRelayConfig);

// API endpoint for getting kind 30382 event information
app.get('/api/kind30382-info', handleKind30382Info);

// API endpoint for getting kind 10040 event information
app.get('/api/kind10040-info', handleKind10040Info);

// API endpoint for getting NostrUser profiles data from Neo4j
app.get('/api/get-profiles', handleGetProfiles);

// API endpoint for getting individual user data from Neo4j
app.get('/api/get-user-data', handleGetUserData);

// API endpoint for getting network proximity data
app.get('/api/get-network-proximity', handleGetNetworkProximity);

// API endpoint for getting kind 0 events from the nostr network
app.get('/api/get-kind0', handleGetKind0Event);

// GrapeRank configuration endpoints
app.get('/api/graperank-config', handleGetGrapeRankConfig);
app.post('/api/graperank-config', handleUpdateGrapeRankConfig);
app.get('/control/api/graperank-config', handleGetGrapeRankConfig);
app.post('/control/api/graperank-config', handleUpdateGrapeRankConfig);

// Blacklist Configuration API Endpoints
app.get('/api/blacklist-config', handleGetBlacklistConfig);
app.post('/api/blacklist-config', handleUpdateBlacklistConfig);

// Whitelist management
app.get('/api/whitelist-config', handleGetWhitelistConfig);
app.post('/api/whitelist-config', handleUpdateWhitelistConfig);
app.get('/control/api/whitelist-config', handleGetWhitelistConfig);
app.post('/control/api/whitelist-config', handleUpdateWhitelistConfig);

app.get('/api/whitelist-stats', handleGetWhitelistStats);
app.get('/control/api/whitelist-stats', handleGetWhitelistStats);

// Endpoint to count users above influence threshold
app.get('/api/influence-count', handleGetInfluenceCount);
app.get('/control/api/influence-count', handleGetInfluenceCount);

// Endpoint to count users with hops less than or equal to threshold
app.get('/api/hops-count', handleGetHopsCount);
app.get('/control/api/hops-count', handleGetHopsCount);

// Endpoint to count blacklisted users
app.get('/api/blacklist-count', handleGetBlacklistCount);
app.get('/control/api/blacklist-count', handleGetBlacklistCount);

// Endpoint to count users based on full whitelist criteria
app.get('/api/whitelist-preview-count', handleGetWhitelistPreviewCount);
app.get('/control/api/whitelist-preview-count', handleGetWhitelistPreviewCount);

// Authentication endpoints
app.post('/api/auth/verify', handleAuthVerify);
app.post('/api/auth/login', handleAuthLogin);

// API endpoint for checking authentication status
app.get('/api/auth/status', (req, res) => {
    if (req.session && req.session.authenticated) {
        res.json({
            authenticated: true,
            pubkey: req.session.pubkey
        });
    } else {
        res.json({
            authenticated: false
        });
    }
});
app.get('/api/auth/logout', handleAuthLogout);
app.get('/control/api/auth/logout', handleAuthLogout);

// Add route handler for Hasenpfeffr control
app.post('/api/hasenpfeffr-control', handleHasenpfeffrControl);
app.post('/control/api/hasenpfeffr-control', handleHasenpfeffrControl);

// Add route handler for getting calculation status
app.get('/api/calculation-status', handleCalculationStatus);
app.get('/control/api/calculation-status', handleCalculationStatus);

// Add route handler for running service management scripts
app.get('/api/run-script', handleRunScript);
app.post('/api/run-script', handleRunScript);
app.get('/control/api/run-script', handleRunScript);
app.post('/control/api/run-script', handleRunScript);

// Add route handler for checking service status
app.get('/api/service-status', handleServiceStatus);
app.post('/api/service-status', handleServiceStatus);
app.get('/control/api/service-status', handleServiceStatus);
app.post('/control/api/service-status', handleServiceStatus);

// Original handleGetInstanceStatus function has been moved to /src/api/index.js
// This improves performance by splitting the endpoint into multiple smaller endpoints
// that can be loaded in parallel
/*
function handleGetInstanceStatus(req, res) {
    console.log('Getting comprehensive instance status');
    
    // Result object
    const result = {
        success: true,
        timestamp: Math.floor(Date.now() / 1000),
        strfry: {
            service: { status: 'checking...' },
            events: {
                total: 0,
                recent: 0,
                byKind: {
                    0: 0,    // Profiles
                    1: 0,    // Notes/Tweets
                    3: 0,    // Follows
                    7: 0,    // Reactions
                    1984: 0, // Reports
                    10000: 0, // Mutes
                    30818: 0, // Wiki articles
                    10040: 0  // NIP-85 subscribers
                }
            }
        },
        neo4j: {
            service: { status: 'checking...' },
            constraints: { status: 'checking...' },
            indexes: { status: 'checking...' },
            users: { total: 0 },
            relationships: {
                total: 0,
                recent: 0,
                follows: 0,
                reports: 0,
                mutes: 0
            }
        },
        whitelist: {
            count: 0,
            lastUpdated: null
        },
        blacklist: {
            count: 0,
            lastUpdated: null
        },
        grapeRank: {
            verifiedUsers: 0,
            lastUpdated: null
        },
        pageRank: {
            lastUpdated: null
        },
        followsNetwork: {
            lastCalculated: null,
            byHops: {
                0: 0,
                1: 0,
                2: 0,
                3: 0,
                999: 0 // Disconnected
            },
            total: 0
        }
    };
    
    // Function implementation...
}
*/

// Authentication handlers
function handleAuthVerify(req, res) {
    try {
        const { pubkey } = req.body;
        
        if (!pubkey) {
            return res.status(400).json({ error: 'Missing pubkey parameter' });
        }
        
        console.log(`Received authentication request from pubkey: ${pubkey}`);
        
        // Get owner pubkey from config
        const ownerPubkey = getConfigFromFile('HASENPFEFFR_OWNER_PUBKEY');
        
        console.log(`Owner pubkey from config: '${ownerPubkey}'`);
        
        if (!ownerPubkey) {
            console.error('HASENPFEFFR_OWNER_PUBKEY not set in configuration');
            return res.status(500).json({ error: 'Server configuration error' });
        }
        
        // Check if the pubkey matches the owner pubkey
        const authorized = pubkey === ownerPubkey;
        console.log(`Authorization result: ${authorized} (${pubkey} === ${ownerPubkey})`);
        
        if (authorized) {
            // Generate a random challenge for the client to sign
            const challenge = crypto.randomBytes(32).toString('hex');
            req.session.challenge = challenge;
            req.session.pubkey = pubkey;
            
            return res.json({ authorized, challenge });
        } else {
            return res.json({ 
                authorized: false, 
                message: `Only the owner (${ownerPubkey.substring(0, 8)}...) can access the control panel` 
            });
        }
    } catch (error) {
        console.error('Error verifying authentication:', error);
        return res.status(500).json({ error: error.message });
    }
}

function handleAuthLogin(req, res) {
    try {
        const { event, nsec } = req.body;
        
        if (!event) {
            return res.status(400).json({ error: 'Missing event parameter' });
        }
        
        // Verify that the event has a signature
        // In a production environment, you would want to use a proper Nostr library for verification
        // For this example, we'll just check that the pubkey matches and the challenge is included
        
        const sessionPubkey = req.session.pubkey;
        const sessionChallenge = req.session.challenge;
        
        if (!sessionPubkey || !sessionChallenge) {
            return res.status(400).json({ 
                success: false, 
                message: 'No active authentication session' 
            });
        }
        
        // Check pubkey matches
        if (event.pubkey !== sessionPubkey) {
            return res.json({ 
                success: false, 
                message: 'Public key mismatch' 
            });
        }
        
        // Check challenge is included in tags
        let challengeFound = false;
        if (event.tags && Array.isArray(event.tags)) {
            for (const tag of event.tags) {
                if (tag[0] === 'challenge' && tag[1] === sessionChallenge) {
                    challengeFound = true;
                    break;
                }
            }
        }
        
        if (!challengeFound) {
            return res.json({ 
                success: false, 
                message: 'Challenge verification failed' 
            });
        }
        
        // Set session as authenticated
        req.session.authenticated = true;
        
        // Store nsec in session if provided
        if (req.body.nsec) {
            req.session.nsec = req.body.nsec;
            console.log('Private key stored in session for signing events');
        }
        
        return res.json({ 
            success: true, 
            message: 'Authentication successful' 
        });
    } catch (error) {
        console.error('Error during login:', error);
        return res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
}

function handleAuthLogout(req, res) {
    // Destroy the session
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).json({ error: 'Error logging out' });
        }
        
        res.json({ success: true, message: 'Logged out successfully' });
    });
}

// Function to control systemd service
function controlService(serviceName, action) {
  try {
    execSync(`sudo systemctl ${action} ${serviceName}`);
    return { success: true, message: `Service ${serviceName} ${action} successful` };
  } catch (error) {
    return { success: false, message: `Failed to ${action} service ${serviceName}: ${error.message}` };
  }
}

// Handler for getting GrapeRank configuration
function handleGetGrapeRankConfig(req, res) {
    console.log('Getting GrapeRank configuration...');
    
    const configPath = '/etc/graperank.conf';
    
    try {
        // Check if the config file exists
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({ 
                success: false, 
                error: 'GrapeRank configuration file not found' 
            });
        }
        
        // Read the configuration file
        const configContent = fs.readFileSync(configPath, 'utf8');
        
        // Parse the configuration file
        const config = {};
        const lines = configContent.split('\n');
        
        lines.forEach(line => {
            // Skip comments and empty lines
            if (line.trim().startsWith('#') || line.trim() === '') {
                return;
            }
            
            // Extract parameter name and value
            const match = line.match(/^export\s+([A-Z_]+)=(.*)$/);
            if (match) {
                const [, paramName, paramValue] = match;
                config[paramName] = paramValue.trim();
            }
        });
        
        return res.json({
            success: true,
            config: config
        });
    } catch (error) {
        console.error('Error reading GrapeRank configuration:', error);
        return res.status(500).json({
            success: false,
            error: `Error reading GrapeRank configuration: ${error.message}`
        });
    }
}

// Handler for updating GrapeRank configuration
function handleUpdateGrapeRankConfig(req, res) {
    console.log('Updating GrapeRank configuration...');
    
    const configPath = '/etc/graperank.conf';
    const tempConfigPath = '/tmp/graperank.conf.tmp';
    
    try {
        // Check if the config file exists
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({ 
                success: false, 
                error: 'GrapeRank configuration file not found' 
            });
        }
        
        // Get the updated parameters from the request body
        const updatedParams = req.body;
        
        if (!updatedParams || Object.keys(updatedParams).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No parameters provided for update'
            });
        }
        
        // Read the current configuration file
        const configContent = fs.readFileSync(configPath, 'utf8');
        const lines = configContent.split('\n');
        
        // Create a new configuration with updated parameters
        const updatedLines = lines.map(line => {
            // Skip comments and empty lines
            if (line.trim().startsWith('#') || line.trim() === '') {
                return line;
            }
            
            // Check if this line contains a parameter that needs to be updated
            for (const [paramName, paramValue] of Object.entries(updatedParams)) {
                const regex = new RegExp(`^export\\s+${paramName}=.*$`);
                if (regex.test(line)) {
                    return `export ${paramName}=${paramValue}`;
                }
            }
            
            return line;
        });
        
        // Write the updated configuration to a temporary file
        fs.writeFileSync(tempConfigPath, updatedLines.join('\n'));
        
        // Use sudo to copy the temporary file to the actual configuration file
        execSync(`sudo cp ${tempConfigPath} ${configPath}`);
        execSync(`sudo chown root:hasenpfeffr ${configPath}`);
        execSync(`sudo chmod 644 ${configPath}`);
        
        // Clean up the temporary file
        fs.unlinkSync(tempConfigPath);
        
        return res.json({
            success: true,
            message: 'GrapeRank configuration updated successfully'
        });
    } catch (error) {
        console.error('Error updating GrapeRank configuration:', error);
        return res.status(500).json({
            success: false,
            error: `Error updating GrapeRank configuration: ${error.message}`
        });
    }
}

// Handler for getting blacklist configuration
function handleGetBlacklistConfig(req, res) {
  try {
    const configPath = '/etc/blacklist.conf';
    
    // Check if the configuration file exists
    if (!fs.existsSync(configPath)) {
      return res.json({
        success: false,
        error: 'Blacklist configuration file not found'
      });
    }
    
    // Read the configuration file
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = {};
    const lines = configContent.split('\n');
    
    // Parse the configuration file
    for (const line of lines) {
      if (line.startsWith('export ')) {
        const parts = line.substring(7).split('=');
        if (parts.length === 2) {
          const key = parts[0].trim();
          let value = parts[1].trim();
          
          // Remove any quotes from the value
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          }
          
          config[key] = value;
        }
      }
    }

    // Get the count of blacklisted pubkeys
    let blacklistedCount = 0;
    const blacklistPath = '/usr/local/lib/strfry/plugins/data/blacklist_pubkeys.json';
    if (fs.existsSync(blacklistPath)) {
      try {
        const blacklistContent = fs.readFileSync(blacklistPath, 'utf8');
        const blacklist = JSON.parse(blacklistContent);
        blacklistedCount = Object.keys(blacklist).length;
      } catch (error) {
        console.error('Error reading blacklist file:', error);
      }
    }
    
    return res.json({
      success: true,
      config: config,
      blacklistedCount: blacklistedCount
    });
  } catch (error) {
    console.error('Error getting blacklist configuration:', error);
    return res.json({
      success: false,
      error: error.message
    });
  }
}

// Handler for updating blacklist configuration
function handleUpdateBlacklistConfig(req, res) {
  try {
    const configPath = '/etc/blacklist.conf';
    const tempConfigPath = '/tmp/blacklist.conf.tmp';
    
    // Check if the configuration file exists
    if (!fs.existsSync(configPath)) {
      return res.json({
        success: false,
        error: 'Blacklist configuration file not found'
      });
    }
    
    // Read the configuration file
    const configContent = fs.readFileSync(configPath, 'utf8');
    const lines = configContent.split('\n');
    const updatedLines = [];
    
    // Update the configuration file
    for (const line of lines) {
      let updatedLine = line;
      
      if (line.startsWith('export ')) {
        const parts = line.substring(7).split('=');
        if (parts.length === 2) {
          const key = parts[0].trim();
          
          // Check if the key is in the request body
          if (req.body[key] !== undefined) {
            updatedLine = `export ${key}=${req.body[key]}`;
          }
        }
      }
      
      updatedLines.push(updatedLine);
    }
    
    // Write the updated configuration to a temporary file
    fs.writeFileSync(tempConfigPath, updatedLines.join('\n'));
    
    // Copy the temporary file to the actual configuration file with sudo
    execSync(`sudo cp ${tempConfigPath} ${configPath}`);
    execSync(`sudo chmod 644 ${configPath}`);
    execSync(`sudo chown root:hasenpfeffr ${configPath}`);
    
    // Clean up the temporary file
    fs.unlinkSync(tempConfigPath);
    
    return res.json({
      success: true
    });
  } catch (error) {
    console.error('Error updating blacklist configuration:', error);
    return res.json({
      success: false,
      error: error.message
    });
  }
}

// Handler for generating blacklist
function handleGenerateBlacklist(req, res) {
    console.log('Generating blacklist data...');
    
    // Set a longer timeout for the response (10 minutes)
    req.setTimeout(600000); // 10 minutes in milliseconds
    res.setTimeout(600000);
    
    // Use exec with timeout options
    const child = exec('sudo /usr/local/lib/node_modules/hasenpfeffr/src/algos/personalizedBlacklist/calculatePersonalizedBlacklist.sh', {
        timeout: 590000, // slightly less than the HTTP timeout
        maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
    }, (error, stdout, stderr) => {
        console.log('Blacklist calculation completed');
        
        if (error) {
            console.error('Error generating blacklist data:', error);
            return res.json({
                success: false,
                output: stderr || stdout || error.message
            });
        }
        
        console.log('Blacklist data generated successfully');
        return res.json({
            success: true,
            output: stdout || stderr
        });
    });
    
    // Log when the process starts
    child.on('spawn', () => {
        console.log('Blacklist calculation process started');
    });
}

// Handler for setting up Neo4j constraints and indexes
function handleNeo4jSetupConstraints(req, res) {
    console.log('Setting up Neo4j constraints and indexes...');
    
    // Check authentication for write operations
    if (req.method !== 'GET' && (!req.session || !req.session.authenticated)) {
        return res.status(403).json({
            success: false,
            error: 'Authentication required for this operation'
        });
    }
    
    // Execute the setup script
    const setupScript = path.join(__dirname, '..', 'setup', 'neo4jConstraintsAndIndexes.sh');
    
    // Check if the script exists
    if (!fs.existsSync(setupScript)) {
        return res.status(404).json({
            success: false,
            error: 'Setup script not found',
            output: `Script not found at: ${setupScript}`
        });
    }
    
    // Make the script executable
    try {
        fs.chmodSync(setupScript, '755');
    } catch (error) {
        console.error('Error making script executable:', error);
    }
    
    // Execute the script
    exec(setupScript, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing Neo4j constraints setup: ${error.message}`);
            return res.json({
                success: false,
                error: error.message,
                output: stdout + '\n' + stderr
            });
        }
        
        console.log('Neo4j constraints and indexes set up successfully');
        res.json({
            success: true,
            message: 'Neo4j constraints and indexes set up successfully',
            output: stdout
        });
    });
}

// Handler for turning Hasenpfeffr on and off
async function handleHasenpfeffrControl(req, res) {
    const { action } = req.body;
    
    if (!action || (action !== 'on' && action !== 'off')) {
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid action. Must be "on" or "off".' 
        });
    }
    
    try {
        let scriptPath;
        if (action === 'on') {
            scriptPath = '/usr/local/lib/node_modules/hasenpfeffr/src/manage/turnHasenpfeffrOn.sh';
        } else {
            scriptPath = '/usr/local/lib/node_modules/hasenpfeffr/src/manage/turnHasenpfeffrOff.sh';
        }
        
        // Check if script exists
        if (!fs.existsSync(scriptPath)) {
            return res.status(404).json({ 
                success: false, 
                error: `Script not found: ${scriptPath}` 
            });
        }
        
        // Make script executable if it's not already
        execSync(`sudo chmod +x ${scriptPath}`);
        
        // Execute the script
        console.log(`Executing ${scriptPath}...`);
        const output = execSync(`sudo ${scriptPath}`, { timeout: 60000 }).toString();
        
        return res.json({
            success: true,
            action,
            message: `Hasenpfeffr turned ${action} successfully`,
            output
        });
    } catch (error) {
        console.error(`Error turning Hasenpfeffr ${action}:`, error);
        return res.status(500).json({ 
            success: false, 
            error: `Failed to turn Hasenpfeffr ${action}: ${error.message}` 
        });
    }
}

// Handler for running service management scripts
function handleRunScript(req, res) {
    const { script } = req.body;
    
    if (!script) {
        return res.status(400).json({ error: 'Missing script parameter' });
    }
    
    try {
        // Check if script exists
        if (!fs.existsSync(script)) {
            return res.status(404).json({ 
                success: false, 
                error: `Script not found: ${script}` 
            });
        }
        
        // Make script executable if it's not already
        execSync(`sudo chmod +x ${script}`);
        
        // Execute the script
        console.log(`Executing ${script}...`);
        const output = execSync(`sudo ${script}`, { timeout: 60000 }).toString();
        
        return res.json({
            success: true,
            message: `Script ${script} executed successfully`,
            output
        });
    } catch (error) {
        console.error(`Error executing script ${script}:`, error);
        return res.status(500).json({ 
            success: false, 
            error: `Failed to execute script ${script}: ${error.message}` 
        });
    }
}

// Handler for getting service status
function handleServiceStatus(req, res) {
    console.log('Getting service status...');
    
    const { service } = req.query;
    
    if (!service) {
        return res.status(400).json({ error: 'Missing service parameter' });
    }
    
    try {
        // Check if service is running using systemctl
        const serviceStatus = getServiceStatus(service);
        
        return res.json({
            success: true,
            active: serviceStatus === 'active'
        });
    } catch (error) {
        console.error(`Error checking service status for ${service}:`, error);
        return res.status(500).json({ 
            success: false, 
            error: `Failed to check service status: ${error.message}` 
        });
    }
}

// Handler for getting influence count
function handleGetInfluenceCount(req, res) {
    const threshold = parseFloat(req.query.threshold || 0.5);
    
    // Check if Neo4j is running
    exec('systemctl is-active neo4j', (serviceError, serviceStdout) => {
        const isRunning = serviceStdout.trim() === 'active';
        
        if (!isRunning) {
            return res.json({
                success: false,
                error: 'Neo4j service is not running'
            });
        }
        
        // Get Neo4j credentials from the configuration system
        const neo4jConnection = getNeo4jConnection();
        const neo4jUser = neo4jConnection.user;
        const neo4jPassword = neo4jConnection.password;
        
        if (!neo4jPassword) {
            return res.json({
                success: false,
                error: 'Neo4j password not configured. Please update /etc/hasenpfeffr.conf with NEO4J_PASSWORD.'
            });
        }
        
        // Build the Cypher query
        const query = `MATCH (n:NostrUser) WHERE n.influence >= ${threshold} RETURN count(n) as userCount;`;
        
        // Execute the query using cypher-shell
        const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Error querying Neo4j for influence count:', error);
                return res.json({
                    success: false,
                    error: stderr || error.message
                });
            }
            
            // Parse the result to get the count
            const match = stdout.match(/(\d+)/);
            if (match && match[1]) {
                const userCount = parseInt(match[1], 10);
                return res.json({
                    success: true,
                    count: userCount
                });
            } else {
                return res.json({
                    success: false,
                    error: 'Failed to parse user count from Neo4j response'
                });
            }
        });
    });
}

// Handler for getting count of users with hops less than or equal to threshold
function handleGetHopsCount(req, res) {
    const threshold = parseInt(req.query.threshold || 1, 10);
    
    // Check if Neo4j is running
    exec('systemctl is-active neo4j', (serviceError, serviceStdout) => {
        const isRunning = serviceStdout.trim() === 'active';
        
        if (!isRunning) {
            return res.json({
                success: false,
                error: 'Neo4j service is not running'
            });
        }
        
        // Get Neo4j credentials from the configuration system
        const neo4jConnection = getNeo4jConnection();
        const neo4jUser = neo4jConnection.user;
        const neo4jPassword = neo4jConnection.password;
        
        if (!neo4jPassword) {
            return res.json({
                success: false,
                error: 'Neo4j password not configured. Please update /etc/hasenpfeffr.conf with NEO4J_PASSWORD.'
            });
        }
        
        // Build the Cypher query
        const query = `MATCH (n:NostrUser) WHERE n.hops <= ${threshold} RETURN count(n) as userCount;`;
        
        // Execute the query using cypher-shell
        const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Error querying Neo4j for hops count:', error);
                return res.json({
                    success: false,
                    error: stderr || error.message
                });
            }
            
            // Parse the result to get the count
            const match = stdout.match(/(\d+)/);
            if (match && match[1]) {
                const userCount = parseInt(match[1], 10);
                return res.json({
                    success: true,
                    count: userCount
                });
            } else {
                return res.json({
                    success: false,
                    error: 'Failed to parse user count from Neo4j response'
                });
            }
        });
    });
}

// Handler for getting whitelist configuration
function handleGetWhitelistConfig(req, res) {
  try {
    const configPath = '/etc/whitelist.conf';
    
    // Check if the configuration file exists
    if (!fs.existsSync(configPath)) {
      return res.json({
        success: false,
        error: 'Whitelist configuration file not found'
      });
    }
    
    // Read the configuration file
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = {};
    const lines = configContent.split('\n');
    
    // Parse the configuration file
    for (const line of lines) {
      if (line.startsWith('export ')) {
        const parts = line.substring(7).split('=');
        if (parts.length === 2) {
          const key = parts[0].trim();
          let value = parts[1].trim();
          
          // Remove any quotes from the value
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.substring(1, value.length - 1);
          }
          
          config[key] = value;
        }
      }
    }

    // Get the count of whitelisted pubkeys
    let whitelistedCount = 0;
    const whitelistPath = '/usr/local/lib/strfry/plugins/data/whitelist_pubkeys.json';
    if (fs.existsSync(whitelistPath)) {
      try {
        const whitelistContent = fs.readFileSync(whitelistPath, 'utf8');
        const whitelist = JSON.parse(whitelistContent);
        whitelistedCount = Object.keys(whitelist).length;
      } catch (error) {
        console.error('Error reading whitelist file:', error);
      }
    }
    
    return res.json({
      success: true,
      config: config,
      whitelistedCount: whitelistedCount
    });
  } catch (error) {
    console.error('Error getting whitelist configuration:', error);
    return res.json({
      success: false,
      error: error.message
    });
  }
}

// Handler for updating whitelist configuration
function handleUpdateWhitelistConfig(req, res) {
  try {
    const configPath = '/etc/whitelist.conf';
    const tempConfigPath = '/tmp/whitelist.conf.tmp';
    
    // Check if the configuration file exists
    if (!fs.existsSync(configPath)) {
      return res.json({
        success: false,
        error: 'Whitelist configuration file not found'
      });
    }
    
    // Read the configuration file
    const configContent = fs.readFileSync(configPath, 'utf8');
    const lines = configContent.split('\n');
    const updatedLines = [];
    
    // Update the configuration file
    for (const line of lines) {
      let updatedLine = line;
      
      if (line.startsWith('export ')) {
        const parts = line.substring(7).split('=');
        if (parts.length === 2) {
          const key = parts[0].trim();
          
          // Check if the key is in the request body
          if (req.body[key] !== undefined) {
            // Format the value with quotes
            let value = req.body[key];
            if (typeof value === 'string' && !value.startsWith('"') && !value.startsWith("'")) {
              value = `'${value}'`;
            }
            updatedLine = `export ${key}=${value}`;
          }
        }
      }
      
      updatedLines.push(updatedLine);
    }
    
    // Write the updated configuration to a temporary file
    fs.writeFileSync(tempConfigPath, updatedLines.join('\n'));
    
    // Copy the temporary file to the actual configuration file with sudo
    execSync(`sudo cp ${tempConfigPath} ${configPath}`);
    execSync(`sudo chmod 644 ${configPath}`);
    execSync(`sudo chown root:hasenpfeffr ${configPath}`);
    
    // Clean up the temporary file
    fs.unlinkSync(tempConfigPath);
    
    return res.json({
      success: true
    });
  } catch (error) {
    console.error('Error updating whitelist configuration:', error);
    return res.json({
      success: false,
      error: error.message
    });
  }
}

// Handler for getting whitelist statistics
function handleGetWhitelistStats(req, res) {
  try {
    let whitelistCount = 0;
    let lastModified = null;
    
    // Path to the whitelist file
    const whitelistPath = '/usr/local/lib/strfry/plugins/data/whitelist_pubkeys.json';
    
    if (fs.existsSync(whitelistPath)) {
      // Get the file stats for last modified time
      const stats = fs.statSync(whitelistPath);
      lastModified = stats.mtime.getTime();
      
      // Read the whitelist file to get the count
      try {
        const whitelistContent = fs.readFileSync(whitelistPath, 'utf8');
        const whitelist = JSON.parse(whitelistContent);
        whitelistCount = Object.keys(whitelist).length;
      } catch (error) {
        console.error('Error reading whitelist file:', error);
      }
    }
    
    return res.json({
      success: true,
      count: whitelistCount,
      lastModified: lastModified
    });
  } catch (error) {
    console.error('Error getting whitelist stats:', error);
    return res.json({
      success: false,
      error: error.message
    });
  }
}

// Handler for getting preview count of users that would be whitelisted with current parameters
function handleGetWhitelistPreviewCount(req, res) {
    // Get all parameters from request
    const influenceThreshold = parseFloat(req.query.influence || 0.5);
    const hopsThreshold = parseInt(req.query.hops || 1, 10);
    const combinationLogic = req.query.logic || 'OR'; // 'AND' or 'OR'
    const incorporateBlacklist = req.query.blacklist === 'true';
    
    // Check if Neo4j is running
    exec('systemctl is-active neo4j', (serviceError, serviceStdout) => {
        const isRunning = serviceStdout.trim() === 'active';
        
        if (!isRunning) {
            return res.json({
                success: false,
                error: 'Neo4j service is not running'
            });
        }
        
        // Get Neo4j credentials from the configuration system
        const neo4jConnection = getNeo4jConnection();
        const neo4jUser = neo4jConnection.user;
        const neo4jPassword = neo4jConnection.password;
        
        if (!neo4jPassword) {
            return res.json({
                success: false,
                error: 'Neo4j password not configured. Please update /etc/hasenpfeffr.conf with NEO4J_PASSWORD.'
            });
        }
        
        // Build the Cypher query based on parameters
        let query = `MATCH (n:NostrUser) WHERE `;
        
        // Add condition based on combination logic
        if (combinationLogic === 'AND') {
            query += `n.influence >= ${influenceThreshold} AND n.hops <= ${hopsThreshold}`;
        } else { // OR logic
            query += `n.influence >= ${influenceThreshold} OR n.hops <= ${hopsThreshold}`;
        }
        
        // Add blacklist condition if needed
        if (incorporateBlacklist) {
            query += ` AND (n.blacklisted IS NULL OR n.blacklisted = 0)`;
        }
        
        query += ` RETURN count(n) as userCount;`;
        
        // Execute the query using cypher-shell
        const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Error querying Neo4j for whitelist preview count:', error);
                return res.json({
                    success: false,
                    error: stderr || error.message
                });
            }
            
            // Parse the result to get the count
            const match = stdout.match(/(\d+)/);
            if (match && match[1]) {
                const userCount = parseInt(match[1], 10);
                return res.json({
                    success: true,
                    count: userCount
                });
            } else {
                return res.json({
                    success: false,
                    error: 'Failed to parse user count from Neo4j response'
                });
            }
        });
    });
}

// Handler for getting count of blacklisted users
function handleGetBlacklistCount(req, res) {
    // Check if Neo4j is running
    exec('systemctl is-active neo4j', (serviceError, serviceStdout) => {
        const isRunning = serviceStdout.trim() === 'active';
        
        if (!isRunning) {
            return res.json({
                success: false,
                error: 'Neo4j service is not running'
            });
        }
        
        // Get Neo4j credentials from the configuration system
        const neo4jConnection = getNeo4jConnection();
        const neo4jUser = neo4jConnection.user;
        const neo4jPassword = neo4jConnection.password;
        
        if (!neo4jPassword) {
            return res.json({
                success: false,
                error: 'Neo4j password not configured. Please update /etc/hasenpfeffr.conf with NEO4J_PASSWORD.'
            });
        }
        
        // Build the Cypher query
        const query = `MATCH (n:NostrUser) WHERE n.blacklisted = 1 RETURN count(n) as userCount;`;
        
        // Execute the query using cypher-shell
        const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Error querying Neo4j for blacklist count:', error);
                return res.json({
                    success: false,
                    error: stderr || error.message
                });
            }
            
            // Parse the result to get the count
            const match = stdout.match(/(\d+)/);
            if (match && match[1]) {
                const userCount = parseInt(match[1], 10);
                return res.json({
                    success: true,
                    count: userCount
                });
            } else {
                return res.json({
                    success: false,
                    error: 'Failed to parse user count from Neo4j response'
                });
            }
        });
    });
}

// Start the server
app.listen(port, () => {
    console.log(`Hasenpfeffr Control Panel running on port ${port}`);
});

// Export utility functions for testing and reuse
module.exports = {
    getConfigFromFile,
    getNeo4jConnection
};