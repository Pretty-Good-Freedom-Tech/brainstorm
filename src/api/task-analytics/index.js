const express = require('express');
const router = express.Router();

// Import handler functions with explicit .js extensions
const { handleTaskAnalytics } = require('./queries/analytics.js');
const { handleTaskTrends } = require('./queries/trends.js');
const { handleTaskPredictions } = require('./queries/predictions.js');
const { handleTaskPerformance } = require('./queries/performance.js');

// Export handlers for registration in main API
module.exports = {
    handleTaskAnalytics,
    handleTaskTrends,
    handleTaskPredictions,
    handleTaskPerformance
};
