/**
 * Update Customer Display Name API Handler
 * POST /api/update-customer-display-name
 * 
 * Updates the display name for a specific customer
 * Owner-only endpoint for updating customer display names
 */

const CustomerManager = require('../../../utils/customerManager.js');

/**
 * Handle adding a new customer
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleUpdateCustomerDisplayName(req, res) {
    try {
        // Owner-only endpoint check would go here if needed
        // For now, assuming this is handled by middleware or frontend access control

        const { pubkey, newDisplayName } = req.body;

        if (!pubkey) {
            return res.status(400).json({
                success: false,
                error: 'Customer pubkey is required'
            });
        }

        if (!newDisplayName) {
            return res.status(400).json({
                success: false,
                error: 'New display name is required'
            });
        }

        const customerManager = new CustomerManager();
        const result = await customerManager.changeCustomerDisplayName(pubkey, newDisplayName);

        if (result.success) {
            console.log(`Customer display name changed successfully: ${result.message}`);
            return res.json({
                success: true,
                message: result.message,
                data: {
                    customer: result.customer,
                    statusChanged: result.statusChanged,
                    oldStatus: result.oldStatus,
                    newStatus: result.newStatus
                }
            });
        } else {
            return res.status(400).json({
                success: false,
                error: result.message || 'Failed to change customer status'
            });
        }
    } catch (error) {
        console.error('Error changing customer display name:', error);
        
        // Handle specific error types
        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }
        
        if (error.message.includes('required') || error.message.includes('must be')) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        return res.status(500).json({
            success: false,
            error: 'Internal server error while changing customer display name'
        });
    }
}

/**
 * Generate a unique customer name based on pubkey
 * @param {string} pubkey - User's public key
 * @returns {string} - Generated customer name
 */
function generateCustomerName(pubkey) {
    // Use first 8 characters of pubkey + timestamp for uniqueness
    const pubkeyPrefix = pubkey.substring(0, 8);
    const timestamp = Date.now().toString(36); // Base36 for shorter string
    return `customer_${pubkeyPrefix}_${timestamp}`;
}

module.exports = { handleUpdateCustomerDisplayName };