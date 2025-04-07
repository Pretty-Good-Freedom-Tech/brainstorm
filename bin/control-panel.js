#!/usr/bin/env node

/**
 * Hasenpfeffr Control Panel
 * 
 * This script starts the Hasenpfeffr Control Panel web interface
 * and API server for managing NIP-85 data generation and publication.
 */

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
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

// Session middleware
app.use(session({
    secret: getConfigFromFile('SESSION_SECRET', 'hasenpfeffr-default-session-secret-please-change-in-production'),
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Helper function to serve HTML files
function serveHtmlFile(filename, res) {
    console.log(`[SERVER] Attempting to serve file: ${filename}`);
    
    try {
        // Build all possible file paths to check
        const pagesPath = path.join(__dirname, '../public/pages', filename);
        const originalPath = path.join(__dirname, '../public', filename);
        
        console.log(`[SERVER] Checking paths:
            Pages path: ${pagesPath}
            Original path: ${originalPath}`);
        
        // Check if files exist
        const pagesExists = fs.existsSync(pagesPath);
        const originalExists = fs.existsSync(originalPath);
        
        console.log(`[SERVER] File existence:
            In pages directory: ${pagesExists}
            In original directory: ${originalExists}`);
        
        // Determine which file to serve
        if (pagesExists) {
            console.log(`[SERVER] Serving from pages directory: ${pagesPath}`);
            res.sendFile(pagesPath);
        } else if (originalExists) {
            console.log(`[SERVER] Serving from original directory: ${originalPath}`);
            res.sendFile(originalPath);
        } else {
            console.log(`[SERVER] File not found in either location: ${filename}`);
            res.status(404).send(`File not found: ${filename}<br>
                Checked pages path: ${pagesPath}<br>
                Checked original path: ${originalPath}`);
        }
    } catch (error) {
        console.error(`[SERVER] Error serving HTML file: ${error.message}`);
        res.status(500).send(`Internal server error: ${error.message}`);
    }
}

// Serve the HTML files - consolidated approach
// Root path serves index.html
app.get('/', (req, res) => {
    serveHtmlFile('index.html', res);
});

// Generic handler for all HTML files
app.get('/:filename.html', (req, res) => {
    const filename = req.params.filename + '.html';
    console.log(`[SERVER] Route hit: /${filename}`);
    serveHtmlFile(filename, res);
});

/*
// Handle any /control/ prefixed routes - maintain backward compatibility
app.get('/control/:filename.html', (req, res) => {
    const filename = req.params.filename + '.html';
    console.log(`[SERVER] Control route hit: /control/${filename}`);
    serveHtmlFile(filename, res);
});

// Handle special case for /control
app.get('/control', (req, res) => {
    console.log(`[SERVER] Control root route hit`);
    serveHtmlFile('nip85-control-panel.html', res);
});
*/.

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

// Start the server
app.listen(port, () => {
    console.log(`Hasenpfeffr Control Panel running on port ${port}`);
});

// Export utility functions for testing and reuse
module.exports = {
    getConfigFromFile,
    getNeo4jConnection
};