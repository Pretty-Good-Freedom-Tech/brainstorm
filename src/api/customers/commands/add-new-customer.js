/**
 * Add New Customer API Handler
 * POST /api/add-new-customer
 * 
 * Creates a new customer using pubkey with default settings
 * Owner-only endpoint for adding customers to the system
 */

const CustomerManager = require('../../../utils/customerManager');
const nostrTools = require('nostr-tools');

/**
 * Handle adding a new customer
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleAddNewCustomer(req, res) {
    try {
        // Owner-only endpoint check would go here if needed
        // For now, assuming this is handled by middleware or frontend access control

        const { pubkey } = req.body;

        if (!pubkey) {
            return res.status(400).json({
                success: false,
                error: 'Pubkey is required'
            });
        }

        // Validate pubkey format (64-character hex string)
        if (!pubkey || pubkey.length !== 64 || !/^[a-fA-F0-9]+$/.test(pubkey)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid pubkey format. Must be a 64-character hex string.'
            });
        }

        const customerManager = new CustomerManager();

        // Check if customer already exists
        const allCustomers = await customerManager.getAllCustomers();
        const existingCustomer = Object.values(allCustomers.customers).find(c => c.pubkey === pubkey);
        
        if (existingCustomer) {
            return res.status(409).json({
                success: false,
                error: 'Customer already exists',
                customer: {
                    name: existingCustomer.name,
                    pubkey: existingCustomer.pubkey,
                    status: existingCustomer.status,
                    id: existingCustomer.id
                }
            });
        }

        // Convert pubkey to npub for display purposes
        let npub;
        try {
            npub = nostrTools.nip19.npubEncode(pubkey);
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: 'Invalid pubkey format'
            });
        }

        // Generate a default customer name based on pubkey
        const customerName = `customer_${pubkey.substring(0, 8)}`;

        // Create customer data with defaults
        const customerData = {
            name: customerName,
            pubkey: pubkey,
            status: 'active',
            directory: customerName,
            observer_id: pubkey,
            comments: 'Added via admin interface',
            service_tier: 'free',
            update_interval: 604800 // 1 week in seconds
        };

        // Create the customer
        const newCustomer = await customerManager.createCustomer(customerData);

        res.json({
            success: true,
            message: 'Customer created successfully',
            customer: {
                id: newCustomer.id,
                name: newCustomer.name,
                pubkey: newCustomer.pubkey,
                npub: npub,
                status: newCustomer.status,
                service_tier: newCustomer.subscription.service_tier,
                directory: newCustomer.directory,
                when_signed_up: newCustomer.subscription.when_signed_up
            }
        });

    } catch (error) {
        console.error('Error adding new customer:', error);
        
        // Handle specific error types
        if (error.message.includes('already exists')) {
            return res.status(409).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to add customer',
            details: error.message
        });
    }
}

module.exports = { handleAddNewCustomer };