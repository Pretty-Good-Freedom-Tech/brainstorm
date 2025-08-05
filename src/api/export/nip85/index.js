/**
 * NIP-85 API Module
 * Exports NIP-85 related operation handlers
 */

const { handleGenerateNip85 } = require('./commands/generate');
const { handleCreateKind10040, handlePublishKind10040 } = require('./commands/kind10040');
const { handleCreateAndPublishKind10040 } = require('./commands/create-and-publish-kind10040');
const { handleCreateUnsignedKind10040 } = require('./commands/create-unsigned-kind10040');
const { handlePublishSignedKind10040 } = require('./commands/publish-signed-kind10040');
const { handlePublishKind30382 } = require('./commands/kind30382');
const { handlePublish } = require('./commands/publish');
const { handleGetKind10040Event } = require('./queries/kind10040');
const { handleGetKind10040Info, handleGetKind30382Info } = require('./queries/info');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    // Commands (write operations)
    handleGenerateNip85,
    handleCreateKind10040,
    handlePublishKind10040,
    handleCreateAndPublishKind10040,
    handleCreateUnsignedKind10040,
    handlePublishSignedKind10040,
    handlePublishKind30382,
    handlePublish,
    
    // Queries (read operations)
    handleGetKind10040Event,
    handleGetKind10040Info,
    handleGetKind30382Info
};
