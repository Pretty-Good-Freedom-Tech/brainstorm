/**
 * Nostr Profiles API Module
 * Exports profile-related operation handlers
 */

const { handleGetKind0Event } = require('./queries/kind0');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    // Queries (read operations)
    handleGetKind0Event
};
