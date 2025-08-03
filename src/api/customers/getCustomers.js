const CustomerManager = require('../../utils/customerManager');

/**
 * Get customers data for observer selector
 * Returns active customers using CustomerManager
 */
async function handleGetCustomers(req, res) {
    try {
        // Initialize CustomerManager
        const customerManager = new CustomerManager();
        await customerManager.initialize();
        
        // Get active customers using CustomerManager
        const activeCustomers = await customerManager.listActiveCustomers();
        
        // Format customers for API response
        const customers = activeCustomers
            .map(customer => ({
                id: customer.id,
                name: customer.name,
                pubkey: customer.pubkey,
                status: customer.status,
                comments: customer.comments || '',
                directory: customer.directory
            }))
            .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically by name
        
        res.json({
            success: true,
            customers: customers,
            total: customers.length
        });
        
    } catch (error) {
        console.error('Error in handleGetCustomers:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}

module.exports = {
    handleGetCustomers
};
