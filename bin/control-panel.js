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
        const filePath = path.join(__dirname, '../public/pages', filename);
        console.log(`Attempting to serve HTML file: ${filename} from path: ${filePath}`);
        if (fs.existsSync(filePath)) {
            console.log(`File exists, sending: ${filePath}`);
            res.sendFile(filePath);
        } else {
            console.log(`File not found: ${filePath}`);
            res.status(404).send('File not found: ' + filename);
        }
    } catch (err) {
        console.error('Error serving HTML file:', err);
        res.status(500).send('Server error');
    }
}

// Debug middleware to log all requests
app.use((req, res, next) => {
    console.log(`Request received: ${req.method} ${req.url}`);
    next();
});

// Define HTML routes BEFORE static middleware to prevent conflicts
// Serve the HTML files
app.get('/', (req, res) => {
    console.log('Root route handler');
    serveHtmlFile('index.html', res);
});

app.get('/control', (req, res) => {
    console.log('/control route handler');
    serveHtmlFile('index.html', res);
});

// Main pages with original URLs
app.get('/control/index.html', (req, res) => {
    console.log('/control/index.html route handler');
    serveHtmlFile('index.html', res);
});

app.get('/control/overview.html', (req, res) => {
    serveHtmlFile('overview.html', res);
});

app.get('/control/control-panel.html', (req, res) => {
    serveHtmlFile('control-panel.html', res);
});

app.get('/control/neo4j-control-panel.html', (req, res) => {
    serveHtmlFile('neo4j-control-panel.html', res);
});

app.get('/control/nip85-control-panel.html', (req, res) => {
    serveHtmlFile('nip85-control-panel.html', res);
});

app.get('/control/graperank-control-panel.html', (req, res) => {
    serveHtmlFile('graperank-control-panel.html', res);
});

app.get('/control/blacklist-control-panel.html', (req, res) => {
    serveHtmlFile('blacklist-control-panel.html', res);
});

app.get('/control/whitelist-control-panel.html', (req, res) => {
    serveHtmlFile('whitelist-control-panel.html', res);
});

app.get('/control/profiles-control-panel.html', (req, res) => {
    serveHtmlFile('profiles-control-panel.html', res);
});

app.get('/control/network-visualization-lite.html', (req, res) => {
    serveHtmlFile('network-visualization-lite.html', res);
});

app.get('/control/profile.html', (req, res) => {
    serveHtmlFile('profile.html', res);
});

app.get('/control/sign-in.html', (req, res) => {
    serveHtmlFile('sign-in.html', res);
});

app.get('/control/home.html', (req, res) => {
    serveHtmlFile('home.html', res);
});

// For backward compatibility, redirect old URLs without /control prefix
app.get('/control-panel.html', (req, res) => {
    res.redirect('/control/control-panel.html');
});

app.get('/nip85-control-panel.html', (req, res) => {
    res.redirect('/control/nip85-control-panel.html');
});

app.get('/sign-in.html', (req, res) => {
    res.redirect('/control/sign-in.html');
});

app.get('/overview.html', (req, res) => {
    res.redirect('/control/overview.html');
});

app.get('/home.html', (req, res) => {
    res.redirect('/control/home.html');
});

app.get('/index.html', (req, res) => {
    res.redirect('/control/index.html');
});

app.get('/control/profiles', (req, res) => {
    res.redirect('/control/profiles-control-panel.html');
});

// Handle /pages/ URLs - don't redirect, just serve the file
app.get('/control/pages/:file', (req, res) => {
    serveHtmlFile(req.params.file, res);
});

// Serve static files from the public directory with proper MIME types
// IMPORTANT: Static middleware comes AFTER route definitions to prevent conflicts
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

// Also serve /control/ static files but EXCLUDE the HTML files we're serving via routes
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

// Authentication middleware
const authMiddleware = (req, res, next) => {
    // Skip auth for static resources, sign-in page and auth-related endpoints
    if (req.path === '/sign-in.html' || 
        req.path === '/index.html' ||
        req.path.startsWith('/api/auth/') ||
        req.path === '/' || 
        req.path.startsWith('/control/') ||
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