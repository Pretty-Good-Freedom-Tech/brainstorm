/**
 * Batch Transfer Command
 * Transfers kinds 3, 1984, and 10000 data from strfry to Neo4j
 */

const { exec } = require('child_process');

/**
 * Handler for batch transfer operations
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleBatchTransfer(req, res) {
    console.log('Starting batch transfer of kinds 3, 1984, and 10000 data from strfry to Neo4j...');
    
    // Set the response header to ensure it's always JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Set a timeout to ensure the response doesn't hang
    const timeoutId = setTimeout(() => {
        console.log('Batch transfer is taking longer than expected, sending initial response...');
        res.json({
            success: true,
            continueInBackground: true,
            message: 'Batch transfer initiated',
            output: 'Batch transfer process started. This process will continue in the background.\n'
        });
    }, 120000); // 2 minutes timeout
    
    // Create a child process to run the transfer script
    const transferProcess = exec('/usr/local/lib/node_modules/hasenpfeffr/src/pipeline/batch/transfer.sh');
    
    let output = '';
    let errorOutput = '';
    
    transferProcess.stdout.on('data', (data) => {
        console.log(`Batch Transfer stdout: ${data}`);
        output += data;
    });
    
    transferProcess.stderr.on('data', (data) => {
        console.error(`Batch Transfer stderr: ${data}`);
        errorOutput += data;
    });
    
    transferProcess.on('close', (code) => {
        console.log(`Batch Transfer process exited with code ${code}`);
        
        // Clear the timeout if the command completes before the timeout
        clearTimeout(timeoutId);
        
        // Check if the response has already been sent
        if (res.headersSent) {
            console.log('Response already sent, batch transfer continuing in background');
            return;
        }
        
        if (code === 0) {
            console.log('Batch transfer completed successfully');
            res.json({
                success: true,
                message: 'Batch transfer completed successfully',
                output: output
            });
        } else {
            console.error(`Batch transfer failed with exit code ${code}`);
            res.json({
                success: false,
                message: `Batch transfer failed with exit code ${code}`,
                output: output
            });
        }
    });
    
    // Handle unexpected errors
    transferProcess.on('error', (error) => {
        // Clear the timeout if an error occurs
        clearTimeout(timeoutId);
        
        // Check if the response has already been sent
        if (res.headersSent) {
            console.error(`Batch Transfer error: ${error.message}`);
            return;
        }
        
        console.error(`Batch Transfer error: ${error.message}`);
        res.status(500).json({
            success: false,
            message: `Batch transfer error: ${error.message}`
        });
    });
}

module.exports = {
    handleBatchTransfer
};
