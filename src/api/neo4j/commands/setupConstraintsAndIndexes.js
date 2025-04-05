/**
 * Hasenpfeffr Neo4j API endpoint
 * Install Constraints and Indexes
 */

const { exec } = require('child_process');

/**
 * Generate Neo4j constraints and indexes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleNeo4jSetupConstraintsAndIndexes(req, res) {
    console.log('Setting up Neo4j constraints and indexes...');
    
    // Define the setup script
    const setupScript = '/usr/local/lib/node_modules/hasenpfeffr/setup/neo4jConstraintsAndIndexes.sh';
    
    // Check if the script exists
    if (!fs.existsSync(setupScript)) {
        return res.status(404).json({ 
            success: false, 
            error: 'Setup script not found',
            output: `Script not found at: ${setupScript}`
        });
    }
    
    // Make the script executable
    try {
        fs.chmodSync(setupScript, '755');
    } catch (error) {
        console.error('Error making script executable:', error);
    }
    
    // Execute the script
    exec(setupScript, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing Neo4j constraints setup: ${error.message}`);
            return res.json({
                success: false,
                error: error.message,
                output: stdout + '\n' + stderr
            });
        }
        
        console.log('Neo4j constraints and indexes set up successfully');
        res.json({
            success: true,
            message: 'Neo4j constraints and indexes set up successfully',
            output: stdout
        });
    });
}

module.exports = {
    handleNeo4jSetupConstraintsAndIndexes
};