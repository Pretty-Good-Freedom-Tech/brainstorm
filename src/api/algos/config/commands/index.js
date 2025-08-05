/**
 * Generic Configuration Command Handler
 * Handles POST requests for updating any algorithm configuration type
 * Usage: /api/algos/config/update?pubkey=<customer_pubkey>&configType=<config_type>&setPreset=<preset>
 */

const CustomerManager = require('../../../../utils/customerManager');
const { getConfigFromFile } = require('../../../../utils/config');

/**
 * Handle POST request for updating any configuration type
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleUpdateConfig(req, res) {
    try {
        // Extract parameters from query string and body
        const { pubkey, configType, setPreset } = req.query;
        
        // Also check request body for preset (fallback)
        const { preset: bodyPreset } = req.body || {};
        const newPreset = setPreset || bodyPreset;

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

        // Update the configuration preset
        const updateResult = await customerManager.updateConfigPreset(pubkey, configType, newPreset.toLowerCase());
        
        if (updateResult.success) {
            // Return successful response
            res.json({
                success: true,
                message: updateResult.message,
                data: {
                    pubkey,
                    configType,
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
                    configType,
                    customer: updateResult.customer,
                    configPath: updateResult.configPath,
                    availablePresets: updateResult.availablePresets
                }
            });
        }

    } catch (error) {
        console.error('Error in handleUpdateConfig:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
}

module.exports = {
    handleUpdateConfig
};
