/**
 * Brainstorm authentication API endpoints
 * Provides handlers for user authentication and session management
 */

const crypto = require('crypto');
const fs = require('fs');
const { getConfigFromFile } = require('../utils/config');

/**
 * Verify if a pubkey belongs to the system owner
 */
function handleAuthVerify(req, res) {
    try {
        const { pubkey } = req.body;
        
        if (!pubkey) {
            return res.status(400).json({ error: 'Missing pubkey parameter' });
        }
        
        console.log(`Received authentication request from pubkey: ${pubkey}`);
        
        // Debug: Inspect the config file directly
        const confFile = '/etc/brainstorm.conf';
        let configContents = 'File not found';
        let configExists = false;
        
        try {
            if (fs.existsSync(confFile)) {
                configExists = true;
                configContents = fs.readFileSync(confFile, 'utf8');
                console.log('Config file exists. First 100 chars:', configContents.substring(0, 100) + '...');
            } else {
                console.error(`Config file does not exist at path: ${confFile}`);
            }
        } catch (configError) {
            console.error('Error accessing config file:', configError);
        }
        
        // Get owner pubkey from config
        const ownerPubkey = getConfigFromFile('BRAINSTORM_OWNER_PUBKEY');
        
        console.log(`Owner pubkey from config: '${ownerPubkey}'`);
        
        // Create detailed debug info
        const debugInfo = {
            configExists,
            configPath: confFile,
            providedKey: pubkey,
            expectedKey: ownerPubkey || 'NOT_FOUND'
        };
        
        console.log('Auth debug info:', JSON.stringify(debugInfo, null, 2));
        
        if (!ownerPubkey) {
            console.error('BRAINSTORM_OWNER_PUBKEY not set in configuration');
            return res.json({ 
                authorized: false,
                message: 'The BRAINSTORM_OWNER_PUBKEY is not set in the server configuration',
                details: {
                    providedKey: pubkey,
                    expectedKey: 'NOT_CONFIGURED',
                    configExists,
                    configPath: confFile
                }
            });
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
            // Return detailed info about why auth failed
            const responseData = { 
                authorized: false, 
                message: `Only the owner can access the control panel`, 
                details: {
                    providedKey: pubkey,
                    expectedKey: ownerPubkey,
                    keyComparison: `${pubkey.substring(0, 8)}... !== ${ownerPubkey.substring(0, 8)}...`
                }
            };
            
            console.log('Sending unauthorized response:', JSON.stringify(responseData, null, 2));
            return res.json(responseData);
        }
    } catch (error) {
        console.error('Error verifying authentication:', error);
        return res.status(500).json({ 
            error: error.message,
            stack: error.stack
        });
    }
}

/**
 * Process login request with signed challenge
 */
