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

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

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

// Handler functions for API endpoints
function handleStatus(req, res) {
    console.log('Checking status...');
    
    // Get the STRFRY_DOMAIN from config
    const strfryDomain = getConfigFromFile('STRFRY_DOMAIN', 'localhost');
    
    exec('systemctl status strfry', (error, stdout, stderr) => {
        return res.json({
            output: stdout || stderr,
            strfryDomain: strfryDomain
        });
    });
}

function handleStrfryStats(req, res) {
    console.log('Getting strfry event statistics...');
    
    // Set the response header to ensure it's always JSON
    res.setHeader('Content-Type', 'application/json');
    
    exec('hasenpfeffr-strfry-stats', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing strfry stats: ${stderr || error.message}`);
            return res.json({
                success: false,
                stats: {
                    total: 0,
                    kind3: 0,
                    kind1984: 0,
                    kind10000: 0,
                    error: `Error executing strfry stats: ${stderr || error.message}`
                },
                error: `Error executing strfry stats: ${stderr || error.message}`
            });
        }
        
        try {
            // Parse the JSON output from the script
            const stats = JSON.parse(stdout);
            console.log('Strfry stats:', stats);
            
            return res.json({
                success: true,
                stats: {
                    ...stats,
                    error: null
                },
                error: null
            });
        } catch (parseError) {
            console.error('Error parsing strfry stats output:', parseError, 'Output was:', stdout);
            return res.json({
                success: false,
                stats: {
                    total: 0,
                    kind3: 0,
                    kind1984: 0,
                    kind10000: 0,
                    error: `Error parsing strfry stats output: ${parseError.message}`
                },
                error: `Error parsing strfry stats output: ${parseError.message}`
            });
        }
    });
}

function handleNeo4jStatus(req, res) {
    console.log('Getting Neo4j status information...');
    
    const neo4jStatus = {
        running: false,
        userCount: 0,
        relationships: {
            follow: 0,
            mute: 0,
            report: 0
        },
        constraints: [],
        indexes: [],
        error: null
    };

    // Check if Neo4j service is running
    exec('systemctl is-active neo4j', (serviceError, serviceStdout) => {
        neo4jStatus.running = serviceStdout.trim() === 'active';
        
        // If not running, return early
        if (!neo4jStatus.running) {
            return res.json({
                success: true,
                status: neo4jStatus
            });
        }
        
        // Helper function to execute Cypher queries
        const executeCypher = (query, handler) => {
            // Get Neo4j credentials from the configuration system
            const neo4jConnection = getNeo4jConnection();
            const neo4jUser = neo4jConnection.user;
            const neo4jPassword = neo4jConnection.password;
            
            if (!neo4jPassword) {
                neo4jStatus.error = 'Neo4j password not configured. Please update /etc/hasenpfeffr.conf with NEO4J_PASSWORD.';
                return handler('');
            }
            
            const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    neo4jStatus.error = `Error executing Neo4j query: ${stderr || error.message}`;
                } else {
                    handler(stdout);
                }
            });
        };

        // Get user count
        executeCypher('MATCH (u:NostrUser) RETURN count(u) as count;', (output) => {
            const match = output.match(/(\d+)/);
            if (match && match[1]) {
                neo4jStatus.userCount = parseInt(match[1], 10);
            }
            
            // Get relationship counts
            executeCypher('MATCH ()-[r:FOLLOWS]->() RETURN count(r) as count;', (output) => {
                const match = output.match(/(\d+)/);
                if (match && match[1]) {
                    neo4jStatus.relationships.follow = parseInt(match[1], 10);
                }
                
                executeCypher('MATCH ()-[r:MUTES]->() RETURN count(r) as count;', (output) => {
                    const match = output.match(/(\d+)/);
                    if (match && match[1]) {
                        neo4jStatus.relationships.mute = parseInt(match[1], 10);
                    }
                    
                    executeCypher('MATCH ()-[r:REPORTS]->() RETURN count(r) as count;', (output) => {
                        const match = output.match(/(\d+)/);
                        if (match && match[1]) {
                            neo4jStatus.relationships.report = parseInt(match[1], 10);
                        }
                        
                        // Get constraints
                        executeCypher('SHOW CONSTRAINTS;', (output) => {
                            neo4jStatus.constraints = output
                            
                            // Get indexes
                            executeCypher('SHOW INDEXES;', (output) => {
                                neo4jStatus.indexes = output
                                
                                // Return the final result
                                res.json({
                                    success: !neo4jStatus.error,
                                    status: neo4jStatus,
                                    error: neo4jStatus.error
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

function handleNegentropySync(req, res) {
    console.log('Syncing with Negentropy...');
    
    // Set the response header to ensure it's always JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Get relay and filter parameters from request body
    const relay = req.body.relay || 'wss://relay.hasenpfeffr.com';
    const filter = req.body.filter || '{"kinds":[3, 1984, 10000]}';
    
    console.log(`Using relay: ${relay}, filter: ${filter}`);
    
    // Set a timeout to ensure the response doesn't hang
    const timeoutId = setTimeout(() => {
        console.log('Negentropy sync is taking longer than expected, sending initial response...');
        res.json({
            success: true,
            continueInBackground: true,
            output: `Negentropy sync with ${relay} started.\nThis process will continue in the background. You can check Strfry Event statistics to track progress.\n`,
            error: null
        });
    }, 120000); // 2 minutes timeout
    
    // Build the command with the provided relay and filter
    const command = `sudo strfry sync ${relay} --filter '${filter}' --dir down`;
    console.log(`Executing command: ${command}`);
    
    exec(command, (error, stdout, stderr) => {
        // Clear the timeout if the command completes before the timeout
        clearTimeout(timeoutId);
        
        // Check if the response has already been sent
        if (res.headersSent) {
            console.log('Response already sent, negentropy sync continuing in background');
            return;
        }
        
        return res.json({
            success: !error,
            output: stdout || stderr,
            error: error ? error.message : null
        });
    });
}

function handleNegentropySyncWoT(req, res) {
  console.log('Syncing with Negentropy: WoT ...');
  
  // Set a longer timeout for the response (10 minutes)
  req.setTimeout(600000); // 10 minutes in milliseconds
  res.setTimeout(600000);
  
  // Use execFile instead of exec for better security and control
  const child = exec('sudo /usr/local/lib/node_modules/hasenpfeffr/src/manage/negentropySync/syncWoT.sh', {
      timeout: 590000, // slightly less than the HTTP timeout
      maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
  }, (error, stdout, stderr) => {
      console.log('Negentropy WoT sync completed');
      
      if (error) {
          console.error('Error syncing with Negentropy: WoT:', error);
          return res.json({
              success: false,
              output: stderr || stdout || error.message
          });
      }
      
      console.log('Negentropy WoT sync completed successfully');
      return res.json({
          success: true,
          output: stdout || stderr
      });
  });
  
  // Log when the process starts
  child.on('spawn', () => {
      console.log('Negentropy WoT sync process started');
  });
}

function handleNegentropySyncPersonal(req, res) {
  console.log('Syncing with Negentropy: Personal ...');
  
  // Set a longer timeout for the response (10 minutes)
  req.setTimeout(600000); // 10 minutes in milliseconds
  res.setTimeout(600000);
  
  // Use execFile instead of exec for better security and control
  const child = exec('sudo /usr/local/lib/node_modules/hasenpfeffr/src/manage/negentropySync/syncPersonal.sh', {
      timeout: 590000, // slightly less than the HTTP timeout
      maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
  }, (error, stdout, stderr) => {
      console.log('Negentropy Personal sync completed');
      
      if (error) {
          console.error('Error syncing with Negentropy: Personal:', error);
          return res.json({
              success: false,
              output: stderr || stdout || error.message
          });
      }
      
      console.log('Negentropy Personal sync completed successfully');
      return res.json({
          success: true,
          output: stdout || stderr
      });
  });
  
  // Log when the process starts
  child.on('spawn', () => {
      console.log('Negentropy Personal sync process started');
  });
}

function handleNegentropySyncProfiles(req, res) {
  console.log('Syncing with Negentropy: Profiles ...');
  
  // Set a longer timeout for the response (10 minutes)
  req.setTimeout(600000); // 10 minutes in milliseconds
  res.setTimeout(600000);
  
  // Use execFile instead of exec for better security and control
  const child = exec('sudo /usr/local/lib/node_modules/hasenpfeffr/src/manage/negentropySync/syncProfiles.sh', {
      timeout: 590000, // slightly less than the HTTP timeout
      maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
  }, (error, stdout, stderr) => {
      console.log('Negentropy Profiles sync completed');
      
      if (error) {
          console.error('Error syncing with Negentropy: Profiles:', error);
          return res.json({
              success: false,
              output: stderr || stdout || error.message
          });
      }
      
      console.log('Negentropy Profiles sync completed successfully');
      return res.json({
          success: true,
          output: stdout || stderr
      });
  });
  
  // Log when the process starts
  child.on('spawn', () => {
      console.log('Negentropy Profiles sync process started');
  });
}

function handleGenerateNip85(req, res) {
    console.log('Generating and publishing NIP-85 data...');
    
    // Get the NIP85 directory from environment or use default
    const nip85Dir = process.env.HASENPFEFFR_NIP85_DIR || '/usr/local/lib/node_modules/hasenpfeffr/src/algos/nip85';
    const scriptPath = path.join(nip85Dir, 'publishNip85.sh');
    
    // Set a longer timeout for the response (10 minutes)
    req.setTimeout(600000); // 10 minutes in milliseconds
    res.setTimeout(600000);
    
    console.log(`Executing NIP-85 publishing script: ${scriptPath}`);
    
    // Use exec to run the script with sudo
    const child = exec(`sudo ${scriptPath}`, {
        timeout: 590000, // slightly less than the HTTP timeout
        maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
    }, (error, stdout, stderr) => {
        console.log('NIP-85 publishing completed');
        
        if (error) {
            console.error('Error publishing NIP-85 data:', error);
            return res.json({
                success: false,
                output: stderr || stdout || error.message
            });
        }
        
        console.log('NIP-85 data published successfully');
        return res.json({
            success: true,
            output: stdout
        });
    });
    
    // Handle data events to capture real-time output
    child.stdout.on('data', (data) => {
        const dataStr = data.toString();
        console.log(`NIP-85 publishing stdout: ${dataStr}`);
    });
    
    child.stderr.on('data', (data) => {
        const dataStr = data.toString();
        console.error(`NIP-85 publishing stderr: ${dataStr}`);
    });
    
    child.on('close', (code) => {
        console.log(`NIP-85 publishing process exited with code ${code}`);
    });
}

function handleGeneratePageRank(req, res) {
  console.log('Generating PageRank data...');
  
  // Set a longer timeout for the response (10 minutes)
  req.setTimeout(600000); // 10 minutes in milliseconds
  res.setTimeout(600000);
  
  // Use execFile instead of exec for better security and control
  const child = exec('sudo /usr/local/lib/node_modules/hasenpfeffr/src/algos/calculatePersonalizedPageRank.sh', {
      timeout: 590000, // slightly less than the HTTP timeout
      maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
  }, (error, stdout, stderr) => {
      console.log('PageRank calculation completed');
      
      if (error) {
          console.error('Error generating PageRank data:', error);
          return res.json({
              success: false,
              output: stderr || stdout || error.message
          });
      }
      
      console.log('PageRank data generated successfully');
      return res.json({
          success: true,
          output: stdout || stderr
      });
  });
  
  // Log when the process starts
  child.on('spawn', () => {
      console.log('PageRank calculation process started');
  });
}

function handleExportWhitelist(req, res) {
  console.log('Exporting Whitelist data...');
  
  // Set a longer timeout for the response (10 minutes)
  req.setTimeout(600000); // 10 minutes in milliseconds
  res.setTimeout(600000);
  
  // Use execFile instead of exec for better security and control
  const child = exec('sudo /usr/local/lib/node_modules/hasenpfeffr/src/algos/exportWhitelist.sh', {
      timeout: 590000, // slightly less than the HTTP timeout
      maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
  }, (error, stdout, stderr) => {
      console.log('Whitelist export completed');
      
      if (error) {
          console.error('Error exporting Whitelist data:', error);
          return res.json({
              success: false,
              output: stderr || stdout || error.message
          });
      }
      
      console.log('Whitelist exported successfully');
      return res.json({
          success: true,
          output: stdout || stderr
      });
  });
  
  // Log when the process starts
  child.on('spawn', () => {
      console.log('Whitelist export process started');
  });
}

function handleGenerateGrapeRank(req, res) {
    console.log('Generating GrapeRank data...');
    
    // Set a longer timeout for the response (10 minutes)
    req.setTimeout(600000); // 10 minutes in milliseconds
    res.setTimeout(600000);
    
    // Use execFile instead of exec for better security and control
    const child = exec('sudo /usr/local/lib/node_modules/hasenpfeffr/src/algos/personalizedGrapeRank/calculatePersonalizedGrapeRank.sh', {
        timeout: 590000, // slightly less than the HTTP timeout
        maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
    }, (error, stdout, stderr) => {
        console.log('GrapeRank calculation completed');
        
        if (error) {
            console.error('Error generating GrapeRank data:', error);
            return res.json({
                success: false,
                output: stderr || stdout || error.message
            });
        }
        
        console.log('GrapeRank data generated successfully');
        return res.json({
            success: true,
            output: stdout || stderr
        });
    });
    
    // Log when the process starts
    child.on('spawn', () => {
        console.log('GrapeRank calculation process started');
    });
}

function handlePublish(req, res) {
    console.log('Publishing NIP-85 events...');
    
    exec('hasenpfeffr-publish', (error, stdout, stderr) => {
        return res.json({
            success: !error,
            output: stdout || stderr
        });
    });
}

// Function to get systemd service status
function getServiceStatus(serviceName) {
  try {
    const result = execSync(`sudo systemctl is-active ${serviceName}`).toString().trim();
    return result === 'active' ? 'active' : 'inactive';
  } catch (error) {
    return 'inactive';
  }
}

// Function to control systemd service
function controlService(serviceName, action) {
  try {
    execSync(`sudo systemctl ${action} ${serviceName}`);
    return { success: true, message: `Service ${serviceName} ${action} successful` };
  } catch (error) {
    return { success: false, message: `Failed to ${action} ${serviceName}: ${error.message}` };
  }
}

// Handler for systemd services
function handleSystemdServices(req, res) {
  const services = [
    'neo4j',
    'strfry',
    'hasenpfeffr-control-panel',
    'strfry-router',
    'addToQueue',
    'processQueue',
    'reconcile.timer',
    'processAllTasks.timer',
    'calculateHops.timer',
    'calculatePersonalizedPageRank.timer',
    'calculatePersonalizedGrapeRank.timer'
  ];
  
  const action = req.query.action;
  const service = req.query.service;
  
  // If action and service are provided, perform the requested action
  if (action && service) {
    if (['start', 'stop', 'restart'].includes(action)) {
      const result = controlService(service, action);
      return res.json(result);
    } else {
      return res.status(400).json({ error: 'Invalid action. Use start, stop, or restart.' });
    }
  }
  
  // Otherwise, return status of all services
  const statuses = {};
  for (const service of services) {
    statuses[service] = getServiceStatus(service);
  }
  
  res.json({ services: statuses });
}

// Handler for strfry plugin toggle
async function handleStrfryPlugin(req, res) {
    const action = req.query.action;
    
    if (!action) {
        return res.status(400).json({ error: 'Missing action parameter' });
    }

    try {
        const strfryConfPath = '/etc/strfry.conf';
        const strfryRouterConfPath = '/etc/strfry-router.config';
        let pluginStatus = 'unknown';
        
        // Check if strfry.conf exists
        if (!fs.existsSync(strfryConfPath)) {
            return res.status(404).json({ error: 'strfry.conf not found' });
        }
        
        // Read current config
        let confContent = fs.readFileSync(strfryConfPath, 'utf8');
        
        // Check current plugin status
        // Look for the plugin setting in the writePolicy section
        const writePolicyPluginRegex = /writePolicy\s*{[^}]*plugin\s*=\s*"([^"]*)"/s;
        const writePolicyMatch = confContent.match(writePolicyPluginRegex);
        
        // Also check for the relay.writePolicy.plugin line that might have been added incorrectly
        const relayPluginRegex = /relay\.writePolicy\.plugin\s*=\s*"([^"]*)"/;
        const relayMatch = confContent.match(relayPluginRegex);
        
        // Determine plugin status from either match
        if (writePolicyMatch) {
            pluginStatus = writePolicyMatch[1] ? 'enabled' : 'disabled';
        } else if (relayMatch) {
            pluginStatus = relayMatch[1] ? 'enabled' : 'disabled';
        }
        
        if (action === 'status') {
            return res.json({ status: pluginStatus });
        }
        
        if (action === 'enable' || action === 'disable') {
            // Set plugin path
            const pluginPath = '/usr/local/lib/strfry/plugins/hasenpfeffr.js';
            
            // Ensure plugin directory exists
            if (!fs.existsSync('/usr/local/lib/strfry/plugins')) {
                execSync('sudo mkdir -p /usr/local/lib/strfry/plugins');
            }
            
            // Copy plugin file if it doesn't exist at destination
            if (!fs.existsSync(pluginPath)) {
                execSync(`sudo cp /usr/local/lib/node_modules/hasenpfeffr/plugins/hasenpfeffr.js ${pluginPath}`);
                execSync(`sudo chmod +x ${pluginPath}`);
            }
            
            // Update strfry.conf based on action
            if (action === 'enable') {
                if (writePolicyMatch) {
                    // Update the existing plugin setting in the writePolicy section
                    confContent = confContent.replace(writePolicyPluginRegex, (match) => {
                        return match.replace(/plugin\s*=\s*"[^"]*"/, `plugin = "${pluginPath}"`);
                    });
                } else {
                    // If writePolicy section exists but without plugin setting, we need to add it
                    const writePolicySectionRegex = /(writePolicy\s*{[^}]*)(})/s;
                    const writePolicySectionMatch = confContent.match(writePolicySectionRegex);
                    
                    if (writePolicySectionMatch) {
                        confContent = confContent.replace(writePolicySectionRegex, `$1        plugin = "${pluginPath}"\n    $2`);
                    } else {
                        // If writePolicy section doesn't exist, this is unexpected but we'll add it
                        confContent += `\n    writePolicy {\n        plugin = "${pluginPath}"\n    }\n`;
                    }
                }
            } else { // action === 'disable'
                if (writePolicyMatch) {
                    // Update the existing plugin setting in the writePolicy section to empty string
                    confContent = confContent.replace(writePolicyPluginRegex, (match) => {
                        return match.replace(/plugin\s*=\s*"[^"]*"/, 'plugin = ""');
                    });
                } else {
                    // If writePolicy section exists but without plugin setting, we need to add it
                    const writePolicySectionRegex = /(writePolicy\s*{[^}]*)(})/s;
                    const writePolicySectionMatch = confContent.match(writePolicySectionRegex);
                    
                    if (writePolicySectionMatch) {
                        confContent = confContent.replace(writePolicySectionRegex, `$1        plugin = ""\n    $2`);
                    } else {
                        // If writePolicy section doesn't exist, this is unexpected but we'll add it
                        confContent += `\n    writePolicy {\n        plugin = ""\n    }\n`;
                    }
                }
            }
            
            // Remove any incorrect relay.writePolicy.plugin line if it exists
            if (relayMatch) {
                confContent = confContent.replace(/\nrelay\.writePolicy\.plugin\s*=\s*"[^"]*"\n?/, '\n');
            }
            
            // Write config to a temporary file and then use sudo to move it
            const tempConfigPath = '/tmp/strfry.conf.tmp';
            fs.writeFileSync(tempConfigPath, confContent);
            execSync(`sudo cp ${tempConfigPath} ${strfryConfPath}`);
            fs.unlinkSync(tempConfigPath);
            
            // Update strfry-router.config based on action
            try {
                let sourceConfigPath;
                if (action === 'enable') {
                    sourceConfigPath = '/usr/local/lib/node_modules/hasenpfeffr/setup/strfry-router-plugin.config';
                } else { // action === 'disable'
                    sourceConfigPath = '/usr/local/lib/node_modules/hasenpfeffr/setup/strfry-router.config';
                }
                
                // Check if source config exists
                if (!fs.existsSync(sourceConfigPath)) {
                    console.error(`Source config file not found: ${sourceConfigPath}`);
                    return res.status(404).json({ error: `Source config file not found: ${sourceConfigPath}` });
                }
                
                // Get owner pubkey from hasenpfeffr.conf
                const ownerPubkey = getConfigFromFile('HASENPFEFFR_OWNER_PUBKEY', '');
                
                if (!ownerPubkey) {
                    console.warn('HASENPFEFFR_OWNER_PUBKEY not found in configuration');
                }
                
                // Read the config file content
                let routerConfigContent = fs.readFileSync(sourceConfigPath, 'utf8');
                
                // Replace ${ownerPubkey} placeholder with actual owner pubkey
                routerConfigContent = routerConfigContent.replace(/\${ownerPubkey}/g, ownerPubkey);
                
                // Write the modified content to a temporary file
                const tempRouterConfigPath = '/tmp/strfry-router.config.tmp';
                fs.writeFileSync(tempRouterConfigPath, routerConfigContent);
                
                // Copy the temporary file to the destination
                execSync(`sudo cp ${tempRouterConfigPath} ${strfryRouterConfPath}`);
                fs.unlinkSync(tempRouterConfigPath);
                
                // Restart strfry service
                execSync('sudo systemctl restart strfry');
                
                return res.json({ 
                    status: action === 'enable' ? 'enabled' : 'disabled', 
                    message: `Plugin ${action === 'enable' ? 'enabled' : 'disabled'} successfully and strfry service restarted`
                });
            } catch (configError) {
                console.error('Error updating strfry-router.config:', configError);
                return res.status(500).json({ 
                    error: `Error updating strfry-router.config: ${configError.message}`,
                    status: action === 'enable' ? 'enabled' : 'disabled',
                    message: `Plugin ${action === 'enable' ? 'enabled' : 'disabled'} but strfry-router.config update failed`
                });
            }
        }
        
        return res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
        console.error('Error handling strfry plugin:', error);
        return res.status(500).json({ error: error.message });
    }
}

// Handler for reconciliation
function handleReconciliation(req, res) {
    console.log('Starting reconciliation of kinds 3, 1984, and 10000 data from strfry to Neo4j...');
    
    // Set the response header to ensure it's always JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Set a timeout to ensure the response doesn't hang
    const timeoutId = setTimeout(() => {
        console.log('Reconciliation is taking longer than expected, sending initial response...');
        res.json({
            success: true,
            continueInBackground: true,
            message: 'Reconciliation initiated',
            output: 'Reconciliation process started. This will continue in the background.\n'
        });
    }, 120000); // 2 minutes timeout
    
    // Create a child process to run the reconciliation script
    const reconciliationProcess = exec('/usr/local/lib/node_modules/hasenpfeffr/src/pipeline/reconcile/runFullReconciliation.sh');
    
    let output = '';
    let errorOutput = '';
    
    reconciliationProcess.stdout.on('data', (data) => {
        console.log(`Reconciliation stdout: ${data}`);
        output += data;
    });
    
    reconciliationProcess.stderr.on('data', (data) => {
        console.error(`Reconciliation stderr: ${data}`);
        errorOutput += data;
    });
    
    reconciliationProcess.on('close', (code) => {
        console.log(`Reconciliation process exited with code ${code}`);
        clearTimeout(timeoutId);
        res.json({
            success: true,
            message: 'Reconciliation completed',
            output: output
        });
    });
}

// Handler for batch transfer
function handleBatchTransfer(req, res) {
    console.log('Starting batch transfer of kinds 3, 1984, and 10000 data from strfry to Neo4j...');
    
    // Set the response header to ensure it's always JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Set a timeout to ensure the response doesn't hang
    const timeoutId = setTimeout(() => {
        console.log('Batch transfer is taking longer than expected, sending initial response...');
        res.json({
            success: true,
            continueInBackground: true,
            message: 'Batch transfer initiated',
            output: 'Batch transfer process started. This will continue in the background.\n'
        });
    }, 120000); // 2 minutes timeout
    
    // Create a child process to run the transfer script
    const transferProcess = exec('/usr/local/lib/node_modules/hasenpfeffr/src/pipeline/batch/transfer.sh');
    
    let output = '';
    let errorOutput = '';
    
    transferProcess.stdout.on('data', (data) => {
        console.log(`Batch Transfer stdout: ${data}`);
        output += data;
    });
    
    transferProcess.stderr.on('data', (data) => {
        console.error(`Batch Transfer stderr: ${data}`);
        errorOutput += data;
    });
    
    transferProcess.on('close', (code) => {
        console.log(`Batch Transfer process exited with code ${code}`);
        
        // Clear the timeout if the command completes before the timeout
        clearTimeout(timeoutId);
        
        // Check if the response has already been sent
        if (res.headersSent) {
            console.log('Response already sent, batch transfer continuing in background');
            return;
        }
        
        if (code === 0) {
            console.log('Batch transfer completed successfully');
            res.json({
                success: true,
                message: 'Batch transfer completed successfully',
                output: output
            });
        } else {
            console.error(`Batch transfer failed with exit code ${code}`);
            res.json({
                success: false,
                message: `Batch transfer failed with exit code ${code}`,
                output: output
            });
        }
    });
    
    // Handle unexpected errors
    transferProcess.on('error', (error) => {
        // Clear the timeout if an error occurs
        clearTimeout(timeoutId);
        
        // Check if the response has already been sent
        if (res.headersSent) {
            console.error(`Batch Transfer error: ${error.message}`);
            return;
        }
        
        console.error(`Batch Transfer error: ${error.message}`);
        res.status(500).json({
            success: false,
            message: `Batch transfer error: ${error.message}`
        });
    });
}

// Handler for creating kind 10040 events
function handleCreateKind10040(req, res) {
    console.log('Creating kind 10040 events...');
    
    // Set the response header to ensure it's always JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Get the full path to the script
    const scriptPath = path.join(__dirname, 'hasenpfeffr-create-kind10040.js');
    console.log('Using script path:', scriptPath);
    
    // Set a timeout to ensure the response doesn't hang
    const timeoutId = setTimeout(() => {
        console.log('Kind 10040 creation is taking longer than expected, sending initial response...');
        res.json({
            success: true,
            output: 'Kind 10040 creation started. This process will continue in the background.\n',
            error: null
        });
    }, 30000); // 30 seconds timeout
    
    exec(`node ${scriptPath}`, (error, stdout, stderr) => {
        // Clear the timeout if the command completes before the timeout
        clearTimeout(timeoutId);
        
        // Check if the response has already been sent
        if (res.headersSent) {
            console.log('Response already sent, kind 10040 creation continuing in background');
            return;
        }
        
        return res.json({
            success: !error,
            output: stdout || stderr,
            error: error ? error.message : null
        });
    });
}

// Handler for getting unsigned kind 10040 event
function handleGetKind10040Event(req, res) {
    // Check if user is authenticated
    if (!req.session.authenticated) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        // Define data directories
        const dataDir = '/var/lib/hasenpfeffr/data';
        const eventFile = path.join(dataDir, 'kind10040_event.json');
        
        // Check if the event file exists
        if (!fs.existsSync(eventFile)) {
            return res.status(404).json({ 
                success: false, 
                error: 'No kind 10040 event file found. Please create an event first.' 
            });
        }
        
        // Read the event file
        const eventData = fs.readFileSync(eventFile, 'utf8');
        const event = JSON.parse(eventData);
        
        // Get the owner's pubkey from config
        const ownerPubkey = getConfigFromFile('HASENPFEFFR_OWNER_PUBKEY');
        
        // Set pubkey to the owner's pubkey
        event.pubkey = ownerPubkey;
        
        // Remove any existing signature if present
        delete event.sig;
        delete event.id;
        
        // Return the event data along with the session challenge
        return res.json({ 
            success: true, 
            event: event,
            challenge: req.session.challenge
        });
    } catch (error) {
        console.error('Error getting kind 10040 event:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
}

// Handler for publishing kind 10040 events
function handlePublishKind10040(req, res) {
    // Check if user is authenticated
    if (!req.session.authenticated) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        // Get the signed event from the request
        const { signedEvent } = req.body;
        
        if (!signedEvent) {
            return res.status(400).json({ 
                success: false, 
                error: 'No signed event provided' 
            });
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
        if (signedEvent.pubkey !== sessionPubkey) {
            return res.json({ 
                success: false, 
                message: 'Public key mismatch' 
            });
        }
        
        // Check challenge is included in tags
        let challengeFound = false;
        if (signedEvent.tags && Array.isArray(signedEvent.tags)) {
            for (const tag of signedEvent.tags) {
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
        
        // Define data directories
        const dataDir = '/var/lib/hasenpfeffr/data';
        const publishedDir = path.join(dataDir, 'published');
        
        // Create directories if they don't exist
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        if (!fs.existsSync(publishedDir)) {
            fs.mkdirSync(publishedDir, { recursive: true });
        }
        
        // Save the signed event to a file
        const signedEventFile = path.join(publishedDir, `kind10040_${signedEvent.id.substring(0, 8)}_${Date.now()}.json`);
        fs.writeFileSync(signedEventFile, JSON.stringify(signedEvent, null, 2));
        
        // Execute the publish script with the signed event file
        const scriptPath = path.join(__dirname, '..', 'src', 'algos', 'publish_nip85_10040.mjs');
        
        // Run the script as a child process
        const child = spawn('node', [scriptPath], {
            env: {
                ...process.env,
                SIGNED_EVENT_FILE: signedEventFile
            }
        });
        
        let output = '';
        let errorOutput = '';
        
        child.stdout.on('data', (data) => {
            const dataStr = data.toString();
            console.log(`publish_nip85_10040.mjs stdout: ${dataStr}`);
            output += dataStr;
        });
        
        child.stderr.on('data', (data) => {
            const dataStr = data.toString();
            console.error(`publish_nip85_10040.mjs stderr: ${dataStr}`);
            errorOutput += dataStr;
        });
        
        child.on('close', (code) => {
            console.log(`publish_nip85_10040.mjs exited with code ${code}`);
            
            // Save the output to a log file for debugging
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const logDir = path.join(__dirname, '../logs');
            
            // Create logs directory if it doesn't exist
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            
            const logFile = path.join(logDir, `kind10040_${timestamp}.log`);
            fs.writeFileSync(logFile, `STDOUT:\n${output}\n\nSTDERR:\n${errorOutput}\n\nExit code: ${code}`);
            console.log(`Kind 10040 process log saved to ${logFile}`);
            
            // Try to parse the last JSON output if available
            try {
                // Look for the last JSON object in the output
                const jsonMatch = output.match(/\{[\s\S]*\}/g);
                if (jsonMatch) {
                    const lastJson = jsonMatch[jsonMatch.length - 1];
                    const result = JSON.parse(lastJson);
                    
                    // Store the result in a file that can be retrieved later
                    const resultFile = path.join(logDir, `kind10040_result_${timestamp}.json`);
                    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
                    console.log(`Kind 10040 result saved to ${resultFile}`);
                }
            } catch (error) {
                console.error('Error parsing JSON output:', error);
            }
        });
        
        // Unref the child to allow the parent process to exit independently
        child.unref();
    } catch (error) {
        console.error('Error publishing kind 10040 event:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
}

// Handler for getting relay configuration
function handleRelayConfig(req, res) {
    console.log('Getting relay configuration...');
    
    try {
        // Get relay configuration from hasenpfeffr.conf
        const relayUrl = getConfigFromFile('HASENPFEFFR_RELAY_URL', '');
        const relayPubkey = getConfigFromFile('HASENPFEFFR_RELAY_PUBKEY', '');
        
        // Return the configuration
        res.json({
            success: true,
            relayUrl: relayUrl,
            relayPubkey: relayPubkey
        });
    } catch (error) {
        console.error('Error getting relay configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get relay configuration: ' + error.message
        });
    }
}

// Handler for publishing kind 30382 events
function handlePublishKind30382(req, res) {
    console.log('Publishing kind 30382 events...');
    
    // Set the response header to ensure it's always JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Get the full path to the script
    const scriptPath = path.join(__dirname, '../src/algos/nip85/hasenpfeffr-publish-kind30382.js');
    console.log('Using script path:', scriptPath);
    
    // Send an initial response that the process has started
    res.json({
        success: true,
        message: 'Kind 30382 publishing started. This process will continue in the background.',
        output: 'Kind 30382 publishing started. This process will continue in the background.\n',
        error: null
    });
    
    // Execute the command with a much larger buffer size and in the background
    // after the response has been sent
    const childProcess = spawn('node', [scriptPath], {
        maxBuffer: 1024 * 1024 * 100, // 100MB buffer
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    childProcess.stdout.on('data', (data) => {
        const dataStr = data.toString();
        console.log(`Kind 30382 background process output: ${dataStr}`);
        output += dataStr;
    });
    
    childProcess.stderr.on('data', (data) => {
        const dataStr = data.toString();
        console.error(`Kind 30382 background process error: ${dataStr}`);
        errorOutput += dataStr;
    });
    
    childProcess.on('close', (code) => {
        console.log(`Kind 30382 background process exited with code ${code}`);
        
        // Save the output to a log file for debugging
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const logDir = path.join(__dirname, '../logs');
        
        // Create logs directory if it doesn't exist
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        const logFile = path.join(logDir, `kind30382_${timestamp}.log`);
        fs.writeFileSync(logFile, `STDOUT:\n${output}\n\nSTDERR:\n${errorOutput}\n\nExit code: ${code}`);
        console.log(`Kind 30382 process log saved to ${logFile}`);
        
        // Try to parse the last JSON output if available
        try {
            // Look for the last JSON object in the output
            const jsonMatch = output.match(/\{[\s\S]*\}/g);
            if (jsonMatch) {
                const lastJson = jsonMatch[jsonMatch.length - 1];
                const result = JSON.parse(lastJson);
                
                // Store the result in a file that can be retrieved later
                const resultFile = path.join(logDir, `kind30382_result_${timestamp}.json`);
                fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
                console.log(`Kind 30382 result saved to ${resultFile}`);
            }
        } catch (error) {
            console.error('Error parsing JSON output:', error);
        }
    });
    
    // Unref the child to allow the parent process to exit independently
    childProcess.unref();
}

// Handler for getting kind 30382 event information
function handleKind30382Info(req, res) {
  try {
    // Get relay pubkey from config
    const relayPubkey = getConfigFromFile('HASENPFEFFR_RELAY_PUBKEY', '');
    const relayUrl = getConfigFromFile('HASENPFEFFR_RELAY_URL', '');
    
    if (!relayPubkey) {
      return res.json({
        success: false,
        message: 'Relay pubkey not found in configuration'
      });
    }
    
    // Get count of kind 30382 events
    const countCmd = `sudo strfry scan --count '{"kinds":[30382], "authors":["${relayPubkey}"]}'`;
    let count = 0;
    try {
      count = parseInt(execSync(countCmd).toString().trim(), 10);
    } catch (error) {
      console.error('Error getting event count:', error);
    }
    
    // Get most recent kind 30382 event
    const latestCmd = `sudo strfry scan '{"kinds":[30382], "authors":["${relayPubkey}"], "limit": 1}'`;
    let latestEvent = null;
    let timestamp = null;
    
    try {
      const output = execSync(latestCmd).toString().trim();
      if (output) {
        latestEvent = JSON.parse(output);
        timestamp = latestEvent.created_at;
      }
    } catch (error) {
      console.error('Error getting latest event:', error);
    }
    
    return res.json({
      success: true,
      count: count,
      timestamp: timestamp,
      latestEvent: latestEvent,
      relayUrl: relayUrl
    });
  } catch (error) {
    return res.json({
      success: false,
      message: `Error getting kind 30382 info: ${error.message}`
    });
  }
}

// Handler for getting kind 10040 event information
function handleKind10040Info(req, res) {
  try {
    // Get owner pubkey from config
    const ownerPubkey = getConfigFromFile('HASENPFEFFR_OWNER_PUBKEY', '');
    const relayUrl = getConfigFromFile('HASENPFEFFR_RELAY_URL', '');
    
    if (!ownerPubkey) {
      return res.json({
        success: false,
        message: 'Owner pubkey not found in configuration'
      });
    }
    
    // Get most recent kind 10040 event
    const latestCmd = `sudo strfry scan '{"kinds":[10040], "authors":["${ownerPubkey}"], "limit": 1}'`;
    let latestEvent = null;
    let timestamp = null;
    let eventId = null;
    
    try {
      const output = execSync(latestCmd).toString().trim();
      if (output) {
        latestEvent = JSON.parse(output);
        timestamp = latestEvent.created_at;
        eventId = latestEvent.id;
      }
    } catch (error) {
      console.error('Error getting latest event:', error);
    }
    
    return res.json({
      success: true,
      timestamp: timestamp,
      eventId: eventId,
      latestEvent: latestEvent,
      relayUrl: relayUrl
    });
  } catch (error) {
    return res.json({
      success: false,
      message: `Error getting kind 10040 info: ${error.message}`
    });
  }
}

// Handler for getting NostrUser profiles data from Neo4j
function handleGetProfiles(req, res) {
  try {
    // Get query parameters for filtering and pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const sortBy = req.query.sortBy || 'personalizedPageRank';
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    // Get all filter parameters
    const filterPubkey = req.query.filterPubkey || '';
    const filterMinHops = req.query.filterMinHops || '';
    const filterMaxHops = req.query.filterMaxHops || '';
    const filterMinRank = req.query.filterMinRank || '';
    const filterMaxRank = req.query.filterMaxRank || '';
    const filterMinInfluence = req.query.filterMinInfluence || '';
    const filterMaxInfluence = req.query.filterMaxInfluence || '';
    const filterMinAverage = req.query.filterMinAverage || '';
    const filterMaxAverage = req.query.filterMaxAverage || '';
    const filterMinConfidence = req.query.filterMinConfidence || '';
    const filterMaxConfidence = req.query.filterMaxConfidence || '';
    const filterMinInput = req.query.filterMinInput || '';
    const filterMaxInput = req.query.filterMaxInput || '';
    
    // Create Neo4j driver
    const neo4jUri = getConfigFromFile('NEO4J_URI', 'bolt://localhost:7687');
    const neo4jUser = getConfigFromFile('NEO4J_USER', 'neo4j');
    const neo4jPassword = getConfigFromFile('NEO4J_PASSWORD', 'neo4j');
    
    const driver = neo4j.driver(
      neo4jUri,
      neo4j.auth.basic(neo4jUser, neo4jPassword)
    );
    
    const session = driver.session();
    
    // Build the Cypher query with filters
    let query = `
      MATCH (u:NostrUser)
      WHERE u.pubkey IS NOT NULL
    `;
    
    // Add filters if provided
    if (filterMinHops) {
      query += ` AND u.hops >= ${parseInt(filterMinHops)}`;
    }
    
    if (filterMaxHops) {
      query += ` AND u.hops <= ${parseInt(filterMaxHops)}`;
    }
    
    if (filterMinRank) {
      query += ` AND u.personalizedPageRank >= ${parseFloat(filterMinRank)}`;
    }
    
    if (filterMaxRank) {
      query += ` AND u.personalizedPageRank <= ${parseFloat(filterMaxRank)}`;
    }
    
    if (filterMinInfluence) {
      query += ` AND u.influence >= ${parseFloat(filterMinInfluence)}`;
    }
    
    if (filterMaxInfluence) {
      query += ` AND u.influence <= ${parseFloat(filterMaxInfluence)}`;
    }
    
    if (filterMinAverage) {
      query += ` AND u.average >= ${parseFloat(filterMinAverage)}`;
    }
    
    if (filterMaxAverage) {
      query += ` AND u.average <= ${parseFloat(filterMaxAverage)}`;
    }
    
    if (filterMinConfidence) {
      query += ` AND u.confidence >= ${parseFloat(filterMinConfidence)}`;
    }
    
    if (filterMaxConfidence) {
      query += ` AND u.confidence <= ${parseFloat(filterMaxConfidence)}`;
    }
    
    if (filterMinInput) {
      query += ` AND u.input >= ${parseFloat(filterMinInput)}`;
    }
    
    if (filterMaxInput) {
      query += ` AND u.input <= ${parseFloat(filterMaxInput)}`;
    }
    
    if (filterPubkey) {
      query += ` AND u.pubkey CONTAINS '${filterPubkey}'`;
    }
    
    // Add count query for pagination
    const countQuery = query + ` RETURN count(u) as total`;
    
    // Add sorting and pagination to the main query
    query += `
      RETURN u.pubkey as pubkey,
             u.personalizedPageRank as personalizedPageRank,
             u.hops as hops,
             u.influence as influence,
             u.average as average,
             u.confidence as confidence,
             u.input as input,
             u.mutingCount as mutingCount,
             u.muterCount as muterCount,
             u.reportingCount as reportingCount,
             u.reporterCount as reporterCount
      ORDER BY u.${sortBy} ${sortOrder}
      SKIP ${(page - 1) * limit}
      LIMIT ${limit}
    `;
    
    // Execute count query first
    session.run(countQuery)
      .then(countResult => {
        const total = parseInt(countResult.records[0].get('total').toString());
        
        // Then execute the main query
        return session.run(query)
          .then(result => {
            const users = result.records.map(record => {
              return {
                pubkey: record.get('pubkey'),
                personalizedPageRank: record.get('personalizedPageRank') ? parseFloat(record.get('personalizedPageRank').toString()) : null,
                hops: record.get('hops') ? parseInt(record.get('hops').toString()) : null,
                influence: record.get('influence') ? parseFloat(record.get('influence').toString()) : null,
                average: record.get('average') ? parseFloat(record.get('average').toString()) : null,
                confidence: record.get('confidence') ? parseFloat(record.get('confidence').toString()) : null,
                input: record.get('input') ? parseFloat(record.get('input').toString()) : null,
                mutingCount: record.get('mutingCount') ? parseInt(record.get('mutingCount').toString()) : 0,
                muterCount: record.get('muterCount') ? parseInt(record.get('muterCount').toString()) : 0,
                reportingCount: record.get('reportingCount') ? parseInt(record.get('reportingCount').toString()) : 0,
                reporterCount: record.get('reporterCount') ? parseInt(record.get('reporterCount').toString()) : 0
              };
            });
            
            res.json({
              success: true,
              data: {
                users,
                pagination: {
                  total,
                  page,
                  limit,
                  pages: Math.ceil(total / limit)
                }
              }
            });
          });
      })
      .catch(error => {
        console.error('Error fetching profiles:', error);
        res.status(500).json({
          success: false,
          message: `Error fetching profiles: ${error.message}`
        });
      })
      .finally(() => {
        session.close();
        driver.close();
      });
  } catch (error) {
    console.error('Error in handleGetProfiles:', error);
    res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`
    });
  }
}

