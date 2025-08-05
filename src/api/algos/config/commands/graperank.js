/**
 * GrapeRank Configuration Command Handler
 * Provides API endpoint to update GrapeRank configuration for customers
 */

const CustomerManager = require('../../../../utils/customerManager');
const { getConfigFromFile } = require('../../../../utils/config');

/**
 * Handle POST request for updating GrapeRank configuration
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleUpdateGrapeRankConfig(req, res) {
    try {
        // Extract pubkey and setPreset from query parameters
        const { pubkey, setPreset } = req.query;
        
        // Also check request body for preset (fallback)
        const { preset: bodyPreset } = req.body || {};
        const newPreset = setPreset || bodyPreset;

        if (!pubkey) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: pubkey'
            });
        }

        if (!newPreset) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: setPreset (or preset in body)'
            });
        }

        // Validate pubkey format (basic hex validation)
        if (!/^[0-9a-fA-F]{64}$/.test(pubkey)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid pubkey format. Must be 64-character hex string.'
            });
        }

        // Validate preset value
        const validPresets = ['permissive', 'default', 'restrictive'];
        if (!validPresets.includes(newPreset.toLowerCase())) {
            return res.status(400).json({
                success: false,
                error: `Invalid preset. Must be one of: ${validPresets.join(', ')}`
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

        // Update the GrapeRank preset
        const updateResult = await customerManager.updateGrapeRankPreset(pubkey, newPreset.toLowerCase());
        
        if (updateResult.success) {
            // Return successful response
            res.json({
                success: true,
                message: updateResult.message,
                data: {
                    pubkey,
                    oldPreset: updateResult.oldPreset,
                    newPreset: updateResult.newPreset,
                    customer: updateResult.customer,
                    configPath: updateResult.configPath,
                    timestamp: updateResult.timestamp
                }
            });
        } else {
            // Return error response with appropriate status code
            const statusCode = updateResult.error.includes('does not exist') ? 404 :
                             updateResult.error.includes('Invalid preset') ? 400 :
                             updateResult.error.includes('configuration file') ? 404 : 500;
            
            res.status(statusCode).json({
                success: false,
                error: updateResult.error,
                details: {
                    pubkey,
                    customer: updateResult.customer,
                    configPath: updateResult.configPath
                }
            });
        }

    } catch (error) {
        console.error('Error in handleUpdateGrapeRankConfig:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
}

module.exports = {
    handleUpdateGrapeRankConfig
};
