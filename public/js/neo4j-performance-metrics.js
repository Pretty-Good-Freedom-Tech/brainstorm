let autoRefreshInterval;
let dashboardData = {};
let heapChart = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    refreshDashboard();
    setupAutoRefresh();
    initializeHeapChart();
});

// Setup auto-refresh
function setupAutoRefresh() {
    const autoRefreshCheckbox = document.getElementById('autoRefresh');
    
    // Clear any existing interval first
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
    
    if (autoRefreshCheckbox.checked) {
        autoRefreshInterval = setInterval(refreshDashboard, 30000);
    }
    
    autoRefreshCheckbox.addEventListener('change', function() {
        // Always clear existing interval first
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }
        
        if (this.checked) {
            console.log('Auto-refresh enabled');
            autoRefreshInterval = setInterval(refreshDashboard, 30000);
        } else {
            console.log('Auto-refresh disabled');
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }
    });
}

// Main refresh function
async function refreshDashboard() {
    try {
        document.body.classList.add('loading');
        
        // Also update heap chart on refresh
        if (heapChart) {
            await updateHeapChart();
        }
        
        // Also load task timeline data for the combined chart
        await loadTaskTimelineData();

        // Load and analyze structured events using the correct analyzer method
        const events = eventsAnalyzer.loadEvents();
        const executionData = eventsAnalyzer.analyzeTaskExecution(events);

        // Load preserved task execution history for enhanced analytics
        const preservedHistoryPath = path.join(config.BRAINSTORM_LOG_DIR, 'preserved', 'system_metrics_history.jsonl');
        const preservedExecutionData = loadPreservedTaskHistory(preservedHistoryPath);
        
        // Fetch Neo4j health data
        const healthResponse = await fetch('/api/neo4j-health/complete');
        const healthData = await healthResponse.json();
        
        // Fetch recent alerts
        const alertsResponse = await fetch('/api/neo4j-health/alerts?component=neo4j&limit=20');
        const alertsData = await alertsResponse.json();
        
        // Update dashboard
        updateServiceStatus(healthData.service || {});
        updateHeapHealth(healthData.heap || {});
        updateIndexHealth(healthData.indexes || {});
        updateCrashPatterns(healthData.crashPatterns || {});
        updateClassLoadingMetrics(healthData.classLoading || {});
        updateJvmMetrics(healthData.jvm || {});
        updateAlerts(alertsData.alerts || []);
        
        // Update timestamp
        document.getElementById('lastUpdated').textContent = 
            `Last updated: ${new Date().toLocaleTimeString()}`;
        
    } catch (error) {
        console.error('Failed to refresh dashboard:', error);
        showError('Failed to fetch Neo4j health data');
    } finally {
        document.body.classList.remove('loading');
    }
}

// Update JVM internal metrics
function updateJvmMetrics(data) {
    const card = document.getElementById('jvmMetricsCard');
    const statusBadge = document.getElementById('jvmMetricsStatus');
    
    if (!data || Object.keys(data).length === 0 || data.error) {
        statusBadge.className = 'status-badge status-warning';
        statusBadge.textContent = data?.error || 'No data';
        return;
    }
    
    // Update metrics
    document.getElementById('threadCount').textContent = data.threadCount || '-';
    document.getElementById('peakThreadCount').textContent = data.peakThreadCount || '-';
    document.getElementById('safepointTime').textContent = data.safepointTime ? `${data.safepointTime}ms` : '-';
    document.getElementById('safepointSyncTime').textContent = data.safepointSyncTime ? `${data.safepointSyncTime}ms` : '-';
    
    // Calculate and update safepoint overhead
    const safepointOverhead = data.safepointOverhead || 0;
    const overheadPercent = Math.min(100, Math.max(0, safepointOverhead));
    const overheadBar = document.getElementById('safepointOverhead');
    const overheadValue = document.getElementById('safepointOverheadValue');
    
    overheadBar.style.width = `${overheadPercent}%`;
    overheadBar.className = 'progress ' + 
        (overheadPercent > 10 ? 'critical' : overheadPercent > 5 ? 'warning' : 'normal');
    overheadValue.textContent = `${overheadPercent.toFixed(1)}%`;
    
    // Update status badge
    statusBadge.className = 'status-badge ' + 
        (overheadPercent > 10 ? 'status-critical' : 
         overheadPercent > 5 ? 'status-warning' : 'status-ok');
    statusBadge.textContent = overheadPercent > 10 ? 'High Load' : 
                             overheadPercent > 5 ? 'Moderate Load' : 'Normal';
}

// Format bytes to human-readable string
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Update class loading metrics
function updateClassLoadingMetrics(data) {
    const card = document.getElementById('classLoadingCard');
    const statusBadge = document.getElementById('classLoadingStatus');
    
    if (!data || !data.summary || Object.keys(data.summary).length === 0) {
        statusBadge.className = 'status-badge status-warning';
        statusBadge.textContent = data?.error || 'No data';
        return;
    }
    
    const metrics = data.summary;
    
    // Update metrics with the new structure
    document.getElementById('classLoaderCount').textContent = metrics.classLoaderCount || '-';
    document.getElementById('loadedClassCount').textContent = metrics.loadedClassCount || '-';
    document.getElementById('unloadedClassCount').textContent = metrics.unloadedClassCount || '-';
    document.getElementById('classLoadTime').textContent = metrics.classLoadingTime ? `${metrics.classLoadingTime}s` : '-';
    
    // Update instance size if available
    const instanceSizeElem = document.getElementById('instanceSize');
    if (instanceSizeElem && metrics.instanceSizeBytes) {
        instanceSizeElem.textContent = formatBytes(metrics.instanceSizeBytes);
    }
    
    // Update progress bar
    const overhead = data.classLoadingOverhead || 0;
    const overheadPercent = Math.min(100, Math.max(0, overhead));
    const overheadBar = document.getElementById('classLoadingOverhead');
    const overheadValue = document.getElementById('classLoadingOverheadValue');
    
    overheadBar.style.width = `${overheadPercent}%`;
    overheadBar.className = 'progress ' + 
        (overhead > 20 ? 'critical' : overhead > 10 ? 'warning' : 'normal');
    overheadValue.textContent = `${overheadPercent.toFixed(1)}%`;
    
    // Update status badge
    statusBadge.className = 'status-badge ' + 
        (overhead > 20 ? 'status-critical' : 
         overhead > 10 ? 'status-warning' : 'status-ok');
    statusBadge.textContent = overhead > 20 ? 'High Load' : 
                             overhead > 10 ? 'Moderate Load' : 'Normal';
}

