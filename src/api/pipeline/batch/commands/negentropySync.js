/**
 * Negentropy Sync Command
 * Handles bulk synchronization of data using Negentropy protocol
 */

const { exec } = require('child_process');

/**
 * Handler for Negentropy synchronization
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleNegentropySync(req, res) {
    console.log('Syncing with Negentropy...');
    
    // Set the response header to ensure it's always JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Get relay and filter parameters from request body
    const relay = req.body.relay || 'wss://relay.brainstorm.com';
    const filter = req.body.filter || '{"kinds":[3, 1984, 10000]}';
    
    console.log(`Using relay: ${relay}, filter: ${filter}`);
    
    // Set a timeout to ensure the response doesn't hang
    const timeoutId = setTimeout(() => {
        console.log('Negentropy sync is taking longer than expected, sending initial response...');
        res.json({
            success: true,
            continueInBackground: true,
            output: `Negentropy sync with ${relay} started.\nThis process will continue in the background. You can check Strfry Event statistics to track progress.\n`,
            error: null
        });
    }, 120000); // 2 minutes timeout
    
    // Build the command with the provided relay and filter
    const command = `sudo strfry sync ${relay} --filter '${filter}' --dir down`;
    console.log(`Executing command: ${command}`);
    
    exec(command, (error, stdout, stderr) => {
        // Clear the timeout if the command completes before the timeout
        clearTimeout(timeoutId);
        
        // Check if the response has already been sent
        if (res.headersSent) {
            console.log('Response already sent, negentropy sync continuing in background');
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
    handleNegentropySync
};
