/*
 * NIP-85 API Module
 * Determines how many kind 30382 events exist for a given pubkey
 * 
 * api endpoint for: /api/get-30382-count-externally?pubkey=<pubkey>
 * 
 * Returns data in this format:
 * {
 *   "success": true,
 *   "data": {
 *     "author": "<pubkey>",
 *     "count": 4
 *   }
 * }
 * THIS HANDLER IS MODELLED AFTER THE get-all-10040-authors-externally.js handler
 */

const WebSocket = require('ws');
const { useWebSocketImplementation } = require('nostr-tools/pool');
useWebSocketImplementation(WebSocket);

// Import NDK as default export
const NDK = require('@nostr-dev-kit/ndk').default;

const nip85RelayUrls = ["wss://relay.damus.io", "wss://relay.primal.net", "wss://nip85.brainstorm.world", "wss://nip85.nostr1.com", "wss://nip85.grapevine.network"];

async function handleGet30382CountExternally(req, res) {
    // get pubkey from query parameters
    const { pubkey } = req.query;
    
    if (!pubkey) {
        return res.status(400).json({ success: false, message: 'Missing pubkey parameter' });
    }

    try {
        const ndk = new NDK({ explicitRelayUrls: nip85RelayUrls });

        // Add relay event listeners for debugging
        ndk.pool.on('relay:connect', (relay) => {
            console.log(`✅ Connected to relay: ${relay.url}`);
        });
        
        ndk.pool.on('relay:disconnect', (relay) => {
            console.log(`❌ Disconnected from relay: ${relay.url}`);
        });
        
        ndk.pool.on('relay:error', (relay, error) => {
            console.log(`⚠️ Relay error for ${relay.url}:`, error.message);
        });

        // Connect with timeout
        console.log('Attempting to connect to relays...');
        const connectTimeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Connection timeout after 5 seconds')), 5000);
        });
        
        await Promise.race([ndk.connect(), connectTimeout]);
        console.log('✅ NDK connection established');
        
        // Wait a moment for relay connections to stabilize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check connected relays with correct status check
        const allRelays = Array.from(ndk.pool.relays.values());
        console.log('All relay statuses:', allRelays.map(r => ({ url: r.url, status: r.connectivity.status })));
        
        const connectedRelays = allRelays
            .filter(relay => relay.connectivity.status === 1) // 1 = connected
            .map(relay => relay.url);
        console.log(`Connected relays (${connectedRelays.length}):`, connectedRelays);
        
        // Fetch events with enhanced debugging
        console.log('Fetching kind 30382 events...');
        const filter = { kinds: [30382], authors: [pubkey] };
        console.log('Using filter:', JSON.stringify(filter));

        // TODO: COMPLETE THIS HANDLER FUNCTION
        // QUESTION: who to use as authors?
        // ideally we need the full 10040 event for the author,
        // so we can get trusted pubkey AND trusted relay for each trust metric
        // Alternatively, could use only the data from the 'rank' metric
        // To get that, need to update the get-all-10040-authors-externally endpoint
        // so that it provides this data for each author.




    } catch (error) {
        return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
}

module.exports = {
    handleGet30382CountExternally
};