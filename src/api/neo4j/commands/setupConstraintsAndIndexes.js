/**
 * Handler for Neo4j constraints and indexes setup
 * 
 * This module provides an endpoint to set up Neo4j constraints and indexes
 */

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { getConfigFromFile } = require('../../../utils/config');

/**
 * Handles the setup of Neo4j constraints and indexes
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function handleNeo4jSetupConstraintsAndIndexes(req, res) {
    console.log('Setting up Neo4j constraints and indexes...');
    
    // Set response type to JSON to ensure we don't get HTML responses
    res.setHeader('Content-Type', 'application/json');
    
    try {
        // Calculate the absolute path to the setup script
        // From /src/api/neo4j/commands to /setup
        const setupScript = path.resolve(__dirname, '../../../../setup/neo4jConstraintsAndIndexes.sh');
        
        console.log(`Using setup script: ${setupScript}`);
        
        // Check if the script exists
        if (!fs.existsSync(setupScript)) {
            console.error(`Neo4j constraints setup script not found at: ${setupScript}`);
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
            return res.json({
                success: true,
                message: 'Neo4j constraints and indexes set up successfully',
                output: stdout
            });
        });
    } catch (error) {
        console.error('Unexpected error in handleNeo4jSetupConstraintsAndIndexes:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error: ' + error.message
        });
    }
}

module.exports = {
    handleNeo4jSetupConstraintsAndIndexes
};