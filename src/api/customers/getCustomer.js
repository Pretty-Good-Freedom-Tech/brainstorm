const CustomerManager = require('../../utils/customerManager');

/**
 * Get customers data for observer selector
 * Returns active customers using CustomerManager
 */
async function handleGetCustomer(req, res) {
    try {
        // Initialize CustomerManager
        const customerManager = new CustomerManager();
        await customerManager.initialize();

        // get pubkey as a parameter
        const pubkey = req.params.pubkey;

        // if no pubkey, return error
        if (!pubkey) {
            return res.status(400).json({
                success: false,
                error: 'No pubkey provided'
            });
        }
        
        // Get customer with matching pubkey using CustomerManager
        const customer = await customerManager.getCustomer(pubkey);
        
        // Return data for this customer
        const customerData = customer
            .map(customer => ({
                id: customer.id,
                name: customer.name,
                pubkey: customer.pubkey,
                status: customer.status,
                comments: customer.comments || '',
                directory: customer.directory,
                
            }))
        
        res.json({
            success: true,
            customer: customerData
        });
        
    } catch (error) {
        console.error('Error in handleGetCustomer:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}

module.exports = {
    handleGetCustomer
};
