/**
 * Grapevine Analysis API Module
 * Exports handlers for all Grapevine Analysis-related endpoints
 */

const { 
    handleGetGrapevineInteraction
} = require('./queries');

module.exports = {
    // Queries (read operations)
    handleGetGrapevineInteraction
};