// Update service status card
function updateServiceStatus(data) {
    const card = document.getElementById('serviceStatusCard');
    const statusBadge = document.getElementById('serviceStatus');
    
    if (data.status === 'running') {
        card.className = 'health-card success';
        statusBadge.className = 'status-badge status-running';
        statusBadge.textContent = 'Running';
    } else {
        card.className = 'health-card critical';
        statusBadge.className = 'status-badge status-critical';
        statusBadge.textContent = 'Down';
    }
    
    document.getElementById('neo4jPid').textContent = data.pid || 'N/A';
    document.getElementById('memoryUsage').textContent = data.memoryMB ? `${data.memoryMB} MB` : 'N/A';
    document.getElementById('connectionTest').textContent = data.connectionTest || 'Unknown';
    document.getElementById('responseTime').textContent = data.responseTime || 'N/A';
}

// Update heap health card
function updateHeapHealth(data) {
    const card = document.getElementById('heapHealthCard');
    const statusBadge = document.getElementById('heapStatus');
    const progressBar = document.getElementById('heapProgressBar');
    
    const heapPercent = data.utilizationPercent || 0;
    
    if (heapPercent >= 95) {
        card.className = 'health-card critical';
        statusBadge.className = 'status-badge status-critical';
        statusBadge.textContent = 'Critical';
        progressBar.className = 'progress-fill progress-critical';
    } else if (heapPercent >= 80) {
        card.className = 'health-card warning';
        statusBadge.className = 'status-badge status-warning';
        statusBadge.textContent = 'Warning';
        progressBar.className = 'progress-fill progress-warning';
    } else {
        card.className = 'health-card success';
        statusBadge.className = 'status-badge status-running';
        statusBadge.textContent = 'Healthy';
        progressBar.className = 'progress-fill progress-normal';
    }
    
    progressBar.style.width = `${heapPercent}%`;
    
    document.getElementById('heapUtilization').textContent = `${heapPercent}%`;
    document.getElementById('heapUsedTotal').textContent = 
        data.usedMB && data.totalMB ? `${data.usedMB} / ${data.totalMB} MB` : 'N/A';
    document.getElementById('gcOverhead').textContent = data.gcOverheadPercent ? `${data.gcOverheadPercent}%` : 'N/A';
    document.getElementById('fullGcCount').textContent = data.fullGcCount || '0';
}

// Update index health card
function updateIndexHealth(data) {
    const card = document.getElementById('indexHealthCard');
    const statusBadge = document.getElementById('indexStatus');
    
    const failedIndexes = data.failedIndexes || 0;
    const totalIndexes = data.totalIndexes || 0;
    
    if (failedIndexes > 0) {
        card.className = 'health-card critical';
        statusBadge.className = 'status-badge status-critical';
        statusBadge.textContent = 'Issues';
    } else if (totalIndexes < 5) {
        card.className = 'health-card warning';
        statusBadge.className = 'status-badge status-warning';
        statusBadge.textContent = 'Insufficient';
    } else {
        card.className = 'health-card success';
        statusBadge.className = 'status-badge status-running';
        statusBadge.textContent = 'Healthy';
    }
    
    document.getElementById('totalIndexes').textContent = totalIndexes;
    document.getElementById('failedIndexes').textContent = failedIndexes;
    document.getElementById('totalConstraints').textContent = data.totalConstraints || '0';
    document.getElementById('queryTimeout').textContent = data.queryTimeout ? 'Yes' : 'No';
}

// Update crash patterns card
function updateCrashPatterns(data) {
    const card = document.getElementById('crashPatternsCard');
    const statusBadge = document.getElementById('crashPatternStatus');
    
    const totalIssues = (data.heapSpaceOom || 0) + (data.gcOverheadOom || 0) + 
                      (data.metaspaceOom || 0) + (data.nativeThreadOom || 0) +
                      (data.apocStalling || 0) + (data.longTransactions || 0);
    
    if (totalIssues > 0) {
        card.className = 'health-card warning';
        statusBadge.className = 'status-badge status-warning';
        statusBadge.textContent = `${totalIssues} Issues`;
    } else {
        card.className = 'health-card success';
        statusBadge.className = 'status-badge status-running';
        statusBadge.textContent = 'No Issues';
    }
    
    document.getElementById('heapSpaceOom').textContent = data.heapSpaceOom || '0';
    document.getElementById('gcOverheadOom').textContent = data.gcOverheadOom || '0';
    document.getElementById('metaspaceOom').textContent = data.metaspaceOom || '0';
    document.getElementById('nativeThreadOom').textContent = data.nativeThreadOom || '0';
    document.getElementById('apocStalling').textContent = data.apocStalling || '0';
    document.getElementById('longTransactions').textContent = data.longTransactions || '0';
}

