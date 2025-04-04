/**
 * Reconciliation API Module
 * Exports reconciliation operation handlers
 */

const { handleReconciliation } = require('./commands/execute');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Commands (write operations)
    handleReconciliation
};
