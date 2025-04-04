/**
 * NIP-85 API Module
 * Exports NIP-85 related operation handlers
 */

const { handleGenerateNip85 } = require('./commands/generate');
const { handleCreateKind10040 } = require('./commands/kind10040');
const { handlePublishKind10040 } = require('./commands/kind10040');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    handleGenerateNip85,
    handleCreateKind10040,
    handlePublishKind10040
};
