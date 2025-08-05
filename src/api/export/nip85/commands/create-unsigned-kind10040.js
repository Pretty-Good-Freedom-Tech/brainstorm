/**
 * Create Unsigned Kind 10040 Event
 * 
 * Creates an unsigned Kind 10040 event template for NIP-85 trusted assertions
 * that can be signed by the user using NIP-07 browser extension
 */

const { getConfigFromFile } = require('../../../../utils/config');
const { getCustomerRelayKeys } = require('../../../../utils/customerRelayKeys');

/**
 * Create unsigned Kind 10040 event template
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleCreateUnsignedKind10040(req, res) {
    try {
        // Check if user is authenticated
        if (!req.session.authenticated) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required.' 
            });
        }

        // Get the customer pubkey from the request
        const customerPubkey = req.body.pubkey || req.query.pubkey;
        
        if (!customerPubkey) {
            return res.status(400).json({
                success: false,
                message: 'Customer pubkey is required'
            });
        }

        console.log(`Creating unsigned Kind 10040 event for customer: ${customerPubkey.substring(0, 8)}...`);
        
        // Get relay configuration
        const relayUrl = getConfigFromFile('BRAINSTORM_RELAY_URL', '');
        
        if (!relayUrl) {
            return res.status(500).json({
                success: false,
                message: 'Relay URL not configured'
            });
        }

        // Get relay keys to get the relay pubkey
        const relayKeys = await getCustomerRelayKeys(customerPubkey);
        
        if (!relayKeys || !relayKeys.pubkey) {
            return res.status(404).json({
                success: false,
                message: 'Relay keys not found for customer. Please ensure customer relay has been created.'
            });
        }

        const relayPubkey = relayKeys.pubkey;
        
        // Create the unsigned Kind 10040 event template
        const unsignedEvent = {
            kind: 10040,
            pubkey: customerPubkey, // This will be the customer's pubkey (user who signs)
            created_at: Math.floor(Date.now() / 1000),
            content: "",
            tags: [
                [
                    "30382:rank",
                    relayPubkey,
                    relayUrl
                ],
                [
                    "30382:personalizedGrapeRank_influence",
                    relayPubkey,
                    relayUrl
                ],
                [
                    "30382:personalizedGrapeRank_average",
                    relayPubkey,
                    relayUrl
                ],
                [
                    "30382:personalizedGrapeRank_confidence",
                    relayPubkey,
                    relayUrl
                ],
                [
                    "30382:personalizedGrapeRank_input",
                    relayPubkey,
                    relayUrl
                ],
                [
                    "30382:personalizedPageRank",
                    relayPubkey,
                    relayUrl
                ],
                [
                    "30382:verifiedFollowersCount",
                    relayPubkey,
                    relayUrl
                ],
                [
                    "30382:verifiedMutersCount",
                    relayPubkey,
                    relayUrl
                ],
                [
                    "30382:verifiedReportersCount",
                    relayPubkey,
                    relayUrl
                ],
                [
                    "30382:hops",
                    relayPubkey,
                    relayUrl
                ]
            ]
        };

        res.json({
            success: true,
            data: {
                unsignedEvent: unsignedEvent,
                relayUrl: relayUrl,
                relayPubkey: relayPubkey,
                message: 'Unsigned Kind 10040 event created. Please sign with NIP-07 browser extension.'
            }
        });

    } catch (error) {
        console.error('Error creating unsigned Kind 10040 event:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while creating unsigned event'
        });
    }
}

module.exports = {
    handleCreateUnsignedKind10040
};
