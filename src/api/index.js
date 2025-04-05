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
const profiles = require('./export/profiles');
const relay = require('./export/relay');
const users = require('./export/users');
const graperank = require('./export/graperank');
const blacklist = require('./export/blacklist');
const whitelist = require('./export/whitelist');
const services = require('./export/services');
const strfry = require('./strfry');
const pipeline = require('./pipeline');
const algos = require('./algos');

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
    
    app.get('/api/neo4j-status', getNeo4jStatus);
    
    app.get('/api/list-status', getListStatus);
    
    app.get('/api/ranking-status', getRankingStatus);
    
    app.get('/api/network-status', getNetworkStatus);
    
    // Debug endpoint for troubleshooting server issues
    app.get('/api/debug', getDebugInfo);
    
    // Authentication endpoints
    app.post('/api/auth/verify', handleAuthVerify);
    
    app.post('/api/auth/login', handleAuthLogin);
    
    app.get('/api/auth/logout', handleAuthLogout);
    
    app.get('/api/auth/status', handleAuthStatus);
    
    // Test endpoint for debugging authentication
    app.get('/api/auth/test', handleAuthTest);
    
    // Backward compatibility endpoint that calls all endpoints and combines results
    app.get('/api/instance-status', handleGetInstanceStatus);
    
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

    // Profiles endpoint
    app.get('/api/get-kind0', profiles.handleGetKind0Event);

    // Relay endpoint
    app.get('/api/relay-config', relay.handleGetRelayConfig);

    // Users endpoints
    app.get('/api/get-profiles', users.handleGetProfiles);
    app.get('/api/get-user-data', users.handleGetUserData);
    app.get('/api/get-network-proximity', users.handleGetNetworkProximity);

    // GrapeRank endpoints
    app.get('/api/get-graperank-config', graperank.handleGetGrapeRankConfig);
    app.post('/api/post-graperank-config', graperank.handleUpdateGrapeRankConfig);
    app.post('/api/generate-graperank', graperank.handleGenerateGrapeRank);

    // Blacklist endpoints
    app.get('/api/get-blacklist-config', blacklist.handleGetBlacklistConfig);
    app.post('/api/post-blacklist-config', blacklist.handleUpdateBlacklistConfig);
    app.post('/api/generate-blacklist', blacklist.handleGenerateBlacklist);

    // Whitelist endpoints
    app.get('/api/get-whitelist-config', whitelist.handleGetWhitelistConfig);
    app.post('/api/post-whitelist-config', whitelist.handleUpdateWhitelistConfig);
    app.post('/api/export-whitelist', whitelist.handleExportWhitelist);

    // PageRank endpoints
    app.post('/api/generate-pagerank', algos.handleGeneratePageRank);

    // Services endpoints
    app.get('/api/service-status', services.handleServiceStatus);
    app.get('/api/systemd-services', services.handleSystemdServices);

    // Strfry plugin endpoints - split into query and command
    app.get('/api/strfry-plugin', strfry.handleGetPluginStatus);  // Status query (public)
    app.post('/api/strfry-plugin', strfry.handleToggleStrfryPlugin);  // Toggle command (owner only)

    // Pipeline endpoints
    app.post('/api/batch-transfer', pipeline.handleBatchTransfer);
    app.post('/api/reconciliation', pipeline.handleReconciliation);

    // Algos endpoint
    app.post('/api/calculate-hops', algos.handleCalculateHops);

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
