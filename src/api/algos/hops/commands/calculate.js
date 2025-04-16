/**
 * Hops Calculation Command
 * Triggers the calculation of hops (distance) in the Nostr social graph
 */

const { exec } = require('child_process');

/**
 * Handler for triggering hops calculation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleCalculateHops(req, res) {
    console.log('Starting calculation of hops in the Nostr social graph...');
    
    // Set the response header to ensure it's always JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Set a timeout to ensure the response doesn't hang
    const timeoutId = setTimeout(() => {
        console.log('Hops calculation is taking longer than expected, sending initial response...');
        res.json({
            success: true,
            continueInBackground: true,
            message: 'Hops calculation initiated',
            output: 'Hops calculation process started. This will continue in the background.\n'
        });
    }, 60000); // 1 minute timeout
    
    // Create a child process to run the calculation script
    const calculateProcess = exec('/usr/local/lib/node_modules/brainstorm/src/algos/calculateHops.sh');
    
    let output = '';
    let errorOutput = '';
    
    calculateProcess.stdout.on('data', (data) => {
        console.log(`Hops calculation stdout: ${data}`);
        output += data;
    });
    
    calculateProcess.stderr.on('data', (data) => {
        console.error(`Hops calculation stderr: ${data}`);
        errorOutput += data;
    });
    
    calculateProcess.on('close', (code) => {
        console.log(`Hops calculation process exited with code ${code}`);
        
        // Clear the timeout if the command completes before the timeout
        clearTimeout(timeoutId);
        
        // Check if the response has already been sent
        if (res.headersSent) {
            console.log('Response already sent, hops calculation continuing in background');
            return;
        }
        
        if (code === 0) {
            console.log('Hops calculation completed successfully');
            res.json({
                success: true,
                message: 'Hops calculation completed successfully',
                output: output
            });
        } else {
            console.error(`Hops calculation failed with exit code ${code}`);
            res.json({
                success: false,
                message: `Hops calculation failed with exit code ${code}`,
                output: output,
                error: errorOutput
            });
        }
    });
    
    // Handle unexpected errors
    calculateProcess.on('error', (error) => {
        // Clear the timeout if an error occurs
        clearTimeout(timeoutId);
        
        // Check if the response has already been sent
        if (res.headersSent) {
            console.error(`Hops calculation error: ${error.message}`);
            return;
        }
        
        console.error(`Hops calculation error: ${error.message}`);
        res.status(500).json({
            success: false,
            message: `Hops calculation error: ${error.message}`
        });
    });
}

module.exports = {
    handleCalculateHops
};
