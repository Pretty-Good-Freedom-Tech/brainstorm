#!/usr/bin/env node

/**
 * Test script for StructuredEventsAnalyzer
 * Run this on AWS EC2 to test the enhanced log parsing
 */

const path = require('path');
const StructuredEventsAnalyzer = require('./src/api/taskDashboard/structuredEventsAnalyzer.js');

// Configuration for AWS EC2 environment
const config = {
    BRAINSTORM_LOG_DIR: process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm',
    BRAINSTORM_MODULE_BASE_DIR: process.env.BRAINSTORM_MODULE_BASE_DIR || '/home/ubuntu/brainstorm'
};

console.log('=== StructuredEventsAnalyzer Test ===');
console.log('Configuration:');
console.log('  BRAINSTORM_LOG_DIR:', config.BRAINSTORM_LOG_DIR);
console.log('  BRAINSTORM_MODULE_BASE_DIR:', config.BRAINSTORM_MODULE_BASE_DIR);
console.log('');

// Create analyzer instance
const analyzer = new StructuredEventsAnalyzer(config);

// Test the enhanced analyzer
console.log('Testing enhanced analyzer...');
const result = analyzer.analyzeTaskExecution();

console.log('=== Diagnostics ===');
console.log('Files checked:', JSON.stringify(result.diagnostics.filesChecked, null, 2));
console.log('Events found:', result.diagnostics.eventsFound);
console.log('Parse errors:', result.diagnostics.parseErrors);
console.log('');

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

console.log('');
console.log('=== Summary ===');
console.log('Total tasks with execution data:', result.analysis.tasksWithExecutionData);
console.log('Currently running:', result.analysis.currentlyRunning);
console.log('Never run:', result.analysis.neverRun);
console.log('Recently successful:', result.analysis.recentlySuccessful);
console.log('Recently failed:', result.analysis.recentlyFailed);