// Update alerts list
function updateAlerts(alerts) {
    const alertsList = document.getElementById('alertsList');
    
    if (!alerts || alerts.length === 0) {
        alertsList.innerHTML = '<p>No recent alerts</p>';
        return;
    }
    
    const alertsHtml = alerts.map(alert => {
        const alertClass = alert.severity === 'critical' ? 'alert-critical' : 'alert-warning';
        const timestamp = new Date(alert.timestamp).toLocaleString();
        
        // Add clickable link for NEO4J_HIGH_ERROR_RATE alerts
        let alertContent = `<strong>${alert.alertType}</strong>: ${alert.message}`;
        if (alert.alertType === 'NEO4J_HIGH_ERROR_RATE') {
            alertContent = `<strong>${alert.alertType}</strong>: ${alert.message} <a href="/neo4j-error-logs.html?hours=24&severity=all" target="_blank" style="color: #007bff; text-decoration: underline; margin-left: 8px;">📋 View Error Logs</a>`;
        }
        
        return `
            <div class="alert-item ${alertClass}">
                ${alertContent}
                <div class="alert-timestamp">${timestamp}</div>
                ${alert.recommendedAction ? `<div><em>Action: ${alert.recommendedAction}</em></div>` : ''}
            </div>
        `;
    }).join('');
    
    alertsList.innerHTML = alertsHtml;
}

// Clear alerts
async function clearAlerts() {
    try {
        await fetch('/api/health-alerts/clear', { method: 'POST' });
        document.getElementById('alertsList').innerHTML = '<p>No recent alerts</p>';
    } catch (error) {
        console.error('Failed to clear alerts:', error);
    }
}

// Initialize heap usage chart
async function initializeHeapChart() {
    const ctx = document.getElementById('heapChart').getContext('2d');
    
    heapChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Heap Utilization %',
                data: [],
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.1)',
                borderWidth: 2,
                fill: false,
                tension: 0.4,
                yAxisID: 'y'
            },
            {
                label: 'Metaspace Utilization %',
                data: [],
                borderColor: 'rgb(54, 162, 235)',
                backgroundColor: 'rgba(54, 162, 235, 0.1)',
                borderWidth: 2,
                fill: false,
                tension: 0.4,
                yAxisID: 'y'
            },
            {
                label: 'Old Generation Utilization %',
                data: [],
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.1)',
                borderWidth: 2,
                fill: false,
                tension: 0.4,
                yAxisID: 'y'
            },
            {
                label: 'G1GC Survivor Regions %',
                data: [],
                borderColor: 'rgb(153, 102, 255)',
                backgroundColor: 'rgba(153, 102, 255, 0.1)',
                borderWidth: 2,
                fill: false,
                tension: 0.4,
                yAxisID: 'y'
            }, {
                label: 'GC Overhead %',
                data: [],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderWidth: 2,
                fill: false,
                tension: 0.4,
                yAxisID: 'y_gc_overhead'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Time'
                    },
                    type: 'time',
                    time: {
                        displayFormats: {
                            minute: 'HH:mm',
                            hour: 'MMM dd HH:mm'
                        }
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    stack: 'metrics',
                    stackWeight: 10,
                    title: {
                        display: true,
                        text: 'Memory Utilization %'
                    },
                    min: 0,
                    max: 100,
                    grid: {
                        drawOnChartArea: true,
                    },
                },
                y_gc_overhead: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    stack: 'metrics',
                    stackWeight: 10,
                    title: {
                        display: true,
                        text: 'GC Overhead %'
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
                    max: 20
                },
                y_young_gc: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    stack: 'metrics',
                    stackWeight: 10,
                    title: {
                        display: true,
                        text: 'Young GC Count'
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
                    max: 20
                },
                y_tasks: {
                    type: 'category',
                    labels: ['START', 'END'],
                    offset: true,
                    position: 'left',
                    stack: 'metrics',
                    stackWeight: 4,
                    title: {
                        display: true,
                        text: 'Task Timeline'
                    },
                    border: {
                      color: 'rgba(118, 3, 3, 0.1)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        filter: function(legendItem, chartData) {
                            // Only show legend items for y and y_gc_overhead axes, hide y_tasks (timeline)
                            const dataset = chartData.datasets[legendItem.datasetIndex];
                            return dataset.yAxisID !== 'y_tasks';
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            const point = context[0];
                            // Check if this is a timeline dataset (negative Y values)
                            if (point.dataset.taskData) {
                                return `${point.dataset.taskData.taskName}`;
                            }
                            return context[0].label;
                        },
                        label: function(context) {
                            // Handle timeline tooltips
                            if (context.dataset.taskData) {
                                const task = context.dataset.taskData;
                                const startTime = new Date(task.startTime).toLocaleTimeString();
                                const endTime = task.endTime ? new Date(task.endTime).toLocaleTimeString() : 'Running';
                                const duration = task.duration ? `${task.duration.toFixed(1)}s` : 'Ongoing';
                                const status = task.success === null ? 'Running' : (task.success ? 'Success' : 'Failed');
                                
                                return [
                                    `Start: ${startTime}`,
                                    `End: ${endTime}`,
                                    `Duration: ${duration}`,
                                    `Status: ${status}`,
                                    `Category: ${task.category}`
                                ];
                            }
                            // Handle memory metric tooltips
                            return `${context.dataset.label}: ${context.parsed.y}%`;
                        },
                        afterBody: function(context) {
                            // Only show detailed memory info for memory datasets
                            if (!context[0].dataset.taskData) {
                                const dataIndex = context[0].dataIndex;
                                const data = heapChart.data.datasets[0].rawData;
                                if (data && data[dataIndex]) {
                                    const point = data[dataIndex];
                                    return [
                                        `Heap: ${point.heapUsedMB}/${point.heapTotalMB} MB (${point.heapUtilizationPercent}%)`,
                                        `Metaspace: ${point.metaspaceUsedMB}/${point.metaspaceCapacityMB} MB (${point.metaspaceUtilizationPercent}%)`,
                                        `Old Gen: ${point.oldGenUsedMB}/${point.oldGenCapacityMB} MB`,
                                        `Young Gen: ${point.youngGenUsedMB}/${point.youngGenCapacityMB} MB`,
                                        `GC Counts - Young: ${point.youngGcCount}, Full: ${point.fullGcCount}`,
                                        `GC Times - Young: ${point.youngGcTimeSec}s, Full: ${point.fullGcTimeSec}s`
                                    ];
                                }
                            }
                            return [];
                        }
                    }
                }
            }
        }
    });
    
    // Load initial data
    await updateHeapChart();
}

