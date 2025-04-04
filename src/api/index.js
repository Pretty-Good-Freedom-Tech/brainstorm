/**
 * Hasenpfeffr API module index
 * Registers all API endpoints for the Hasenpfeffr control panel
 */

// Import API modules
const { getStrfryStatus } = require('./strfry/strfryStatus');
const { getNeo4jStatus } = require('./neo4j/neo4jStatus');
const { getListStatus } = require('./lists/listStatus');
const { getRankingStatus } = require('./ranking/rankingStatus');
const { getNetworkStatus } = require('./network/networkStatus');
const { getDebugInfo } = require('./debug');
const { 
    handleAuthVerify, 
    handleAuthLogin, 
    handleAuthLogout, 
    handleAuthStatus,
    handleAuthTest,
    authMiddleware 
} = require('./auth/authHandler');

// Import domain-specific handler modules
const nip85 = require('./export/nip85');

// Import utilities
const { getConfigFromFile } = require('../utils/config');

/**
 * Register all API endpoints with the Express app
 * @param {Object} app - Express app instance
 */
function register(app) {
    // We need to make sure session middleware is applied to the app
    // Check if it's already been applied
    if (!app._hasenpfeffrSessionConfigured) {
        console.log('Configuring session middleware for Hasenpfeffr API...');
        
        // Load express-session only if needed
        const session = require('express-session');
        
        // Configure session middleware - this must match the main app's configuration
        app.use(session({
            secret: getConfigFromFile('SESSION_SECRET', 'hasenpfeffr-default-session-secret-please-change-in-production'),
            resave: false,
            saveUninitialized: true,
            cookie: { secure: false } // Set secure:true if using HTTPS
        }));
        
        // Mark session as configured
        app._hasenpfeffrSessionConfigured = true;
    }
    
    // Register new modular endpoints for both paths
    app.get('/api/strfry-status', getStrfryStatus);
    app.get('/control/api/strfry-status', getStrfryStatus);
    
    app.get('/api/neo4j-status', getNeo4jStatus);
    app.get('/control/api/neo4j-status', getNeo4jStatus);
    
    app.get('/api/list-status', getListStatus);
    app.get('/control/api/list-status', getListStatus);
    
    app.get('/api/ranking-status', getRankingStatus);
    app.get('/control/api/ranking-status', getRankingStatus);
    
    app.get('/api/network-status', getNetworkStatus);
    app.get('/control/api/network-status', getNetworkStatus);
    
    // Debug endpoint for troubleshooting server issues
    app.get('/api/debug', getDebugInfo);
    app.get('/control/api/debug', getDebugInfo);
    
    // Authentication endpoints
    app.post('/api/auth/verify', handleAuthVerify);
    app.post('/control/api/auth/verify', handleAuthVerify);
    
    app.post('/api/auth/login', handleAuthLogin);
    app.post('/control/api/auth/login', handleAuthLogin);
    
    app.get('/api/auth/logout', handleAuthLogout);
    app.get('/control/api/auth/logout', handleAuthLogout);
    
    app.get('/api/auth/status', handleAuthStatus);
    app.get('/control/api/auth/status', handleAuthStatus);
    
    // Test endpoint for debugging authentication
    app.get('/api/auth/test', handleAuthTest);
    app.get('/control/api/auth/test', handleAuthTest);
    
    // Backward compatibility endpoint that calls all endpoints and combines results
    app.get('/api/instance-status', handleGetInstanceStatus);
    app.get('/control/api/instance-status', handleGetInstanceStatus);
    
    // Register all domain-specific endpoints in the central router
    
    // NIP-85 endpoints 
    // Command endpoints (write operations requiring authentication)
    app.post('/api/generate-nip85', nip85.handleGenerateNip85);
    app.post('/api/create-kind10040', nip85.handleCreateKind10040);
    app.post('/api/publish-kind10040', nip85.handlePublishKind10040);
    app.post('/api/publish-kind30382', nip85.handlePublishKind30382);
    
    // Query endpoints (read operations)
    app.get('/api/get-kind10040-event', nip85.handleGetKind10040Event);
    app.get('/api/kind10040-info', nip85.handleKind10040Info);
    app.get('/api/kind30382-info', nip85.handleKind30382Info);

    console.log('Registered all Hasenpfeffr API endpoints');
}

/**
 * Legacy handler for combined instance status
 * This maintains backward compatibility while each endpoint is migrated
 */
async function handleGetInstanceStatus(req, res) {
    console.log('Getting comprehensive instance status (legacy endpoint)');
    
    // Create a result object to combine all endpoint results
    const result = {
        success: true,
        timestamp: Math.floor(Date.now() / 1000)
    };
    
    try {
        // Function to make a GET request to another endpoint
        const fetchEndpoint = (endpoint) => {
            return new Promise((resolve, reject) => {
                // Create a mock request and response to capture the endpoint's output
                const mockReq = { ...req };
                const mockRes = {
                    json: (data) => resolve(data)
                };
                
                // Call the handler directly
                endpoint(mockReq, mockRes);
            });
        };
        
        // Fetch data from all endpoints in parallel
        const [strfryData, neo4jData, listData, rankingData, networkData] = await Promise.all([
            fetchEndpoint(getStrfryStatus),
            fetchEndpoint(getNeo4jStatus),
            fetchEndpoint(getListStatus),
            fetchEndpoint(getRankingStatus),
            fetchEndpoint(getNetworkStatus)
        ]);
        
        // Combine the results
        result.strfry = strfryData;
        result.neo4j = neo4jData;
        result.whitelist = listData.whitelist;
        result.blacklist = listData.blacklist;
        result.grapeRank = rankingData.grapeRank;
        result.pageRank = rankingData.pageRank;
        result.followsNetwork = networkData;
        
        console.log('Combined instance status data collected successfully');
        res.json(result);
    } catch (error) {
        console.error('Error collecting combined instance status data:', error);
        result.success = false;
        result.error = error.message;
        res.json(result);
    }
}

module.exports = {
    register,
    handleGetInstanceStatus
};
