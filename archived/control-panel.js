#!/usr/bin/env node

/**
 * Hasenpfeffr Control Panel
 * 
 *  ARCHIVED: This file is being archived on March 5, 2025 as part of a codebase cleanup.
 * The active version of this file is now maintained at bin/control-panel.js.
 * 
 * This script starts the Hasenpfeffr Control Panel web interface
 * and API server for managing NIP-85 data generation and publication.
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const { exec } = require('child_process');

// Import configuration
const config = require('./config');

// Create Express app
const app = express();
const port = process.env.CONTROL_PANEL_PORT || 7778;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the control panel HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/control-panel.html'));
});

// API endpoint to check system status
app.get('/api/status', (req, res) => {
    console.log('Checking status...');
    
    exec('systemctl status strfry', (error, stdout, stderr) => {
        return res.json({
            output: stdout || stderr
        });
    });
});

// API endpoint to get strfry event statistics
app.get('/api/strfry-stats', (req, res) => {
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
            let command;
            if (!kindFilter) {
                command = `sudo strfry scan --count '{}'`;
            } else {
                command = `sudo strfry scan --count '{ "kinds": [${kindFilter}]}'`;
            }
            
            exec(command, (error, stdout, stderr) => {
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
});

// API endpoint to get Neo4j status information
app.get('/api/neo4j-status', (req, res) => {
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
});

// API endpoint to initialize database
app.post('/api/init-db', (req, res) => {
    console.log('Initializing database...');
    
    exec('bash /usr/local/bin/hasenpfeffr-init-db.sh', (error, stdout, stderr) => {
        return res.json({
            success: !error,
            output: stdout || stderr
        });
    });
});

// API endpoint to generate NIP-85 data
app.post('/api/generate', (req, res) => {
    console.log('Generating NIP-85 data...');
    
    exec('hasenpfeffr-generate', (error, stdout, stderr) => {
        return res.json({
            success: !error,
            output: stdout || stderr
        });
    });
});

// API endpoint to publish NIP-85 events
app.post('/api/publish', (req, res) => {
    console.log('Publishing NIP-85 events...');
    
    exec('hasenpfeffr-publish', (error, stdout, stderr) => {
        return res.json({
            success: !error,
            output: stdout || stderr
        });
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Hasenpfeffr Control Panel running on port ${port}`);
});
