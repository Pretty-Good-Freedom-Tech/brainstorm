#!/usr/bin/env node

/**
 * Hasenpfeffr Control Panel
 * 
 * This script starts the Hasenpfeffr Control Panel web interface
 * and API server for managing NIP-85 data generation and publication.
 */

const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Import configuration
let config = {};
try {
  const { loadConfig } = require('../lib/config');
  config = loadConfig();
} catch (error) {
  console.warn('Could not load configuration:', error.message);
}

// Create Express app
const app = express();
const port = process.env.CONTROL_PANEL_PORT || 7778;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
// First try to find the public directory in the bin directory
let publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
    // If not found, try the parent directory (project root)
    publicPath = path.join(__dirname, '../public');
}
app.use(express.static(publicPath));

// Serve the control panel HTML file
app.get('/', (req, res) => {
    // First try to find the HTML file in the bin directory
    let htmlPath = path.join(__dirname, 'public/control-panel.html');
    
    // If not found, try the parent directory (project root)
    if (!fs.existsSync(htmlPath)) {
        htmlPath = path.join(__dirname, '../public/control-panel.html');
    }
    
    if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
    } else {
        res.status(404).send('Control panel HTML file not found. Looked in: ' + 
                            path.join(__dirname, 'public/control-panel.html') + ' and ' +
                            path.join(__dirname, '../public/control-panel.html'));
    }
});

// Define API routes for both direct access and nginx proxy
// Direct access: /api/...
// Nginx proxy: /control/api/...

// API endpoint to check system status
app.get('/api/status', handleStatus);
app.get('/control/api/status', handleStatus);

// API endpoint to get strfry event statistics
app.get('/api/strfry-stats', handleStrfryStats);
app.get('/control/api/strfry-stats', handleStrfryStats);

// API endpoint to get Neo4j status information
app.get('/api/neo4j-status', handleNeo4jStatus);
app.get('/control/api/neo4j-status', handleNeo4jStatus);

// API endpoint for Negentropy sync
app.post('/api/negentropy-sync', handleNegentropySync);
app.post('/control/api/negentropy-sync', handleNegentropySync);

// API endpoint to generate NIP-85 data
app.get('/api/generate', handleGenerate);
app.get('/control/api/generate', handleGenerate);
app.post('/api/generate', handleGenerate);
app.post('/control/api/generate', handleGenerate);

// API endpoint to publish NIP-85 events
app.get('/api/publish', handlePublish);
app.get('/control/api/publish', handlePublish);
app.post('/api/publish', handlePublish);
app.post('/control/api/publish', handlePublish);

// Handler functions for API endpoints
function handleStatus(req, res) {
    console.log('Checking status...');
    
    exec('systemctl status strfry', (error, stdout, stderr) => {
        return res.json({
            output: stdout || stderr
        });
    });
}

function handleStrfryStats(req, res) {
    console.log('Getting strfry event statistics...');
    
    // Create an object to store all stats
    const stats = {
        total: 0,
        kind3: 0,
        kind1984: 0,
        kind10000: 0,
        error: null
    };

    // Function to execute strfry scan with kind filter
    const getEventCount = (kindFilter, statKey) => {
        return new Promise((resolve) => {
            let jsonFilter;
            if (!kindFilter) {
                jsonFilter = '{}';
            } else {
                jsonFilter = `{ "kinds": [${kindFilter}]}`;
            }
            
            // First try without sudo
            const commandWithoutSudo = `strfry scan --count '${jsonFilter}'`;
            
            exec(commandWithoutSudo, (error, stdout, stderr) => {
                if (!error) {
                    // Command succeeded without sudo
                    const match = stdout.match(/Found (\d+) events/);
                    if (match && match[1]) {
                        stats[statKey] = parseInt(match[1], 10);
                    }
                    resolve();
                    return;
                }
                
                // If the command failed without sudo, try with sudo
                const commandWithSudo = `sudo -n strfry scan --count '${jsonFilter}'`;
                
                exec(commandWithSudo, (error, stdout, stderr) => {
                    if (error) {
                        stats.error = `Error executing strfry scan: ${stderr || error.message}`;
                        resolve();
                        return;
                    }
                    
                    // Parse the count from stdout (expected format: "Found X events")
                    const match = stdout.match(/Found (\d+) events/);
                    if (match && match[1]) {
                        stats[statKey] = parseInt(match[1], 10);
                    }
                    resolve();
                });
            });
        });
    };

    // Execute all commands in sequence
    Promise.all([
        getEventCount('', 'total'),
        getEventCount('3', 'kind3'),
        getEventCount('1984', 'kind1984'),
        getEventCount('10000', 'kind10000')
    ])
    .then(() => {
        res.json({
            success: !stats.error,
            stats: stats,
            error: stats.error
        });
    })
    .catch(err => {
        res.json({
            success: false,
            error: `Failed to get strfry stats: ${err.message}`
        });
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
            const command = `cypher-shell -u neo4j -p ${process.env.NEO4J_PASSWORD || 'neo4j'} "${query}"`;
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
            executeCypher('MATCH ()-[r:FOLLOW]->() RETURN count(r) as count;', (output) => {
                const match = output.match(/(\d+)/);
                if (match && match[1]) {
                    neo4jStatus.relationships.follow = parseInt(match[1], 10);
                }
                
                executeCypher('MATCH ()-[r:MUTE]->() RETURN count(r) as count;', (output) => {
                    const match = output.match(/(\d+)/);
                    if (match && match[1]) {
                        neo4jStatus.relationships.mute = parseInt(match[1], 10);
                    }
                    
                    executeCypher('MATCH ()-[r:REPORT]->() RETURN count(r) as count;', (output) => {
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

function handlePublish(req, res) {
    console.log('Publishing NIP-85 events...');
    
    exec('hasenpfeffr-publish', (error, stdout, stderr) => {
        return res.json({
            success: !error,
            output: stdout || stderr
        });
    });
}

// Start the server
app.listen(port, () => {
    console.log(`Hasenpfeffr Control Panel running on port ${port}`);
});