function handleAuthLogin(req, res) {
    try {
        const { event, nsec } = req.body;
        
        if (!event) {
            return res.status(400).json({ error: 'Missing event parameter' });
        }
        
        // Verify that the event has a signature
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

/**
 * Handle user logout by destroying session
 */
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

/**
 * Get current authentication status
 */
function handleAuthStatus(req, res) {
    const isAuthenticated = req.session && req.session.authenticated === true;
    return res.json({
        authenticated: isAuthenticated,
        pubkey: isAuthenticated ? req.session.pubkey : null
    });
}

/**
 * Simple test endpoint to debug configuration access
 * Returns the owner public key directly
 */
function handleAuthTest(req, res) {
    try {
        // Direct config file inspection
        const confFile = '/etc/brainstorm.conf';
        let fileExists = false;
        let fileContents = '';
        
        try {
            if (fs.existsSync(confFile)) {
                fileExists = true;
                fileContents = fs.readFileSync(confFile, 'utf8').substring(0, 100) + '...'; // Just the first 100 chars
            }
        } catch (e) {
            console.error('Error reading config file directly:', e);
        }
        
        // Try to get owner key using our function
        const ownerPubkey = getConfigFromFile('BRAINSTORM_OWNER_PUBKEY');
        
        return res.json({
            success: true,
            timestamp: Math.floor(Date.now() / 1000),
            ownerPubkey: ownerPubkey || 'NOT_FOUND',
            configFileExists: fileExists,
            configFilePath: confFile,
            configFilePreview: fileContents
        });
    } catch (error) {
        console.error('Error in auth test endpoint:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
}

/**
 * Check if a user is authenticated as the owner
 * @param {Object} req - Express request object
 * @returns {boolean} True if the user is the owner, false otherwise
 */
function isOwner(req) {
    // Get owner pubkey from config
    const ownerPubkey = getConfigFromFile('BRAINSTORM_OWNER_PUBKEY', '');
    
    // Check if the user is authenticated and is the owner
    return req.session && 
           req.session.authenticated &&
           req.session.pubkey &&
           req.session.pubkey === ownerPubkey;
}

/**
 * Authentication middleware
 * Handles three levels of access:
 * 1. Public access - No authentication required (read-only endpoints)
 * 2. User authentication - Any authenticated user (some write endpoints)
 * 3. Owner authentication - Only the system owner (administrative endpoints)
 */
function authMiddleware(req, res, next) {
    // Skip auth for static resources, sign-in page and auth-related endpoints
    if (req.path === '/sign-in.html' || 
        req.path === '/index.html' ||
        req.path.startsWith('/api/auth/') ||
        req.path === '/' || 
        req.path === '/control-panel.html' ||
        req.path === '/nip85.html' ||
        req.path === '/nip85-control-panel.html' ||
        !req.path.startsWith('/api/')) {
        return next();
    }
    
    // Check if user is authenticated for API calls
    if (req.session && req.session.authenticated) {
        // TODO: differentiate between owner and customer endpoints
        const customerOrOwnerEndpoints = [
            '/get-customer'
        ]
        // Define owner-only endpoints (administrative actions)
        const ownerOnlyEndpoints = [
            '/brainstorm-control',
            '/post-graperank-config',
            '/api/post-blacklist-config',
            '/post-whitelist-config',
            '/generate-blacklist',
            '/export-whitelist',
            '/generate-graperank',
            '/generate-pagerank',
            '/personalized-pagerank',
            '/generate-verified-followers',
            '/generate-reports',
            '/generate-nip85',
            '/systemd-services',
            '/toggle-strfry-filteredContent',
            '/delete-all-relationships',
            '/batch-transfer',
            '/reconciliation',
            '/calculate-hops',
            '/negentropy-sync-wot',
            '/negentropy-sync-profiles',
            '/negentropy-sync-personal',
            '/negentropy-sync',
            '/neo4j-setup-constraints-and-indexes',
            '/run-script',
            '/process-all-active-customers',
            '/create-all-customer-relays',
            '/sign-up-new-customer',
            '/delete-customer',
            '/change-customer-status',
            '/service-management/control',
            '/add-new-customer',
            '/update-customer-display-name',
            '/backup-customers',
            '/backups',
            '/backups/download',
            '/restore/upload',
            '/restore/sets',
            '/restore/customer'
        ];
        
        // Check if this endpoint requires owner authentication
        const isOwnerEndpoint = ownerOnlyEndpoints.some(endpoint => 
            req.path.includes(endpoint) && req.method === 'POST'
        );
        
        // If this is an owner-only endpoint, verify owner status
        if (isOwnerEndpoint && !isOwner(req)) {
            return res.status(403).json({ 
                error: 'Admin authentication required. Only the system owner can perform this action.'
            });
        }
        
        // User is authenticated and has appropriate permissions
        return next();
    } else {
        // For API calls that modify data, return unauthorized status
        const writeEndpoints = [
            '/post-graperank-config',
            '/api/post-blacklist-config',
            '/post-whitelist-config',
            '/generate-blacklist',
            '/export-whitelist',
            '/generate-graperank',
            '/generate-pagerank',
            '/personalized-pagerank',
            '/generate-verified-followers',
            '/generate-reports',
            '/generate-nip85',
            '/systemd-services',
            '/brainstorm-control',
            '/toggle-strfry-filteredContent',  // New endpoint for enabling/disabling
            '/delete-all-relationships',
            '/batch-transfer',
            '/reconciliation',
            '/calculate-hops',
            '/negentropy-sync-wot',
            '/negentropy-sync-profiles',
            '/negentropy-sync-personal',
            '/negentropy-sync',
            '/neo4j-setup-constraints-and-indexes',
            '/run-script',
            '/process-all-active-customers',
            '/create-all-customer-relays',
            '/sign-up-new-customer',
            '/delete-customer',
            '/change-customer-status',
            '/service-management/control',
            '/add-new-customer',
            '/update-customer-display-name',
            '/backup-customers',
            '/backups',
            '/backups/download',
            '/restore/upload',
            '/restore/sets',
            '/restore/customer'
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
}

/**
 * Verify any valid Nostr user (not just owner)
 * This endpoint allows any user with a valid pubkey to authenticate
 */
function handleAuthVerifyUser(req, res) {
    try {
        const { pubkey } = req.body;
        
        if (!pubkey) {
            return res.status(400).json({ error: 'Missing pubkey parameter' });
        }
        
        console.log(`Received user authentication request from pubkey: ${pubkey}`);
        
        // Basic validation - check if pubkey looks like a valid hex string
        if (!/^[0-9a-fA-F]{64}$/.test(pubkey)) {
            return res.json({
                authorized: false,
                message: 'Invalid pubkey format. Must be 64-character hex string.'
            });
        }
        
        // For general user authentication, we accept any valid pubkey
        // Generate a random challenge for the client to sign
        const challenge = crypto.randomBytes(32).toString('hex');
        req.session.challenge = challenge;
        req.session.pubkey = pubkey;
        
        // Check if this user is the owner for role information
        const ownerPubkey = getConfigFromFile('BRAINSTORM_OWNER_PUBKEY');
        const isOwnerUser = pubkey === ownerPubkey;
        
        return res.json({ 
            authorized: true, 
            challenge,
            isOwner: isOwnerUser,
            message: isOwnerUser ? 'Owner authentication successful' : 'User authentication successful'
        });
        
    } catch (error) {
        console.error('Error in handleAuthVerifyUser:', error);
        return res.status(500).json({ error: 'Internal server error during authentication' });
    }
}

/**
 * Login endpoint for general users (not just owner)
 * Processes the signed challenge from any authenticated user
 */
function handleAuthLoginUser(req, res) {
    try {
        const { event } = req.body;
        
        if (!event) {
            return res.status(400).json({ success: false, message: 'Missing signed event' });
        }
        
        // Verify the event signature and challenge
        const sessionChallenge = req.session.challenge;
        const sessionPubkey = req.session.pubkey;
        
        if (!sessionChallenge || !sessionPubkey) {
            return res.status(400).json({ success: false, message: 'No active authentication session' });
        }
        
        // Verify the event pubkey matches session
        if (event.pubkey !== sessionPubkey) {
            return res.status(400).json({ success: false, message: 'Event pubkey does not match session' });
        }
        
        // Verify the challenge tag
        const challengeTag = event.tags.find(tag => tag[0] === 'challenge');
        if (!challengeTag || challengeTag[1] !== sessionChallenge) {
            return res.status(400).json({ success: false, message: 'Invalid challenge in signed event' });
        }
        
        // If we get here, authentication is successful
        req.session.authenticated = true;
        req.session.userPubkey = sessionPubkey;
        
        // Check if user is owner
        const ownerPubkey = getConfigFromFile('BRAINSTORM_OWNER_PUBKEY');
        const isOwnerUser = sessionPubkey === ownerPubkey;
        req.session.isOwner = isOwnerUser;

        // Check if user is customer
        const isCustomerUser = false;
        req.session.isCustomer = isCustomerUser;
        
        // Clear the challenge
        delete req.session.challenge;
        
        console.log(`User authentication successful for pubkey: ${sessionPubkey} (owner: ${isOwnerUser})`);
        
        return res.json({ 
            success: true, 
            message: 'Authentication successful',
            isOwner: isOwnerUser,
            isCustomer: isCustomerUser,
            pubkey: sessionPubkey
        });
        
    } catch (error) {
        console.error('Error in handleAuthLoginUser:', error);
        return res.status(500).json({ success: false, message: 'Internal server error during login' });
    }
}

module.exports = {
    handleAuthVerify,
    handleAuthLogin,
    handleAuthLogout,
    handleAuthStatus,
    handleAuthTest,
    handleAuthVerifyUser,
    handleAuthLoginUser,
    authMiddleware,
    isOwner
};
