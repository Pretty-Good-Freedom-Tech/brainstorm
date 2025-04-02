/**
 * Hasenpfeffr Instance Status Overview Bar
 * 
 * This component displays key metrics about the Hasenpfeffr instance status
 * in a compact, collapsible bar that can be included in any page.
 */

class OverviewBar {
    constructor() {
        this.collapsed = localStorage.getItem('overviewBarCollapsed') === 'true';
        this.lastUpdate = null;
        this.refreshInterval = null;
        this.autoRefreshMinutes = 5;
    }
    
    /**
     * Initialize the overview bar
     */
    initialize() {
        console.log('Initializing Hasenpfeffr Overview Bar');
        this.setupListeners();
        this.applyCollapseState();
        this.fetchInstanceStatus();
        
        // Set up auto-refresh
        this.setupAutoRefresh();
    }
    
    /**
     * Set up event listeners for interactivity
     */
    setupListeners() {
        // Toggle collapse state
        document.getElementById('toggleOverviewBar').addEventListener('click', () => {
            this.collapsed = !this.collapsed;
            localStorage.setItem('overviewBarCollapsed', this.collapsed);
            this.applyCollapseState();
        });
        
        // Refresh button
        document.getElementById('refreshOverviewBar').addEventListener('click', () => {
            this.fetchInstanceStatus();
        });
    }
    
    /**
     * Apply the collapsed state to the UI
     */
    applyCollapseState() {
        const bar = document.getElementById('overviewBar');
        if (this.collapsed) {
            bar.classList.add('collapsed');
        } else {
            bar.classList.remove('collapsed');
        }
    }
    
    /**
     * Set up automatic refresh of the status data
     */
    setupAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        // Auto-refresh every X minutes
        this.refreshInterval = setInterval(() => {
            this.fetchInstanceStatus();
        }, this.autoRefreshMinutes * 60 * 1000);
    }
    
    /**
     * Format numbers for display
     */
    formatNumber(num) {
        if (num === null || num === undefined) return '-';
        
        // If the number is larger than 1000, format as 1.2k, 5.3M, etc.
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'k';
        }
        
        return num.toString();
    }
    
    /**
     * Format timestamp for display
     */
    formatTimestamp(timestamp) {
        if (!timestamp) return 'Never';
        
        const now = new Date();
        const date = new Date(timestamp * 1000);
        const diff = Math.floor((now - date) / 1000);
        
        if (diff < 60) {
            return 'Just now';
        } else if (diff < 3600) {
            const minutes = Math.floor(diff / 60);
            return `${minutes}m ago`;
        } else if (diff < 86400) {
            const hours = Math.floor(diff / 3600);
            return `${hours}h ago`;
        } else {
            return date.toLocaleDateString();
        }
    }
    
    /**
     * Update the UI with the latest status data
     */
    updateUI(data) {
        console.log('Updating Overview Bar UI with data:', data);
        
        // Update last updated timestamp
        this.lastUpdate = data.timestamp;
        document.getElementById('lastRefreshTime').textContent = this.formatTimestamp(data.timestamp);
        
        // Update Strfry status
        const strfryStatus = document.getElementById('strfryStatus');
        strfryStatus.className = `status-indicator status-${data.strfry.service.status === 'running' ? 'running' : 'stopped'}`;
        document.getElementById('totalEvents').textContent = this.formatNumber(data.strfry.events.total);
        
        // Update Neo4j status
        const neo4jStatus = document.getElementById('neo4jStatus');
        neo4jStatus.className = `status-indicator status-${data.neo4j.service.status === 'running' ? 'running' : 'stopped'}`;
        document.getElementById('totalUsers').textContent = this.formatNumber(data.neo4j.users.total);
        
        // Update Whitelist count
        document.getElementById('whitelistCount').textContent = this.formatNumber(data.whitelist.count);
        
        // Update Verified users
        document.getElementById('verifiedUsers').textContent = this.formatNumber(data.grapeRank.verifiedUsers);
        
        // Update Recent events
        document.getElementById('recentEvents').textContent = this.formatNumber(data.strfry.events.recent);
    }
    
    /**
     * Fetch instance status data from the API
     */
    fetchInstanceStatus() {
        console.log('Fetching instance status data for Overview Bar...');
        
        fetch(window.location.origin + '/api/instance-status')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    this.updateUI(data);
                } else {
                    console.error('Error in API response:', data.error);
                }
            })
            .catch(error => {
                console.error('Error fetching instance status data:', error);
            });
    }
}

// Create and initialize an instance of the Overview Bar on DOM content loaded
document.addEventListener('DOMContentLoaded', function() {
    const overviewBar = new OverviewBar();
    overviewBar.initialize();
});
