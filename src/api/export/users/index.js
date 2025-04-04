/**
 * NostrUser API Module
 * Exports NostrUser data-related operation handlers
 */

const { handleGetProfiles } = require('./queries/profiles');
const { handleGetUserData } = require('./queries/userdata');
const { handleGetNetworkProximity } = require('./queries/proximity');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    // Queries (read operations)
    handleGetProfiles,
    handleGetUserData,
    handleGetNetworkProximity
};
