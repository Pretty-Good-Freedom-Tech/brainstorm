/**
 * Hasenpfeffr lists status API endpoint
 * Provides information about whitelist and blacklist status
 */

const fs = require('fs');

/**
 * Get whitelist and blacklist status
 */
function getListStatus(req, res) {
    console.log('Getting whitelist and blacklist status...');
    
    // Result object
    const result = {
        success: true,
        timestamp: Math.floor(Date.now() / 1000),
        whitelist: {
            count: 0,
            lastUpdated: null
        },
        blacklist: {
            count: 0,
            lastUpdated: null
        }
    };
    
    // Define path to Strfry plugins data
    const strfryPluginsData = process.env.STRFRY_PLUGINS_DATA || '/var/lib/strfry/plugins/data';
    
    // Array to collect promises for parallel execution
    const promises = [];
    
    // 1. Check whitelist count and last updated
    promises.push(
        new Promise((resolve) => {
            const whitelistPath = `${strfryPluginsData}/whitelist_pubkeys.json`;
            fs.access(whitelistPath, fs.constants.F_OK, (err) => {
                if (err) {
                    console.error('Whitelist file not found:', err);
                    resolve();
                    return;
                }
                
                fs.stat(whitelistPath, (statErr, stats) => {
                    if (statErr) {
                        console.error('Error getting whitelist file stats:', statErr);
                        resolve();
                        return;
                    }
                    
                    result.whitelist.lastUpdated = Math.floor(stats.mtime.getTime() / 1000);
                    
                    // Read and count entries
                    fs.readFile(whitelistPath, 'utf8', (readErr, data) => {
                        if (readErr) {
                            console.error('Error reading whitelist file:', readErr);
                            resolve();
                            return;
                        }
                        
                        try {
                            const whitelist = JSON.parse(data);
                            result.whitelist.count = Object.keys(whitelist).length;
                        } catch (e) {
                            console.error('Error parsing whitelist file:', e);
                        }
                        resolve();
                    });
                });
            });
        })
    );
    
    // 2. Check blacklist count and last updated
    promises.push(
        new Promise((resolve) => {
            const blacklistPath = `${strfryPluginsData}/blacklist_pubkeys.json`;
            fs.access(blacklistPath, fs.constants.F_OK, (err) => {
                if (err) {
                    console.error('Blacklist file not found:', err);
                    resolve();
                    return;
                }
                
                fs.stat(blacklistPath, (statErr, stats) => {
                    if (statErr) {
                        console.error('Error getting blacklist file stats:', statErr);
                        resolve();
                        return;
                    }
                    
                    result.blacklist.lastUpdated = Math.floor(stats.mtime.getTime() / 1000);
                    
                    // Read and count entries
                    fs.readFile(blacklistPath, 'utf8', (readErr, data) => {
                        if (readErr) {
                            console.error('Error reading blacklist file:', readErr);
                            resolve();
                            return;
                        }
                        
                        try {
                            const blacklist = JSON.parse(data);
                            result.blacklist.count = Object.keys(blacklist).length;
                        } catch (e) {
                            console.error('Error parsing blacklist file:', e);
                        }
                        resolve();
                    });
                });
            });
        })
    );
    
    // Execute all promises and return result
    Promise.all(promises)
        .then(() => {
            console.log('List status data collected successfully');
            res.json(result);
        })
        .catch(error => {
            console.error('Error collecting list status data:', error);
            result.success = false;
            result.error = error.message;
            res.json(result);
        });
}

module.exports = {
    getListStatus
};
