/**
 * API endpoint to get comprehensive NIP-85 status for a customer
 * Uses CustomerManager utility methods for centralized, consistent logic
 */

const CustomerManager = require('../../../../utils/customerManager');

async function handleGetNip85StatusRedo(req, res) {
    try {
        const { pubkey, returnRawEvents } = req.query;
        
        if (!pubkey) {
            return res.status(400).json({
                success: false,
                message: 'pubkey parameter is required'
            });
        }
        
        // Validate pubkey format (64 character hex string)
        if (!/^[a-fA-F0-9]{64}$/.test(pubkey)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pubkey format. Must be 64 character hex string.'
            });
        }

        let includeEvents = false;
        if (returnRawEvents) {
            includeEvents = true;
        }
        
        console.log(`[get-nip85-status] Checking NIP-85 status for pubkey: ${pubkey}`);
        
        // Use CustomerManager utility to get comprehensive NIP-85 status
        const customerManager = new CustomerManager();
        const nip85Status = await customerManager.getNip85Status(pubkey, {
            includeEvents: includeEvents // Don't include full event data in API response for performance unless requested
        });
        
        console.log(`[get-nip85-status] NIP-85 status result:`, {
            isComplete: nip85Status.overall.isComplete,
            summary: nip85Status.overall.summary,
            hasRelayKeys: nip85Status.customer.hasRelayKeys,
            hasKind10040: nip85Status.kind10040.exists,
            relayKeyMatch: nip85Status.kind10040.matches,
            kind30382Count: nip85Status.kind30382.count
        });
        
        return res.json({
            success: true,
            data: nip85Status
        });
        
    } catch (error) {
        console.error('[get-nip85-status] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error while checking NIP-85 status',
            error: error.message
        });
    }
}

module.exports = {
    handleGetNip85StatusRedo
};
