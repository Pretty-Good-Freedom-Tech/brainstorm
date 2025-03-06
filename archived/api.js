#!/usr/bin/env node

/**
 * Hasenpfeffr Control Panel API
 * 
 * ARCHIVED: This file is being archived on March 5, 2025 as part of a codebase cleanup.
 * The active version of this functionality is now maintained at bin/control-panel.js.
 * 
 * This script provides the API endpoints for the Hasenpfeffr Control Panel.
 */

const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const app = express();
const port = 7778;

// Middleware to parse JSON requests
app.use(express.json());

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

// API endpoint to initialize the database
app.post('/api/init-db', (req, res) => {
    console.log('Initializing database...');
    
    const command = 'sudo strfry sync wss://relay.primal.net --dir down --filter \'{"kinds":[3,1984,10000]}\'';
    
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error initializing database: ${error.message}`);
            return res.json({
                success: false,
                error: error.message,
                output: stderr || stdout
            });
        }
        
        console.log('Database initialized successfully');
        return res.json({
            success: true,
            output: stdout
        });
    });
});

// API endpoint to check the status of the strfry relay
app.get('/api/status', (req, res) => {
    console.log('Checking status...');
    
    exec('systemctl status strfry', (error, stdout, stderr) => {
        return res.json({
            output: stdout || stderr
        });
    });
});

// API endpoint to generate NIP-85 data
app.post('/api/generate', (req, res) => {
    console.log('Generating NIP-85 data...');
    
    exec('cd ~/hasenpfeffr && HASENPFEFFR_RELAY_URL=wss://relay4.hasenpfeffr.com HASENPFEFFR_RELAY_PUBKEY=test-pubkey npm run generate', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error generating data: ${error.message}`);
            return res.json({
                success: false,
                error: error.message,
                output: stderr || stdout
            });
        }
        
        console.log('NIP-85 data generated successfully');
        return res.json({
            success: true,
            output: stdout
        });
    });
});

// API endpoint to publish NIP-85 events
app.post('/api/publish', (req, res) => {
    console.log('Publishing NIP-85 events...');
    
    exec('cd ~/hasenpfeffr && HASENPFEFFR_RELAY_URL=wss://relay4.hasenpfeffr.com HASENPFEFFR_RELAY_PUBKEY=test-pubkey npm run publish', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error publishing events: ${error.message}`);
            return res.json({
                success: false,
                error: error.message,
                output: stderr || stdout
            });
        }
        
        console.log('NIP-85 events published successfully');
        return res.json({
            success: true,
            output: stdout
        });
    });
});

// Serve the control panel
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'control-panel.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Hasenpfeffr Control Panel API running on port ${port}`);
});
