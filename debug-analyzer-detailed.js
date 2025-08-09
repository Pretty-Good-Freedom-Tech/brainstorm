#!/usr/bin/env node

/**
 * Detailed debugging script for StructuredEventsAnalyzer
 * Run this on AWS EC2 to debug the processAllActiveCustomers issue
 */

const path = require('path');
const fs = require('fs');
const StructuredEventsAnalyzer = require('./src/api/taskDashboard/structuredEventsAnalyzer.js');

// Configuration for AWS EC2 environment
const config = {
    BRAINSTORM_LOG_DIR: process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm',
    BRAINSTORM_MODULE_BASE_DIR: process.env.BRAINSTORM_MODULE_BASE_DIR || '/usr/local/lib/node_modules/brainstorm/'
};

console.log('=== DETAILED StructuredEventsAnalyzer Debug ===');
console.log('Configuration:');
console.log('  BRAINSTORM_LOG_DIR:', config.BRAINSTORM_LOG_DIR);
console.log('  BRAINSTORM_MODULE_BASE_DIR:', config.BRAINSTORM_MODULE_BASE_DIR);
console.log('');

// Check file paths
const eventsFile = path.join(config.BRAINSTORM_LOG_DIR, 'taskQueue', 'events.jsonl');
const structuredLogFile = path.join(config.BRAINSTORM_LOG_DIR, 'taskQueue', 'structured.log');
const registryFile = path.join(config.BRAINSTORM_MODULE_BASE_DIR, 'src', 'manage', 'taskQueue', 'taskRegistry.json');

console.log('=== File Path Check ===');
console.log('Events file:', eventsFile);
console.log('  Exists:', fs.existsSync(eventsFile));
if (fs.existsSync(eventsFile)) {
    console.log('  Size:', fs.statSync(eventsFile).size, 'bytes');
}

console.log('Structured log file:', structuredLogFile);
console.log('  Exists:', fs.existsSync(structuredLogFile));
if (fs.existsSync(structuredLogFile)) {
    console.log('  Size:', fs.statSync(structuredLogFile).size, 'bytes');
}

console.log('Registry file:', registryFile);
console.log('  Exists:', fs.existsSync(registryFile));
if (fs.existsSync(registryFile)) {
    console.log('  Size:', fs.statSync(registryFile).size, 'bytes');
}
console.log('');

// Create analyzer instance
const analyzer = new StructuredEventsAnalyzer(config);

// Test raw event loading
console.log('=== Raw Event Loading Test ===');
const rawEvents = analyzer.loadEvents();
console.log('Total events loaded:', rawEvents.length);

// Filter processAllActiveCustomers events
const processAllActiveCustomersEvents = rawEvents.filter(e => e.taskName === 'processAllActiveCustomers');
console.log('processAllActiveCustomers events found:', processAllActiveCustomersEvents.length);

if (processAllActiveCustomersEvents.length > 0) {
    console.log('Event details:');
    processAllActiveCustomersEvents.forEach((event, index) => {
        console.log(`  ${index + 1}. ${event.eventType} at ${event.timestamp} (pid: ${event.pid})`);
        if (event.target) console.log(`     target: ${event.target}`);
    });
} else {
    console.log('No processAllActiveCustomers events found!');
    
    // Check what task names we do have
    const uniqueTaskNames = [...new Set(rawEvents.map(e => e.taskName))];
    console.log('Available task names in events:', uniqueTaskNames.slice(0, 10));
}
console.log('');

// Test task registry loading
console.log('=== Task Registry Test ===');
const registry = analyzer.taskRegistry;
console.log('Registry loaded:', !!registry);
console.log('Registry has tasks:', !!registry.tasks);
if (registry.tasks) {
    console.log('Total tasks in registry:', Object.keys(registry.tasks).length);
    console.log('processAllActiveCustomers in registry:', !!registry.tasks['processAllActiveCustomers']);
    
    if (registry.tasks['processAllActiveCustomers']) {
        console.log('Registry entry:', JSON.stringify(registry.tasks['processAllActiveCustomers'], null, 2));
    }
}
console.log('');

