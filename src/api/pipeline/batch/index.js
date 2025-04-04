/**
 * Batch API Module
 * Exports batch transfer operation handlers
 */

const { handleBatchTransfer } = require('./commands/transfer');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Commands (write operations)
    handleBatchTransfer
};
