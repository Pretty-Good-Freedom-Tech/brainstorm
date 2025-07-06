/**
 * Reconciliation Command
 * Handles merging and reconciling kinds 3, 1984, and 10000 data from strfry to Neo4j
 */

const { exec } = require('child_process');

/**
 * Handler for reconciliation operations
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleReconciliation(req, res) {
    console.log('Starting reconciliation of kinds 3, 1984, and 10000 data from strfry to Neo4j...');
    
    // Set the response header to ensure it's always JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Set a timeout to ensure the response doesn't hang
    const timeoutId = setTimeout(() => {
        console.log('Reconciliation is taking longer than expected, sending initial response...');
        res.json({
            success: true,
            continueInBackground: true,
            message: 'Reconciliation initiated',
            output: 'Reconciliation process started. This will continue in the background.\n'
        });
    }, 120000); // 2 minutes timeout
    
    // Create a child process to run the reconciliation script
    const reconciliationProcess = exec('sudo /usr/local/lib/node_modules/brainstorm/src/pipeline/reconciliation/reconciliation.sh');
    
    let output = '';
    let errorOutput = '';
    
    reconciliationProcess.stdout.on('data', (data) => {
        console.log(`Reconciliation stdout: ${data}`);
        output += data;
    });
    
    reconciliationProcess.stderr.on('data', (data) => {
        console.error(`Reconciliation stderr: ${data}`);
        errorOutput += data;
    });
    
    reconciliationProcess.on('close', (code) => {
        console.log(`Reconciliation process exited with code ${code}`);
        
        // Clear the timeout if the command completes before the timeout
        clearTimeout(timeoutId);
        
        // Check if the response has already been sent
        if (res.headersSent) {
            console.log('Response already sent, reconciliation continuing in background');
            return;
        }
        
        if (code === 0) {
            console.log('Reconciliation completed successfully');
            res.json({
                success: true,
                message: 'Reconciliation completed successfully',
                output: output
            });
        } else {
            console.error(`Reconciliation failed with exit code ${code}`);
            res.json({
                success: false,
                message: `Reconciliation failed with exit code ${code}`,
                output: output
            });
        }
    });
    
    // Handle unexpected errors
    reconciliationProcess.on('error', (error) => {
        // Clear the timeout if an error occurs
        clearTimeout(timeoutId);
        
        // Check if the response has already been sent
        if (res.headersSent) {
            console.error(`Reconciliation error: ${error.message}`);
            return;
        }
        
        console.error(`Reconciliation error: ${error.message}`);
        res.status(500).json({
            success: false,
            message: `Reconciliation error: ${error.message}`
        });
    });
}

module.exports = {
    handleReconciliation
};