// Test session grouping
console.log('=== Session Grouping Test ===');
const taskSessions = new Map();
processAllActiveCustomersEvents.forEach(event => {
    const sessionKey = `${event.taskName}_${event.pid}`;
    
    if (!taskSessions.has(sessionKey)) {
        taskSessions.set(sessionKey, {
            taskName: event.taskName,
            pid: event.pid,
            events: []
        });
    }
    
    taskSessions.get(sessionKey).events.push(event);
});

console.log('Sessions found:', taskSessions.size);
taskSessions.forEach((session, sessionKey) => {
    console.log(`Session ${sessionKey}:`);
    console.log(`  Events: ${session.events.length}`);
    
    const startEvent = session.events.find(e => e.eventType === 'TASK_START');
    const endEvent = session.events.find(e => e.eventType === 'TASK_END');
    const errorEvent = session.events.find(e => e.eventType === 'TASK_ERROR');
    
    console.log(`  Has TASK_START: ${!!startEvent}`);
    console.log(`  Has TASK_END: ${!!endEvent}`);
    console.log(`  Has TASK_ERROR: ${!!errorEvent}`);
    
    if (startEvent && endEvent) {
        const duration = new Date(endEvent.timestamp) - new Date(startEvent.timestamp);
        console.log(`  Duration: ${Math.floor(duration / 1000 / 60)} minutes`);
        console.log(`  Success: ${endEvent.target?.includes('success') || endEvent.metadata?.status === 'success'}`);
    }
});
console.log('');

// Test full analyzer
console.log('=== Full Analyzer Test ===');
const result = analyzer.analyzeTaskExecution(rawEvents);

// Look specifically for processAllActiveCustomers
console.log('=== processAllActiveCustomers Analysis ===');
const processAllActiveCustomersData = result.executionData['processAllActiveCustomers'];
if (processAllActiveCustomersData) {
    console.log('Task found in execution data:');
    console.log('  Has execution data:', processAllActiveCustomersData.hasExecutionData);
    console.log('  Is running:', processAllActiveCustomersData.isRunning);
    console.log('  Last status:', processAllActiveCustomersData.lastStatus);
    console.log('  Total runs:', processAllActiveCustomersData.totalRuns);
    console.log('  Success rate:', processAllActiveCustomersData.successRate);
    console.log('  Last run:', processAllActiveCustomersData.lastRun);
    console.log('  Last duration:', processAllActiveCustomersData.lastDurationFormatted);
    console.log('  Time since last run:', processAllActiveCustomersData.timeSinceLastRun);
} else {
    console.log('processAllActiveCustomers NOT found in execution data');
}

// Test processCustomer specifically (should now use TASK_END after standardization)
console.log('');
console.log('=== processCustomer Analysis (TASK_END Standardization Test) ===');
const processCustomerEvents = rawEvents.filter(e => e.taskName === 'processCustomer');
console.log('processCustomer events found:', processCustomerEvents.length);

if (processCustomerEvents.length > 0) {
    console.log('Event details:');
    processCustomerEvents.forEach((event, index) => {
        console.log(`  ${index + 1}. ${event.eventType} at ${event.timestamp} (pid: ${event.pid})`);
        if (event.target) console.log(`     target: ${event.target}`);
    });
}

const processCustomerData = result.executionData['processCustomer'];
if (processCustomerData) {
    console.log('Analyzer result for processCustomer:');
    console.log('  Has execution data:', processCustomerData.hasExecutionData);
    console.log('  Is running:', processCustomerData.isRunning);
    console.log('  Last status:', processCustomerData.lastStatus);
    console.log('  Total runs:', processCustomerData.totalRuns);
    console.log('  Success rate:', processCustomerData.successRate);
    console.log('  Last duration:', processCustomerData.lastDurationFormatted);
} else {
    console.log('processCustomer NOT found in execution data');
}

console.log('');
console.log('=== Diagnostics ===');
console.log('Diagnostics:', JSON.stringify(analyzer.diagnostics, null, 2));
