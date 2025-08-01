const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getConfigFromFile } = require('../../utils/config');
const { createSingleCustomerRelay } = require('../../utils/customerRelayKeys');

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
                error: 'Authentication required. Please sign in first.',
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
                error: 'Owner account cannot sign up as customer',
                classification: 'owner'
            });
        }

        // Determine paths for customers data
        const customersPath = '/var/lib/brainstorm/customers/customers.json';
        const fallbackPath = path.join(__dirname, '../../../customers/customers.json');
        const customersDir = '/var/lib/brainstorm/customers';
        const fallbackDir = path.join(__dirname, '../../../customers');
        
        let actualCustomersPath, actualCustomersDir;
        let customersData;
        
        // Try to read from production path first, then fallback
        try {
            const data = fs.readFileSync(customersPath, 'utf8');
            customersData = JSON.parse(data);
            actualCustomersPath = customersPath;
            actualCustomersDir = customersDir;
        } catch (error) {
            try {
                const data = fs.readFileSync(fallbackPath, 'utf8');
                customersData = JSON.parse(data);
                actualCustomersPath = fallbackPath;
                actualCustomersDir = fallbackDir;
            } catch (fallbackError) {
                console.error('Error reading customers data from both paths:', error, fallbackError);
                return res.json({
                    success: false,
                    error: 'Failed to access customer database'
                });
            }
        }

        // Check if user is already a customer
        const customers = customersData.customers || {};
        for (const [customerName, customerData] of Object.entries(customers)) {
            if (customerData.pubkey === userPubkey) {
                return res.json({
                    success: false,
                    error: 'You are already a customer',
                    classification: 'customer',
                    customerName: customerName,
                    customerId: customerData.id
                });
            }
        }

        // Generate new customer data
        const newCustomerName = generateCustomerName(userPubkey);
        const newCustomerId = generateNextCustomerId(customers);
        
        // Generate relay keys using the shared utility
        let relayKeys;
        try {
            relayKeys = createSingleCustomerRelay(userPubkey, newCustomerId, newCustomerName);
        } catch (error) {
            console.error('Error creating customer relay keys:', error);
            return res.json({
                success: false,
                error: 'Failed to generate relay keys for customer'
            });
        }
        
        // Create new customer object
        const newCustomer = {
            id: newCustomerId,
            status: 'active',
            directory: newCustomerName,
            name: newCustomerName,
            pubkey: userPubkey,
            observer_id: userPubkey,
            comments: 'auto-generated',
            createdAt: new Date().toISOString()
        };

        // Create customer directory
        const customerDir = path.join(actualCustomersDir, newCustomerName);
        const defaultDir = path.join(actualCustomersDir, 'default');
        
        try {
            // Copy default customer directory to new customer directory
            if (fs.existsSync(defaultDir)) {
                execSync(`cp -r "${defaultDir}" "${customerDir}"`, { stdio: 'pipe' });
                console.log(`Created customer directory: ${customerDir}`);
            } else {
                // Create basic directory structure if default doesn't exist
                fs.mkdirSync(customerDir, { recursive: true });
                console.log(`Created basic customer directory: ${customerDir}`);
            }
        } catch (error) {
            console.error('Error creating customer directory:', error);
            return res.json({
                success: false,
                error: 'Failed to create customer directory'
            });
        }

        // Update customers.json
        customersData.customers[newCustomerName] = newCustomer;
        
        try {
            fs.writeFileSync(actualCustomersPath, JSON.stringify(customersData, null, 4));
            console.log(`Updated customers.json with new customer: ${newCustomerName}`);
        } catch (error) {
            console.error('Error updating customers.json:', error);
            // Try to clean up the directory if JSON update failed
            try {
                if (fs.existsSync(customerDir)) {
                    execSync(`rm -rf "${customerDir}"`, { stdio: 'pipe' });
                }
            } catch (cleanupError) {
                console.error('Error cleaning up directory after JSON failure:', cleanupError);
            }
            return res.json({
                success: false,
                error: 'Failed to update customer database'
            });
        }

        // Return success with customer details
        return res.json({
            success: true,
            message: 'Customer account created successfully',
            customerName: newCustomerName,
            customerId: newCustomerId,
            pubkey: userPubkey,
            status: 'active',
            directory: customerDir,
            relayPubkey: relayKeys.pubkey,
            createdAt: newCustomer.createdAt
        });

    } catch (error) {
        console.error('Error in signUpNewCustomer:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error during sign-up process'
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
