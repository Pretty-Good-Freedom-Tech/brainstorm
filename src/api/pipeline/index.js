/**
 * Pipeline API Module
 * Exports data pipeline operation handlers
 */

const batch = require('./batch');
const reconcile = require('./reconcile');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Re-export batch module handlers
    ...batch,

    // Re-export reconcile module handlers
    ...reconcile
};
