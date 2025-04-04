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

// Import centralized configuration utility
const { getConfigFromFile } = require('../src/utils/config');

// Import configuration
let config;
try {
  const configModule = require('../lib/config');
  config = configModule.getAll();
} catch (error) {
  console.warn('Could not load configuration:', error.message);
  config = {};
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

// Register API modules
api.register(app);

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

// API endpoint for setting up Neo4j constraints and indexes
app.get('/api/neo4j-setup-constraints', handleNeo4jSetupConstraints);

// API endpoint for Negentropy sync
app.post('/api/negentropy-sync', handleNegentropySync);

app.post('/api/negentropy-sync-wot', handleNegentropySyncWoT);

app.post('/api/negentropy-sync-personal', handleNegentropySyncPersonal);

// API endpoint to publish NIP-85 events
app.get('/api/publish', handlePublish);

// API endpoint to create kind 10040 events 
app.post('/api/create-kind10040', handleCreateKind10040);

app.get('/api/whitelist-stats', handleGetWhitelistStats);

// Endpoint to count users above influence threshold
app.get('/api/influence-count', handleGetInfluenceCount);

// Endpoint to count users with hops less than or equal to threshold
app.get('/api/hops-count', handleGetHopsCount);

// Endpoint to count blacklisted users
app.get('/api/blacklist-count', handleGetBlacklistCount);

// Endpoint to count users based on full whitelist criteria
app.get('/api/whitelist-preview-count', handleGetWhitelistPreviewCount);

// Add route handler for Hasenpfeffr control
app.post('/api/hasenpfeffr-control', handleHasenpfeffrControl);

// Add route handler for getting calculation status
app.get('/api/calculation-status', handleCalculationStatus);

// Add route handler for running service management scripts
app.get('/api/run-script', handleRunScript);
app.post('/api/run-script', handleRunScript);

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

function handlePublish(req, res) {
    console.log('Publishing NIP-85 events...');
    
    exec('hasenpfeffr-publish', (error, stdout, stderr) => {
        return res.json({
            success: !error,
            output: stdout || stderr
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
    const setupScript = path.join(__dirname, '../setup', 'neo4jConstraintsAndIndexes.sh');
    
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