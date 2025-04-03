/**
 * Authentication Middleware
 * Provides middleware functions for authentication and authorization
 */

const { getConfigFromFile } = require('../../utils/config');

/**
 * Middleware to require authentication for protected routes
 * Only the owner with a verified Nostr key can access protected routes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function requireAuthentication(req, res, next) {
    // Check if the user is authenticated
    if (!req.session || !req.session.authenticated) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required. Only the owner can perform this action.'
        });
    }
    
    // Check if the authenticated pubkey matches the owner's pubkey
    const ownerPubkey = getConfigFromFile('HASENPFEFFR_OWNER_PUBKEY');
    if (req.session.pubkey !== ownerPubkey) {
        return res.status(403).json({
            success: false,
            message: 'Only the owner can perform this action.'
        });
    }
    
    // User is authenticated and authorized, proceed to the route handler
    next();
}

/**
 * Middleware to check if the user is authenticated
 * Does not block access, but adds authentication status to request object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function checkAuthentication(req, res, next) {
    // Check if the user is authenticated
    const isAuthenticated = !!(req.session && req.session.authenticated);
    const ownerPubkey = getConfigFromFile('HASENPFEFFR_OWNER_PUBKEY');
    const isOwner = isAuthenticated && (req.session.pubkey === ownerPubkey);
    
    // Add authentication info to request object
    req.authInfo = {
        isAuthenticated,
        isOwner,
        pubkey: isAuthenticated ? req.session.pubkey : null
    };
    
    // Proceed to the route handler
    next();
}

module.exports = {
    requireAuthentication,
    checkAuthentication
};
