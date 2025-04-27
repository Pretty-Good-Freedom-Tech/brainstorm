/**
 * Search Profiles API
 * Provides data for searching profiles
 * 
 * Search kind0 notes in strfry database
 * 
 * Returns an array of pubkeys
 */

const { exec } = require('child_process');
const nostrTools = require('nostr-tools');

/**
 * Search profiles
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleSearchProfiles(req, res) {
    const searchType = req.query.searchType; // npub (fragment), pubkey (fragment), kind0 (name, username, about, picture, banner, lnpub)
    const searchString = req.query.searchString;
    
    if (!searchType || !searchString) {
        return res.status(400).json({
            success: false,
            error: 'Missing search parameter; expecting searchType and searchString'
        });
    }

    // if searchType is not npub or kind0, return an error
    if (searchType !== 'npub' && searchType !== 'kind0') {
        return res.status(400).json({
            success: false,
            error: 'Invalid search type; expecting npub or kind0'
        });
    }

    // if searchType == npub, then use nip19 to get the pubkey
    if (searchType === 'npub') {
        try {
            const decodeResults = nostrTools.nip19.decode(searchString);
            if (decodeResults.type !== 'npub') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid search type; expecting npub'
                });
            }
            // return here
            return res.json({
                success: true,
                searchType,
                searchString,
                decodeResultsType: decodeResults.type,
                pubkey: decodeResults.data,
                error: null
            });
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: 'nip19 decode failure',
                error
            });
        }
    }

    // if searchType == kind0, then use strfry to search
    if (searchType === 'kind0') {
        try {
            let searchResult;
            // Retrieve all kind 0 events from strfry database
            // execute this bash command:
            // sudo strfry scan '{"kind": [0]}'
            // Build the command for all kind0 notes
            const command = `sudo strfry scan '{"kind": [0]}'`;
            console.log(`Executing command: ${command}`);
            
            exec(command, (error, stdout, stderr) => {
                // Check if the response has already been sent
                if (res.headersSent) {
                    console.log('Response already sent, search continuing in background');
                    return;
                }
                
                // if searchType == kind0, scan through events to find matches
                const events = JSON.parse(stdout);
                const matches = events.filter(event => event.content.includes(searchString));
                return res.json({
                    success: true,
                    searchType,
                    searchString,
                    matches,
                    error: null
                });
            });
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: 'strfry scan failure',
                error
            });
        }
    }
}

module.exports = {
    handleSearchProfiles
};