// Update heap chart with new data
async function updateHeapChart() {
    try {
        const timeRangeSelector = document.getElementById('timeRangeSelector');
        const selectedHours = timeRangeSelector.value;
        
        // Use the enhanced heap-metrics-history endpoint
        const endpoint = '/api/neo4j-health/heap-metrics-history';
        
        const response = await fetch(`${endpoint}?hours=${selectedHours}&maxPoints=20000`);
        const result = await response.json();
        
        if (!result.success) {
            console.error('Failed to fetch heap metrics:', result.error);
            updateDataSourceIndicator('Error loading data', 'error');
            return;
        }
        
        const data = result.data || [];
        const preservationStats = result.metadata?.preservationStats || null;
        
        // Update data source indicator
        updateDataSourceIndicator(data, preservationStats);
        
        if (data.length === 0) {
            heapChart.data.labels = [];
            heapChart.data.datasets[0].data = [];
            heapChart.data.datasets[1].data = [];
            heapChart.data.datasets[2].data = [];
            heapChart.data.datasets[3].data = [];
            heapChart.update();
            return;
        }
        
        // Prepare chart data
        const labels = data.map(point => new Date(point.timestamp));
        const heapUtilization = data.map(point => point.heapUtilizationPercent);
        const metaspaceUtilization = data.map(point => point.metaspaceUtilizationPercent);
        const oldGenUtilization = data.map(point => {
            return point.oldGenCapacityMB > 0 ? 
                Math.round((point.oldGenUsedMB / point.oldGenCapacityMB) * 100) : 0;
        });
        
        // Calculate total survivor utilization for G1GC (combines S0 + S1)
        const totalSurvivorUtilization = data.map(point => {
            const s0Used = point.s0UsedMB || 0;
            const s1Used = point.s1UsedMB || 0;
            const s0Capacity = point.s0CapacityMB || 0;
            const s1Capacity = point.s1CapacityMB || 0;
            const totalUsed = s0Used + s1Used;
            const totalCapacity = s0Capacity + s1Capacity;
            return totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0;
        });
        const gcOverhead = data.map(point => point.gcOverheadPercent || point.gcTimePercent || 0);
        
        // Calculate dynamic Y-axis ranges
        const maxGcOverhead = Math.max(...gcOverhead.filter(val => val > 0));
        const gcAxisMax = calculateGcAxisMax(maxGcOverhead);
        console.log(`GC Axis Max: ${gcAxisMax}`);
        
        // Calculate max for memory utilization (y axis)
        const allMemoryValues = [...heapUtilization, ...metaspaceUtilization, ...oldGenUtilization].filter(val => val > 0);
        const maxMemoryUtil = Math.max(...allMemoryValues);
        const memoryAxisMax = Math.max(100, Math.ceil(maxMemoryUtil / 10) * 10); // Round up to nearest 10, minimum 100
        
        // Calculate max for Young GC Count (y_young_gc axis)
        const youngGcCounts = data.map(point => point.youngGcCount || 0).filter(val => val > 0);
        const maxYoungGc = Math.max(...youngGcCounts);
        const youngGcAxisMax = Math.max(20, Math.ceil(maxYoungGc / 100) * 100); // Round up to nearest 100, minimum 20
        
        // Update all axes dynamically
        heapChart.options.scales.y.max = memoryAxisMax;
        heapChart.options.scales.y_gc_overhead.max = gcAxisMax;
        heapChart.options.scales.y_young_gc.max = youngGcAxisMax;
        
        // Add warning annotation if GC overhead is critically high
        if (maxGcOverhead > 100) {
            heapChart.options.scales.y_gc_overhead.title.text = `⚠️ GC Overhead % (Max: ${maxGcOverhead.toFixed(1)}%)`;
            heapChart.options.scales.y_gc_overhead.title.color = '#ef4444';
        } else if (maxGcOverhead > 50) {
            heapChart.options.scales.y_gc_overhead.title.text = `⚠️ GC Overhead % (Max: ${maxGcOverhead.toFixed(1)}%)`;
            heapChart.options.scales.y_gc_overhead.title.color = '#f59e0b';
        } else {
            heapChart.options.scales.y_gc_overhead.title.text = 'GC Overhead %';
            heapChart.options.scales.y_gc_overhead.title.color = '#666';
        }
        
        // Store raw data for tooltips
        heapChart.data.datasets[0].rawData = data;
        
        // Add task timeline datasets to the chart using negative values
        const timelineDatasets = createTimelineDatasets(labels);
        
        // Update chart with both memory metrics and timeline data
        heapChart.data.labels = labels;
        heapChart.data.datasets = [
            // Memory metrics datasets (positive values)
            {
                label: 'Heap Utilization %',
                data: heapUtilization,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.1)',
                yAxisID: 'y',
                rawData: data
            },
            {
                label: 'Metaspace Utilization %',
                data: metaspaceUtilization,
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.1)',
                yAxisID: 'y'
            },
            {
                label: 'Old Gen Utilization %',
                data: oldGenUtilization,
                borderColor: 'rgb(54, 162, 235)',
                backgroundColor: 'rgba(54, 162, 235, 0.1)',
                yAxisID: 'y'
            },
            {
                label: 'G1GC Survivor Regions %',
                data: totalSurvivorUtilization,
                borderColor: 'rgb(153, 102, 255)',
                backgroundColor: 'rgba(153, 102, 255, 0.1)',
                yAxisID: 'y'
            },
            {
                label: 'GC Overhead %',
                data: gcOverhead,
                borderColor: 'rgb(255, 206, 86)',
                backgroundColor: 'rgba(255, 206, 86, 0.1)',
                yAxisID: 'y_gc_overhead'
            },
            // Task timeline datasets (negative values)
            ...timelineDatasets
        ];
        heapChart.update();
        
        console.log(`Updated heap chart with ${data.length} data points from combined data sources`);
        console.log(`GC Overhead range: 0% - ${maxGcOverhead.toFixed(1)}%, Y-axis max: ${gcAxisMax}`);
        
    } catch (error) {
        console.error('Error updating heap chart:', error);
        updateDataSourceIndicator('Network error', 'error');
    }
}

