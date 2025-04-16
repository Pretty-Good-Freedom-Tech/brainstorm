/**
 * Strfry Plugin Toggle Command
 * Handles enabling or disabling the strfry content filtering plugin
 */

const fs = require('fs');
const { execSync } = require('child_process');
const { getConfigFromFile } = require('../../../utils/config');

/**
 * Handler for enabling or disabling the strfry plugin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleToggleStrfryPlugin(req, res) {
    const action = req.query.action || req.body.action;
    
    if (!action) {
        return res.status(400).json({ error: 'Missing action parameter' });
    }

    if (action !== 'enable' && action !== 'disable') {
        return res.status(400).json({ error: 'Invalid action. Use enable or disable.' });
    }

    try {
        // Define paths
        const strfryConfPath = '/etc/strfry.conf';
        const strfryRouterConfPath = '/etc/strfry-router.config';
        
        // Check if strfry.conf exists
        if (!fs.existsSync(strfryConfPath)) {
            return res.status(404).json({ error: 'strfry.conf not found' });
        }
        
        // Read current config
        let confContent = fs.readFileSync(strfryConfPath, 'utf8');
        
        // Check current plugin status
        // Look for the plugin setting in the writePolicy section
        const writePolicyPluginRegex = /writePolicy\s*{[^}]*plugin\s*=\s*"([^"]*)"/s;
        const writePolicyMatch = confContent.match(writePolicyPluginRegex);
        
        // Also check for the relay.writePolicy.plugin line that might have been added incorrectly
        const relayPluginRegex = /relay\.writePolicy\.plugin\s*=\s*"([^"]*)"/;
        const relayMatch = confContent.match(relayPluginRegex);
        
        // Set plugin path
        const pluginPath = '/usr/local/lib/strfry/plugins/brainstorm.js';
        
        // Ensure plugin directory exists
        if (!fs.existsSync('/usr/local/lib/strfry/plugins')) {
            execSync('sudo mkdir -p /usr/local/lib/strfry/plugins');
        }
        
        // Copy plugin file if it doesn't exist at destination
        if (!fs.existsSync(pluginPath)) {
            execSync(`sudo cp /usr/local/lib/node_modules/brainstorm/plugins/brainstorm.js ${pluginPath}`);
            execSync(`sudo chmod +x ${pluginPath}`);
        }
        
        // Update strfry.conf based on action
        if (action === 'enable') {
            if (writePolicyMatch) {
                // Update the existing plugin setting in the writePolicy section
                confContent = confContent.replace(writePolicyPluginRegex, (match) => {
                    return match.replace(/plugin\s*=\s*"[^"]*"/, `plugin = "${pluginPath}"`);
                });
            } else {
                // If writePolicy section exists but without plugin setting, we need to add it
                const writePolicySectionRegex = /(writePolicy\s*{[^}]*)(})/s;
                const writePolicySectionMatch = confContent.match(writePolicySectionRegex);
                
                if (writePolicySectionMatch) {
                    confContent = confContent.replace(writePolicySectionRegex, `$1        plugin = "${pluginPath}"\n    $2`);
                } else {
                    // If writePolicy section doesn't exist, this is unexpected but we'll add it
                    confContent += `\n    writePolicy {\n        plugin = "${pluginPath}"\n    }\n`;
                }
            }
        } else { // action === 'disable'
            if (writePolicyMatch) {
                // Update the existing plugin setting in the writePolicy section to empty string
                confContent = confContent.replace(writePolicyPluginRegex, (match) => {
                    return match.replace(/plugin\s*=\s*"[^"]*"/, 'plugin = ""');
                });
            } else {
                // If writePolicy section exists but without plugin setting, we need to add it
                const writePolicySectionRegex = /(writePolicy\s*{[^}]*)(})/s;
                const writePolicySectionMatch = confContent.match(writePolicySectionRegex);
                
                if (writePolicySectionMatch) {
                    confContent = confContent.replace(writePolicySectionRegex, `$1        plugin = ""\n    $2`);
                } else {
                    // If writePolicy section doesn't exist, this is unexpected but we'll add it
                    confContent += `\n    writePolicy {\n        plugin = ""\n    }\n`;
                }
            }
        }
        
        // Remove any incorrect relay.writePolicy.plugin line if it exists
        if (relayMatch) {
            confContent = confContent.replace(/\nrelay\.writePolicy\.plugin\s*=\s*"[^"]*"\n?/, '\n');
        }
        
        // Write config to a temporary file and then use sudo to move it
        const tempConfigPath = '/tmp/strfry.conf.tmp';
        fs.writeFileSync(tempConfigPath, confContent);
        execSync(`sudo cp ${tempConfigPath} ${strfryConfPath}`);
        fs.unlinkSync(tempConfigPath);
        
        // Update strfry-router.config based on action
        try {
            // Set source config path
            let sourceConfigPath;
            if (action === 'enable') {
                sourceConfigPath = '/usr/local/lib/node_modules/brainstorm/setup/strfry-router-plugin.config';
            } else { // action === 'disable'
                sourceConfigPath = '/usr/local/lib/node_modules/brainstorm/setup/strfry-router.config';
            }
            
            // Check if source config exists
            if (!fs.existsSync(sourceConfigPath)) {
                console.error(`Source config file not found: ${sourceConfigPath}`);
                return res.status(404).json({ error: `Source config file not found: ${sourceConfigPath}` });
            }
            
            // Get owner pubkey from brainstorm.conf
            const ownerPubkey = getConfigFromFile('BRAINSTORM_OWNER_PUBKEY', '');
            
            if (!ownerPubkey) {
                console.warn('BRAINSTORM_OWNER_PUBKEY not found in configuration');
            }
            
            // Read the config file content
            let routerConfigContent = fs.readFileSync(sourceConfigPath, 'utf8');
            
            // Replace ${ownerPubkey} placeholder with actual owner pubkey
            routerConfigContent = routerConfigContent.replace(/\${ownerPubkey}/g, ownerPubkey);
            
            // Write the modified content to a temporary file
            const tempRouterConfigPath = '/tmp/strfry-router.config.tmp';
            fs.writeFileSync(tempRouterConfigPath, routerConfigContent);
            
            // Copy the temporary file to the destination
            execSync(`sudo cp ${tempRouterConfigPath} ${strfryRouterConfPath}`);
            fs.unlinkSync(tempRouterConfigPath);
            
            // Restart strfry service
            execSync('sudo systemctl restart strfry');
            
            return res.json({ 
                success: true,
                status: action === 'enable' ? 'enabled' : 'disabled', 
                message: `Plugin ${action === 'enable' ? 'enabled' : 'disabled'} successfully and strfry service restarted`
            });
        } catch (configError) {
            console.error('Error updating strfry-router.config:', configError);
            return res.status(500).json({ 
                success: false,
                error: `Error updating strfry-router.config: ${configError.message}`,
                status: action === 'enable' ? 'enabled' : 'disabled',
                message: `Plugin ${action === 'enable' ? 'enabled' : 'disabled'} but strfry-router.config update failed`
            });
        }
    } catch (error) {
        console.error('Error handling strfry plugin toggle:', error);
        return res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}

module.exports = {
    handleToggleStrfryPlugin
};
