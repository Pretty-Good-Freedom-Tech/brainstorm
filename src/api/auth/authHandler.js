/**
 * Hasenpfeffr authentication API endpoints
 * Provides handlers for user authentication and session management
 */

const crypto = require('crypto');
const fs = require('fs');

// Get configuration values directly from /etc/hasenpfeffr.conf
function getConfigFromFile(varName, defaultValue = null) {
    try {
        const confFile = '/etc/hasenpfeffr.conf';
        if (fs.existsSync(confFile)) {
            // Read the file content directly
            const fileContent = fs.readFileSync(confFile, 'utf8');
            console.log(`Auth module: Reading config for ${varName} from ${confFile}`);
            
            // Look for the variable in the file content
            const regex = new RegExp(`${varName}=[\"\'](.*?)[\"\']`, 'gm');
            const match = regex.exec(fileContent);
            
            if (match && match[1]) {
                console.log(`Auth module: Found ${varName}=${match[1]}`);
                return match[1];
            }
        } else {
            console.error(`Auth module: Config file not found at ${confFile}`);
        }
    } catch (error) {
        console.error(`Auth module: Error reading config for ${varName}:`, error);
    }
    
    // If we get here, we couldn't find the variable in the config file
    console.log(`Auth module: Using default value for ${varName}: ${defaultValue}`);
    return defaultValue;
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
        
        // Debug: Inspect the config file directly
        const confFile = '/etc/hasenpfeffr.conf';
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
        const ownerPubkey = getConfigFromFile('HASENPFEFFR_OWNER_PUBKEY');
        
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
            console.error('HASENPFEFFR_OWNER_PUBKEY not set in configuration');
            return res.json({ 
                authorized: false,
                message: 'The HASENPFEFFR_OWNER_PUBKEY is not set in the server configuration',
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
        const confFile = '/etc/hasenpfeffr.conf';
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
        const ownerPubkey = getConfigFromFile('HASENPFEFFR_OWNER_PUBKEY');
        
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
    handleAuthTest,
    authMiddleware
};
