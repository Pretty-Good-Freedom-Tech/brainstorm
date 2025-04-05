/**
 * Algorithms API Module
 * Exports handlers for various graph algorithm operations
 */

const hops = require('./hops');
const pagerank = require('./pagerank');
const graperank = require('./graperank');

// Export modules directly with their namespaces
module.exports = {
    // Export modules for nested access
    hops,
    pagerank,
    graperank
};
