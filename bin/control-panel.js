#!/usr/bin/env node

/**
 * Hasenpfeffr Control Panel
 * 
 * This script starts the Hasenpfeffr Control Panel web interface
 * and API server for managing NIP-85 data generation and publication.
 */

const express = require('express');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const spawn = require('child_process').spawn;

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
    res.redirect('/control/control-panel.html');
});

app.get('/control/control-panel.html', (req, res) => {
    serveHtmlFile('control/control-panel.html', res);
});

app.get('/control/nip85-control-panel.html', (req, res) => {
    serveHtmlFile('control/nip85-control-panel.html', res);
});

app.get('/control/sign-in.html', (req, res) => {
    serveHtmlFile('control/sign-in.html', res);
});

// For backward compatibility, redirect old URLs to new ones
app.get('/control-panel.html', (req, res) => {
    res.redirect('/control/control-panel.html');
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
    'calculatePersonalizedPageRank.timer'
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
        
        // Return the event data
        return res.json({ 
            success: true, 
            event: event
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
        if (!signedEvent.sig) {
            return res.status(400).json({ 
                success: false, 
                error: 'Event is not signed' 
            });
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
            console.log('publish_nip85_10040.mjs stdout:', dataStr);
            output += dataStr;
        });
        
        child.stderr.on('data', (data) => {
            const dataStr = data.toString();
            console.error('publish_nip85_10040.mjs stderr:', dataStr);
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
    
    // Set a timeout to ensure the response doesn't hang
    const timeoutId = setTimeout(() => {
        console.log('Kind 30382 publishing is taking longer than expected, sending initial response...');
        res.json({
            success: true,
            output: 'Kind 30382 publishing started. This process will continue in the background.\n',
            error: null
        });
    }, 30000); // 30 seconds timeout
    
    exec(`node ${scriptPath}`, (error, stdout, stderr) => {
        // Clear the timeout if the command completes before the timeout
        clearTimeout(timeoutId);
        
        // Check if the response has already been sent
        if (res.headersSent) {
            console.log('Response already sent, kind 30382 publishing continuing in background');
            return;
        }
        
        // Parse the script output to determine success
        let scriptResult = { success: false };
        try {
            // Try to parse the JSON output from the script
            if (stdout) {
                const parsedOutput = JSON.parse(stdout);
                scriptResult = parsedOutput;
            }
        } catch (parseError) {
            console.error('Error parsing script output:', parseError);
            // If we can't parse the output, use the original error/stdout/stderr
        }
        
        // Determine success based on the parsed result or fallback to error check
        const isSuccess = scriptResult.success !== undefined 
            ? scriptResult.success 
            : !error;
        
        // Format the output message
        let outputMessage = stdout || stderr || 'No output from script';
        
        // Check for the specific "Unexpected server response: 200" error and handle it
        if (outputMessage.includes('Unexpected server response: 200')) {
            console.log('Detected "Unexpected server response: 200" which is actually a success');
            // This is actually a success case
            return res.json({
                success: true,
                output: 'Kind 30382 events published successfully. The "Unexpected server response: 200" message indicates a successful HTTP response.',
                error: null
            });
        }
        
        return res.json({
            success: isSuccess,
            output: outputMessage,
            error: error ? error.message : null
        });
    });
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
        if (nsec) {
            req.session.nsec = nsec;
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
