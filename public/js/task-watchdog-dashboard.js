/**
 * Task Watchdog Dashboard JavaScript
 * Handles real-time monitoring of task health, stuck tasks, and orphaned processes
 */

class TaskWatchdogDashboard {
    constructor() {
        this.refreshInterval = null;
        this.autoRefreshEnabled = true;
        this.refreshIntervalMs = 30000; // 30 seconds
        
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

        // Alert filters
        document.getElementById('alert-severity-filter').addEventListener('change', () => {
            this.loadAlerts();
        });

        document.getElementById('alert-hours-filter').addEventListener('change', () => {
            this.loadAlerts();
        });

        // Modal events
        const modal = document.getElementById('action-modal');
        const closeBtn = modal.querySelector('.close');
        const cancelBtn = document.getElementById('modal-cancel');

        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        cancelBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    async loadDashboard() {
        try {
            this.updateLastRefreshed();
            
            // Load all dashboard data in parallel
            await Promise.all([
                this.loadStatus(),
                this.loadAlerts(),
                this.loadStuckTasks(),
                this.loadOrphanedProcesses()
            ]);
            
        } catch (error) {
            console.error('Error loading dashboard:', error);
            this.showError('Failed to load dashboard data');
        }
    }

    async loadStatus() {
        try {
            const response = await fetch('/api/task-watchdog/status');
            const result = await response.json();
            
            if (result.status === 'success') {
                this.updateStatusMetrics(result.data);
            } else {
                throw new Error(result.message || 'Failed to load status');
            }
        } catch (error) {
            console.error('Error loading status:', error);
            this.showError('Failed to load task status');
        }
    }

    async loadAlerts() {
        try {
            const severity = document.getElementById('alert-severity-filter').value;
            const hours = document.getElementById('alert-hours-filter').value;
            
            const params = new URLSearchParams({
                limit: '20',
                hours: hours
            });
            
            if (severity) {
                params.append('severity', severity);
            }
            
            const response = await fetch(`/api/task-watchdog/alerts?${params}`);
            const result = await response.json();
            
            if (result.status === 'success') {
                this.updateAlertsDisplay(result.data);
            } else {
                throw new Error(result.message || 'Failed to load alerts');
            }
        } catch (error) {
            console.error('Error loading alerts:', error);
            this.showAlertsError('Failed to load alerts');
        }
    }

    async loadStuckTasks() {
        try {
            const response = await fetch('/api/task-watchdog/stuck-tasks');
            const result = await response.json();
            
            if (result.status === 'success') {
                this.updateStuckTasksDisplay(result.data);
            } else {
                throw new Error(result.message || 'Failed to load stuck tasks');
            }
        } catch (error) {
            console.error('Error loading stuck tasks:', error);
            this.showStuckTasksError('Failed to load stuck tasks');
        }
    }

    async loadOrphanedProcesses() {
        try {
            const response = await fetch('/api/task-watchdog/orphaned-processes');
            const result = await response.json();
            
            if (result.status === 'success') {
                this.updateOrphanedProcessesDisplay(result.data);
            } else {
                throw new Error(result.message || 'Failed to load orphaned processes');
            }
        } catch (error) {
            console.error('Error loading orphaned processes:', error);
            this.showOrphanedProcessesError('Failed to load orphaned processes');
        }
    }

    updateStatusMetrics(data) {
        // Update metric cards
        document.getElementById('active-tasks-count').textContent = data.activeTasks || 0;
        document.getElementById('stuck-tasks-count').textContent = data.stuckTasks || 0;
        document.getElementById('orphaned-processes-count').textContent = data.orphanedProcesses || 0;
        document.getElementById('completion-rate').textContent = `${data.taskCompletionRate || 100}%`;
        
        // Update health status
        const healthBadge = document.getElementById('health-status');
        const healthMessage = document.getElementById('health-message');
        
        healthBadge.className = `health-badge ${data.healthStatus || 'healthy'}`;
        healthBadge.textContent = (data.healthStatus || 'healthy').charAt(0).toUpperCase() + 
                                  (data.healthStatus || 'healthy').slice(1);
        
        // Set health message based on status
        let message = 'All systems operating normally';
        if (data.healthStatus === 'critical') {
            message = `${data.stuckTasks} stuck tasks require immediate attention`;
        } else if (data.healthStatus === 'warning') {
            message = `${data.activeTasks} active tasks, monitoring for issues`;
        }
        healthMessage.textContent = message;
    }

    updateAlertsDisplay(data) {
        const container = document.getElementById('alerts-container');
        
        if (!data.alerts || data.alerts.length === 0) {
            container.innerHTML = '<div class="loading">No alerts found</div>';
            return;
        }
        
        const alertsHtml = data.alerts.map(alert => `
            <div class="alert-item ${alert.severity}">
                <div class="alert-severity ${alert.severity}">${alert.severity}</div>
                <div class="alert-content">
                    <div class="alert-title">${alert.alertType}</div>
                    <div class="alert-message">${alert.message}</div>
                    <div class="alert-meta">
                        <span>Task: ${alert.taskName}</span>
                        <span>Target: ${alert.target}</span>
                        <span>Time: ${this.formatTimestamp(alert.timestamp)}</span>
                        <span>Component: ${alert.component}</span>
                    </div>
                    ${alert.recommendedAction ? `<div class="alert-action">Action: ${alert.recommendedAction}</div>` : ''}
                </div>
            </div>
        `).join('');
        
        container.innerHTML = alertsHtml;
    }

    updateStuckTasksDisplay(data) {
        const tbody = document.getElementById('stuck-tasks-tbody');
        const info = document.getElementById('stuck-tasks-info');
        
        info.textContent = `${data.totalStuckTasks} tasks stuck (${data.criticalStuckTasks} critical, ${data.warningStuckTasks} warning)`;
        
        if (!data.stuckTasks || data.stuckTasks.length === 0) {
            tbody.innerHTML = '<tr class="no-data"><td colspan="8">No stuck tasks found</td></tr>';
            return;
        }
        
        const rowsHtml = data.stuckTasks.map(task => `
            <tr>
                <td>${task.taskName}</td>
                <td>${task.target}</td>
                <td>${this.formatTimestamp(task.startTime)}</td>
                <td>${task.runningTimeMinutes} min</td>
                <td>${task.expectedDurationMinutes} min</td>
                <td><span class="severity-badge ${task.severity}">${task.severity}</span></td>
                <td>${task.pid || 'N/A'}</td>
                <td class="actions-cell">
                    <button class="action-btn" onclick="dashboard.showTaskDetails('${task.taskName}', '${task.target}')">Details</button>
                    ${task.pid ? `<button class="action-btn danger" onclick="dashboard.confirmKillProcess('${task.pid}', '${task.taskName}')">Kill</button>` : ''}
                </td>
            </tr>
        `).join('');
        
        tbody.innerHTML = rowsHtml;
    }

    updateOrphanedProcessesDisplay(data) {
        const tbody = document.getElementById('orphaned-processes-tbody');
        const info = document.getElementById('orphaned-info');
        
        const totalProcesses = data.totalOrphanedProcesses + data.totalSuspiciousProcesses;
        info.textContent = `${totalProcesses} processes found (${data.totalOrphanedProcesses} orphaned, ${data.totalSuspiciousProcesses} suspicious)`;
        
        const allProcesses = [
            ...(data.orphanedProcesses || []),
            ...(data.suspiciousProcesses || [])
        ];
        
        if (allProcesses.length === 0) {
            tbody.innerHTML = '<tr class="no-data"><td colspan="7">No orphaned processes found</td></tr>';
            return;
        }
        
        const rowsHtml = allProcesses.map(proc => `
            <tr>
                <td>${proc.pid}</td>
                <td>${proc.taskName || 'Unknown'}</td>
                <td title="${proc.command}">
                    ${proc.command.length > 50 ? proc.command.substring(0, 50) + '...' : proc.command}
                </td>
                <td>${proc.cpu}%</td>
                <td>${proc.memory}%</td>
                <td><span class="status-badge ${proc.status}">${proc.status}</span></td>
                <td class="actions-cell">
                    <button class="action-btn" onclick="dashboard.showProcessDetails('${proc.pid}')">Details</button>
                    <button class="action-btn danger" onclick="dashboard.confirmKillProcess('${proc.pid}', '${proc.taskName || 'Unknown'}')">Kill</button>
                </td>
            </tr>
        `).join('');
        
        tbody.innerHTML = rowsHtml;
    }

    showTaskDetails(taskName, target) {
        const modal = document.getElementById('action-modal');
        const title = document.getElementById('modal-title');
        const message = document.getElementById('modal-message');
        const details = document.getElementById('modal-details');
        const confirmBtn = document.getElementById('modal-confirm');
        
        title.textContent = 'Task Details';
        message.textContent = `Details for task: ${taskName}`;
        details.innerHTML = `
            <strong>Task Name:</strong> ${taskName}<br>
            <strong>Target:</strong> ${target}<br>
            <strong>Status:</strong> Stuck/Long Running<br>
            <br>
            <strong>Recommended Actions:</strong><br>
            • Check task logs for errors<br>
            • Verify system resources<br>
            • Consider manual intervention
        `;
        
        confirmBtn.style.display = 'none';
        modal.style.display = 'block';
    }

    showProcessDetails(pid) {
        const modal = document.getElementById('action-modal');
        const title = document.getElementById('modal-title');
        const message = document.getElementById('modal-message');
        const details = document.getElementById('modal-details');
        const confirmBtn = document.getElementById('modal-confirm');
        
        title.textContent = 'Process Details';
        message.textContent = `Details for process: ${pid}`;
        details.innerHTML = `
            <strong>PID:</strong> ${pid}<br>
            <strong>Status:</strong> Potentially orphaned<br>
            <br>
            <strong>Recommended Actions:</strong><br>
            • Verify process is actually orphaned<br>
            • Check if process can be safely terminated<br>
            • Monitor process behavior
        `;
        
        confirmBtn.style.display = 'none';
        modal.style.display = 'block';
    }

    confirmKillProcess(pid, taskName) {
        const modal = document.getElementById('action-modal');
        const title = document.getElementById('modal-title');
        const message = document.getElementById('modal-message');
        const details = document.getElementById('modal-details');
        const confirmBtn = document.getElementById('modal-confirm');
        
        title.textContent = 'Confirm Kill Process';
        message.textContent = `Are you sure you want to kill process ${pid}?`;
        details.innerHTML = `
            <strong>PID:</strong> ${pid}<br>
            <strong>Task:</strong> ${taskName}<br>
            <br>
            <strong>Warning:</strong> This action cannot be undone.<br>
            Make sure the process is safe to terminate.
        `;
        
        confirmBtn.style.display = 'inline-block';
        confirmBtn.onclick = () => {
            this.killProcess(pid);
            modal.style.display = 'none';
        };
        
        modal.style.display = 'block';
    }

    async killProcess(pid) {
        try {
            // Note: This would require a backend endpoint to safely kill processes
            // For now, just show a message
            alert(`Process kill functionality would be implemented here for PID: ${pid}`);
            
            // Refresh the dashboard after action
            setTimeout(() => {
                this.loadDashboard();
            }, 1000);
            
        } catch (error) {
            console.error('Error killing process:', error);
            alert('Failed to kill process: ' + error.message);
        }
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
        // Could show a toast notification or update UI to show error state
    }

    showAlertsError(message) {
        document.getElementById('alerts-container').innerHTML = 
            `<div class="error">Error: ${message}</div>`;
    }

    showStuckTasksError(message) {
        document.getElementById('stuck-tasks-tbody').innerHTML = 
            `<tr class="no-data"><td colspan="8">Error: ${message}</td></tr>`;
    }

    showOrphanedProcessesError(message) {
        document.getElementById('orphaned-processes-tbody').innerHTML = 
            `<tr class="no-data"><td colspan="7">Error: ${message}</td></tr>`;
    }
}

// Initialize dashboard when page loads
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new TaskWatchdogDashboard();
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
