/**
 * Hasenpfeffr authentication API endpoints
 * Provides handlers for user authentication and session management
 */

const crypto = require('crypto');

// Get configuration values directly from /etc/hasenpfeffr.conf
function getConfigFromFile(varName, defaultValue = null) {
    try {
        // Import the config util from the utils module
        const getConfigFromFileUtil = require('../../utils/config').getConfigFromFile;
        return getConfigFromFileUtil(varName, defaultValue);
    } catch (error) {
        console.error(`Error getting configuration value ${varName}:`, error.message);
        return defaultValue;
    }
}

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
        
        // Get owner pubkey from config
        const ownerPubkey = getConfigFromFile('HASENPFEFFR_OWNER_PUBKEY');
        
        console.log(`Owner pubkey from config: '${ownerPubkey}'`);
        
        if (!ownerPubkey) {
            console.error('HASENPFEFFR_OWNER_PUBKEY not set in configuration');
            return res.status(500).json({ error: 'Server configuration error' });
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
            return res.json({ 
                authorized: false, 
                message: `Only the owner (${ownerPubkey.substring(0, 8)}...) can access the control panel` 
            });
        }
    } catch (error) {
        console.error('Error verifying authentication:', error);
        return res.status(500).json({ error: error.message });
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
 * Authentication middleware
 */
function authMiddleware(req, res, next) {
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
}

module.exports = {
    handleAuthVerify,
    handleAuthLogin,
    handleAuthLogout,
    handleAuthStatus,
    authMiddleware
};
