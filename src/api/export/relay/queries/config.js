/**
 * Relay Configuration Queries
 * Handles retrieval of relay configuration information
 */

const { getConfigFromFile } = require('../../../../utils/config');

/**
 * Get relay configuration
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetRelayConfig(req, res) {
    console.log('Getting relay configuration...');
    
    try {
        // Get relay configuration from brainstorm.conf
        const relayUrl = getConfigFromFile('BRAINSTORM_RELAY_URL', '');
        const relayPubkey = getConfigFromFile('BRAINSTORM_RELAY_PUBKEY', '');
        
        // Return the configuration
        res.json({
            success: true,
            relayUrl: relayUrl,
            relayPubkey: relayPubkey
        });
    } catch (error) {
        console.error('Error getting relay configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get relay configuration: ' + error.message
        });
    }
}

module.exports = {
    handleGetRelayConfig
};
