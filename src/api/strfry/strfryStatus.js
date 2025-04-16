/**
 * Brainstorm strfry status API endpoint
 * Provides information about strfry service status and event statistics
 */

const { exec } = require('child_process');

/**
 * Get strfry status including service status and event counts
 */
function getStrfryStatus(req, res) {
    console.log('Getting strfry status...');
    
    // Result object
    const result = {
        success: true,
        timestamp: Math.floor(Date.now() / 1000),
        service: { status: 'checking...' },
        events: {
            total: 0,
            recent: 0,
            byKind: {
                0: 0,    // Profiles
                1: 0,    // Notes/Tweets
                3: 0,    // Follows
                7: 0,    // Reactions
                1984: 0, // Reports
                10000: 0, // Mutes
                30818: 0, // Wiki articles
                10040: 0  // NIP-85 subscribers
            }
        }
    };
    
    // Array to collect promises for parallel execution
    const promises = [];
    
    // 1. Check Strfry service status
    promises.push(
        new Promise((resolve) => {
            exec('systemctl is-active strfry', (error, stdout, stderr) => {
                result.service.status = (stdout.trim() === 'active') ? 'running' : 'stopped';
                resolve();
            });
        })
    );
    
    // 2. Get Strfry event counts by kind
    const eventKinds = [0, 1, 3, 7, 1984, 10000, 30818, 10040];
    
    // Function to get event count for a specific kind
    function getEventCountByKind(kind) {
        return new Promise((resolve) => {
            const cmd = `sudo strfry scan --count '{"kinds":[${kind}]}'`;
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error getting count for kind ${kind}:`, error);
                    resolve();
                    return;
                }
                
                try {
                    // Parse count from output
                    const count = parseInt(stdout.trim(), 10);
                    result.events.byKind[kind] = isNaN(count) ? 0 : count;
                } catch (e) {
                    console.error(`Error parsing count for kind ${kind}:`, e);
                }
                resolve();
            });
        });
    }
    
    // Add promises for each event kind
    eventKinds.forEach(kind => {
        promises.push(getEventCountByKind(kind));
    });
    
    // 3. Get total event count
    promises.push(
        new Promise((resolve) => {
            const cmd = `sudo strfry scan --count '{}'`;
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    console.error('Error getting total event count:', error);
                    resolve();
                    return;
                }
                
                try {
                    // Parse count from output
                    const count = parseInt(stdout.trim(), 10);
                    result.events.total = isNaN(count) ? 0 : count;
                } catch (e) {
                    console.error('Error parsing total event count:', e);
                }
                resolve();
            });
        })
    );
    
    // 4. Get recent event count (past hour)
    promises.push(
        new Promise((resolve) => {
            const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
            const cmd = `sudo strfry scan --count '{"since":${oneHourAgo}}'`;
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    console.error('Error getting recent event count:', error);
                    resolve();
                    return;
                }
                
                try {
                    // Parse count from output
                    const count = parseInt(stdout.trim(), 10);
                    result.events.recent = isNaN(count) ? 0 : count;
                } catch (e) {
                    console.error('Error parsing recent event count:', e);
                }
                resolve();
            });
        })
    );
    
    // Execute all promises and return result
    Promise.all(promises)
        .then(() => {
            console.log('Strfry status data collected successfully');
            res.json(result);
        })
        .catch(error => {
            console.error('Error collecting strfry status data:', error);
            result.success = false;
            result.error = error.message;
            res.json(result);
        });
}

module.exports = {
    getStrfryStatus
};
