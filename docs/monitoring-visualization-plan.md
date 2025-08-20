# Monitoring Data Visualization Plan

## Current Visualization Status

### ✅ **Existing Dashboards:**
1. **Neo4j Memory Metrics** - Covers systemResourceMonitor, neo4jStabilityMonitor, neo4jCrashPatternDetector
2. **Task Dashboard** - Covers systemStateGatherer

### ❌ **Missing Visualizations:**
1. **Task Watchdog Dashboard** - taskWatchdog data
2. **Task Behavior Analytics Dashboard** - taskBehaviorMonitor data  
3. **System Resource Trends Dashboard** - Historical resource data
4. **Monitoring Overview Dashboard** - Unified monitoring status

## Detailed Visualization Plans

### **1. Task Watchdog Dashboard**

#### **Purpose:**
Monitor stuck tasks, orphaned processes, and task completion health

#### **API Endpoints Needed:**
```javascript
// New API endpoints to create
GET /api/task-watchdog/status
GET /api/task-watchdog/alerts
GET /api/task-watchdog/stuck-tasks
GET /api/task-watchdog/orphaned-processes
```

#### **Dashboard Components:**

##### **A. Task Health Overview (Top Section)**
- **Active Tasks Count** - Real-time count of running tasks
- **Stuck Tasks Alert** - Red badge with count of stuck tasks
- **Orphaned Processes** - Warning badge with orphaned process count
- **Task Completion Rate** - Percentage of tasks completing successfully

##### **B. Stuck Tasks Table (Main Section)**
```html
<table class="stuck-tasks-table">
  <thead>
    <tr>
      <th>Task Name</th>
      <th>Started</th>
      <th>Duration</th>
      <th>Expected Duration</th>
      <th>Status</th>
      <th>PID</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody id="stuck-tasks-list">
    <!-- Populated via API -->
  </tbody>
</table>
```

##### **C. Orphaned Processes Section**
- List of processes without parent tasks
- Process details (PID, command, start time)
- Kill process action buttons

##### **D. Task Timeline Visualization**
- Gantt chart showing task execution timeline
- Color coding: Green (completed), Yellow (running), Red (stuck)
- Interactive hover for task details

#### **File Structure:**
```
public/pages/task-watchdog-dashboard.html
public/css/task-watchdog-dashboard.css
src/api/task-watchdog/
├── index.js
├── queries/
│   ├── status.js
│   ├── alerts.js
│   ├── stuck-tasks.js
│   └── orphaned-processes.js
```

### **2. Task Behavior Analytics Dashboard**

#### **Purpose:**
Analyze task execution patterns, performance trends, and behavioral anomalies

#### **API Endpoints Needed:**
```javascript
GET /api/task-behavior/analytics
GET /api/task-behavior/anomalies  
GET /api/task-behavior/performance-trends
GET /api/task-behavior/task-metrics/:taskName
```

#### **Dashboard Components:**

##### **A. Performance Metrics Overview**
- **Average Task Duration** - Across all tasks
- **Task Success Rate** - Percentage of successful completions
- **Anomaly Count** - Number of detected anomalies
- **Performance Trend** - Up/down arrow with percentage change

##### **B. Task Duration Trends Chart**
```html
<div class="chart-container">
  <canvas id="task-duration-chart"></canvas>
  <div class="chart-controls">
    <select id="time-range">
      <option value="24h">Last 24 Hours</option>
      <option value="7d">Last 7 Days</option>
      <option value="30d">Last 30 Days</option>
    </select>
    <select id="task-filter">
      <option value="all">All Tasks</option>
      <!-- Populated dynamically -->
    </select>
  </div>
</div>
```

##### **C. Anomaly Detection Section**
- **Anomaly Types:** Duration, Frequency, Resource Usage, Failure Rate
- **Severity Levels:** Critical, Warning, Info
- **Timeline:** When anomalies occurred
- **Details:** Specific metrics that triggered detection

##### **D. Task Performance Comparison**
- Side-by-side comparison of task metrics
- Performance ranking table
- Resource utilization comparison

#### **Visualization Libraries:**
- **Chart.js** for line charts and bar graphs
- **D3.js** for advanced timeline visualizations
- **DataTables** for sortable/filterable tables

### **3. System Resource Trends Dashboard**

#### **Purpose:**
Historical analysis of system resource usage and performance trends

#### **API Endpoints Needed:**
```javascript
GET /api/system-resources/history
GET /api/system-resources/trends
GET /api/system-resources/predictions
GET /api/neo4j-performance/history
```

#### **Dashboard Components:**

##### **A. Resource Usage Timeline**
- **CPU Usage** - Multi-line chart over time
- **Memory Usage** - System vs Neo4j memory
- **Disk Usage** - Storage utilization trends
- **Network I/O** - Data transfer rates

##### **B. Neo4j Performance Trends**
- **Heap Usage** - Historical heap utilization
- **GC Performance** - Garbage collection metrics over time
- **Query Response Times** - Database performance trends
- **Connection Pool** - Connection usage patterns

