const { getConfigFromFile } = require('../../utils/config');
const { createSingleCustomerRelay } = require('../../utils/customerRelayKeys');
const CustomerManager = require('../../utils/customerManager');

/**
 * Sign up a new customer
 * Creates a new customer account with unique ID, directory, and relay keys
 * to call: POST /api/auth/sign-up-new-customer
 */
async function handleSignUpNewCustomer(req, res) {
    try {
        // Check if user is authenticated
        if (!req.session || !req.session.pubkey) {
            return res.json({
                success: false,
                message: 'Authentication required. Please sign in first.',
                classification: 'unauthenticated'
            });
        }

        const userPubkey = req.session.pubkey;

        // Get owner pubkey from brainstorm.conf
        let ownerPubkey = getConfigFromFile('BRAINSTORM_OWNER_PUBKEY');

        // Check if user is the owner
        if (ownerPubkey && userPubkey === ownerPubkey) {
            return res.json({
                success: false,
                message: 'Owner account cannot sign up as customer',
                classification: 'owner'
            });
        }

        // Initialize CustomerManager
        const customerManager = new CustomerManager();
        await customerManager.initialize();
        
        // Check if user is already a customer
        const existingCustomer = await customerManager.getCustomer(userPubkey);
        if (existingCustomer) {
            return res.json({
                success: false,
                message: 'You are already a customer',
                classification: 'customer',
                customerName: existingCustomer.name,
                customerId: existingCustomer.id
            });
        }

        // Generate new customer data
        const allCustomers = await customerManager.getAllCustomers();
        const newCustomerName = generateCustomerName(userPubkey);
        const newCustomerId = generateNextCustomerId(allCustomers.customers);
        
        // Generate relay keys for the new customer
        console.log('Generating relay keys for new customer...');
        let relayKeys;
        try {
            relayKeys = await createSingleCustomerRelay(userPubkey, newCustomerId, newCustomerName);
        } catch (error) {
            console.error('Error creating customer relay keys:', error);
            return res.json({
                success: false,
                message: 'Failed to generate relay keys for customer',
                error
            });
        }
        
        // Create new customer using CustomerManager
        const newCustomerData = {
            name: newCustomerName,
            pubkey: userPubkey,
            status: 'active',
            comments: 'default',
            observer_id: userPubkey,
            createdAt: new Date().toISOString()
        };

        let newCustomer;
        try {
            newCustomer = await customerManager.createCustomer(newCustomerData);
            console.log(`Created new customer: ${newCustomerName} (ID: ${newCustomer.id})`);
        } catch (error) {
            console.error('Error creating customer:', error);
            return res.json({
                success: false,
                message: 'Failed to create customer account',
                error: error.message
            });
        }

        // Return success with customer details
        return res.json({
            success: true,
            message: 'Customer account created successfully',
            customerName: newCustomer.name,
            customerId: newCustomer.id,
            pubkey: userPubkey,
            status: 'active',
            directory: newCustomer.directory,
            relayPubkey: relayKeys.pubkey,
            createdAt: newCustomer.createdAt
        });

    } catch (error) {
        console.error('Error in signUpNewCustomer:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error during sign-up process',
            error
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

/**
 * Generate the next available customer ID
 * @param {Object} customers - Existing customers object
 * @returns {number} - Next available ID
 */
function generateNextCustomerId(customers) {
    let maxId = -1;
    for (const customerData of Object.values(customers)) {
        if (typeof customerData.id === 'number' && customerData.id > maxId) {
            maxId = customerData.id;
        }
    }
    return maxId + 1;
}

module.exports = { handleSignUpNewCustomer };
