/**
 * Task Behavior Analytics Dashboard JavaScript
 * Handles advanced analytics, trends, predictions, and performance analysis
 */

class TaskBehaviorAnalyticsDashboard {
    constructor() {
        this.refreshInterval = null;
        this.autoRefreshEnabled = true;
        this.refreshIntervalMs = 60000; // 1 minute
        this.charts = {};
        this.currentTab = 'analytics';
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadDashboard();
        this.startAutoRefresh();
    }

    bindEvents() {
        // Refresh button
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.loadDashboard();
        });

        // Time range filter
        document.getElementById('time-range-select').addEventListener('change', () => {
            this.loadDashboard();
        });

        // Task filter
        document.getElementById('task-filter').addEventListener('change', () => {
            this.loadDashboard();
        });

        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Trends controls
        document.getElementById('trend-metric')?.addEventListener('change', () => {
            this.loadTrends();
        });

        document.getElementById('trend-granularity')?.addEventListener('change', () => {
            this.loadTrends();
        });

        // Predictions controls
        document.getElementById('prediction-type')?.addEventListener('change', () => {
            this.loadPredictions();
        });

        document.getElementById('prediction-horizon')?.addEventListener('change', () => {
            this.loadPredictions();
        });
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.currentTab = tabName;

        // Load tab-specific data
        switch (tabName) {
            case 'analytics':
                this.loadAnalytics();
                break;
            case 'trends':
                this.loadTrends();
                break;
            case 'predictions':
                this.loadPredictions();
                break;
            case 'performance':
                this.loadPerformance();
                break;
        }
    }

    async loadDashboard() {
        try {
            this.updateLastRefreshed();
            
            // Load data for current tab
            switch (this.currentTab) {
                case 'analytics':
                    await this.loadAnalytics();
                    break;
                case 'trends':
                    await this.loadTrends();
                    break;
                case 'predictions':
                    await this.loadPredictions();
                    break;
                case 'performance':
                    await this.loadPerformance();
                    break;
            }
            
        } catch (error) {
            console.error('Error loading dashboard:', error);
            this.showError('Failed to load dashboard data');
        }
    }

    async loadAnalytics() {
        try {
            const timeRange = document.getElementById('time-range-select').value;
            const taskName = document.getElementById('task-filter').value;
            
            const params = new URLSearchParams({ timeRange });
            if (taskName) params.append('taskName', taskName);
            
            const response = await fetch(`/api/task-analytics/analytics?${params}`);
            const result = await response.json();
            
            if (result.status === 'success') {
                this.updateAnalyticsDisplay(result.data);
                this.updateTaskFilter(result.data.taskAnalytics.taskBreakdown);
            } else {
                throw new Error(result.message || 'Failed to load analytics');
            }
        } catch (error) {
            console.error('Error loading analytics:', error);
            this.showAnalyticsError('Failed to load analytics data');
        }
    }

    async loadTrends() {
        try {
            const timeRange = document.getElementById('time-range-select').value;
            const metric = document.getElementById('trend-metric')?.value || 'duration';
            const granularity = document.getElementById('trend-granularity')?.value || 'hour';
            
            const params = new URLSearchParams({ timeRange, metric, granularity });
            
            const response = await fetch(`/api/task-analytics/trends?${params}`);
            const result = await response.json();
            
            if (result.status === 'success') {
                this.updateTrendsDisplay(result.data);
            } else {
                throw new Error(result.message || 'Failed to load trends');
            }
        } catch (error) {
            console.error('Error loading trends:', error);
            this.showTrendsError('Failed to load trends data');
        }
    }

    async loadPredictions() {
        try {
            const type = document.getElementById('prediction-type')?.value || 'failure';
            const horizon = document.getElementById('prediction-horizon')?.value || '24';
            const taskName = document.getElementById('task-filter').value;
            
            const params = new URLSearchParams({ type, horizon });
            if (taskName) params.append('taskName', taskName);
            
            const response = await fetch(`/api/task-analytics/predictions?${params}`);
            const result = await response.json();
            
            if (result.status === 'success') {
                this.updatePredictionsDisplay(result.data);
            } else {
                throw new Error(result.message || 'Failed to load predictions');
            }
        } catch (error) {
            console.error('Error loading predictions:', error);
            this.showPredictionsError('Failed to load predictions data');
        }
    }

    async loadPerformance() {
        try {
            const timeRange = document.getElementById('time-range-select').value;
            const taskName = document.getElementById('task-filter').value;
            
            const params = new URLSearchParams({ timeRange, recommendations: 'true' });
            if (taskName) params.append('taskName', taskName);
            
            const response = await fetch(`/api/task-analytics/performance?${params}`);
            const result = await response.json();
            
            if (result.status === 'success') {
                this.updatePerformanceDisplay(result.data);
            } else {
                throw new Error(result.message || 'Failed to load performance data');
            }
        } catch (error) {
            console.error('Error loading performance:', error);
            this.showPerformanceError('Failed to load performance data');
        }
    }

    updateAnalyticsDisplay(data) {
        // Update overview metrics
        const overallStats = data.taskAnalytics.overallStats || {};
        document.getElementById('total-tasks').textContent = data.taskAnalytics.totalTasks || 0;
        document.getElementById('success-rate').textContent = `${overallStats.overallSuccessRate || 100}%`;
        document.getElementById('avg-duration').textContent = this.formatDuration(overallStats.averageExecutionTime || 0);
        document.getElementById('total-executions').textContent = overallStats.totalExecutions || 0;

        // Update task breakdown table
        this.updateTaskBreakdownTable(data.taskAnalytics.taskBreakdown || []);

        // Update execution patterns charts
        this.updateExecutionPatternsCharts(data.executionPatterns || {});
    }

    updateTaskBreakdownTable(taskBreakdown) {
        const tbody = document.getElementById('task-breakdown-tbody');
        
        if (!taskBreakdown || taskBreakdown.length === 0) {
            tbody.innerHTML = '<tr class="no-data"><td colspan="6">No task data available</td></tr>';
            return;
        }

        const rowsHtml = taskBreakdown.map(task => `
            <tr>
                <td>${task.taskName}</td>
                <td>${task.target}</td>
                <td>${task.totalExecutions}</td>
                <td>
                    <span class="success-rate ${task.successRate < 90 ? 'low' : 'high'}">
                        ${task.successRate}%
                    </span>
                </td>
                <td>${this.formatDuration(task.averageDuration)}</td>
                <td>${task.lastExecution ? this.formatTimestamp(task.lastExecution) : 'Never'}</td>
            </tr>
        `).join('');

        tbody.innerHTML = rowsHtml;
    }

    updateExecutionPatternsCharts(patterns) {
        // Hourly distribution chart
        this.updateHourlyChart(patterns.hourlyDistribution || []);
        
        // Task frequency chart
        this.updateFrequencyChart(patterns.taskFrequency || []);
    }

    updateHourlyChart(hourlyData) {
        const ctx = document.getElementById('hourly-chart');
        if (!ctx) return;

        if (this.charts.hourly) {
            this.charts.hourly.destroy();
        }

        const labels = hourlyData.map(d => `${d.hour}:00`);
        const data = hourlyData.map(d => d.count);

        this.charts.hourly = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Task Executions',
                    data,
                    backgroundColor: 'rgba(52, 152, 219, 0.6)',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    updateFrequencyChart(frequencyData) {
        const ctx = document.getElementById('frequency-chart');
        if (!ctx) return;

        if (this.charts.frequency) {
            this.charts.frequency.destroy();
        }

        const labels = frequencyData.slice(0, 10).map(d => d.task);
        const data = frequencyData.slice(0, 10).map(d => d.count);

        this.charts.frequency = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: [
                        '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
                        '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#f1c40f'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right'
                    }
                }
            }
        });
    }

    updateTrendsDisplay(data) {
        // Update trends chart
        this.updateTrendsChart(data.trends || []);
        
        // Update trend analysis
        this.updateTrendAnalysis(data.summary || {});
    }

    updateTrendsChart(trendsData) {
        const ctx = document.getElementById('trends-chart');
        if (!ctx) return;

        if (this.charts.trends) {
            this.charts.trends.destroy();
        }

        const labels = trendsData.map(d => this.formatTimestamp(d.timestamp));
        const data = trendsData.map(d => d.value);

        this.charts.trends = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Trend Value',
                    data,
                    borderColor: 'rgba(52, 152, 219, 1)',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    updateTrendAnalysis(summary) {
        const container = document.getElementById('trend-analysis');
        
        if (!summary || Object.keys(summary).length === 0) {
            container.innerHTML = '<div class="loading">No trend analysis available</div>';
            return;
        }

        const analysisHtml = `
            <div class="trend-stat ${summary.trend}">
                <span><strong>Trend:</strong> ${summary.trend}</span>
                <span>${summary.changePercent > 0 ? '+' : ''}${summary.changePercent}%</span>
            </div>
            <div class="trend-stat">
                <span><strong>Volatility:</strong> ${summary.volatility}%</span>
                <span>Stability indicator</span>
            </div>
            <div class="trend-stat">
                <span><strong>Average:</strong> ${summary.statistics?.average || 'N/A'}</span>
                <span>Mean value</span>
            </div>
            <div class="trend-stat">
                <span><strong>Range:</strong> ${summary.statistics?.min || 'N/A'} - ${summary.statistics?.max || 'N/A'}</span>
                <span>Min - Max values</span>
            </div>
        `;

        container.innerHTML = analysisHtml;
    }

    updatePredictionsDisplay(data) {
        const container = document.getElementById('predictions-content');
        
        if (!data.predictions || Object.keys(data.predictions).length === 0) {
            container.innerHTML = '<div class="loading">No predictions available</div>';
            return;
        }

        let predictionsHtml = '';

        if (Array.isArray(data.predictions)) {
            // Failure predictions
            predictionsHtml = data.predictions.map(pred => `
                <div class="prediction-card ${this.getPredictionRiskClass(pred.failureProbability)}">
                    <div class="prediction-header">
                        <div class="prediction-title">${pred.taskName} (${pred.target})</div>
                        <div class="confidence-badge ${pred.confidence}">${pred.confidence}</div>
                    </div>
                    <div class="prediction-value">${pred.failureProbability}% failure risk</div>
                    <div class="prediction-reasoning">${pred.reasoning}</div>
                    ${pred.lastFailure ? `<div class="prediction-meta">Last failure: ${this.formatTimestamp(pred.lastFailure)}</div>` : ''}
                </div>
            `).join('');
        } else {
            // Resource or duration predictions
            predictionsHtml = Object.entries(data.predictions).map(([key, pred]) => `
                <div class="prediction-card ${this.getPredictionRiskClass(pred.predicted || pred.nextValue)}">
                    <div class="prediction-header">
                        <div class="prediction-title">${key.charAt(0).toUpperCase() + key.slice(1)}</div>
                        <div class="confidence-badge ${pred.confidence}">${pred.confidence}</div>
                    </div>
                    <div class="prediction-value">
                        ${pred.predicted !== undefined ? `${pred.predicted}${key === 'cpu' || key === 'memory' || key === 'heap' ? '%' : ''}` : 
                          pred.nextValue !== undefined ? this.formatDuration(pred.nextValue) : 'N/A'}
                    </div>
                    <div class="prediction-reasoning">
                        ${pred.trend ? `Trend: ${pred.trend}` : ''}
                        ${pred.hoursToThreshold ? ` • ${pred.hoursToThreshold}h to threshold` : ''}
                    </div>
                </div>
            `).join('');
        }

        container.innerHTML = predictionsHtml;
    }

    updatePerformanceDisplay(data) {
        // Update performance metrics
        this.updatePerformanceMetrics(data.performanceMetrics || {});
        
        // Update bottlenecks
        this.updateBottlenecks(data.bottlenecks || []);
        
        // Update recommendations
        this.updateRecommendations(data.recommendations || []);
    }

    updatePerformanceMetrics(metrics) {
        const container = document.getElementById('performance-metrics');
        
        if (!metrics.overallStats) {
            container.innerHTML = '<div class="loading">No performance metrics available</div>';
            return;
        }

        const stats = metrics.overallStats;
        const metricsHtml = `
            <div class="performance-metric">
                <h4>Total Executions</h4>
                <div class="performance-value">${stats.totalExecutions || 0}</div>
            </div>
            <div class="performance-metric">
                <h4>Success Rate</h4>
                <div class="performance-value">${stats.overallSuccessRate || 100}%</div>
            </div>
            <div class="performance-metric">
                <h4>Avg Duration</h4>
                <div class="performance-value">${this.formatDuration(stats.averageExecutionTime || 0)}</div>
            </div>
            <div class="performance-metric">
                <h4>Throughput</h4>
                <div class="performance-value">${stats.averageThroughput || 0}/h</div>
                <div class="performance-details">executions per hour</div>
            </div>
        `;

        container.innerHTML = metricsHtml;
    }

    updateBottlenecks(bottlenecks) {
        const container = document.getElementById('bottlenecks-list');
        
        if (!bottlenecks || bottlenecks.length === 0) {
            container.innerHTML = '<div class="loading">No bottlenecks detected</div>';
            return;
        }

        const bottlenecksHtml = bottlenecks.map(bottleneck => `
            <div class="bottleneck-item ${bottleneck.severity}">
                <div class="bottleneck-header">
                    <div class="bottleneck-title">${bottleneck.taskName} - ${bottleneck.type.replace(/_/g, ' ')}</div>
                    <div class="severity-badge ${bottleneck.severity}">${bottleneck.severity}</div>
                </div>
                <div class="bottleneck-description">${bottleneck.description}</div>
                <div class="bottleneck-impact">Impact: ${bottleneck.impact}</div>
            </div>
        `).join('');

        container.innerHTML = bottlenecksHtml;
    }

    updateRecommendations(recommendations) {
        const container = document.getElementById('recommendations-list');
        
        if (!recommendations || recommendations.length === 0) {
            container.innerHTML = '<div class="loading">No recommendations available</div>';
            return;
        }

        const recommendationsHtml = recommendations.map(rec => `
            <div class="recommendation-item ${rec.priority}">
                <div class="recommendation-header">
                    <div class="recommendation-title">${rec.title}</div>
                    <div class="priority-badge ${rec.priority}">${rec.priority}</div>
                </div>
                <div class="recommendation-description">${rec.description}</div>
                <div class="recommendation-actions">
                    <h5>Recommended Actions:</h5>
                    <ul>
                        ${rec.actions.map(action => `<li>${action}</li>`).join('')}
                    </ul>
                </div>
                <div class="recommendation-impact">Expected Impact: ${rec.expectedImpact}</div>
            </div>
        `).join('');

        container.innerHTML = recommendationsHtml;
    }

    updateTaskFilter(taskBreakdown) {
        const select = document.getElementById('task-filter');
        const currentValue = select.value;
        
        // Clear existing options except "All Tasks"
        select.innerHTML = '<option value="">All Tasks</option>';
        
        // Add unique task names
        const uniqueTasks = [...new Set(taskBreakdown.map(task => task.taskName))];
        uniqueTasks.forEach(taskName => {
            const option = document.createElement('option');
            option.value = taskName;
            option.textContent = taskName;
            if (taskName === currentValue) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    // Helper functions
    getPredictionRiskClass(value) {
        if (typeof value === 'number') {
            if (value > 70) return 'high-risk';
            if (value > 30) return 'medium-risk';
            return 'low-risk';
        }
        return 'low-risk';
    }

    formatDuration(ms) {
        if (!ms || ms < 0) return '0s';
        
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffMinutes < 1) {
            return 'Just now';
        } else if (diffMinutes < 60) {
            return `${diffMinutes}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else if (diffDays < 7) {
            return `${diffDays}d ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    updateLastRefreshed() {
        const now = new Date();
        document.getElementById('last-updated').textContent = 
            `Last updated: ${now.toLocaleTimeString()}`;
    }

    startAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        if (this.autoRefreshEnabled) {
            this.refreshInterval = setInterval(() => {
                this.loadDashboard();
            }, this.refreshIntervalMs);
        }
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    showError(message) {
        console.error('Dashboard error:', message);
    }

    showAnalyticsError(message) {
        document.getElementById('task-breakdown-tbody').innerHTML = 
            `<tr class="no-data"><td colspan="6">Error: ${message}</td></tr>`;
    }

    showTrendsError(message) {
        document.getElementById('trend-analysis').innerHTML = 
            `<div class="error">Error: ${message}</div>`;
    }

    showPredictionsError(message) {
        document.getElementById('predictions-content').innerHTML = 
            `<div class="error">Error: ${message}</div>`;
    }

    showPerformanceError(message) {
        document.getElementById('performance-metrics').innerHTML = 
            `<div class="error">Error: ${message}</div>`;
    }
}

// Initialize dashboard when page loads
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new TaskBehaviorAnalyticsDashboard();
});

// Handle page visibility changes to pause/resume auto-refresh
document.addEventListener('visibilitychange', () => {
    if (dashboard) {
        if (document.hidden) {
            dashboard.stopAutoRefresh();
        } else {
            dashboard.startAutoRefresh();
            dashboard.loadDashboard(); // Refresh immediately when page becomes visible
        }
    }
});
