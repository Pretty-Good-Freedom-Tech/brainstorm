/**
 * Management API Module
 * Exports handlers for various management operations
 */

const negentropySync = require('./negentropySync');
const { handleHasenpfeffrControl } = require('./commands/hasenpfeffrControl');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Re-export negentropySync module handlers
    ...negentropySync,
    
    // System control handlers
    handleHasenpfeffrControl
};
