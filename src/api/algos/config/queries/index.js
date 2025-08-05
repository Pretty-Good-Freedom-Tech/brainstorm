/**
 * Generic Configuration Query Handler
 * Handles GET requests for any algorithm configuration type
 * Usage: /api/algos/config/get?pubkey=<customer_pubkey>&configType=<config_type>
 */

const { CustomerManager } = require('../../../../utils/customerManager');
const { getConfigFromFile } = require('../../../../utils/config');

/**
 * Handle GET request for any configuration type
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleGetConfig(req, res) {
    try {
        // Extract pubkey and configType from query parameters
        const { pubkey, configType } = req.query;

        if (!pubkey) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: pubkey'
            });
        }

        if (!configType) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: configType'
            });
        }

        // Validate pubkey format (basic hex validation)
        if (!/^[0-9a-fA-F]{64}$/.test(pubkey)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid pubkey format. Must be 64-character hex string.'
            });
        }

        // Validate configType format (alphanumeric, no special chars except underscore)
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(configType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid configType format. Must be alphanumeric string starting with letter.'
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

        // Get the configuration preset
        const presetData = await customerManager.getConfigPreset(pubkey, configType);
        
        // Return the preset data
        res.json({
            success: true,
            data: presetData
        });

    } catch (error) {
        console.error('Error in handleGetConfig:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
}

module.exports = {
    handleGetConfig
};
