/**
 * NostrUser API Module
 * Exports NostrUser data-related operation handlers
 */

const { handleGetProfiles } = require('./queries/profiles');
const { handleGetNip56Profiles } = require('./queries/nip56-profiles');
const { handleGetUserData } = require('./queries/userdata');
const { handleGetNetworkProximity } = require('./queries/proximity');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    // Queries (read operations)
    handleGetProfiles,
    handleGetNip56Profiles,
    handleGetUserData,
    handleGetNetworkProximity
};
