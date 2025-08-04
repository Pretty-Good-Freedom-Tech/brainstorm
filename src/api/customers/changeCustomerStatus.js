/**
 * Change Customer Status API Endpoint
 * 
 * Owner-only endpoint for changing customer status (activate/deactivate)
 */

const CustomerManager = require('../../utils/customerManager');
const { getOwnerPubkey } = require('../../utils/config');

/**
 * Handle customer status change request
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleChangeCustomerStatus(req, res) {
    try {
        // Extract pubkey and status from request body
        const { pubkey, status } = req.body;
        
        if (!pubkey) {
            return res.status(400).json({
                success: false,
                error: 'Customer pubkey is required'
            });
        }

        if (!status) {
            return res.status(400).json({
                success: false,
                error: 'Status is required (active or inactive)'
            });
        }

        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Status must be either "active" or "inactive"'
            });
        }

        // Verify user is authenticated and is the owner
        const userPubkey = req.session?.userPubkey;
        if (!userPubkey) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const ownerPubkey = getOwnerPubkey();
        if (!ownerPubkey || userPubkey !== ownerPubkey) {
            return res.status(403).json({
                success: false,
                error: 'Only the owner can change customer status'
            });
        }

        // Use CustomerManager to change status
        const customerManager = new CustomerManager();
        const result = await customerManager.changeCustomerStatus(pubkey, status);

        if (result.success) {
            console.log(`Customer status changed successfully: ${result.message}`);
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
        console.error('Error changing customer status:', error);
        
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
            error: 'Internal server error while changing customer status'
        });
    }
}

module.exports = {
    handleChangeCustomerStatus
};
