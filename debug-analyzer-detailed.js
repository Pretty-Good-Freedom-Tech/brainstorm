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
const processAllActiveCustomersData = result['processAllActiveCustomers'];

if (processAllActiveCustomersData) {
    console.log('Analyzer result for processAllActiveCustomers:');
    console.log(JSON.stringify(processAllActiveCustomersData, null, 2));
} else {
    console.log('processAllActiveCustomers NOT found in analyzer result');
    console.log('Available tasks in result:', Object.keys(result).slice(0, 10));
}

console.log('');
console.log('=== Diagnostics ===');
console.log('Diagnostics:', JSON.stringify(analyzer.diagnostics, null, 2));
