const fs = require('fs');
const path = require('path');

/**
 * Get customers data for observer selector
 * Returns active customers from customers.json
 */
async function handleGetCustomers(req, res) {
    try {
        // Path to customers.json file
        const customersPath = '/var/lib/brainstorm/customers/customers.json';
        
        // Fallback path for development
        const fallbackPath = path.join(__dirname, '../../../customers/customers.json');
        
        let customersData;
        
        try {
            // Try production path first
            const data = fs.readFileSync(customersPath, 'utf8');
            customersData = JSON.parse(data);
        } catch (error) {
            try {
                // Try fallback path for development
                const data = fs.readFileSync(fallbackPath, 'utf8');
                customersData = JSON.parse(data);
            } catch (fallbackError) {
                console.error('Failed to read customers.json from both paths:', error, fallbackError);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to load customers data'
                });
            }
        }
        
        // Extract customers and filter active ones
        const customers = Object.values(customersData.customers || {})
            .filter(customer => customer.status === 'active')
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
