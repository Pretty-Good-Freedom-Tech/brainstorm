/**
 * NIP-85 Participation Data Queries
 * api endpoint for: /api/get-nip85-participation-data
 * handler: getNip85ParticipationData
 * Fetches all available kind 10040 events using nostr-dev-kit (NDK)
 * 
 * Returns data in this format: 
 * 
 * {
  "success": true,
  "data": {
    "kind10040count": 4,
    "authors": [
      "53dab47395542b4df9c9d5b32934403b751f0a882e69bb8dd8a660df3a95f02d",
      "e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f",
      "cf961e812466aa5e809ea7d2f1503241dc37902776b4c2751d7d49807731e104",
      "043df008b847b66bf991dfb696aac68973eccfa4cedfb87173df79a4cf666ea7"
    ]
  },
  "message": "Found 4 unique authors from 4 Kind 10040 events"
}
*/

// Set up WebSocket polyfill for Node.js environment
const WebSocket = require('ws');
const { useWebSocketImplementation } = require('nostr-tools/pool');
useWebSocketImplementation(WebSocket);

// Import NDK as default export
const NDK = require('@nostr-dev-kit/ndk').default;

const nip85RelayUrls = ["wss://relay.damus.io", "wss://relay.primal.net", "wss://nip85.brainstorm.world", "wss://nip85.nostr1.com", "wss://nip85.grapevine.network"];

async function handleGetNip85ParticipationOverview(req, res) {
    try {
        console.log('Starting NIP-85 participation overview fetch...');
        console.log('Target relays:', nip85RelayUrls);
        
        // Initialize NDK
        const ndk = new NDK({ 
            explicitRelayUrls: nip85RelayUrls
        });
        
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
            setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000);
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
        console.log('Fetching kind 10040 events...');
        const filter = { kinds: [10040] };
        console.log('Using filter:', JSON.stringify(filter));
        
        // Create a more detailed fetch with progress tracking
        let fetchCompleted = false;
        let eventCount = 0;
        let lastEventTime = Date.now();
        const events = new Set();
        let subscription = null;
        
        const fetchPromise = new Promise(async (resolve, reject) => {
            try {
                console.log('Creating NDK subscription...');
                
                subscription = ndk.subscribe(filter, { closeOnEose: true });
                
                subscription.on('event', (event) => {
                    events.add(event);
                    eventCount++;
                    lastEventTime = Date.now();
                    console.log(`📥 Received event ${eventCount} with id ${event.id} from ${event.relay?.url || 'unknown relay'}`);
                });
                
                subscription.on('eose', () => {
                    console.log('📋 End of stored events (EOSE) received');
                    fetchCompleted = true;
                    resolve(events);
                });
                
                subscription.on('close', () => {
                    console.log('🔒 Subscription closed');
                    if (!fetchCompleted) {
                        resolve(events);
                    }
                });
                
                console.log('Subscription created, waiting for events...');
                
                // Fallback: If no new events for 3 seconds, assume we're done
                const checkForCompletion = setInterval(() => {
                    const timeSinceLastEvent = Date.now() - lastEventTime;
                    if (timeSinceLastEvent > 3000 && eventCount > 0 && !fetchCompleted) {
                        console.log(`⏱️ No new events for 3 seconds, assuming completion with ${eventCount} events`);
                        clearInterval(checkForCompletion);
                        fetchCompleted = true;
                        if (subscription) {
                            subscription.stop();
                        }
                        resolve(events);
                    }
                }, 1000);
                
                // Also resolve after 10 seconds regardless (shorter than main timeout)
                setTimeout(() => {
                    if (!fetchCompleted) {
                        console.log(`⏰ 10-second fallback timeout reached with ${eventCount} events`);
                        clearInterval(checkForCompletion);
                        fetchCompleted = true;
                        if (subscription) {
                            subscription.stop();
                        }
                        resolve(events);
                    }
                }, 10000);
                
            } catch (error) {
                console.error('Error in fetch promise:', error);
                reject(error);
            }
        });
        
        const fetchTimeout = new Promise((resolve) => {
            setTimeout(() => {
                console.log(`⏰ Main timeout after 15 seconds. Returning ${eventCount} events collected so far.`);
                if (subscription && !fetchCompleted) {
                    subscription.stop();
                }
                // Return events instead of rejecting
                resolve(events);
            }, 15000);
        });
        
        console.log('Waiting for events or timeout...');
        const kind10040Events = await Promise.race([fetchPromise, fetchTimeout]);
        console.log(`✅ Fetch completed, found ${kind10040Events.size} events`);
        
        // Convert Set to Array and extract authors
        const eventArray = Array.from(kind10040Events);
        const authors = eventArray.map(event => event.pubkey);
        console.log(`Extracted ${authors.length} unique authors`);
        
        return res.status(200).json({
            success: true, 
            data: { 
                count: eventArray.length, 
                authors,
                connectedRelays: connectedRelays.length,
                relayUrls: connectedRelays
            },
            message: `Found ${eventArray.length} Kind 10040 events from ${connectedRelays.length} relays`
        });
        
    } catch (error) {
        console.error('[get-nip85-participation-overview] Error:', error);
        console.error('Error stack:', error.stack);
        return res.status(500).json({
            success: false,
            message: 'Internal server error while checking NIP-85 Participation Overview',
            error: error.message
        });
    }
}

module.exports = {
    handleGetNip85ParticipationOverview
};