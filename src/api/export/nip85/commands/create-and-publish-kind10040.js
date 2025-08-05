/**
 * NIP-85 Kind 10040 Commands
 * Handles creation and management of Kind 10040 events
 */

const path = require('path');
const { exec } = require('child_process');
const { spawn } = require('child_process');
const fs = require('fs');
const { getConfigFromFile } = require('../../../../utils/config');

/**
 * Create Kind 10040 events
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleCreateAndPublishKind10040(req, res) {
    // Check if user is authenticated
    if (!req.session.authenticated) {
        return res.status(401).json({ 
            success: false, 
            message: 'Authentication required.' 
        });
    }

    // Get the customer pubkey from the request
    const customerPubkey = req.body.pubkey;
    
    console.log('Creating kind 10040 events...');
    
    // Set the response header to ensure it's always JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Get the base directory from config with fallback
    const baseDir = getConfigFromFile('BRAINSTORM_MODULE_BASE_DIR', '/usr/local/lib/node_modules/brainstorm');
    
    // Get the full path to the script
    let scriptName = 'brainstorm-create-and-publish-kind10040.js';
    // if customerPubkey is provided, then include customerPubkey as an argument
    if (customerPubkey) {
        scriptName = `brainstorm-create-and-publish-kind10040.js ${customerPubkey}`;
    }
    const scriptPath = path.join(baseDir, 'bin', scriptName);
    console.log('Using script path:', scriptPath);
    
    // Set a timeout to ensure the response doesn't hang
    const timeoutId = setTimeout(() => {
        console.log('Kind 10040 creation is taking longer than expected, sending initial response...');
        res.json({
            success: true,
            output: 'Kind 10040 creation started. This process will continue in the background.\n',
            error: null
        });
    }, 30000); // 30 seconds timeout
    
    exec(`node ${scriptPath}`, (error, stdout, stderr) => {
        // Clear the timeout if the command completes before the timeout
        clearTimeout(timeoutId);
        
        // Check if the response has already been sent
        if (res.headersSent) {
            console.log('Response already sent, kind 10040 creation continuing in background');
            return;
        }
        
        return res.json({
            success: !error,
            output: stdout || stderr,
            error: error ? error.message : null
        });
    });
}

module.exports = {
    handleCreateAndPublishKind10040
};
