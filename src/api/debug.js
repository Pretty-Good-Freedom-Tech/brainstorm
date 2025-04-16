/**
 * Debug API endpoint for troubleshooting server issues
 */

const fs = require('fs');
const { exec } = require('child_process');

/**
 * Debug endpoint that tests various components to help diagnose 502 errors
 */
function getDebugInfo(req, res) {
    console.log('Running debug checks...');
    
    // Result object
    const result = {
        success: true,
        timestamp: Math.floor(Date.now() / 1000),
        filesystem: {
            brainstormConfExists: false,
            permissions: {}
        },
        commands: {
            systemctl: false,
            whoami: ''
        },
        environment: {
            path: process.env.PATH,
            nodeEnv: process.env.NODE_ENV,
            user: process.env.USER || process.env.USERNAME
        }
    };
    
    // Check if config file exists
    try {
        const confFile = '/etc/brainstorm.conf';
        result.filesystem.brainstormConfExists = fs.existsSync(confFile);
        
        if (result.filesystem.brainstormConfExists) {
            try {
                // Check file permissions
                const stats = fs.statSync(confFile);
                result.filesystem.permissions.mode = stats.mode.toString(8);
                result.filesystem.permissions.uid = stats.uid;
                result.filesystem.permissions.gid = stats.gid;
                
                // Try reading a small portion of the file
                const fileHead = fs.readFileSync(confFile, { encoding: 'utf8', flag: 'r', length: 100 });
                result.filesystem.permissions.canRead = true;
                result.filesystem.filePreview = fileHead.substring(0, 20) + '...'; // Just show first 20 chars
            } catch (error) {
                result.filesystem.permissions.error = error.message;
            }
        }
    } catch (error) {
        result.filesystem.error = error.message;
    }
    
    // Test commands
    const promises = [];
    
    // Test systemctl
    promises.push(
        new Promise((resolve) => {
            exec('which systemctl', (error, stdout, stderr) => {
                result.commands.systemctlPath = stdout.trim();
                if (!error && stdout.trim()) {
                    result.commands.systemctl = true;
                }
                resolve();
            });
        })
    );
    
    // Test whoami command
    promises.push(
        new Promise((resolve) => {
            exec('whoami', (error, stdout, stderr) => {
                result.commands.whoami = stdout.trim();
                resolve();
            });
        })
    );
    
    // Test logger
    promises.push(
        new Promise((resolve) => {
            try {
                console.log('DEBUG: Testing logging');
                console.error('DEBUG: Testing error logging');
                result.logging = true;
            } catch (error) {
                result.logging = false;
                result.loggingError = error.message;
            }
            resolve();
        })
    );
    
    // Return results after all checks complete
    Promise.all(promises)
        .then(() => {
            res.json(result);
        })
        .catch((error) => {
            result.success = false;
            result.error = error.message;
            res.json(result);
        });
}

module.exports = {
    getDebugInfo
};
