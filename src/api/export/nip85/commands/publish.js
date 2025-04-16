/**
 * NIP-85 Publication Command Handler
 * 
 * This module provides an endpoint to publish NIP-85 events
 */

const { exec } = require('child_process');

/**
 * Handles publishing NIP-85 events
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function handlePublish(req, res) {
    console.log('Publishing NIP-85 events...');
    
    exec('brainstorm-publish', (error, stdout, stderr) => {
        return res.json({
            success: !error,
            output: stdout || stderr,
            error: error ? error.message : null
        });
    });
}

module.exports = {
    handlePublish
};
