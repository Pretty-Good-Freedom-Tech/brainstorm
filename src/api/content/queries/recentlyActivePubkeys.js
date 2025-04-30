/**
 * Recently Active Pubkeys Query
 * Returns a list of pubkeys that have been active within the last 24 hours
 * queries strfry for all kind 1 notes from the last 24 hours
 * return the entire list of pubkeys
 */

const { exec } = require('child_process');

/**
 * Handler for getting recently active pubkeys
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */

function handleGetRecentlyActivePubkeys(req, res) {
    try {
        const unixTime24HoursAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
        const getEventsCmd = `sudo strfry scan '{"kinds":[1], "since": ${unixTime24HoursAgo}, "limit": 5000}'`;
        
        exec(getEventsCmd, (error, stdout, stderr) => {
            if (error) {
              console.log(`Local strfry query failed ${stderr || error.message}`);
              return;
            }
            
            try {
              // Parse the JSON output from the script
              const events = stdout.trim().split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
              
              if (events.length > 0) {
                // extract list of pubkeys
                const pubkeys = events.map(event => event.pubkey);
                return res.json({
                  success: true,
                  numPubkeys: pubkeys.length,
                  getEventsCmd,
                  pubkeys,
                  source: 'local_strfry'
                });
              } else {
                console.log('No events found via local strfry');
                return res.json({
                  success: false,
                  message: 'No events found'
                });
              }
            } catch (parseError) {
              console.log('Error parsing strfry output:', parseError);
              return res.json({
                success: false,
                message: 'Error parsing strfry output'
              });
            }
          });
    } catch (error) {
        console.error('Error getting recently active pubkeys:', error);
        return res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}

module.exports = {
    handleGetRecentlyActivePubkeys
};