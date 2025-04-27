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

    // Function to return list of pubkeys whose kind 0 events contain the search Strings 
    function getAllMatchingKind0Profiles(searchString) {
        return new Promise((resolve) => {
            const cmd = `sudo strfry scan '{"kinds":[0], "limit": 1000}'`;
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error getting matching profiles:`, error);
                    resolve();
                    return;
                }
                
                try {
                    // Parse pubkeys from output
                    const aKind0Events = stdout.trim().split('\n');
                    const pubkeys = aKind0Events.map(event => {
                        if (!event) return null;
                        if (event.includes(searchString)) {
                            const oEvent = JSON.parse(event)
                            return oEvent.pubkey
                        }
                        return null;
                    }).filter(pubkey => pubkey !== null);
                    resolve(pubkeys);
                } catch (e) {
                    console.error(`Error parsing pubkeys:`, e);
                    resolve();
                }
                resolve();
            });
        });
    }

    // if searchType == kind0, then use strfry to search
    if (searchType === 'kind0') {
        try {
            // Array to collect promises for parallel execution
            const promises = [];
            promises.push(getAllMatchingKind0Profiles(searchString));
            Promise.all(promises)
                .then(results => {
                    const pubkeys = results[0];
                    if (!pubkeys || pubkeys.length === 0) {
                        return res.json({
                            success: true,
                            message: 'No matching profiles found',
                            pubkeys: []
                        });
                    }
                    return res.json({
                        success: true,
                        message: 'kind0 search results',
                        numPubkeys: pubkeys.length,
                        pubkeys
                    });
                })
                .catch(error => {
                    return res.status(400).json({
                        success: false,
                        message: 'kind0 search failure',
                        error
                    });
                });
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: 'kind0 search failure',
                error
            });
        }
    }
}

module.exports = {
    handleSearchProfiles
};