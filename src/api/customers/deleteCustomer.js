/**
 * Delete Customer API Endpoint
 * 
 * Owner-only endpoint for complete customer deletion including:
 * - Customer data removal from customers.json
 * - Customer directory and file cleanup
 * - Secure relay key removal
 * - Audit trail creation
 */

const CustomerManager = require('../../utils/customerManager');
const { getOwnerPubkey } = require('../../utils/config');

/**
 * Handle customer deletion request
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleDeleteCustomer(req, res) {
    try {
        // Extract pubkey from request body
        const { pubkey } = req.body;
        
        if (!pubkey) {
            return res.status(400).json({
                success: false,
                error: 'Customer pubkey is required'
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
        if (userPubkey !== ownerPubkey) {
            return res.status(403).json({
                success: false,
                error: 'Only the owner can delete customers'
            });
        }

        // Initialize CustomerManager
        const customerManager = new CustomerManager();
        await customerManager.initialize();

        // Verify customer exists before deletion
        const existingCustomer = await customerManager.getCustomer(pubkey);
        if (!existingCustomer) {
            return res.status(404).json({
                success: false,
                error: `Customer with pubkey '${pubkey}' not found`
            });
        }

        // Extract deletion options from request (with secure defaults)
        const options = {
            createBackup: req.body.createBackup !== false, // default true
            removeDirectory: req.body.removeDirectory !== false, // default true
            removeSecureKeys: req.body.removeSecureKeys !== false // default true
        };

        console.log(`Owner ${userPubkey} requesting deletion of customer: ${existingCustomer.name} (${pubkey})`);

        // Perform customer deletion
        const deletionResult = await customerManager.deleteCustomer(pubkey, options);

        // Log successful deletion
        console.log(`Customer deletion completed:`, {
            deletedCustomer: deletionResult.deletedCustomer.name,
            summary: deletionResult.deletionSummary
        });

        // Return success response with detailed information
        return res.status(200).json({
            success: true,
            message: `Customer '${deletionResult.deletedCustomer.name}' has been successfully deleted`,
            data: {
                deletedCustomer: {
                    id: deletionResult.deletedCustomer.id,
                    name: deletionResult.deletedCustomer.name,
                    pubkey: deletionResult.deletedCustomer.pubkey,
                    status: deletionResult.deletedCustomer.status
                },
                deletionSummary: deletionResult.deletionSummary,
                deletedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Customer deletion failed:', error);

        // Return appropriate error response
        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }

        return res.status(500).json({
            success: false,
            error: 'Customer deletion failed: ' + error.message
        });
    }
}

module.exports = {
    handleDeleteCustomer
};