// Handler for getting individual user data from Neo4j
function handleGetUserData(req, res) {
  try {
    // Get query parameters for filtering
    const pubkey = req.query.pubkey;
    
    if (!pubkey) {
      return res.status(400).json({ error: 'Missing pubkey parameter' });
    }
    
    // Create Neo4j driver
    const neo4jUri = getConfigFromFile('NEO4J_URI', 'bolt://localhost:7687');
    const neo4jUser = getConfigFromFile('NEO4J_USER', 'neo4j');
    const neo4jPassword = getConfigFromFile('NEO4J_PASSWORD', 'neo4j');
    
    const driver = neo4j.driver(
      neo4jUri,
      neo4j.auth.basic(neo4jUser, neo4jPassword)
    );
    
    const session = driver.session();
    
    // Build the Cypher query to get user data and counts
    const query = `
      MATCH (u:NostrUser {pubkey: $pubkey})
      
      // Count users that this user follows
      OPTIONAL MATCH (u)-[f:FOLLOWS]->(following:NostrUser)
      WITH u, count(following) as followingCount
      
      // Count users that follow this user (with hops < 20)
      OPTIONAL MATCH (follower:NostrUser)-[f2:FOLLOWS]->(u)
      WHERE follower.hops IS NOT NULL AND follower.hops < 20
      WITH u, followingCount, count(follower) as followerCount
      
      // Count users that this user mutes
      OPTIONAL MATCH (u)-[m:MUTES]->(muted:NostrUser)
      WITH u, followingCount, followerCount, count(muted) as mutingCount
      
      // Count users that mute this user
      OPTIONAL MATCH (muter:NostrUser)-[m2:MUTES]->(u)
      WITH u, followingCount, followerCount, mutingCount, count(muter) as muterCount
      
      // Count users that this user reports
      OPTIONAL MATCH (u)-[r:REPORTS]->(reported:NostrUser)
      WITH u, followingCount, followerCount, mutingCount, muterCount, count(reported) as reportingCount
      
      // Count users that report this user
      OPTIONAL MATCH (reporter:NostrUser)-[r2:REPORTS]->(u)
      
      RETURN u.pubkey as pubkey,
             u.personalizedPageRank as personalizedPageRank,
             u.hops as hops,
             u.influence as influence,
             u.average as average,
             u.confidence as confidence,
             u.input as input,
             followingCount,
             followerCount,
             mutingCount,
             muterCount,
             reportingCount,
             count(reporter) as reporterCount
    `;
    
    // Execute the query
    session.run(query, { pubkey })
      .then(result => {
        const user = result.records[0];
        
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({
          success: true,
          data: {
            pubkey: user.get('pubkey'),
            personalizedPageRank: user.get('personalizedPageRank') ? parseFloat(user.get('personalizedPageRank').toString()) : null,
            hops: user.get('hops') ? parseInt(user.get('hops').toString()) : null,
            influence: user.get('influence') ? parseFloat(user.get('influence').toString()) : null,
            average: user.get('average') ? parseFloat(user.get('average').toString()) : null,
            confidence: user.get('confidence') ? parseFloat(user.get('confidence').toString()) : null,
            input: user.get('input') ? parseFloat(user.get('input').toString()) : null,
            followingCount: user.get('followingCount') ? parseInt(user.get('followingCount').toString()) : 0,
            followerCount: user.get('followerCount') ? parseInt(user.get('followerCount').toString()) : 0,
            mutingCount: user.get('mutingCount') ? parseInt(user.get('mutingCount').toString()) : 0,
            muterCount: user.get('muterCount') ? parseInt(user.get('muterCount').toString()) : 0,
            reportingCount: user.get('reportingCount') ? parseInt(user.get('reportingCount').toString()) : 0,
            reporterCount: user.get('reporterCount') ? parseInt(user.get('reporterCount').toString()) : 0
          }
        });
      })
      .catch(error => {
        console.error('Error fetching user data:', error);
        res.status(500).json({
          success: false,
          message: `Error fetching user data: ${error.message}`
        });
      })
      .finally(() => {
        session.close();
        driver.close();
      });
  } catch (error) {
    console.error('Error in handleGetUserData:', error);
    res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`
    });
  }
}

// Handler for getting network proximity data
function handleGetNetworkProximity(req, res) {
  try {
    // Get query parameters
    const pubkey = req.query.pubkey;
    const limit = parseInt(req.query.limit) || 50; // Default to 50 connections
    
    if (!pubkey) {
      return res.status(400).json({
        success: false,
        message: 'Missing pubkey parameter'
      });
    }
    
    // Create Neo4j driver
    const neo4jUri = getConfigFromFile('NEO4J_URI', 'bolt://localhost:7687');
    const neo4jUser = getConfigFromFile('NEO4J_USER', 'neo4j');
    const neo4jPassword = getConfigFromFile('NEO4J_PASSWORD', 'neo4j');
    
    const driver = neo4j.driver(
      neo4jUri,
      neo4j.auth.basic(neo4jUser, neo4jPassword)
    );
    
    const session = driver.session();
    
    // Build a simplified Cypher query to get network proximity data
    // This version is more efficient and less likely to time out
    const query = `
      // Find the central user
      MATCH (center:NostrUser {pubkey: $pubkey})
      
      // Get a limited number of relationships for each type
      // Following relationships
      OPTIONAL MATCH (center)-[f:FOLLOWS]->(following:NostrUser)
      WHERE following.hops IS NOT NULL
      WITH center, following, f
      ORDER BY following.influence DESC
      LIMIT toInteger($relationshipLimit)
      WITH center, collect({
        pubkey: following.pubkey,
        hops: following.hops,
        influence: following.influence,
        personalizedPageRank: following.personalizedPageRank,
        relationship: 'following',
        timestamp: f.timestamp
      }) AS followingNodes
      
      // Follower relationships
      OPTIONAL MATCH (follower:NostrUser)-[f2:FOLLOWS]->(center)
      WHERE follower.hops IS NOT NULL AND follower.hops < 20
      WITH center, followingNodes, follower, f2
      ORDER BY follower.influence DESC
      LIMIT toInteger($relationshipLimit)
      WITH center, followingNodes, collect({
        pubkey: follower.pubkey,
        hops: follower.hops,
        influence: follower.influence,
        personalizedPageRank: follower.personalizedPageRank,
        relationship: 'follower',
        timestamp: f2.timestamp
      }) AS followerNodes
      
      // Muting relationships
      OPTIONAL MATCH (center)-[m:MUTES]->(muted:NostrUser)
      WHERE muted.hops IS NOT NULL
      WITH center, followingNodes, followerNodes, muted, m
      ORDER BY muted.influence DESC
      LIMIT toInteger($relationshipLimit)
      WITH center, followingNodes, followerNodes, collect({
        pubkey: muted.pubkey,
        hops: muted.hops,
        influence: muted.influence,
        personalizedPageRank: muted.personalizedPageRank,
        relationship: 'muting',
        timestamp: m.timestamp
      }) AS mutingNodes
      
      // Muter relationships
      OPTIONAL MATCH (muter:NostrUser)-[m2:MUTES]->(center)
      WHERE muter.hops IS NOT NULL
      WITH center, followingNodes, followerNodes, mutingNodes, muter, m2
      ORDER BY muter.influence DESC
      LIMIT toInteger($relationshipLimit)
      WITH center, followingNodes, followerNodes, mutingNodes, collect({
        pubkey: muter.pubkey,
        hops: muter.hops,
        influence: muter.influence,
        personalizedPageRank: muter.personalizedPageRank,
        relationship: 'muter',
        timestamp: m2.timestamp
      }) AS muterNodes
      
      // Reporting relationships
      OPTIONAL MATCH (center)-[r:REPORTS]->(reported:NostrUser)
      WHERE reported.hops IS NOT NULL
      WITH center, followingNodes, followerNodes, mutingNodes, muterNodes, reported, r
      ORDER BY reported.influence DESC
      LIMIT toInteger($relationshipLimit)
      WITH center, followingNodes, followerNodes, mutingNodes, muterNodes, collect({
        pubkey: reported.pubkey,
        hops: reported.hops,
        influence: reported.influence,
        personalizedPageRank: reported.personalizedPageRank,
        relationship: 'reporting',
        timestamp: r.timestamp
      }) AS reportingNodes
      
      // Reporter relationships
      OPTIONAL MATCH (reporter:NostrUser)-[r2:REPORTS]->(center)
      WHERE reporter.hops IS NOT NULL
      WITH center, followingNodes, followerNodes, mutingNodes, muterNodes, reportingNodes, reporter, r2
      ORDER BY reporter.influence DESC
      LIMIT toInteger($relationshipLimit)
      WITH center, followingNodes, followerNodes, mutingNodes, muterNodes, reportingNodes, collect({
        pubkey: reporter.pubkey,
        hops: reporter.hops,
        influence: reporter.influence,
        personalizedPageRank: reporter.personalizedPageRank,
        relationship: 'reporter',
        timestamp: r2.timestamp
      }) AS reporterNodes
      
      // Return the central user and all connected nodes
      RETURN {
        center: {
          pubkey: center.pubkey,
          hops: center.hops,
          influence: center.influence,
          personalizedPageRank: center.personalizedPageRank,
          confidence: center.confidence
        },
        connections: {
          following: followingNodes,
          followers: followerNodes,
          muting: mutingNodes,
          muters: muterNodes,
          reporting: reportingNodes,
          reporters: reporterNodes
        }
      } AS networkData
    `;
    
    // Execute the query with a relationship limit parameter
    const relationshipLimit = Math.min(limit / 6, 20); // Divide the total limit among the 6 relationship types, max 20 per type
    
    session.run(query, { pubkey, relationshipLimit })
      .then(result => {
        if (result.records.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'User not found or has no connections'
          });
        }
        
        const networkData = result.records[0].get('networkData');
        
        // Process the data to create a D3-friendly format
        const nodes = [
          {
            id: networkData.center.pubkey,
            type: 'center',
            hops: networkData.center.hops,
            influence: networkData.center.influence,
            personalizedPageRank: networkData.center.personalizedPageRank,
            confidence: networkData.center.confidence
          }
        ];
        
        const links = [];
        const nodeMap = new Map();
        nodeMap.set(networkData.center.pubkey, true);
        
        // Process each type of connection
        Object.entries(networkData.connections).forEach(([connectionType, connections]) => {
          connections.forEach(connection => {
            // Only add each node once
            if (!nodeMap.has(connection.pubkey)) {
              nodes.push({
                id: connection.pubkey,
                type: connectionType,
                hops: connection.hops,
                influence: connection.influence,
                personalizedPageRank: connection.personalizedPageRank
              });
              nodeMap.set(connection.pubkey, true);
            }
            
            // Add the link
            const source = connectionType.endsWith('s') ? connection.pubkey : networkData.center.pubkey;
            const target = connectionType.endsWith('s') ? networkData.center.pubkey : connection.pubkey;
            
            links.push({
              source,
              target,
              type: connectionType,
              timestamp: connection.timestamp
            });
          });
        });
        
        // Limit the number of nodes if necessary
        if (nodes.length > limit + 1) { // +1 for the center node
          // Sort connections by influence and take the top ones
          const sortedNodes = nodes.slice(1).sort((a, b) => {
            return (b.influence || 0) - (a.influence || 0);
          });
          
          const topNodes = sortedNodes.slice(0, limit);
          const topNodeIds = new Set([networkData.center.pubkey, ...topNodes.map(n => n.id)]);
          
          // Filter nodes and links
          const filteredNodes = [nodes[0], ...topNodes];
          const filteredLinks = links.filter(link => 
            topNodeIds.has(link.source) && topNodeIds.has(link.target)
          );
          
          res.json({
            success: true,
            data: {
              nodes: filteredNodes,
              links: filteredLinks
            }
          });
        } else {
          res.json({
            success: true,
            data: {
              nodes,
              links
            }
          });
        }
      })
      .catch(error => {
        console.error('Error fetching network proximity data:', error);
        res.status(500).json({
          success: false,
          message: `Error fetching network proximity data: ${error.message}`
        });
      })
      .finally(() => {
        session.close();
        driver.close();
      });
  } catch (error) {
    console.error('Error in handleGetNetworkProximity:', error);
    res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`
    });
  }
}