##### **C. Predictive Analytics Section**
- **Resource Exhaustion Predictions** - When resources might be depleted
- **Performance Degradation Alerts** - Early warning indicators
- **Capacity Planning** - Growth trend analysis

##### **D. Correlation Analysis**
- **Resource vs Performance** - How resource usage affects performance
- **Task Load vs System Health** - Impact of task execution on system
- **Time-based Patterns** - Daily/weekly usage patterns

### **4. Monitoring Overview Dashboard**

#### **Purpose:**
Unified view of all monitoring systems and their health status

#### **API Endpoints Needed:**
```javascript
GET /api/monitoring/overview
GET /api/monitoring/health-status
GET /api/monitoring/coverage-metrics
GET /api/monitoring/scheduler-status
```

#### **Dashboard Components:**

##### **A. Monitoring Health Grid**
```html
<div class="monitoring-grid">
  <div class="monitor-card" data-monitor="taskWatchdog">
    <h3>Task Watchdog</h3>
    <div class="status-indicator green"></div>
    <div class="last-run">2 minutes ago</div>
    <div class="metrics">
      <span>Tasks: 12 active</span>
      <span>Alerts: 0</span>
    </div>
  </div>
  <!-- Repeat for each monitor -->
</div>
```

##### **B. Alert Aggregation Center**
- **All Active Alerts** - Consolidated view from all monitors
- **Alert Severity Distribution** - Critical/Warning/Info counts
- **Alert Timeline** - When alerts were triggered
- **Alert Correlation** - Related alerts grouping

##### **C. Coverage Metrics**
- **Monitoring Uptime** - Percentage of time monitors are running
- **Data Collection Rate** - How much monitoring data is being collected
- **Response Time** - How quickly alerts are generated
- **False Positive Rate** - Alert accuracy metrics

##### **D. Scheduler Status**
- **Current Execution Tier** - Which monitoring tier is active
- **Next Scheduled Tasks** - Upcoming monitoring executions
- **Resource Utilization** - How much system resources monitoring uses
- **Performance Metrics** - Monitoring system performance

## Implementation Priority

### **Phase 1: High Priority (Week 1)**
1. **Task Watchdog Dashboard** - Critical for operational visibility
2. **API endpoints for Task Watchdog** - Backend support

### **Phase 2: Medium Priority (Week 2)**  
1. **Task Behavior Analytics Dashboard** - Performance insights
2. **Monitoring Overview Dashboard** - Unified monitoring view

### **Phase 3: Future Enhancement (Week 3)**
1. **System Resource Trends Dashboard** - Historical analysis
2. **Advanced analytics and predictions**

## Technical Implementation Details

### **Dashboard Template Structure:**
```html
<!DOCTYPE html>
<html>
<head>
    <title>Dashboard Name - Brainstorm</title>
    <link rel="stylesheet" href="/css/common.css">
    <link rel="stylesheet" href="/css/dashboard-specific.css">
</head>
<body>
    <div id="header-placeholder"></div>
    <div class="page-content">
        <div class="dashboard-header">
            <h1>Dashboard Title</h1>
            <div class="refresh-controls">
                <button id="refresh-btn">Refresh</button>
                <span id="last-updated"></span>
            </div>
        </div>
        <div class="dashboard-content">
            <!-- Dashboard-specific content -->
        </div>
    </div>
    <div id="footer-placeholder"></div>
    
    <script src="/components/header/header.js"></script>
    <script src="/components/footer/footer.js"></script>
    <script src="/js/dashboard-specific.js"></script>
</body>
</html>
```

### **API Response Format:**
```javascript
// Standard monitoring API response
{
    "timestamp": "2025-08-15T21:17:34Z",
    "status": "success",
    "data": {
        // Dashboard-specific data
    },
    "metadata": {
        "dataSource": "events.jsonl",
        "lastUpdated": "2025-08-15T21:17:30Z",
        "recordCount": 1250
    }
}
```

### **Auto-refresh Implementation:**
```javascript
// Standard auto-refresh pattern for all dashboards
class DashboardRefresh {
    constructor(refreshInterval = 30000) {
        this.interval = refreshInterval;
        this.isActive = true;
    }
    
    start() {
        this.refreshData();
        setInterval(() => {
            if (this.isActive) {
                this.refreshData();
            }
        }, this.interval);
    }
    
    async refreshData() {
        try {
            const response = await fetch('/api/dashboard-endpoint');
            const data = await response.json();
            this.updateUI(data);
            this.updateTimestamp();
        } catch (error) {
            this.handleError(error);
        }
    }
}
```

## Success Metrics

### **User Experience:**
- Dashboard load time < 2 seconds
- Data refresh time < 1 second  
- Mobile-responsive design
- Intuitive navigation

### **Data Quality:**
- Real-time data accuracy > 99%
- Alert latency < 30 seconds
- Historical data retention: 30 days
- API response time < 500ms

### **Operational Impact:**
- Reduced time to detect issues by 80%
- Faster problem resolution
- Improved system reliability
- Better capacity planning

This comprehensive visualization plan will provide complete monitoring coverage and significantly improve operational visibility into the Brainstorm system health.
