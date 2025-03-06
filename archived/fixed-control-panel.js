#!/usr/bin/env node

/**
 * Hasenpfeffr Control Panel
 * 
 * ARCHIVED: This file is being archived on March 5, 2025 as part of a codebase cleanup.
 * The active version of this file is now maintained at bin/control-panel.js.
 * This appears to be a fixed version of the control panel that was created during development.
 * 
 * This script starts the Hasenpfeffr Control Panel web interface
 * and API server for managing NIP-85 data generation and publication.
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const { exec } = require('child_process');

// Import configuration
try {
  const config = require('../lib/config.js');
  console.log('Configuration loaded successfully');
} catch (error) {
  console.warn('Could not load configuration:', error.message);
}

// Create Express app
const app = express();
const port = process.env.CONTROL_PANEL_PORT || 7778;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the control panel HTML file
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, '../public/control-panel.html');
    console.log('Looking for HTML file at:', htmlPath);
    
    if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
    } else {
        res.status(404).send('Control panel HTML file not found. Looked at: ' + htmlPath);
    }
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
