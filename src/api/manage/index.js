/**
 * Management API Module
 * Exports handlers for various management operations
 */

const negentropySync = require('./negentropySync');
const { handleBrainstormControl } = require('./commands/brainstormControl');
const { handleRunScript } = require('./commands/runScript');
const { handleRunTask } = require('./commands/runTask');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Re-export negentropySync module handlers
    ...negentropySync,
    
    // System control handlers
    handleBrainstormControl,
    handleRunScript,
    handleRunTask
};
