/**
 * Negentropy Sync API Module
 * Exports handlers for Negentropy synchronization operations
 */

const { handleNegentropySyncWoT } = require('./commands/syncWoT');
const { handleNegentropySyncPersonal } = require('./commands/syncPersonal');
const { handleNegentropySyncProfiles } = require('./commands/syncProfiles');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Commands (write operations)
    handleNegentropySyncWoT,
    handleNegentropySyncPersonal,
    handleNegentropySyncProfiles
};
