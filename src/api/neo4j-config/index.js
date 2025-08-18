/**
 * Neo4j Resource Configuration Overview API
 * Provides comprehensive system and Neo4j configuration analysis
 * 
 * handles endpoint: /api/neo4j-config/overview
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class Neo4jConfigAnalyzer {
    constructor() {
        this.neo4jHome = process.env.NEO4J_HOME || '/var/lib/neo4j';
        this.neo4jConf = process.env.NEO4J_CONF || '/etc/neo4j';
        this.javaHome = process.env.JAVA_HOME || '/usr/lib/jvm/default-java';
    }

    // Get system resources
    async getSystemResources() {
        try {
            const resources = {};
            
            // Total system memory
            const memInfo = fs.readFileSync('/proc/meminfo', 'utf8');
            const totalMemMatch = memInfo.match(/MemTotal:\s+(\d+)\s+kB/);
            const availMemMatch = memInfo.match(/MemAvailable:\s+(\d+)\s+kB/);
            
            resources.totalMemoryGB = totalMemMatch ? Math.round(parseInt(totalMemMatch[1]) / 1024 / 1024 * 100) / 100 : 0;
            resources.availableMemoryGB = availMemMatch ? Math.round(parseInt(availMemMatch[1]) / 1024 / 1024 * 100) / 100 : 0;
            
            // CPU information
            const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
            const cpuCores = (cpuInfo.match(/^processor\s*:/gm) || []).length;
            const cpuModelMatch = cpuInfo.match(/model name\s*:\s*(.+)/);
            
            resources.cpuCores = cpuCores;
            resources.cpuModel = cpuModelMatch ? cpuModelMatch[1].trim() : 'Unknown';
            
            // Load average
            const loadAvg = fs.readFileSync('/proc/loadavg', 'utf8').split(' ');
            resources.loadAverage = {
                '1min': parseFloat(loadAvg[0]),
                '5min': parseFloat(loadAvg[1]),
                '15min': parseFloat(loadAvg[2])
            };
            
            // Disk space for Neo4j directories
            try {
                const neo4jDiskUsage = execSync(`df -h ${this.neo4jHome} | tail -1`, { encoding: 'utf8' });
                const diskParts = neo4jDiskUsage.trim().split(/\s+/);
                resources.neo4jDisk = {
                    filesystem: diskParts[0],
                    size: diskParts[1],
                    used: diskParts[2],
                    available: diskParts[3],
                    usePercent: diskParts[4]
                };
            } catch (error) {
                resources.neo4jDisk = { error: 'Unable to get disk usage' };
            }
            
            return resources;
        } catch (error) {
            console.error('Error getting system resources:', error);
            return { error: error.message };
        }
    }

    // Get Java configuration
    async getJavaConfig() {
        try {
            const javaConfig = {};
            
            // Java version
            try {
                const javaVersion = execSync('java -version 2>&1', { encoding: 'utf8' });
                javaConfig.version = javaVersion.split('\n')[0];
            } catch (error) {
                javaConfig.version = 'Unable to determine Java version';
            }
            
            // JVM arguments from Neo4j process
            try {
                const neo4jPid = execSync("pgrep -f 'java.*neo4j' | head -1", { encoding: 'utf8' }).trim();
                if (neo4jPid) {
                    const jvmArgs = execSync(`ps -p ${neo4jPid} -o args --no-headers`, { encoding: 'utf8' });
                    
                    // Log the full JVM args for debugging
                    console.log('Neo4j JVM Args:', jvmArgs);
                    
                    // Extract key JVM settings - improved regex patterns
                    const heapInitMatch = jvmArgs.match(/-Xms(\d+[kmgKMG]?)/);
                    const heapMaxMatch = jvmArgs.match(/-Xmx(\d+[kmgKMG]?)/);
                    const metaspaceMatch = jvmArgs.match(/-XX:MaxMetaspaceSize=(\d+[kmgKMG]?)/);
                    const gcMatch = jvmArgs.match(/-XX:\+Use(\w+GC)/);
                    
                    javaConfig.heapInit = heapInitMatch ? heapInitMatch[1] : 'Dynamic (not explicitly set)';
                    javaConfig.heapMax = heapMaxMatch ? heapMaxMatch[1] : 'Dynamic (not explicitly set)';
                    javaConfig.maxMetaspace = metaspaceMatch ? metaspaceMatch[1] : 'Not set';
                    javaConfig.gcAlgorithm = gcMatch ? gcMatch[1] : 'Default';
                    javaConfig.pid = neo4jPid;
                    
                    // If heap is dynamic, try to get actual heap size from jstat
                    if (!heapMaxMatch) {
                        try {
                            const jstatOutput = execSync(`jstat -gccapacity ${neo4jPid}`, { encoding: 'utf8' });
                            const lines = jstatOutput.trim().split('\n');
                            if (lines.length >= 2) {
                                const values = lines[1].trim().split(/\s+/);
                                // OGCMX is Old Generation Capacity Max, NGCMX is New Generation Capacity Max
                                const maxHeapKB = (parseFloat(values[1]) + parseFloat(values[3])) / 1024; // Convert to MB
                                javaConfig.actualMaxHeapMB = Math.round(maxHeapKB);
                                javaConfig.heapMax = `${Math.round(maxHeapKB)}MB (dynamic)`;
                            }
                        } catch (jstatError) {
                            console.log('Could not get dynamic heap size from jstat:', jstatError.message);
                        }
                    }
                    
                    // Get current heap usage
                    try {
                        const jstatOutput = execSync(`jstat -gc ${neo4jPid}`, { encoding: 'utf8' });
                        const jstatLines = jstatOutput.trim().split('\n');
                        if (jstatLines.length >= 2) {
                            const values = jstatLines[1].trim().split(/\s+/);
                            javaConfig.currentHeapUsageKB = Math.round((parseFloat(values[2]) + parseFloat(values[3]) + parseFloat(values[5]) + parseFloat(values[7])) / 1024);
                        }
                    } catch (error) {
                        javaConfig.currentHeapUsageKB = 'Unable to get current usage';
                    }
                }
            } catch (error) {
                javaConfig.processInfo = 'Neo4j process not found or inaccessible';
            }
            
            return javaConfig;
        } catch (error) {
            console.error('Error getting Java config:', error);
            return { error: error.message };
        }
    }

    // Get Neo4j database size analysis
    async getDatabaseSizeAnalysis() {
        try {
            const dbAnalysis = {};
            
            // Get database directory sizes
            try {
                const dbPath = '/var/lib/neo4j/data/databases';
                const duOutput = execSync(`du -sh ${dbPath}/* 2>/dev/null | sort -hr`, { encoding: 'utf8' });
                const lines = duOutput.trim().split('\n');
                
                dbAnalysis.databases = [];
                let totalSizeMB = 0;
                
                lines.forEach(line => {
                    const parts = line.split('\t');
                    if (parts.length === 2) {
                        const size = parts[0];
                        const path = parts[1];
                        const dbName = path.split('/').pop();
                        
                        // Convert size to MB for calculations
                        let sizeMB = 0;
                        if (size.includes('G')) {
                            sizeMB = parseFloat(size) * 1024;
                        } else if (size.includes('M')) {
                            sizeMB = parseFloat(size);
                        } else if (size.includes('K')) {
                            sizeMB = parseFloat(size) / 1024;
                        }
                        
                        dbAnalysis.databases.push({
                            name: dbName,
                            size: size,
                            sizeMB: Math.round(sizeMB)
                        });
                        
                        totalSizeMB += sizeMB;
                    }
                });
                
                dbAnalysis.totalSizeMB = Math.round(totalSizeMB);
                dbAnalysis.totalSizeGB = Math.round(totalSizeMB / 1024 * 100) / 100;
                dbAnalysis.available = true;
                
                // Parse neo4j-admin output for more detailed analysis
                try {
                    const adminOutput = execSync('neo4j-admin server memory-recommendation 2>/dev/null', { encoding: 'utf8' });
                    const luceneMatch = adminOutput.match(/Total size of lucene indexes in all databases: (\d+)([kmg]?)/i);
                    const dataMatch = adminOutput.match(/Total size of data and native indexes in all databases: (\d+)([kmg]?)/i);
                    
                    if (luceneMatch) {
                        const size = parseInt(luceneMatch[1]);
                        const unit = luceneMatch[2]?.toLowerCase() || '';
                        dbAnalysis.luceneIndexesMB = unit === 'g' ? size * 1024 : unit === 'k' ? size / 1024 : size;
                    }
                    
                    if (dataMatch) {
                        const size = parseInt(dataMatch[1]);
                        const unit = dataMatch[2]?.toLowerCase() || '';
                        dbAnalysis.dataAndIndexesMB = unit === 'g' ? size * 1024 : unit === 'k' ? size / 1024 : size;
                    }
                } catch (error) {
                    // Admin command failed, use directory sizes only
                }
                
            } catch (error) {
                dbAnalysis.available = false;
                dbAnalysis.error = 'Unable to analyze database sizes';
            }
            
            return dbAnalysis;
        } catch (error) {
            console.error('Error getting database size analysis:', error);
            return { available: false, error: error.message };
        }
    }

    // Get Neo4j admin memory recommendations
    async getNeo4jAdminRecommendations() {
        try {
            const adminRecommendations = {};
            
            // Run neo4j-admin server memory-recommendation
            try {
                const output = execSync('neo4j-admin server memory-recommendation 2>/dev/null', { encoding: 'utf8' });
                const lines = output.split('\n');
                
                lines.forEach(line => {
                    if (line.includes('server.memory.heap.initial_size=')) {
                        adminRecommendations.heapInitial = line.split('=')[1];
                    } else if (line.includes('server.memory.heap.max_size=')) {
                        adminRecommendations.heapMax = line.split('=')[1];
                    } else if (line.includes('server.memory.pagecache.size=')) {
                        adminRecommendations.pagecache = line.split('=')[1];
                    }
                });
                
                adminRecommendations.available = true;
            } catch (error) {
                adminRecommendations.available = false;
                adminRecommendations.error = 'neo4j-admin command not available or failed';
            }
            
            return adminRecommendations;
        } catch (error) {
            console.error('Error getting Neo4j admin recommendations:', error);
            return { available: false, error: error.message };
        }
    }

    // Get Neo4j configuration
    async getNeo4jConfig() {
        try {
            const neo4jConfig = {};
            
            // Read neo4j.conf
            const confPath = path.join(this.neo4jConf, 'neo4j.conf');
            if (fs.existsSync(confPath)) {
                const confContent = fs.readFileSync(confPath, 'utf8');
                
                // Extract key configuration values
                const extractConfig = (key) => {
                    const regex = new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, 'm');
                    const match = confContent.match(regex);
                    return match ? match[1].trim() : 'Not configured';
                };
                
                neo4jConfig.heapInitialSize = extractConfig('server.memory.heap.initial_size');
                neo4jConfig.heapMaxSize = extractConfig('server.memory.heap.max_size');
                neo4jConfig.pagecacheSize = extractConfig('server.memory.pagecache.size');
                neo4jConfig.transactionTimeout = extractConfig('db.transaction.timeout');
                neo4jConfig.queryTimeout = extractConfig('db.transaction.concurrent.maximum');
                neo4jConfig.boltConnectors = extractConfig('server.bolt.enabled');
                neo4jConfig.httpConnectors = extractConfig('server.http.enabled');
                neo4jConfig.httpsConnectors = extractConfig('server.https.enabled');
                neo4jConfig.logLevel = extractConfig('server.logs.debug.level');
                
                // Database-specific settings
                neo4jConfig.defaultDatabase = extractConfig('server.default_database');
                neo4jConfig.allowUpgrade = extractConfig('server.databases.default_to_read_only');
                
                // Performance settings
                neo4jConfig.queryCache = extractConfig('db.query_cache_size');
                neo4jConfig.relationshipGrouping = extractConfig('db.relationship_grouping_threshold');
                
            } else {
                neo4jConfig.configFile = 'neo4j.conf not found';
            }
            
            // Get Neo4j version
            try {
                const versionOutput = execSync('neo4j version 2>/dev/null || echo "Version unavailable"', { encoding: 'utf8' });
                neo4jConfig.version = versionOutput.trim();
            } catch (error) {
                neo4jConfig.version = 'Unable to determine version';
            }
            
            return neo4jConfig;
        } catch (error) {
            console.error('Error getting Neo4j config:', error);
            return { error: error.message };
        }
    }

    // Generate optimization recommendations
    generateRecommendations(systemResources, javaConfig, neo4jConfig, dbAnalysis) {
        const recommendations = [];
        
        // Database-aware memory recommendations
        if (systemResources.totalMemoryGB && dbAnalysis?.available) {
            const totalMemGB = systemResources.totalMemoryGB;
            const availableMemGB = systemResources.availableMemoryGB || totalMemGB * 0.6;
            const dbSizeGB = dbAnalysis.totalSizeGB || 0;
            
            // Calculate optimal memory allocation based on database size
            const minHeapGB = Math.max(2, Math.floor(totalMemGB * 0.2)); // At least 2GB, max 20%
            const optimalPagecacheGB = Math.ceil(dbSizeGB * 1.1); // 110% of database size for growth
            const totalNeo4jMemory = minHeapGB + optimalPagecacheGB;
            
            // Check if current system can handle optimal configuration
            if (totalNeo4jMemory > availableMemGB) {
                // System upgrade recommendation
                const recommendedSystemMemGB = Math.ceil((totalNeo4jMemory + 2) / 4) * 4; // Round up to nearest 4GB
                
                recommendations.push({
                    category: 'System Resources',
                    priority: 'Critical',
                    title: 'Memory Upgrade Required',
                    current: `Available: ${availableMemGB}GB, Database: ${dbSizeGB}GB`,
                    recommended: `Upgrade to ${recommendedSystemMemGB}GB total memory`,
                    configLocation: 'AWS EC2 Instance Type / System Hardware',
                    reasoning: `Your database (${dbSizeGB}GB) requires ${optimalPagecacheGB}GB pagecache for optimal performance, but current available memory (${availableMemGB}GB) is insufficient`
                });
                
                // Compromise configuration for current system
                const compromisePagecacheGB = Math.max(2, Math.floor(availableMemGB - minHeapGB - 1));
                
                recommendations.push({
                    category: 'Memory Configuration',
                    priority: 'High',
                    title: 'Compromise Memory Configuration',
                    current: `Heap: ${javaConfig.heapMax || 'Unknown'}, Pagecache: ${neo4jConfig.pagecacheSize || 'Unknown'}`,
                    recommended: `Heap: ${minHeapGB}g, Pagecache: ${compromisePagecacheGB}g (limited by available memory)`,
                    configLocation: 'neo4j.conf: server.memory settings',
                    reasoning: `Temporary configuration until memory upgrade. ${Math.round((dbSizeGB - compromisePagecacheGB) / dbSizeGB * 100)}% of database will require disk I/O`
                });
            } else {
                // Optimal configuration fits in current system
                recommendations.push({
                    category: 'Memory Configuration',
                    priority: 'High',
                    title: 'Database-Optimized Heap Size',
                    current: `Heap Max: ${javaConfig.heapMax || 'Unknown'}`,
                    recommended: `Set heap to ${minHeapGB}g`,
                    configLocation: 'neo4j.conf: server.memory.heap.max_size',
                    reasoning: `Conservative heap size to maximize pagecache for your ${dbSizeGB}GB database`
                });
                
                recommendations.push({
                    category: 'Memory Configuration',
                    priority: 'High',
                    title: 'Database-Sized Pagecache',
                    current: `Pagecache: ${neo4jConfig.pagecacheSize || 'Auto-configured'}`,
                    recommended: `Set pagecache to ${optimalPagecacheGB}g`,
                    configLocation: 'neo4j.conf: server.memory.pagecache.size',
                    reasoning: `Sized to hold your entire ${dbSizeGB}GB database in memory with 10% growth buffer`
                });
            }
        } else if (systemResources.totalMemoryGB) {
            // Fallback to percentage-based recommendations
            const totalMemGB = systemResources.totalMemoryGB;
            const recommendedHeapGB = Math.floor(totalMemGB * 0.3);
            const recommendedPagecacheGB = Math.floor(totalMemGB * 0.4);
            
            recommendations.push({
                category: 'Memory Configuration',
                priority: 'High',
                title: 'Heap Size Optimization',
                current: `Heap Max: ${javaConfig.heapMax || 'Unknown'}`,
                recommended: `Set heap to ${recommendedHeapGB}g (30% of ${totalMemGB}GB total memory)`,
                configLocation: 'neo4j.conf: server.memory.heap.max_size',
                reasoning: 'Neo4j performs best with heap size around 30% of total memory, leaving room for pagecache and OS'
            });
            
            recommendations.push({
                category: 'Memory Configuration',
                priority: 'High',
                title: 'Pagecache Size Optimization',
                current: `Pagecache: ${neo4jConfig.pagecacheSize || 'Auto-configured'}`,
                recommended: `Set pagecache to ${recommendedPagecacheGB}g (40% of ${totalMemGB}GB total memory)`,
                configLocation: 'neo4j.conf: server.memory.pagecache.size',
                reasoning: 'Pagecache should be sized to hold your entire graph in memory for optimal performance'
            });
        }
        
        // CPU recommendations
        if (systemResources.cpuCores) {
            recommendations.push({
                category: 'Performance Configuration',
                priority: 'Medium',
                title: 'Concurrent Transaction Limit',
                current: `Max Concurrent: ${neo4jConfig.queryTimeout || 'Default (1000)'}`,
                recommended: `Consider setting to ${systemResources.cpuCores * 100}-${systemResources.cpuCores * 200}`,
                configLocation: 'neo4j.conf: db.transaction.concurrent.maximum',
                reasoning: `With ${systemResources.cpuCores} CPU cores, you can handle more concurrent transactions`
            });
        }
        
        // GC recommendations
        if (javaConfig.gcAlgorithm === 'Default' || !javaConfig.gcAlgorithm.includes('G1')) {
            recommendations.push({
                category: 'JVM Configuration',
                priority: 'Medium',
                title: 'Garbage Collector Optimization',
                current: `GC Algorithm: ${javaConfig.gcAlgorithm || 'Default'}`,
                recommended: 'Use G1GC for better performance with large heaps',
                configLocation: 'JVM args: -XX:+UseG1GC',
                reasoning: 'G1GC provides better pause times and throughput for Neo4j workloads'
            });
        }
        
        // Timeout recommendations
        if (neo4jConfig.transactionTimeout === 'Not configured') {
            recommendations.push({
                category: 'Stability Configuration',
                priority: 'High',
                title: 'Transaction Timeout',
                current: 'Transaction Timeout: Not configured',
                recommended: 'Set transaction timeout to 30s-60s',
                configLocation: 'neo4j.conf: db.transaction.timeout',
                reasoning: 'Prevents long-running transactions from consuming resources and causing OOM'
            });
        }
        
        // Load average warnings
        if (systemResources.loadAverage && systemResources.loadAverage['5min'] > systemResources.cpuCores * 0.8) {
            recommendations.push({
                category: 'System Resources',
                priority: 'High',
                title: 'High System Load',
                current: `5min Load Average: ${systemResources.loadAverage['5min']}`,
                recommended: 'Consider scaling up CPU or optimizing queries',
                configLocation: 'System/Infrastructure level',
                reasoning: 'High load average indicates CPU contention which can cause Neo4j performance issues'
            });
        }
        
        return recommendations;
    }
}

async function handleNeo4jConfigOverview(req, res) {
    try {
        console.log('Getting Neo4j configuration overview...');
        
        const analyzer = new Neo4jConfigAnalyzer();
        
        // Collect all configuration data
        const systemResources = await analyzer.getSystemResources();
        const javaConfig = await analyzer.getJavaConfig();
        const neo4jConfig = await analyzer.getNeo4jConfig();
        const neo4jAdminRecommendations = await analyzer.getNeo4jAdminRecommendations();
        const databaseSizeAnalysis = await analyzer.getDatabaseSizeAnalysis();
        
        // Generate recommendations
        const recommendations = analyzer.generateRecommendations(systemResources, javaConfig, neo4jConfig, databaseSizeAnalysis);
        
        res.json({
            success: true,
            data: {
                systemResources,
                javaConfig,
                neo4jConfig,
                neo4jAdminRecommendations,
                databaseSizeAnalysis,
                recommendations,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Neo4j config overview API error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get Neo4j configuration overview',
            message: error.message
        });
    }
}

module.exports = { handleNeo4jConfigOverview };
