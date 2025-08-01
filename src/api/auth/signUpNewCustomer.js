const fs = require('fs');
const path = require('path');
const { getConfigFromFile } = require('../../utils/config');

/**
 * Get user classification (owner/customer/regular user)
 * Returns the classification of the authenticated user
 * to call: api/auth/user-classification
 */
async function handleSignUpNewCustomer(req, res) {
    try {
        // Check if user is authenticated
        if (!req.session || !req.session.pubkey) {
            return res.json({
                success: true,
                classification: 'unauthenticated',
                pubkey: null
            });
        }

        const userPubkey = req.session.pubkey;

        // Get owner pubkey from brainstorm.conf
        let ownerPubkey = getConfigFromFile('BRAINSTORM_OWNER_PUBKEY');

        // Check if user is the owner
        if (ownerPubkey && userPubkey === ownerPubkey) {
            return res.json({
                success: true,
                classification: 'owner',
                pubkey: userPubkey,
            });
        }

        // Check if user is a customer
        let customersData;
        try {
            const customersPath = '/var/lib/brainstorm/customers/customers.json';
            const fallbackPath = path.join(__dirname, '../../../customers/customers.json');
            
            try {
                const data = fs.readFileSync(customersPath, 'utf8');
                customersData = JSON.parse(data);
            } catch (error) {
                const data = fs.readFileSync(fallbackPath, 'utf8');
                customersData = JSON.parse(data);
            }

            // Check if user pubkey matches any customer, whether active or inactive
            const customers = customersData.customers || {};
            for (const [customerName, customerData] of Object.entries(customers)) {
                if (customerData.pubkey === userPubkey) {
                    return res.json({
                        success: true,
                        classification: 'customer',
                        status: customerData.status,
                        pubkey: userPubkey,
                        customerName: customerName,
                        customerId: customerData.id
                    });
                }
            }
        } catch (error) {
            console.error('Error reading customers data:', error);
        }

        // TODO: 
        // generate a random customer name
        // generate a random customer id
        // update files in /var/lib/brainstorm/customers:
        // 1. copy folder: default to: <customer_name>
        // 2. update customers.json
        // create a new set of customer relay keys
        return res.json({
            success: true,
            newCustomerData: {
                name: 'foo',
                id: 999,
                pubkey: userPubkey,
                status: 'active',
                comments: '',
                directory: '',
                relayPubkey: 'bar'
            }
        });

        // User is authenticated but not owner or customer
        return res.json({
            success: true,
            classification: 'guest',
            pubkey: userPubkey
        });

    } catch (error) {
        console.error('Error in signUpNewCustomer:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to sign up new customer'
        });
    }
}

module.exports = { handleSignUpNewCustomer };
