/**
 * Batch API Module
 * Exports batch transfer operation handlers
 */

const { handleDeleteAllRelationships } = require('./commands/deleteAllRelationships');
const { handleBatchTransfer } = require('./commands/transfer');
const { handleNegentropySync } = require('./commands/negentropySync');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Commands (write operations)
    handleDeleteAllRelationships,
    handleBatchTransfer,
    handleNegentropySync
};
