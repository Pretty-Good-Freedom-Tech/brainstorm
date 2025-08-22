/**
 * NIP-19 API Module
 * Exports NIP-19 related operation handlers
 */

const { handleValidateEncoding } = require('./queries/validate-encoding.js');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    // Queries (read operations)
    handleValidateEncoding
};
