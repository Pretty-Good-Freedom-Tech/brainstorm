/**
 * NIP-85 API Module
 * Exports NIP-85 related operation handlers
 */

const { handleGenerateNip85 } = require('./commands/generate');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    handleGenerateNip85
};
