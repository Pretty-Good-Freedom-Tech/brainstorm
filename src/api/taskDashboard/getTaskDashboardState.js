const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const StructuredEventsAnalyzer = require('./structuredEventsAnalyzer');

/**
 * API endpoint to get comprehensive task dashboard state
 * 
 * This endpoint serves data for the owner task management dashboard
 * by reading the system state gathered by systemStateGatherer.js
 */

async function getTaskDashboardState(req, res) {
    try {
        // TODO: Add owner authentication check
        // For now, allowing access for development
        
        const config = loadConfig();
        const stateFile = path.join(config.BRAINSTORM_LOG_DIR, 'taskQueue', 'fullSystemState.json');
        
        // Check if state file exists
        if (!fs.existsSync(stateFile)) {
            // If no state file exists, try to generate one quickly
            try {
                const stateGathererPath = path.join(config.BRAINSTORM_MODULE_MANAGE_DIR, 'taskQueue', 'systemStateGatherer.js');
                if (fs.existsSync(stateGathererPath)) {
                    execSync(`node "${stateGathererPath}"`, { timeout: 10000 }); // 10 second timeout
                }
            } catch (error) {
                console.error('Error generating state file:', error.message);
            }
        }
        
        // Try to read state file again
        if (fs.existsSync(stateFile)) {
            try {
                const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
                
                // Enhance with structured events analysis (Phase 2)
                try {
                    const eventsAnalyzer = new StructuredEventsAnalyzer(config);
                    const eventsData = eventsAnalyzer.generateDashboardData();
                    
                    stateData.structuredEvents = eventsData;
                    stateData.enhanced = true;
                } catch (eventsError) {
                    console.error('Error analyzing structured events:', eventsError.message);
                    stateData.structuredEvents = {
                        summary: { message: 'Structured events analysis unavailable' },
                        performance: {},
                        realTime: { runningTasks: [], recentActivity: [] },
                        customers: []
                    };
                    stateData.enhanced = false;
                }
                
                // Add some real-time data that might not be in the cached state
                stateData.realtime = {
                    timestamp: new Date().toISOString(),
                    serverUptime: getServerUptime(),
                    currentLoad: getCurrentLoad()
                };
                
                res.json(stateData);
                return;
            } catch (error) {
                console.error('Error reading state file:', error.message);
            }
        }
        
        // Fallback: return minimal state if file doesn't exist or can't be read
        res.json({
            timestamp: new Date().toISOString(),
            error: 'State file not available',
            customers: { error: 'State file not available' },
            taskHistory: { error: 'State file not available' },
            systemHealth: { error: 'State file not available' },
            failedTasks: [],
            priorityQueue: [],
            taskStatus: []
        });
        
    } catch (error) {
        console.error('Error in getTaskDashboardState:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

function loadConfig() {
    const configFile = '/etc/brainstorm.conf';
    const configContent = fs.readFileSync(configFile, 'utf8');
    const config = {};
    
    configContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const [key, value] = trimmed.split('=', 2);
            config[key.trim()] = value.trim().replace(/['"]/g, '');
        }
    });
    
    return config;
}

function getServerUptime() {
    try {
        const output = execSync('uptime', { encoding: 'utf8' });
        return output.trim();
    } catch (error) {
        return 'Unknown';
    }
}

function getCurrentLoad() {
    try {
        const output = execSync('uptime', { encoding: 'utf8' });
        const match = output.match(/load average: ([\d.]+)/);
        return match ? parseFloat(match[1]) : null;
    } catch (error) {
        return null;
    }
}

module.exports = getTaskDashboardState;
