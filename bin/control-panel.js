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
    secret: crypto.randomBytes(32).toString('hex'),
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
            '/bulk-transfer',
            '/generate',
            '/publish',
            '/negentropy-sync',
            '/strfry-plugin',
            '/create-kind10040',
            '/publish-kind10040',
            '/publish-kind30382'
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

// API endpoint for Negentropy sync
app.post('/api/negentropy-sync', handleNegentropySync);

// API endpoint to generate NIP-85 data
app.get('/api/generate', handleGenerate);
app.post('/api/generate', handleGenerate);
app.get('/control/api/generate-pagerank', handleGenerate);
app.post('/control/api/generate-pagerank', handleGenerate);

// API endpoint to generate GrapeRank data
app.get('/api/generate-graperank', handleGenerateGrapeRank);
app.post('/api/generate-graperank', handleGenerateGrapeRank);
app.get('/control/api/generate-graperank', handleGenerateGrapeRank);
app.post('/control/api/generate-graperank', handleGenerateGrapeRank);

// API endpoint to publish NIP-85 events
app.get('/api/publish', handlePublish);
app.post('/api/publish', handlePublish);

// API endpoint for systemd services management
app.get('/api/systemd-services', handleSystemdServices);
app.get('/control/api/systemd-services', handleSystemdServices);

// API endpoint for strfry plugin management
app.get('/api/strfry-plugin', handleStrfryPlugin);
app.get('/control/api/strfry-plugin', handleStrfryPlugin);

// API endpoint for bulk transfer
app.post('/api/bulk-transfer', handleBulkTransfer);
app.post('/control/api/bulk-transfer', handleBulkTransfer);

// API endpoint to create kind 10040 events
app.post('/api/create-kind10040', handleCreateKind10040);

// API endpoint to get unsigned kind 10040 event
app.get('/api/get-kind10040-event', handleGetKind10040Event);

// API endpoint to publish kind 10040 events
app.post('/api/publish-kind10040', handlePublishKind10040);

