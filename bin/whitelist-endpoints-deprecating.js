// Whitelist API endpoints for the Hasenpfeffr Control Panel
const fs = require('fs');
const exec = require('child_process').exec;

// Handler for getting current whitelist count and last calculation time
function handleGetWhitelistCount(req, res) {
    // Get the whitelist file path from configuration
    const strfryPluginsData = process.env.STRFRY_PLUGINS_DATA || '/var/lib/strfry/plugins';
    const whitelistPath = `${strfryPluginsData}/whitelist_pubkeys.json`;
    
    try {
        // Check if whitelist file exists
        if (!fs.existsSync(whitelistPath)) {
            return res.json({
                success: true,
                count: 0,
                lastCalculated: 0,
                message: 'Whitelist file not found'
            });
        }
        
        // Read the whitelist file
        const whitelistContent = fs.readFileSync(whitelistPath, 'utf8');
        
        try {
            // Parse the whitelist JSON
            const whitelistJson = JSON.parse(whitelistContent);
            
            // Count the number of pubkeys
            const pubkeyCount = Object.keys(whitelistJson).length;
            
            // Get the last calculation time from whitelist.conf
            let lastCalculated = 0;
            try {
                const whitelistConf = fs.readFileSync('/etc/whitelist.conf', 'utf8');
                const match = whitelistConf.match(/WHEN_LAST_CALCULATED=(\d+)/);
                if (match && match[1]) {
                    lastCalculated = parseInt(match[1], 10);
                }
            } catch (confError) {
                console.error('Error reading whitelist.conf:', confError);
                // Continue without the timestamp
            }
            
            return res.json({
                success: true,
                count: pubkeyCount,
                lastCalculated: lastCalculated
            });
        } catch (jsonError) {
            console.error('Error parsing whitelist JSON:', jsonError);
            return res.json({
                success: false,
                error: 'Invalid whitelist file format'
            });
        }
    } catch (error) {
        console.error('Error reading whitelist file:', error);
        return res.json({
            success: false,
            error: error.message
        });
    }
}

module.exports = {
    handleGetWhitelistCount
};
