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

const { NDK } = require('@nostr-dev-kit/ndk');

const nip85RelayUrls = ['wss://nip85.brainstorm.world','wss://nip85.nostr1.com','wss://nip85.grapevine.network'];

async function getNip85ParticipationData() {
    try {
      const ndk = new NDK({ explicitRelayUrls: nip85RelayUrls });
      await ndk.connect();
      
      const kind10040Events = await ndk.fetchEvents({ kinds: [10040] });
      const authors = kind10040Events.map(event => event.pubkey);
      return { 
        success: true, 
        data: { 
            kind10040count: kind10040Events.length, 
            authors
        }
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
}

module.exports = {
    getNip85ParticipationData
};