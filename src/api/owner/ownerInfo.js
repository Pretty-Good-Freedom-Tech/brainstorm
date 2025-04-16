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
        const ownerPubkey = getConfigFromFile('BRAINSTORM_OWNER_PUBKEY');
        const ownerNpub = getConfigFromFile('BRAINSTORM_OWNER_NPUB');
        const domainName = getConfigFromFile('STRFRY_DOMAIN');
        
        // Return owner information
        res.json({
            success: true,
            ownerPubkey,
            ownerNpub,
            domainName
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
