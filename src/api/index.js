/**
 * Brainstorm API module index
 * Registers all API endpoints for the Brainstorm control panel
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
    handleAuthTest 
} = require('../middleware/auth');
const { handleGetOwnerInfo } = require('./owner/ownerInfo');
const { handleGetGrapevineInteraction } = require('./grapevineInteractions/queries');
const { handleSearchProfiles } = require('./search/profiles');

// Import domain-specific handler modules
const nip85 = require('./export/nip85');
const profiles = require('./export/profiles');
const relay = require('./export/relay');
const users = require('./export/users');
const blacklist = require('./export/blacklist');
const whitelist = require('./export/whitelist');
const services = require('./export/services');
const strfry = require('./strfry');
const pipeline = require('./pipeline');
const algos = require('./algos');
const graperank = require('./export/graperank');
const manage = require('./manage');
const lists = require('./lists');
const status = require('./status');

const { handleNeo4jSetupConstraintsAndIndexes } = require('./neo4j/commands/setupConstraintsAndIndexes.js');

// Import utilities
const { getConfigFromFile } = require('../utils/config');

/**
 * Register all API endpoints with the Express app
 * @param {Object} app - Express app instance
 */
function register(app) {
    // We need to make sure session middleware is applied to the app
    // Check if it's already been applied
    if (!app._brainstormSessionConfigured) {
        console.log('Configuring session middleware for Brainstorm API...');
        
        // Load express-session only if needed
        const session = require('express-session');
        
        // Configure session middleware - this must match the main app's configuration
        app.use(session({
            secret: getConfigFromFile('SESSION_SECRET', 'brainstorm-default-session-secret-please-change-in-production'),
            resave: false,
            saveUninitialized: true,
            cookie: { secure: false } // Set secure:true if using HTTPS
        }));
        
        // Mark session as configured
        app._brainstormSessionConfigured = true;
    }
    
    // Register new modular endpoints for both paths
    // TODO: might move these to status module 
    app.get('/api/strfry-status', getStrfryStatus);

    app.get('/api/list-status', getListStatus);
    
    app.get('/api/ranking-status', getRankingStatus);
    
    app.get('/api/network-status', getNetworkStatus);
    
    // Debug endpoint for troubleshooting server issues
    app.get('/api/debug', getDebugInfo);
    
    // Authentication endpoints
    app.post('/api/auth/verify', handleAuthVerify);
    
    app.post('/api/auth/login', handleAuthLogin);
    
    app.post('/api/auth/logout', handleAuthLogout);
    
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
    app.post('/api/publish-kind10040-event', nip85.handlePublishKind10040);
    app.post('/api/publish-kind30382', nip85.handlePublishKind30382);
    // app.post('/api/publish', nip85.handlePublish);
    
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
    app.get('/api/get-nip56-profiles', users.handleGetNip56Profiles);
    app.get('/api/get-user-data', users.handleGetUserData);
    app.get('/api/get-network-proximity', users.handleGetNetworkProximity);

    // GrapeRank endpoints
    app.get('/api/get-graperank-config', graperank.handleGetGrapeRankConfig);
    app.post('/api/post-graperank-config', graperank.handleUpdateGrapeRankConfig);
    app.post('/api/generate-graperank', algos.graperank.handleGenerateGrapeRank);
    app.get('/api/get-graperank-review', graperank.handleGetGrapeRankReview);

    // Blacklist endpoints
    app.get('/api/get-blacklist-config', blacklist.handleGetBlacklistConfig);
    app.post('/api/post-blacklist-config', blacklist.handleUpdateBlacklistConfig);
    app.post('/api/generate-blacklist', blacklist.handleGenerateBlacklist);

    // Whitelist endpoints
    app.get('/api/get-whitelist-config', whitelist.handleGetWhitelistConfig);
    app.post('/api/post-whitelist-config', whitelist.handleUpdateWhitelistConfig);
    app.post('/api/export-whitelist', whitelist.handleExportWhitelist);

    // PageRank endpoints
    app.post('/api/generate-pagerank', algos.pagerank.handleGeneratePageRank);

    // Verified Followers endpoints
    app.post('/api/generate-verified-followers', algos.verifiedFollowers.handleGenerateVerifiedFollowers);

    // Reports endpoints
    app.post('/api/generate-reports', algos.reports.handleGenerateReports);

    // Services endpoints
    app.get('/api/service-status', services.handleServiceStatus);
    app.get('/api/systemd-services', services.handleSystemdServices);

    // Status endpoints - read-only operations
    app.get('/api/status', status.handleStatus);
    app.get('/api/strfry-stats', status.handleStrfryStats);
    app.get('/api/neo4j-status', status.handleNeo4jStatus);
    app.get('/api/calculation-status', status.handleCalculationStatus);
    app.get('/api/status/neo4j-constraints', status.handleGetNeo4jConstraintsStatus);

    // Strfry plugin endpoints - with clearer separation of concerns
    app.get('/api/get-strfry-filteredContent', strfry.handleGetFilteredContentStatus);  // Status query (public)
    app.post('/api/toggle-strfry-filteredContent', strfry.handleToggleStrfryPlugin);  // Toggle command (owner only)

    // List statistics endpoints - read-only operations
    app.get('/api/whitelist-stats', lists.handleGetWhitelistStats);
    app.get('/api/blacklist-count', lists.handleGetBlacklistCount);
    app.get('/api/whitelist-preview-count', lists.handleGetWhitelistPreviewCount);
    
    // Algorithm query endpoints - read-only operations
    app.get('/api/influence-count', algos.graperank.handleGetInfluenceCount);
    app.get('/api/hops-count', algos.hops.handleGetHopsCount);
    
    // Pipeline endpoints
    app.post('/api/batch-transfer', pipeline.handleBatchTransfer);
    app.post('/api/reconciliation', pipeline.handleReconciliation);
    app.post('/api/negentropy-sync', pipeline.handleNegentropySync);

    // Algos endpoint
    app.post('/api/calculate-hops', algos.hops.handleCalculateHops);

    // Negentropy sync endpoints
    app.post('/api/negentropy-sync-wot', manage.handleNegentropySyncWoT);
    app.post('/api/negentropy-sync-profiles', manage.handleNegentropySyncProfiles);
    app.post('/api/negentropy-sync-personal', manage.handleNegentropySyncPersonal);

    // Add route handler for Brainstorm control
    app.post('/api/brainstorm-control', manage.handleBrainstormControl);

    // Add route handler for running service management scripts
    app.post('/api/run-script', manage.handleRunScript);

    // Neo4j endpoints
    app.post('/api/neo4j-setup-constraints-and-indexes', handleNeo4jSetupConstraintsAndIndexes);

    // Owner info endpoint
    app.get('/api/owner-info', handleGetOwnerInfo);

    // Grapevine Interactions endpoint
    app.get('/api/get-grapevine-interaction', handleGetGrapevineInteraction);

    // Search endpoint
    app.get('/api/search/profiles', handleSearchProfiles);

    console.log('Registered all Brainstorm API endpoints');
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
