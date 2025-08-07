/**
 * NostrUser API Module
 * Exports NostrUser data-related operation handlers
 */

const { handleGetProfiles } = require('./queries/profiles');
const { handleGetProfileScores } = require('./queries/get-profile-scores');
const { handleGetNip56Profiles } = require('./queries/nip56-profiles');
const { handleGetUserData } = require('./queries/userdata');
const { handleGetNetworkProximity } = require('./queries/proximity');
const { handleGetNpubFromPubkey } = require('./queries/get-npub-from-pubkey');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    // Queries (read operations)
    handleGetProfiles,
    handleGetProfileScores,
    handleGetNip56Profiles,
    handleGetUserData,
    handleGetNetworkProximity,
    handleGetNpubFromPubkey
};
