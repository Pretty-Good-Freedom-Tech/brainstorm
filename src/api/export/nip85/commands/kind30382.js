/**
 * NIP-85 Kind 30382 Commands
 * Handles creation and management of Kind 30382 events
 */

const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

/**
 * Publish Kind 30382 events
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handlePublishKind30382(req, res) {
    // Check if user is authenticated
    if (!req.session.authenticated) {
        return res.status(401).json({ 
            success: false, 
            message: 'Authentication required. Only the owner can perform this action.' 
        });
    }
    
    console.log('Publishing kind 30382 events...');
    
    // Set the response header to ensure it's always JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Get the full path to the script
    const scriptPath = path.join(process.cwd(), 'src/algos/nip85/brainstorm-publish-kind30382.js');
    console.log('Using script path:', scriptPath);
    
    // Send an initial response that the process has started
    res.json({
        success: true,
        message: 'Kind 30382 publishing started. This process will continue in the background.',
        output: 'Kind 30382 publishing started. This process will continue in the background.\n',
        error: null
    });
    
    // Execute the command with a much larger buffer size and in the background
    // after the response has been sent
    const childProcess = spawn('node', [scriptPath], {
        maxBuffer: 1024 * 1024 * 100, // 100MB buffer
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    childProcess.stdout.on('data', (data) => {
        const dataStr = data.toString();
        console.log(`Kind 30382 background process output: ${dataStr}`);
        output += dataStr;
    });
    
    childProcess.stderr.on('data', (data) => {
        const dataStr = data.toString();
        console.error(`Kind 30382 background process error: ${dataStr}`);
        errorOutput += dataStr;
    });
    
    childProcess.on('close', (code) => {
        console.log(`Kind 30382 background process exited with code ${code}`);
        
        // Save the output to a log file for debugging
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const logDir = path.join(process.cwd(), 'logs');
        
        // Create logs directory if it doesn't exist
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        const logFile = path.join(logDir, `kind30382_${timestamp}.log`);
        fs.writeFileSync(logFile, `STDOUT:\n${output}\n\nSTDERR:\n${errorOutput}\n\nExit code: ${code}`);
        console.log(`Kind 30382 process log saved to ${logFile}`);
        
        // Try to parse the last JSON output if available
        try {
            // Look for the last JSON object in the output
            const jsonMatch = output.match(/\{[\s\S]*\}/g);
            if (jsonMatch) {
                const lastJson = jsonMatch[jsonMatch.length - 1];
                const result = JSON.parse(lastJson);
                
                // Store the result in a file that can be retrieved later
                const resultFile = path.join(logDir, `kind30382_result_${timestamp}.json`);
                fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
                console.log(`Kind 30382 result saved to ${resultFile}`);
            }
        } catch (error) {
            console.error('Error parsing JSON output:', error);
        }
    });
    
    // Unref the child to allow the parent process to exit independently
    childProcess.unref();
}

module.exports = {
    handlePublishKind30382
};
