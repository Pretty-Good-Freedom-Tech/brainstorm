/**
 * Owner Information API handler
 * Provides information about the relay owner
 */

const { getConfigFromFile } = require('../../utils/config');

/**
 * Handle request for owner information
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetOwnerInfo(req, res) {
    try {
        // Get owner pubkey and npub from configuration
        const ownerPubkey = getConfigFromFile('HASENPFEFFR_OWNER_PUBKEY');
        const ownerNpub = getConfigFromFile('HASENPFEFFR_OWNER_NPUB');
        
        // Return owner information
        res.json({
            success: true,
            ownerPubkey,
            ownerNpub
        });
    } catch (error) {
        console.error('Error getting owner information:', error);
        res.status(500).json({
            success: false,
            error: 'Error retrieving owner information'
        });
    }
}

module.exports = {
    handleGetOwnerInfo
};
