/**
 * Authentication Utilities
 * Provides authentication functions for API endpoints
 */

const { getConfigFromFile } = require('./config');

/**
 * Check if the user is authenticated as the owner
 * @param {Object} req - Express request object
 * @returns {boolean} True if authenticated as the owner, false otherwise
 */
function isOwner(req) {
    // Get the owner's pubkey from the configuration
    const ownerPubkey = getConfigFromFile('HASENPFEFFR_OWNER_PUBKEY', '');
    
    return req.session && 
           req.session.authenticated && 
           req.session.pubkey && 
           req.session.pubkey === ownerPubkey;
}

/**
 * Check if the user is authenticated (any user, not necessarily the owner)
 * @param {Object} req - Express request object
 * @returns {boolean} True if authenticated, false otherwise
 */
function isAuthenticated(req) {
    return req.session && req.session.authenticated;
}

/**
 * Middleware to require owner authentication for admin actions
 * @param {Object} req - Express request object 
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function requireOwner(req, res, next) {
    if (!isOwner(req)) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required. Only the owner can perform this action.'
        });
    }
    next();
}

/**
 * Middleware to require any authentication
 * @param {Object} req - Express request object 
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function requireAuthentication(req, res, next) {
    if (!isAuthenticated(req)) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required.'
        });
    }
    next();
}

module.exports = {
    isOwner,
    isAuthenticated,
    requireOwner,
    requireAuthentication
};
