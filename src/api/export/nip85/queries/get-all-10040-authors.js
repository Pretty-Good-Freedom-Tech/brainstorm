/**
 * API endpoint to get all unique author pubkeys from Kind 30382 events
 * Executes strfry scan command and extracts unique authors
 */

const { execSync } = require('child_process');

async function handleGetAll10040Authors(req, res) {
    try {
        console.log('[get-all-10040-authors] Starting to scan for Kind 30382 events...');
        
        // Execute strfry scan command to get all Kind 30382 events
        const strfryCommand = `sudo strfry scan '{"kinds":[30382]}'`;
        
        console.log('[get-all-10040-authors] Executing command:', strfryCommand);
        
        let strfryOutput;
        try {
            strfryOutput = execSync(strfryCommand, { 
                encoding: 'utf8',
                maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large outputs
                timeout: 60000 // 60 second timeout
            });
        } catch (execError) {
            console.error('[get-all-10040-authors] Error executing strfry command:', execError);
            return res.status(500).json({
                success: false,
                message: 'Failed to execute strfry scan command',
                error: execError.message
            });
        }
        
        console.log('[get-all-10040-authors] Strfry command completed, processing output...');
        
        // Parse the output - each line should be a JSON event
        const lines = strfryOutput.trim().split('\n').filter(line => line.trim());
        const uniqueAuthors = new Set();
        let processedEvents = 0;
        let errorCount = 0;
        
        for (const line of lines) {
            try {
                const event = JSON.parse(line);
                
                // Validate that this is a Kind 30382 event and has a pubkey
                if (event.kind === 30382 && event.pubkey) {
                    uniqueAuthors.add(event.pubkey);
                    processedEvents++;
                } else {
                    console.warn('[get-all-10040-authors] Invalid event format or missing pubkey:', {
                        kind: event.kind,
                        hasPubkey: !!event.pubkey
                    });
                }
            } catch (parseError) {
                errorCount++;
                console.error('[get-all-10040-authors] Error parsing event JSON:', parseError.message);
                // Continue processing other events even if some fail to parse
            }
        }
        
        // Convert Set to Array for response
        const authorsList = Array.from(uniqueAuthors);
        
        console.log('[get-all-10040-authors] Processing complete:', {
            totalLines: lines.length,
            processedEvents,
            errorCount,
            uniqueAuthors: authorsList.length
        });
        
        // Return the results
        res.json({
            success: true,
            data: {
                count: authorsList.length,
                authors: authorsList,
                stats: {
                    totalEventsScanned: lines.length,
                    validEventsProcessed: processedEvents,
                    parseErrors: errorCount
                }
            },
            message: `Found ${authorsList.length} unique authors from ${processedEvents} Kind 30382 events`
        });
        
    } catch (error) {
        console.error('[get-all-10040-authors] Unexpected error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while processing Kind 30382 authors',
            error: error.message
        });
    }
}

module.exports = {
    handleGetAll10040Authors
};