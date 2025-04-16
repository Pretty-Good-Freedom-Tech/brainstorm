/**
 * NIP-85 Kind 10040 Commands
 * Handles creation and management of Kind 10040 events
 */

const path = require('path');
const { exec } = require('child_process');
const { spawn } = require('child_process');
const fs = require('fs');

/**
 * Create Kind 10040 events
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleCreateKind10040(req, res) {
    // Check if user is authenticated
    if (!req.session.authenticated) {
        return res.status(401).json({ 
            success: false, 
            message: 'Authentication required. Only the owner can perform this action.' 
        });
    }
    
    console.log('Creating kind 10040 events...');
    
    // Set the response header to ensure it's always JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Get the full path to the script
    const scriptPath = path.join(process.cwd(), 'bin', 'brainstorm-create-kind10040.js');
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

/**
 * Publish Kind 10040 events
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handlePublishKind10040(req, res) {
    // Check if user is authenticated
    if (!req.session.authenticated) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        // Get the signed event from the request
        const { event: signedEvent } = req.body;
        
        if (!signedEvent) {
            return res.status(400).json({ 
                success: false, 
                error: 'No signed event provided' 
            });
        }
        
        // Verify that the event has a signature
        // In a production environment, you would want to use a proper Nostr library for verification
        // Now we'll check that the pubkey matches and the challenge is in the header
        
        const sessionPubkey = req.session.pubkey;
        const sessionChallenge = req.session.challenge;
        
        if (!sessionPubkey || !sessionChallenge) {
            return res.status(400).json({ 
                success: false, 
                message: 'No active authentication session' 
            });
        }
        
        // Check pubkey matches
        if (signedEvent.pubkey !== sessionPubkey) {
            return res.json({ 
                success: false, 
                message: 'Public key mismatch' 
            });
        }
        
        // Check challenge is included in the header instead of tags
        const headerChallenge = req.headers['x-challenge'];
        
        if (!headerChallenge || headerChallenge !== sessionChallenge) {
            return res.json({ 
                success: false, 
                message: 'Challenge verification failed' 
            });
        }
        
        // Set session as authenticated
        req.session.authenticated = true;
        
        // Store nsec in session if provided
        if (req.body.nsec) {
            req.session.nsec = req.body.nsec;
            console.log('Private key stored in session for signing events');
        }
        
        // Define data directories
        const dataDir = '/var/lib/brainstorm/data';
        const publishedDir = path.join(dataDir, 'published');
        
        // Create directories if they don't exist
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        if (!fs.existsSync(publishedDir)) {
            fs.mkdirSync(publishedDir, { recursive: true });
        }
        
        // Save the signed event to a file
        const signedEventFile = path.join(publishedDir, `kind10040_${signedEvent.id.substring(0, 8)}_${Date.now()}.json`);
        fs.writeFileSync(signedEventFile, JSON.stringify(signedEvent, null, 2));
        
        // Execute the publish script with the signed event file
        const scriptPath = path.join(process.cwd(), 'src', 'algos', 'nip85', 'publish_nip85_10040.mjs');
        
        // Run the script as a child process
        const child = spawn('node', [scriptPath], {
            env: {
                ...process.env,
                SIGNED_EVENT_FILE: signedEventFile
            }
        });
        
        let output = '';
        let errorOutput = '';
        
        child.stdout.on('data', (data) => {
            const dataStr = data.toString();
            console.log(`publish_nip85_10040.mjs stdout: ${dataStr}`);
            output += dataStr;
        });
        
        child.stderr.on('data', (data) => {
            const dataStr = data.toString();
            console.error(`publish_nip85_10040.mjs stderr: ${dataStr}`);
            errorOutput += dataStr;
        });
        
        child.on('close', (code) => {
            console.log(`publish_nip85_10040.mjs exited with code ${code}`);
            
            // Save the output to a log file for debugging
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const logDir = path.join(process.cwd(), 'logs');
            
            // Create logs directory if it doesn't exist
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            
            const logFile = path.join(logDir, `kind10040_${timestamp}.log`);
            fs.writeFileSync(logFile, `STDOUT:\n${output}\n\nSTDERR:\n${errorOutput}\n\nExit code: ${code}`);
            console.log(`Kind 10040 process log saved to ${logFile}`);
            
            // Try to parse the last JSON output if available
            try {
                // Look for the last JSON object in the output
                const jsonMatch = output.match(/\{[\s\S]*\}/g);
                if (jsonMatch) {
                    const lastJson = jsonMatch[jsonMatch.length - 1];
                    const result = JSON.parse(lastJson);
                    
                    // Store the result in a file that can be retrieved later
                    const resultFile = path.join(logDir, `kind10040_result_${timestamp}.json`);
                    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
                    console.log(`Kind 10040 result saved to ${resultFile}`);
                }
            } catch (error) {
                console.error('Error parsing JSON output:', error);
            }
        });
        
        // Unref the child to allow the parent process to exit independently
        child.unref();
        
        // Return success response to the client
        return res.json({
            success: true,
            message: 'Kind 10040 event publishing started',
            file: signedEventFile
        });
        
    } catch (error) {
        console.error('Error publishing kind 10040 event:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
}

module.exports = {
    handleCreateKind10040,
    handlePublishKind10040
};
