const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Orphaned Processes Handler
 * Returns information about processes that may be orphaned (parent task died but process still running)
 */
async function handleOrphanedProcesses(req, res) {
    try {
        const eventsLogPath = path.join(process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm', 'taskQueue', 'events.jsonl');
        
        if (!fs.existsSync(eventsLogPath)) {
            return res.json({
                timestamp: new Date().toISOString(),
                status: 'success',
                data: {
                    orphanedProcesses: [],
                    totalOrphanedProcesses: 0,
                    suspiciousProcesses: []
                },
                metadata: {
                    dataSource: 'events.jsonl',
                    lastUpdated: new Date().toISOString(),
                    recordCount: 0
                }
            });
        }

        // Read and parse events log
        const eventsData = fs.readFileSync(eventsLogPath, 'utf8');
        const events = eventsData.trim().split('\n')
            .filter(line => line.trim())
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch (e) {
                    return null;
                }
            })
            .filter(event => event !== null);

        // Get recent events (last 24 hours)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentEvents = events.filter(event => {
            const eventTime = new Date(event.timestamp);
            return eventTime > twentyFourHoursAgo;
        });

        // Extract PIDs from events
        const trackedPids = new Set();
        const pidToTaskMap = new Map();
        const taskEndEvents = new Set();

        recentEvents.forEach(event => {
            // Extract PID from various event types
            let pid = null;
            if (event.metadata) {
                pid = event.metadata.pid || event.metadata.child_pid || event.metadata.neo4j_pid;
            }

            if (pid) {
                trackedPids.add(pid.toString());
                pidToTaskMap.set(pid.toString(), {
                    taskName: event.taskName,
                    target: event.target,
                    eventType: event.eventType,
                    timestamp: event.timestamp
                });
            }

            // Track task completion events
            if (event.eventType === 'TASK_END' || event.eventType === 'TASK_ERROR') {
                taskEndEvents.add(`${event.taskName}_${event.target}`);
            }
        });

        // Get currently running processes
        let runningProcesses = [];
        try {
            // Get processes related to Brainstorm tasks
            const { stdout } = await execAsync('ps aux | grep -E "(brainstorm|neo4j|cypher-shell|strfry)" | grep -v grep');
            const processLines = stdout.trim().split('\n').filter(line => line.trim());
            
            runningProcesses = processLines.map(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 11) {
                    return {
                        user: parts[0],
                        pid: parts[1],
                        cpu: parts[2],
                        mem: parts[3],
                        vsz: parts[4],
                        rss: parts[5],
                        tty: parts[6],
                        stat: parts[7],
                        start: parts[8],
                        time: parts[9],
                        command: parts.slice(10).join(' ')
                    };
                }
                return null;
            }).filter(proc => proc !== null);
        } catch (error) {
            console.warn('Could not get process list:', error.message);
        }

        // Identify potentially orphaned processes
        const orphanedProcesses = [];
        const suspiciousProcesses = [];

        runningProcesses.forEach(proc => {
            const pid = proc.pid;
            const taskInfo = pidToTaskMap.get(pid);
            
            if (taskInfo) {
                // Check if the task that started this process has ended
                const taskKey = `${taskInfo.taskName}_${taskInfo.target}`;
                if (taskEndEvents.has(taskKey)) {
                    // Task ended but process still running - potentially orphaned
                    orphanedProcesses.push({
                        pid: pid,
                        taskName: taskInfo.taskName,
                        target: taskInfo.target,
                        command: proc.command,
                        startTime: taskInfo.timestamp,
                        cpu: proc.cpu,
                        memory: proc.mem,
                        status: 'orphaned',
                        severity: 'warning',
                        actions: [
                            'Verify process is actually orphaned',
                            'Check if process can be safely terminated',
                            'Kill process if confirmed orphaned'
                        ]
                    });
                }
            } else {
                // Process not tracked in events - suspicious
                if (proc.command.includes('brainstorm') || 
                    proc.command.includes('cypher-shell') ||
                    (proc.command.includes('neo4j') && !proc.command.includes('systemd'))) {
                    
                    suspiciousProcesses.push({
                        pid: pid,
                        command: proc.command,
                        cpu: proc.cpu,
                        memory: proc.mem,
                        user: proc.user,
                        status: 'suspicious',
                        severity: 'info',
                        reason: 'Process not tracked in recent events',
                        actions: [
                            'Investigate process origin',
                            'Check if process is legitimate',
                            'Monitor process behavior'
                        ]
                    });
                }
            }
        });

        // Get additional system information
        let systemLoad = 'unknown';
        try {
            const { stdout: loadOutput } = await execAsync('uptime');
            const loadMatch = loadOutput.match(/load average: ([\d.]+)/);
            if (loadMatch) {
                systemLoad = parseFloat(loadMatch[1]);
            }
        } catch (error) {
            console.warn('Could not get system load:', error.message);
        }

        const responseData = {
            orphanedProcesses,
            totalOrphanedProcesses: orphanedProcesses.length,
            suspiciousProcesses,
            totalSuspiciousProcesses: suspiciousProcesses.length,
            systemInfo: {
                totalTrackedPids: trackedPids.size,
                totalRunningProcesses: runningProcesses.length,
                systemLoad,
                analysisTimeframe: '24 hours'
            }
        };

        res.json({
            timestamp: new Date().toISOString(),
            status: 'success',
            data: responseData,
            metadata: {
                dataSource: 'events.jsonl + ps command',
                lastUpdated: new Date().toISOString(),
                recordCount: orphanedProcesses.length + suspiciousProcesses.length
            }
        });

    } catch (error) {
        console.error('Error in handleOrphanedProcesses:', error);
        res.status(500).json({
            timestamp: new Date().toISOString(),
            status: 'error',
            error: 'Failed to get orphaned processes',
            message: error.message
        });
    }
}

module.exports = { handleOrphanedProcesses };
