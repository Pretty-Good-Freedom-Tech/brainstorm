const fs = require('fs');
const path = require('path');

/**
 * Get user classification (owner/customer/regular user)
 * Returns the classification of the authenticated user
 */
async function handleGetUserClassification(req, res) {
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
        let ownerPubkey = null;
        try {
            const configPath = '/var/lib/brainstorm/brainstorm.conf';
            const fallbackConfigPath = path.join(__dirname, '../../../brainstorm.conf');
            
            let configContent;
            try {
                configContent = fs.readFileSync(configPath, 'utf8');
            } catch (error) {
                configContent = fs.readFileSync(fallbackConfigPath, 'utf8');
            }

            const lines = configContent.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const [key, value] = trimmed.split('=');
                    if (key && key.trim() === 'BRAINSTORM_OWNER_PUBKEY' && value) {
                        ownerPubkey = value.trim().replace(/['"]/g, '');
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('Error reading owner pubkey from config:', error);
        }

        // Check if user is the owner
        if (ownerPubkey && userPubkey === ownerPubkey) {
            return res.json({
                success: true,
                classification: 'owner',
                pubkey: userPubkey,
                ownerPubkey: ownerPubkey
            });
        }

        // Check if user is a customer
        try {
            const customersPath = '/var/lib/brainstorm/customers/customers.json';
            const fallbackPath = path.join(__dirname, '../../../customers/customers.json');
            
            let customersData;
            try {
                const data = fs.readFileSync(customersPath, 'utf8');
                customersData = JSON.parse(data);
            } catch (error) {
                const data = fs.readFileSync(fallbackPath, 'utf8');
                customersData = JSON.parse(data);
            }

            // Check if user pubkey matches any active customer
            const customers = customersData.customers || {};
            for (const [customerName, customerData] of Object.entries(customers)) {
                if (customerData.status === 'active' && customerData.pubkey === userPubkey) {
                    return res.json({
                        success: true,
                        classification: 'customer',
                        pubkey: userPubkey,
                        customerName: customerName,
                        customerId: customerData.id
                    });
                }
            }
        } catch (error) {
            console.error('Error reading customers data:', error);
        }

        // User is authenticated but not owner or customer
        return res.json({
            success: true,
            classification: 'regular_user',
            pubkey: userPubkey
        });

    } catch (error) {
        console.error('Error in getUserClassification:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to determine user classification'
        });
    }
}

module.exports = { handleGetUserClassification };