// Global variables
let currentMetricView = 'overview';
let taskTimelineData = [];

// Load task timeline data
async function loadTaskTimelineData() {
    try {
        const timeRangeSelector = document.getElementById('timeRangeSelector');
        const selectedHours = timeRangeSelector.value;
        const response = await fetch(`/api/neo4j-health/task-timeline?hours=${selectedHours}`);
        const result = await response.json();
        
        if (result.success) {
            taskTimelineData = result.timeline || [];
            updateTimelineStatus(`${taskTimelineData.length} task executions in last ${selectedHours}h`, 'success');
        } else {
            console.error('Failed to fetch task timeline:', result.error);
            updateTimelineStatus('Error loading timeline data', 'error');
            taskTimelineData = [];
        }
    } catch (error) {
        console.error('Error loading task timeline:', error);
        updateTimelineStatus('Network error', 'error');
        taskTimelineData = [];
    }
}

// Create timeline datasets using negative Y-values for perfect alignment
function createTimelineDatasets(chartLabels) {
    if (!taskTimelineData || taskTimelineData.length === 0) {
        return [];
    }

    const datasets = [];
    const taskNames = [...new Set(taskTimelineData.map(t => t.taskName))];
    taskNames.sort();

    console.log('Creating timeline datasets for tasks:', taskNames);
    console.log('Task timeline data:', taskTimelineData);

    // Create a dataset for each task execution
    taskTimelineData.forEach((task, index) => {
        const taskIndex = taskNames.indexOf(task.taskName);
        // const yPosition = 90 - (taskIndex * 10); // Position from 90 down to lower values

        const startTime = new Date(task.startTime);
        const endTime = task.endTime ? new Date(task.endTime) : new Date();

        console.log(`Task ${task.taskName} start: ${startTime}, end: ${endTime}`);

        // Create line segment for task execution
        datasets.push({
            label: '', // Empty label to hide from legend
            data: [
                { x: startTime, y: 'START' },
                { x: endTime, y: 'END' }
            ],
            borderColor: task.color,
            backgroundColor: task.color + '60',
            borderWidth: task.ongoing ? 6 : 4,
            borderDash: task.ongoing ? [5, 5] : [],
            pointRadius: 0,
            showLine: true,
            tension: 0,
            yAxisID: 'y_tasks', // Use separate Y-axis for timeline
            taskData: task // Store task data for tooltips
        });
    });

    console.log('Created timeline datasets:', datasets.length);
    return datasets;
}

// Update timeline status indicator
function updateTimelineStatus(message, type) {
    const indicator = document.getElementById('timelineStatus');
    if (indicator) {
        indicator.textContent = message;
        indicator.style.color = type === 'error' ? '#ef4444' : 
                              type === 'warning' ? '#f59e0b' : '#10b981';
    }
}

