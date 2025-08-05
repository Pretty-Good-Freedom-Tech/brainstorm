/**
 * GrapeRank Configuration Query Handler
 * Provides API endpoint to get GrapeRank preset information for customers
 */

const CustomerManager = require('../../../../utils/customerManager');
const { getConfigFromFile } = require('../../../../utils/config');

/**
 * Handle GET request for GrapeRank configuration preset
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleGetGrapeRankConfig(req, res) {
    try {
        // Extract pubkey from query parameters
        const { pubkey } = req.query;

        if (!pubkey) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: pubkey'
            });
        }

        // Validate pubkey format (basic hex validation)
        if (!/^[0-9a-fA-F]{64}$/.test(pubkey)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid pubkey format. Must be 64-character hex string.'
            });
        }

        // Initialize CustomerManager
        let customersDir = '/var/lib/brainstorm/customers'; // Default fallback
        try {
            const config = getConfigFromFile();
            if (config && config.BRAINSTORM_CUSTOMERS_DIR) {
                customersDir = config.BRAINSTORM_CUSTOMERS_DIR;
            }
        } catch (configError) {
            console.log('Config loading failed, using default customers directory:', customersDir);
        }
        
        const customerManager = new CustomerManager({
            customersDir
        });
        await customerManager.initialize();

        // Get GrapeRank preset for the customer
        const presetResult = await customerManager.getGrapeRankPreset(pubkey);

        // Return successful response
        res.json({
            success: true,
            data: {
                pubkey,
                timestamp: new Date().toISOString(),
                grapeRankConfig: presetResult
            }
        });

    } catch (error) {
        console.error('Error in handleGetGrapeRankConfig:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
}

module.exports = {
    handleGetGrapeRankConfig
};
