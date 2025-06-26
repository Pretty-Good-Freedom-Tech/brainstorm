/**
 * Delete All Relationships Command
 * Deletes all relationships from Neo4j
 */

const { exec } = require('child_process');

function handleDeleteAllRelationships(req, res) {
    console.log('Deleting all relationships from Neo4j...');
    
    // Set the response header to ensure it's always JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Set a timeout to ensure the response doesn't hang
    const timeoutId = setTimeout(() => {
        console.log('Delete all relationships is taking longer than expected, sending initial response...');
        res.json({
            success: true,
            continueInBackground: true,
            message: 'Delete all relationships initiated',
            output: 'Delete all relationships process started. This process will continue in the background.\n'
        });
    }, 120000); // 2 minutes timeout
    
    // Create a child process to run the delete script
    const deleteProcess = exec('/usr/local/lib/node_modules/brainstorm/src/manage/deleteRels/deleteAllRels/deleteAllRels.sh');
    
    let output = '';
    deleteProcess.stdout.on('data', (data) => {
        output += data;
    });
    deleteProcess.stderr.on('data', (data) => {
        output += data;
    });
    deleteProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        console.log('Delete all relationships process completed with code', code);
        res.json({
            success: true,
            continueInBackground: true,
            message: 'Delete all relationships completed',
            output
        });
    });
}

module.exports = {
    handleDeleteAllRelationships
};