// Handler for getting kind 0 events from the nostr network
function handleGetKind0Event(req, res) {
  try {
    // Get query parameters for filtering
    const pubkey = req.query.pubkey;
    
    if (!pubkey) {
      return res.status(400).json({
        success: false,
        message: 'Missing pubkey parameter'
      });
    }
    
    // Define the relays to query
    const relays = [
      'wss://relay.hasenpfeffr.com',
      'wss://profiles.nostr1.com',
      'wss://relay.nostr.band',
      'wss://relay.damus.io',
      'wss://relay.primal.net'
    ];
    
    // First try to get the event from our local strfry relay
    const strfryCommand = `sudo strfry scan '{"kinds":[0],"authors":["${pubkey}"],"limit":1}'`;
    
    exec(strfryCommand, (error, stdout, stderr) => {
      if (error) {
        console.log(`Local strfry query failed, trying external relays: ${stderr || error.message}`);
        // If local strfry fails, continue to external relays
        fetchFromExternalRelays();
        return;
      }
      
      try {
        // Parse the JSON output from the script
        const events = stdout.trim().split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
        
        if (events.length > 0) {
          // Return the most recent event from local strfry
          return res.json({
            success: true,
            data: events[0],
            source: 'local_strfry'
          });
        } else {
          console.log('No kind 0 events found via local strfry, trying external relays');
          // If no events found, try external relays
          fetchFromExternalRelays();
        }
      } catch (parseError) {
        console.log('Error parsing strfry output, trying external relays:', parseError);
        // If parsing fails, continue to external relays
        fetchFromExternalRelays();
      }
    });
    
    // Function to fetch from external relays using NDK
    async function fetchFromExternalRelays() {
      console.log(`Fetching kind 0 event for ${pubkey} from external relays using NDK...`);
      
      try {
        // Initialize NDK with the relays
        console.log('Initializing NDK with relays:', relays);
        const ndk = new NDK({
          explicitRelayUrls: relays
        });
        
        // Connect to relays
        console.log('Attempting to connect to relays via NDK...');
        try {
          await ndk.connect();
          console.log('Successfully connected to relays via NDK');
        } catch (connectError) {
          console.error('Error connecting to relays via NDK:', connectError);
          throw connectError;
        }
        
        // Set a timeout to ensure we don't wait forever
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('NDK fetch timeout after 10 seconds')), 10000);
        });
        
        // Create a filter for the kind 0 event
        const filter = {
          kinds: [0],
          authors: [pubkey],
          limit: 1
        };
        console.log('Using filter:', JSON.stringify(filter));
        
        // Fetch the events with a timeout
        console.log('Fetching events from relays...');
        let fetchPromise;
        try {
          fetchPromise = ndk.fetchEvents(filter);
        } catch (fetchError) {
          console.error('Error creating fetch promise:', fetchError);
          throw fetchError;
        }
        
        // Race between fetch and timeout
        console.log('Waiting for events or timeout...');
        const events = await Promise.race([fetchPromise, timeoutPromise]);
        
        // Convert the NDK events to an array
        console.log('Processing events received from relays...');
        const eventArray = Array.from(events || []);
        console.log(`Found ${eventArray.length} events`);
        
        if (eventArray.length > 0) {
          // Get the raw event data
          const rawEvent = eventArray[0].rawEvent();
          console.log('Found kind 0 event via NDK:', JSON.stringify(rawEvent).substring(0, 100) + '...');
          
          // Return the event
          return res.json({
            success: true,
            data: rawEvent,
            source: 'ndk_external_relay'
          });
        } else {
          console.log('No kind 0 events found via NDK, checking Neo4j');
          // If no events found, check Neo4j
          checkNeo4j();
        }
      } catch (error) {
        console.error('Error fetching from external relays via NDK:', error);
        console.error('Error details:', error.stack || 'No stack trace available');
        console.log('Falling back to Neo4j due to NDK error');
        // If NDK fetch fails, check Neo4j
        checkNeo4j();
      }
    }
    
    // Function to check Neo4j for metadata
    function checkNeo4j() {
      console.log(`Checking Neo4j for metadata for ${pubkey}`);
      
      // Create Neo4j driver
      const neo4jUri = getConfigFromFile('NEO4J_URI', 'bolt://localhost:7687');
      const neo4jUser = getConfigFromFile('NEO4J_USER', 'neo4j');
      const neo4jPassword = getConfigFromFile('NEO4J_PASSWORD', 'neo4j');
      
      const driver = neo4j.driver(
        neo4jUri,
        neo4j.auth.basic(neo4jUser, neo4jPassword)
      );
      
      const session = driver.session();
      
      // Query for any metadata we might have stored
      const query = `
        MATCH (u:NostrUser {pubkey: $pubkey})
        RETURN u.metadata as metadata
      `;
      
      session.run(query, { pubkey })
        .then(result => {
          if (result.records.length > 0 && result.records[0].get('metadata')) {
            try {
              // If we have metadata stored in Neo4j, use that
              const metadata = result.records[0].get('metadata');
              const metadataObj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
              
              // Construct a kind 0 event from the metadata
              const kind0Event = {
                kind: 0,
                pubkey: pubkey,
                content: JSON.stringify(metadataObj),
                created_at: Math.floor(Date.now() / 1000),
                tags: []
              };
              
              return res.json({
                success: true,
                data: kind0Event,
                source: 'neo4j'
              });
            } catch (parseError) {
              console.error('Error parsing metadata from Neo4j:', parseError);
              return res.json({
                success: false,
                message: 'No profile data found for this user'
              });
            }
          } else {
            // If no metadata in Neo4j, return empty
            return res.json({
              success: false,
              message: 'No profile data found for this user'
            });
          }
        })
        .catch(neo4jError => {
          console.error('Error querying Neo4j:', neo4jError);
          return res.status(500).json({
            success: false,
            message: `Error querying Neo4j: ${neo4jError.message}`
          });
        })
        .finally(() => {
          session.close();
          driver.close();
        });
    }
  } catch (error) {
    console.error('Error in handleGetKind0Event:', error);
    res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`
    });
  }
}

// Handler for getting calculation status
function handleCalculationStatus(req, res) {
    console.log('Getting calculation status...');
    
    try {
        // Get HASENPFEFFR_LOG_DIR from hasenpfeffr.conf
        const logDir = getConfigFromFile('HASENPFEFFR_LOG_DIR', '/var/log/hasenpfeffr');
        
        // Define log files to check
        const logFiles = {
            hops: `${logDir}/calculateHops.log`,
            pageRank: `${logDir}/calculatePersonalizedPageRank.log`,
            grapeRank: `${logDir}/calculatePersonalizedGrapeRank.log`,
            whitelist: `${logDir}/exportWhitelist.log`,
            blacklist: `${logDir}/exportBlacklist.log`,
            nip85: `${logDir}/publishNip85.log`,
            syncWoT: `${logDir}/syncWoT.log`,
            syncPersonal: `${logDir}/syncPersonal.log`,
            syncProfiles: `${logDir}/syncProfiles.log`,
            batchTransfer: `${logDir}/batchTransfer.log`,
            reconciliation: `${logDir}/runFullReconciliation.log`
        };
        
        // Function to get calculation status from log file
        const getCalculationStatus = (logFile) => {
            try {
                if (!fs.existsSync(logFile)) {
                    return { status: 'Never', timestamp: 0, formattedTime: 'Never', duration: null };
                }
                
                const fileContent = fs.readFileSync(logFile, 'utf8');
                
                // Check for the most recent "Starting" and "Finished" entries
                // The date format in the log files is like: "Sun Mar 30 00:18:14 UTC 2025"
                const startMatches = [...fileContent.matchAll(/(.*?): Starting/g)];
                const finishMatches = [...fileContent.matchAll(/(.*?): Finished/g)];
                
                if (startMatches.length === 0) {
                    return { status: 'Never', timestamp: 0, formattedTime: 'Never', duration: null };
                }
                
                // Parse the date strings
                const parseLogDate = (dateStr) => {
                    try {
                        // Convert the log date format to a standard format that JavaScript can parse
                        return new Date(dateStr.trim());
                    } catch (err) {
                        console.error(`Error parsing date: ${dateStr}`, err);
                        return null;
                    }
                };
                
                const lastStartMatch = startMatches[startMatches.length - 1];
                const lastStartDate = parseLogDate(lastStartMatch[1]);
                
                if (!lastStartDate) {
                    return { status: 'Error', timestamp: 0, formattedTime: 'Error parsing date', duration: null };
                }
                
                const lastStartTimestamp = Math.floor(lastStartDate.getTime() / 1000);
                
                // Check if there's a finish entry after the last start entry
                let isCompleted = false;
                let lastFinishDate = null;
                let lastFinishTimestamp = 0;
                
                if (finishMatches.length > 0) {
                    // Find the most recent finish entry
                    for (let i = finishMatches.length - 1; i >= 0; i--) {
                        const finishDate = parseLogDate(finishMatches[i][1]);
                        if (finishDate && finishDate >= lastStartDate) {
                            isCompleted = true;
                            lastFinishDate = finishDate;
                            lastFinishTimestamp = Math.floor(lastFinishDate.getTime() / 1000);
                            break;
                        }
                    }
                }
                
                if (!isCompleted) {
                    // In progress - started but not finished
                    const now = new Date();
                    const elapsedSeconds = Math.floor((now - lastStartDate) / 1000);
                    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
                    const elapsedHours = Math.floor(elapsedMinutes / 60);
                    
                    let formattedElapsed;
                    if (elapsedHours > 0) {
                        formattedElapsed = `${elapsedHours}h ${elapsedMinutes % 60}m ago`;
                    } else if (elapsedMinutes > 0) {
                        formattedElapsed = `${elapsedMinutes}m ${elapsedSeconds % 60}s ago`;
                    } else {
                        formattedElapsed = `${elapsedSeconds}s ago`;
                    }
                    
                    return {
                        status: 'In Progress',
                        timestamp: lastStartTimestamp,
                        formattedTime: `Started ${formattedElapsed}`,
                        startTime: lastStartDate.toLocaleString(),
                        duration: null
                    };
                } else {
                    // Completed
                    const now = new Date();
                    const elapsedSeconds = Math.floor((now - lastFinishDate) / 1000);
                    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
                    const elapsedHours = Math.floor(elapsedMinutes / 60);
                    const elapsedDays = Math.floor(elapsedHours / 24);
                    
                    let formattedElapsed;
                    if (elapsedDays > 0) {
                        formattedElapsed = `${elapsedDays}d ${elapsedHours % 24}h ago`;
                    } else if (elapsedHours > 0) {
                        formattedElapsed = `${elapsedHours}h ${elapsedMinutes % 60}m ago`;
                    } else if (elapsedMinutes > 0) {
                        formattedElapsed = `${elapsedMinutes}m ${elapsedSeconds % 60}s ago`;
                    } else {
                        formattedElapsed = `${elapsedSeconds}s ago`;
                    }

                    const durationSeconds = Math.floor((lastFinishDate - lastStartDate) / 1000);
                    const durationMinutes = Math.floor(durationSeconds / 60);
                    const durationHours = Math.floor(durationMinutes / 60);
                    const durationDays = Math.floor(durationHours / 24);
                    
                    let formattedDuration;
                    if (durationDays > 0) {
                        formattedDuration = `${durationDays}d ${durationHours % 24}h`;
                    } else if (durationHours > 0) {
                        formattedDuration = `${durationHours}h ${durationMinutes % 60}m`;
                    } else if (durationMinutes > 0) {
                        formattedDuration = `${durationMinutes}m ${durationSeconds % 60}s`;
                    } else {
                        formattedDuration = `${durationSeconds}s`;
                    }
                    
                    return {
                        status: 'Completed',
                        timestamp: lastFinishTimestamp,
                        formattedTime: `Completed ${formattedElapsed}`,
                        finishTime: lastFinishDate.toLocaleString(),
                        duration: formattedDuration
                    };
                }
            } catch (error) {
                console.error(`Error reading log file ${logFile}:`, error);
                return { status: 'Error', timestamp: 0, formattedTime: 'Error reading log' };
            }
        };
        
        // Get status for each calculation
        const result = {};
        for (const [key, logFile] of Object.entries(logFiles)) {
            result[key] = getCalculationStatus(logFile);
        }
        
        // Return the status
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Error getting calculation status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get calculation status'
        });
    }
}

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