/**
 * NIP-85 Queries
 * Handles retrieval of information about NIP-85 events
 * These endpoints are read-only and don't require authentication
 */

const fs = require('fs');
const path = require('path');
const { getConfigFromFile } = require('../../../../utils/config');

/**
 * Get Kind 10040 event information
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object 
 */
function handleKind10040Info(req, res) {
    try {
        console.log('Fetching Kind 10040 event information');
        
        // Define data directories
        const dataDir = '/var/lib/hasenpfeffr/data';
        const publishedDir = path.join(dataDir, 'published');
        
        // Check if directories exist
        if (!fs.existsSync(publishedDir)) {
            return res.json({
                success: true,
                hasEvents: false,
                message: 'No published Kind 10040 events found',
                events: []
            });
        }
        
        // Get list of files in the published directory
        const files = fs.readdirSync(publishedDir);
        
        // Filter for Kind 10040 event files
        const kind10040Files = files.filter(file => file.startsWith('kind10040_'));
        
        if (kind10040Files.length === 0) {
            return res.json({
                success: true,
                hasEvents: false,
                message: 'No published Kind 10040 events found',
                events: []
            });
        }
        
        // Sort files by creation date (most recent first)
        kind10040Files.sort((a, b) => {
            const timeA = parseInt(a.split('_')[2]?.split('.')[0] || '0', 10);
            const timeB = parseInt(b.split('_')[2]?.split('.')[0] || '0', 10);
            return timeB - timeA;
        });
        
        // Read content of each file
        const events = [];
        for (const file of kind10040Files) {
            try {
                const filePath = path.join(publishedDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const event = JSON.parse(content);
                
                // Add file info
                const stats = fs.statSync(filePath);
                event._fileInfo = {
                    name: file,
                    created: stats.birthtime || stats.ctime,
                    size: stats.size
                };
                
                events.push(event);
            } catch (error) {
                console.error(`Error reading file ${file}:`, error);
                // Continue with next file
            }
        }
        
        return res.json({
            success: true,
            hasEvents: events.length > 0,
            count: events.length,
            events: events
        });
    } catch (error) {
        console.error('Error getting Kind 10040 event information:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

/**
 * Get Kind 30382 event information
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleKind30382Info(req, res) {
    try {
        console.log('Fetching Kind 30382 event information');
        
        // Get log directory from configuration
        const logDir = getConfigFromFile('HASENPFEFFR_LOG_DIR', '/var/log/hasenpfeffr');
        
        // Check if directory exists
        if (!fs.existsSync(logDir)) {
            return res.json({
                success: true,
                hasEvents: false,
                message: 'No Kind 30382 event logs found',
                events: []
            });
        }
        
        // Get list of files in the log directory
        const files = fs.readdirSync(logDir);
        
        // Filter for Kind 30382 result files
        const kind30382Files = files.filter(file => file.startsWith('kind30382_result_'));
        
        if (kind30382Files.length === 0) {
            return res.json({
                success: true,
                hasEvents: false,
                message: 'No Kind 30382 event logs found',
                events: []
            });
        }
        
        // Sort files by creation date (most recent first)
        kind30382Files.sort((a, b) => {
            const timeA = parseInt(a.split('_')[2]?.split('.')[0] || '0', 10);
            const timeB = parseInt(b.split('_')[2]?.split('.')[0] || '0', 10);
            return timeB - timeA;
        });
        
        // Read content of each file
        const events = [];
        for (const file of kind30382Files) {
            try {
                const filePath = path.join(logDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const event = JSON.parse(content);
                
                // Add file info
                const stats = fs.statSync(filePath);
                event._fileInfo = {
                    name: file,
                    created: stats.birthtime || stats.ctime,
                    size: stats.size
                };
                
                events.push(event);
            } catch (error) {
                console.error(`Error reading file ${file}:`, error);
                // Continue with next file
            }
        }
        
        return res.json({
            success: true,
            hasEvents: events.length > 0,
            count: events.length,
            events: events
        });
    } catch (error) {
        console.error('Error getting Kind 30382 event information:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

/**
 * Get a Kind 10040 event template
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetKind10040Event(req, res) {
    try {
        console.log('Fetching Kind 10040 event template');
        
        // Define data directory
        const dataDir = '/var/lib/hasenpfeffr/data';
        
        // Check if directory exists
        if (!fs.existsSync(dataDir)) {
            return res.status(404).json({
                success: false,
                message: 'No Kind 10040 event template found'
            });
        }
        
        // Check if event file exists
        const eventFile = path.join(dataDir, 'kind10040_event.json');
        if (!fs.existsSync(eventFile)) {
            return res.status(404).json({
                success: false,
                message: 'No Kind 10040 event template found'
            });
        }
        
        // Read the event file
        const eventContent = fs.readFileSync(eventFile, 'utf8');
        const event = JSON.parse(eventContent);
        
        return res.json({
            success: true,
            event: event
        });
    } catch (error) {
        console.error('Error getting Kind 10040 event template:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

module.exports = {
    handleKind10040Info,
    handleKind30382Info,
    handleGetKind10040Event
};