// API endpoint to publish kind 30382 events
app.post('/api/publish-kind30382', handlePublishKind30382);

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
                                .split('\n')
                                .filter(line => line.includes('|'))
                                .map(line => line.trim());
                            
                            // Get indexes
                            executeCypher('SHOW INDEXES;', (output) => {
                                neo4jStatus.indexes = output
                                    .split('\n')
                                    .filter(line => line.includes('|'))
                                    .map(line => line.trim());
                                
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
    
    // Set a timeout to ensure the response doesn't hang
    const timeoutId = setTimeout(() => {
        console.log('Negentropy sync is taking longer than expected, sending initial response...');
        res.json({
            success: true,
            output: 'Negentropy sync started. This process will continue in the background.\n',
            error: null
        });
    }, 30000); // 30 seconds timeout
    
    exec('hasenpfeffr-negentropy-sync', (error, stdout, stderr) => {
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

function handleGenerate(req, res) {
    console.log('Generating NIP-85 data...');
    
    exec('hasenpfeffr-generate', (error, stdout, stderr) => {
        return res.json({
            success: !error,
            output: stdout || stderr
        });
    });
}

function handleGenerateGrapeRank(req, res) {
    console.log('Generating GrapeRank data...');
    
    exec('/usr/local/lib/node_modules/hasenpfeffr/src/algos/personalizedGrapeRank/calculatePersonalizedGrapeRank.sh', (error, stdout, stderr) => {
        return res.json({
            success: !error,
            output: stdout || stderr
        });
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
        
        if (action === 'enable') {
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
            
            // Update strfry.conf
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
            
            // Remove any incorrect relay.writePolicy.plugin line if it exists
            if (relayMatch) {
                confContent = confContent.replace(/\nrelay\.writePolicy\.plugin\s*=\s*"[^"]*"\n?/, '\n');
            }
            
            // Write config to a temporary file and then use sudo to move it
            const tempConfigPath = '/tmp/strfry.conf.tmp';
            fs.writeFileSync(tempConfigPath, confContent);
            execSync(`sudo cp ${tempConfigPath} ${strfryConfPath}`);
            fs.unlinkSync(tempConfigPath);
            
            return res.json({ status: 'enabled', message: 'Plugin enabled successfully' });
        }
        
        if (action === 'disable') {
            // Update strfry.conf
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
            
            // Remove any incorrect relay.writePolicy.plugin line if it exists
            if (relayMatch) {
                confContent = confContent.replace(/\nrelay\.writePolicy\.plugin\s*=\s*"[^"]*"\n?/, '\n');
            }
            
            // Write config to a temporary file and then use sudo to move it
            const tempConfigPath = '/tmp/strfry.conf.tmp';
            fs.writeFileSync(tempConfigPath, confContent);
            execSync(`sudo cp ${tempConfigPath} ${strfryConfPath}`);
            fs.unlinkSync(tempConfigPath);
            
            return res.json({ status: 'disabled', message: 'Plugin disabled successfully' });
        }
        
        return res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
        console.error('Error handling strfry plugin:', error);
        return res.status(500).json({ error: error.message });
    }
}

// Handler for bulk transfer
function handleBulkTransfer(req, res) {
    console.log('Starting bulk transfer of kind 3 data from strfry to Neo4j...');
    
    // Create a child process to run the transfer script
    const transferProcess = exec('/usr/local/lib/node_modules/hasenpfeffr/src/pipeline/batch/transfer.sh');
    
    let output = '';
    
    transferProcess.stdout.on('data', (data) => {
        console.log(`Bulk Transfer stdout: ${data}`);
        output += data;
    });
    
    transferProcess.stderr.on('data', (data) => {
        console.error(`Bulk Transfer stderr: ${data}`);
        output += data;
    });
    
    transferProcess.on('close', (code) => {
        console.log(`Bulk Transfer process exited with code ${code}`);
        
        if (code === 0) {
            res.json({
                success: true,
                message: 'Bulk transfer completed successfully',
                output: output
            });
        } else {
            res.json({
                success: false,
                message: `Bulk transfer failed with exit code ${code}`,
                output: output
            });
        }
    });
    
    // Handle unexpected errors
    transferProcess.on('error', (error) => {
        console.error(`Bulk Transfer error: ${error.message}`);
        res.status(500).json({
            success: false,
            message: `Bulk transfer error: ${error.message}`
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
            if (code === 0) {
                // Success
                return res.json({ 
                    success: true, 
                    message: 'Kind 10040 event published successfully', 
                    output: output 
                });
            } else {
                // Error
                return res.json({ 
                    success: false, 
                    error: 'Error publishing kind 10040 event', 
                    details: errorOutput || 'No error details available',
                    output: output
                });
            }
        });
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
    const scriptPath = path.join(__dirname, 'hasenpfeffr-publish-kind30382.js');
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
      MATCH (u:NostrUser { pubkey: $pubkey })
      
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
    const strfryCommand = `strfry scan --limit 1 '{"kinds":[0],"authors":["${pubkey}"]}'`;
    
    exec(strfryCommand, (error, stdout, stderr) => {
      if (error) {
        console.log(`Local strfry query failed, trying external relays: ${stderr || error.message}`);
        // If local strfry fails, continue to external relays
        fetchFromExternalRelays();
        return;
      }
      
      try {
        // Parse the JSON output
        const events = stdout.trim().split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
        
        if (events.length > 0) {
          // Return the most recent event from local strfry
          return res.json({
            success: true,
            data: events[0],
            source: 'local_strfry'
          });
        } else {
          // If no events found in local relay, try external relays
          fetchFromExternalRelays();
        }
      } catch (parseError) {
        console.log('Error parsing strfry output, trying external relays:', parseError);
        // If parsing fails, continue to external relays
        fetchFromExternalRelays();
      }
    });
    
    // Function to fetch from external relays
    function fetchFromExternalRelays() {
      console.log(`Fetching kind 0 event for ${pubkey} from external relays...`);
      
      let foundEvent = null;
      let completedRelays = 0;
      let activeConnections = 0;
      const maxWaitTime = 10000; // 10 seconds max wait time
      
      // Set a timeout to ensure we don't wait forever
      const timeoutId = setTimeout(() => {
        if (!foundEvent) {
          // If we haven't found an event yet, check Neo4j
          checkNeo4j();
        }
      }, maxWaitTime);
      
      // Query each relay
      relays.forEach(relayUrl => {
        activeConnections++;
        
        const ws = new WebSocket(relayUrl);
        let subscriptionId = crypto.randomBytes(16).toString('hex');
        
        // Set a timeout for this specific relay connection
        const connectionTimeout = setTimeout(() => {
          console.log(`Connection timeout for relay: ${relayUrl}`);
          ws.close();
          checkCompletion();
        }, 5000); // 5 seconds timeout for each connection
        
        ws.on('open', () => {
          console.log(`Connected to relay: ${relayUrl}`);
          clearTimeout(connectionTimeout);
          
          // Send REQ message to the relay
          const reqMessage = JSON.stringify([
            "REQ",
            subscriptionId,
            {
              "kinds": [0],
              "authors": [pubkey],
              "limit": 1
            }
          ]);
          
          ws.send(reqMessage);
          
          // Set a timeout for the response
          setTimeout(() => {
            console.log(`Response timeout for relay: ${relayUrl}`);
            ws.close();
            checkCompletion();
          }, 5000); // 5 seconds timeout for response
        });
        
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            
            // Check if it's an EVENT message
            if (message[0] === 'EVENT' && message[1] === subscriptionId) {
              const event = message[2];
              
              // Validate the event
              if (event && event.kind === 0 && event.pubkey === pubkey) {
                console.log(`Found kind 0 event from relay: ${relayUrl}`);
                
                // Store the event if we haven't found one yet or if this one is newer
                if (!foundEvent || event.created_at > foundEvent.created_at) {
                  foundEvent = event;
                }
                
                // Close the connection as we found what we needed
                ws.close();
                checkCompletion();
              }
            }
            
            // Check if it's an EOSE (End of Stored Events) message
            if (message[0] === 'EOSE' && message[1] === subscriptionId) {
              console.log(`End of stored events from relay: ${relayUrl}`);
              ws.close();
              checkCompletion();
            }
          } catch (error) {
            console.error(`Error parsing message from relay ${relayUrl}:`, error);
          }
        });
        
        ws.on('error', (error) => {
          console.error(`WebSocket error for relay ${relayUrl}:`, error.message);
          clearTimeout(connectionTimeout);
          ws.close();
          checkCompletion();
        });
        
        ws.on('close', () => {
          console.log(`Connection closed for relay: ${relayUrl}`);
          checkCompletion();
        });
      });
      
      // Check if we've completed all relay queries
      function checkCompletion() {
        activeConnections--;
        completedRelays++;
        
        console.log(`Completed ${completedRelays}/${relays.length} relays, active connections: ${activeConnections}`);
        
        if (activeConnections <= 0 || foundEvent) {
          clearTimeout(timeoutId);
          
          if (foundEvent) {
            // Return the found event
            return res.json({
              success: true,
              data: foundEvent,
              source: 'external_relay'
            });
          } else if (completedRelays >= relays.length) {
            // If we've checked all relays and found nothing, check Neo4j
            checkNeo4j();
          }
        }
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
        MATCH (u:NostrUser { pubkey: $pubkey })
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
        
        // Verify the event is properly signed
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

// Start the server
app.listen(port, () => {
    console.log(`Hasenpfeffr Control Panel running on port ${port}`);
});

// Export utility functions for testing and reuse
module.exports = {
    getConfigFromFile,
    getNeo4jConnection
};