// Metric view switching functionality
function switchMetricView(view) {
    currentMetricView = view;
    
    // Update button states
    document.querySelectorAll('.metric-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-view="${view}"]`).classList.add('active');
    
    // Update explanation content
    updateExplanationContent(view);
    
    // Update chart based on view
    updateChartForView(view);
}

// Update explanation content based on selected view
function updateExplanationContent(view) {
    const explanationContent = document.getElementById('explanationContent');
    
    const explanations = {
        overview: {
            title: '🏠 Overview - Neo4j Memory Health',
            content: `
                <p>This view shows the most critical memory metrics for Neo4j stability. Monitor these key indicators:</p>
                <ul>
                    <li><strong>Heap Utilization:</strong> Should stay below 80% for optimal performance</li>
                    <li><strong>Metaspace Utilization:</strong> Critical when above 90% - can cause OutOfMemoryError</li>
                    <li><strong>Old Generation:</strong> High utilization indicates objects living too long</li>
                    <li><strong>GC Overhead:</strong> Time spent in garbage collection - should be under 10%</li>
                </ul>
                <div class="warning">⚠️ Watch for sustained high utilization across multiple metrics - this indicates memory pressure.</div>
            `
        },
        heap: {
            title: '🧠 Heap Memory Analysis',
            content: `
                <p>Java heap memory is where Neo4j stores objects during execution. The heap is divided into generations:</p>
                <ul>
                    <li><strong>Young Generation (Eden + Survivor):</strong> New objects are created here</li>
                    <li><strong>Old Generation:</strong> Long-lived objects that survived multiple GC cycles</li>
                    <li><strong>Total Heap:</strong> Combined young + old generation memory</li>
                </ul>
                <div class="info">💡 Healthy heap utilization: 60-80%. Above 85% indicates memory pressure.</div>
                <div class="critical">🚨 Above 95%: Risk of OutOfMemoryError and application crashes.</div>
            `
        },
        metaspace: {
            title: '🔧 Metaspace Memory Management',
            content: `
                <p>Metaspace stores class metadata and is critical for Neo4j's operation with many loaded classes:</p>
                <ul>
                    <li><strong>Class Definitions:</strong> Metadata for all loaded Java classes</li>
                    <li><strong>Method Information:</strong> Bytecode and method signatures</li>
                    <li><strong>Constant Pool:</strong> String literals and class constants</li>
                </ul>
                <div class="warning">⚠️ Your system shows ${Math.round((386833.0/390464.0)*100)}% utilization - monitor closely!</div>
                <div class="critical">🚨 Above 95%: Immediate risk of MetaspaceOOM - Neo4j will crash!</div>
            `
        },
        compressed: {
            title: '⚠️ Compressed Class Space - Critical Monitoring',
            content: `
                <p>Compressed Class Space is a subset of Metaspace with a fixed size limit. When full, it causes immediate crashes:</p>
                <ul>
                    <li><strong>Class Pointers:</strong> Compressed references to class metadata</li>
                    <li><strong>Fixed Size:</strong> Cannot be expanded at runtime (typically ~55MB)</li>
                    <li><strong>Critical Resource:</strong> When full, causes instant OutOfMemoryError</li>
                </ul>
                <div class="critical">🚨 Your system shows ~97% utilization - CRITICAL! This is the most dangerous metric to watch.</div>
                <p><strong>Immediate Actions if >95%:</strong></p>
                <ul>
                    <li>Restart Neo4j during low-traffic period</li>
                    <li>Review and reduce loaded plugins/extensions</li>
                    <li>Consider increasing -XX:CompressedClassSpaceSize</li>
                </ul>
            `
        },
        survivor: {
            title: '🔄 Survivor Space Analysis',
            content: `
                <p>Survivor spaces (S0 and S1) are part of the young generation where objects survive initial garbage collection:</p>
                <ul>
                    <li><strong>S0 and S1:</strong> Objects alternate between these spaces during minor GC</li>
                    <li><strong>Promotion Threshold:</strong> Objects surviving multiple cycles move to Old Gen</li>
                    <li><strong>GC Efficiency:</strong> Proper sizing reduces GC overhead</li>
                </ul>
                <div class="info">💡 Your system: S0=${Math.round(0/73728*100)}%, S1=${Math.round(73062.4/73728*100)}% - S1 is actively used.</div>
                <div class="warning">⚠️ High survivor utilization (>80%) may indicate objects living longer than expected.</div>
            `
        },
        gc: {
            title: '🗑️ Garbage Collection Performance',
            content: `
                <p>Garbage Collection removes unused objects and is critical for Neo4j performance:</p>
                <ul>
                    <li><strong>Young GC:</strong> Frequent, fast cleanup of short-lived objects</li>
                    <li><strong>Full GC:</strong> Expensive cleanup of entire heap - should be rare</li>
                    <li><strong>G1 Concurrent:</strong> Background cleanup with minimal application pause</li>
                    <li><strong>GC Overhead:</strong> Percentage of time spent in garbage collection</li>
                </ul>
                <div class="info">💡 Healthy GC: <5% overhead, young GC every few seconds, full GC rarely.</div>
                <div class="warning">⚠️ >10% GC overhead indicates memory pressure or tuning issues.</div>
                <div class="critical">🚨 >20% GC overhead: Application performance severely impacted!</div>
            `
        }
    };

    const explanation = explanations[view];
    explanationContent.innerHTML = `
        <h4>${explanation.title}</h4>
        ${explanation.content}
    `;
}

// Update chart datasets based on selected view
function updateChartForView(view) {
    if (!heapChart) return;

    // Get current data
    const rawData = heapChart.data.datasets[0].rawData;
    if (!rawData || rawData.length === 0) return;

    const labels = rawData.map(point => new Date(point.timestamp));

    // Define different dataset configurations for each view
    const viewConfigs = {
        overview: {
            datasets: [
                {
                    label: 'Heap Utilization %',
                    data: rawData.map(point => point.heapUtilizationPercent),
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    yAxisID: 'y'
                },
                {
                    label: 'Metaspace Utilization %',
                    data: rawData.map(point => point.metaspaceUtilizationPercent),
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    yAxisID: 'y'
                },
                {
                    label: 'Old Gen Utilization %',
                    data: rawData.map(point => point.oldGenCapacityMB > 0 ? 
                        Math.round((point.oldGenUsedMB / point.oldGenCapacityMB) * 100) : 0),
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    yAxisID: 'y'
                },
                {
                    label: 'GC Overhead %',
                    data: rawData.map(point => point.gcOverheadPercent || 0),
                    borderColor: 'rgb(255, 206, 86)',
                    backgroundColor: 'rgba(255, 206, 86, 0.1)',
                    yAxisID: 'y_gc_overhead'
                }
            ]
        },
        heap: {
            datasets: [
                {
                    label: 'Total Heap Utilization %',
                    data: rawData.map(point => point.heapUtilizationPercent),
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    yAxisID: 'y'
                },
                {
                    label: 'Old Gen Utilization %',
                    data: rawData.map(point => point.oldGenCapacityMB > 0 ? 
                        Math.round((point.oldGenUsedMB / point.oldGenCapacityMB) * 100) : 0),
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    yAxisID: 'y'
                },
                {
                    label: 'Young Gen Utilization %',
                    data: rawData.map(point => point.youngGenCapacityMB > 0 ? 
                        Math.round((point.youngGenUsedMB / point.youngGenCapacityMB) * 100) : 0),
                    borderColor: 'rgb(153, 102, 255)',
                    backgroundColor: 'rgba(153, 102, 255, 0.1)',
                    yAxisID: 'y'
                }
            ]
        },
        metaspace: {
            datasets: [
                {
                    label: 'Metaspace Utilization %',
                    data: rawData.map(point => point.metaspaceUtilizationPercent),
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    yAxisID: 'y'
                }
            ]
        },
        compressed: {
            datasets: [
                {
                    label: 'Compressed Class Utilization %',
                    data: rawData.map(point => point.compressedClassCapacityMB > 0 ? 
                        Math.round((point.compressedClassUsedMB / point.compressedClassCapacityMB) * 100) : 0),
                    borderColor: 'rgb(255, 0, 0)',
                    backgroundColor: 'rgba(255, 0, 0, 0.1)',
                    yAxisID: 'y'
                }
            ]
        },
        survivor: {
            datasets: [
                {
                    label: 'Total Survivor Utilization %',
                    data: rawData.map(point => point.survivorCapacityMB > 0 ? 
                        Math.round((point.survivorUsedMB / point.survivorCapacityMB) * 100) : 0),
                    borderColor: 'rgb(255, 159, 64)',
                    backgroundColor: 'rgba(255, 159, 64, 0.1)',
                    yAxisID: 'y'
                },
                {
                    label: 'S0 Utilization %',
                    data: rawData.map(point => point.s0CapacityMB > 0 ? 
                        Math.round((point.s0UsedMB / point.s0CapacityMB) * 100) : 0),
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    yAxisID: 'y'
                },
                {
                    label: 'S1 Utilization %',
                    data: rawData.map(point => point.s1CapacityMB > 0 ? 
                        Math.round((point.s1UsedMB / point.s1CapacityMB) * 100) : 0),
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    yAxisID: 'y'
                }
            ]
        },
        gc: {
            datasets: [
                {
                    label: 'GC Overhead %',
                    data: rawData.map(point => point.gcOverheadPercent || 0),
                    borderColor: 'rgb(255, 206, 86)',
                    backgroundColor: 'rgba(255, 206, 86, 0.1)',
                    yAxisID: 'y_gc_overhead'
                },
                {
                    label: 'Young GC Count (per hour)',
                    data: rawData.map(point => point.youngGcCount || 0),
                    borderColor: 'rgb(153, 102, 255)',
                    backgroundColor: 'rgba(153, 102, 255, 0.1)',
                    yAxisID: 'y_young_gc'
                },
                {
                    label: 'Concurrent GC Count (per hour)',
                    data: rawData.map(point => point.concurrentGcCount || 0),
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    yAxisID: 'y_young_gc'
                },
                {
                    label: 'Full GC Count (per hour)',
                    data: rawData.map(point => point.fullGcCount || 0),
                    borderColor: 'rgb(255, 159, 64)',
                    backgroundColor: 'rgba(255, 159, 64, 0.1)',
                    yAxisID: 'y_young_gc'
                }
            ]
        }
    };

    const config = viewConfigs[view];
    if (config) {
        // Store raw data in first dataset
        config.datasets[0].rawData = rawData;
        
        // Create timeline datasets and merge with metric datasets
        const timelineDatasets = createTimelineDatasets(labels);
        const allDatasets = [...config.datasets, ...timelineDatasets];
        
        // Update chart
        heapChart.data.labels = labels;
        heapChart.data.datasets = allDatasets;
        heapChart.update();
    }
}

// Calculate appropriate Y-axis maximum for GC Overhead based on data range
function calculateGcAxisMax(maxValue) {
    if (maxValue <= 0) return 20; // Default range for normal conditions
    if (maxValue <= 20) return 25;
    if (maxValue <= 50) return 60;
    if (maxValue <= 100) return 120;
    if (maxValue <= 200) return 250;
    if (maxValue <= 500) return 600;
    if (maxValue <= 1000) return 1200;
    if (maxValue <= 2000) return 2500;
    
    // For extremely high values, round up to nearest 1000
    return Math.ceil(maxValue / 1000) * 1000 + 500;
}

// Update data source indicator
function updateDataSourceIndicator(data, preservationStats) {
    const indicator = document.getElementById('dataSourceIndicator');
    
    if (data === 'Error loading data' || data === 'Network error') {
        indicator.innerHTML = `⚠️ ${data}`;
        indicator.style.color = '#ef4444';
        return;
    }
    
    const dataLength = Array.isArray(data) ? data.length : 0;
    
    // Count data sources
    const currentCount = data.filter(d => d.source === 'current').length;
    const preservedCount = data.filter(d => d.source === 'preserved').length;
    
    let statusText = `📊 Combined data (${dataLength} points)`;
    
    if (currentCount > 0 && preservedCount > 0) {
        statusText += ` - ${currentCount} current, ${preservedCount} preserved`;
        indicator.style.color = '#10b981'; // Green for combined data
    } else if (currentCount > 0) {
        statusText += ` - current data only`;
        indicator.style.color = '#3b82f6'; // Blue for current only
    } else if (preservedCount > 0) {
        statusText += ` - preserved data only`;
        indicator.style.color = '#f59e0b'; // Orange for preserved only
    } else {
        statusText = `📊 Data (${dataLength} points)`;
        indicator.style.color = '#6b7280'; // Gray for unknown source
    }
    
    if (preservationStats && preservationStats.preservedDataRange) {
        const oldestDate = new Date(preservationStats.preservedDataRange.oldest);
        statusText += ` (oldest: ${oldestDate.toLocaleDateString()})`;
    }
    
    indicator.innerHTML = statusText;
}

// Update time range
async function updateTimeRange() {
    await updateHeapChart();
}

// Show error message
function showError(message) {
    const alertsList = document.getElementById('alertsList');
    alertsList.innerHTML = `<div class="alert-item alert-critical">${message}</div>`;
}

// Initialize task timeline chart
function initializeTaskTimeline() {
    const ctx = document.getElementById('taskTimeline').getContext('2d');
    
    taskTimelineChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            const point = context[0];
                            const task = point.raw.task;
                            return `${task.taskName}`;
                        },
                        label: function(context) {
                            const task = context.raw.task;
                            const startTime = new Date(task.startTime).toLocaleTimeString();
                            const endTime = task.endTime ? new Date(task.endTime).toLocaleTimeString() : 'Running';
                            const duration = task.duration ? `${task.duration.toFixed(1)}s` : 'Ongoing';
                            const status = task.success === null ? 'Running' : (task.success ? 'Success' : 'Failed');
                            
                            return [
                                `Start: ${startTime}`,
                                `End: ${endTime}`,
                                `Duration: ${duration}`,
                                `Status: ${status}`,
                                `Category: ${task.category}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        displayFormats: {
                            minute: 'HH:mm',
                            hour: 'HH:mm'
                        }
                    },
                    title: {
                        display: false
                    }
                },
                y: {
                    type: 'category',
                    labels: [],
                    title: {
                        display: true,
                        text: 'Tasks'
                    },
                    grid: {
                        display: false
                    }
                }
            },
            elements: {
                point: {
                    radius: 0
                },
                line: {
                    borderWidth: 8,
                    tension: 0
                }
            }
        }
    });
}

// Update task timeline with execution data
async function updateTaskTimeline() {
    try {
        const timeRangeSelector = document.getElementById('timeRangeSelector');
        const selectedHours = timeRangeSelector.value;
        const response = await fetch(`/api/neo4j-health/task-timeline?hours=${selectedHours}`);
        const result = await response.json();
        
        if (!result.success) {
            console.error('Failed to fetch task timeline:', result.error);
            updateTimelineStatus('Error loading timeline data', 'error');
            return;
        }
        
        const timelineData = result.timeline || [];
        updateTimelineStatus(`${timelineData.length} task executions in last ${selectedHours}h`, 'success');
        
        // Group tasks by name for Y-axis positioning
        const taskNames = [...new Set(timelineData.map(t => t.taskName))];
        taskNames.sort();
        
        // Update Y-axis labels
        taskTimelineChart.options.scales.y.labels = taskNames;
        
        // Create datasets for timeline bars
        const datasets = [];
        
        timelineData.forEach((task, index) => {
            // const yPosition = taskNames.indexOf(task.taskName);
            const startTime = new Date(task.startTime);
            const endTime = task.endTime ? new Date(task.endTime) : new Date();
            
            // Create a line segment representing the task execution
            datasets.push({
                label: task.taskName,
                data: [
                    { x: startTime, y: 'START', task: task },
                    { x: endTime, y: 'END', task: task }
                ],
                borderColor: task.color,
                backgroundColor: task.color + '40', // Add transparency
                borderWidth: task.ongoing ? 6 : 4,
                borderDash: task.ongoing ? [5, 5] : [],
                pointRadius: 0,
                showLine: true,
                tension: 0
            });
        });
        
        // Update chart
        taskTimelineChart.data.datasets = datasets;
        
        // Sync X-axis with heap chart if it exists
        if (heapChart && heapChart.options.scales.x.min && heapChart.options.scales.x.max) {
            taskTimelineChart.options.scales.x.min = heapChart.options.scales.x.min;
            taskTimelineChart.options.scales.x.max = heapChart.options.scales.x.max;
        }
        
        taskTimelineChart.update();
        
        console.log(`Updated task timeline with ${timelineData.length} executions`);
        
    } catch (error) {
        console.error('Error updating task timeline:', error);
        updateTimelineStatus('Network error', 'error');
    }
}

// Update timeline status indicator
function updateTimelineStatus(message, type) {
    const indicator = document.getElementById('timelineStatus');
    if (indicator) {
        indicator.textContent = message;
        indicator.style.color = type === 'error' ? '#ef4444' : 
                              type === 'warning' ? '#f59e0b' : '#10b981';
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add event listeners to metric selector buttons
    document.querySelectorAll('.metric-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const view = this.getAttribute('data-view');
            switchMetricView(view);
        });
    });

    // Initialize with overview view
    switchMetricView('overview');
    
    // Start data loading
    async function initializeData() {
        await loadTaskTimelineData();
        await updateHeapChart();
    }
    
    initializeData();
    
    /*
    // moved to setupAutoRefresh()
    // Set up auto-refresh
    setInterval(async () => {
        await loadTaskTimelineData();
        await updateHeapChart();
    }, 30000); // Refresh every 30 seconds
    */
});