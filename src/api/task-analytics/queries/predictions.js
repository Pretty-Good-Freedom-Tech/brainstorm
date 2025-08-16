const fs = require('fs');
const path = require('path');

/**
 * Task Predictions Handler
 * Provides predictive analytics for task behavior and resource usage
 */
async function handleTaskPredictions(req, res) {
    try {
        const predictionType = req.query.type || 'failure'; // failure, duration, resource
        const taskName = req.query.taskName;
        const horizon = parseInt(req.query.horizon) || 24; // hours to predict ahead

        const eventsLogPath = path.join(process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm', 'taskQueue', 'events.jsonl');
        
        if (!fs.existsSync(eventsLogPath)) {
            return res.json({
                timestamp: new Date().toISOString(),
                status: 'success',
                data: {
                    predictions: [],
                    confidence: 'low',
                    model: 'no_data'
                },
                metadata: {
                    dataSource: 'events.jsonl',
                    lastUpdated: new Date().toISOString(),
                    recordCount: 0,
                    filters: { predictionType, taskName, horizon }
                }
            });
        }

        // Use last 7 days of data for predictions
        const cutoffTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const events = readAndParseEvents(eventsLogPath, cutoffTime, taskName);

        let predictions = {};
        let confidence = 'low';
        let model = 'insufficient_data';

        switch (predictionType) {
            case 'failure':
                ({ predictions, confidence, model } = predictFailures(events, horizon));
                break;
            case 'duration':
                ({ predictions, confidence, model } = predictDurations(events, horizon));
                break;
            case 'resource':
                ({ predictions, confidence, model } = predictResourceUsage(events, horizon));
                break;
        }

        const responseData = {
            predictions,
            confidence,
            model,
            predictionType,
            horizon,
            generatedAt: new Date().toISOString()
        };

        res.json({
            timestamp: new Date().toISOString(),
            status: 'success',
            data: responseData,
            metadata: {
                dataSource: 'events.jsonl',
                lastUpdated: new Date().toISOString(),
                recordCount: events.length,
                filters: { predictionType, taskName, horizon }
            }
        });

    } catch (error) {
        console.error('Error in handleTaskPredictions:', error);
        res.status(500).json({
            timestamp: new Date().toISOString(),
            status: 'error',
            error: 'Failed to get task predictions',
            message: error.message
        });
    }
}

function readAndParseEvents(eventsLogPath, cutoffTime, taskNameFilter) {
    const eventsData = fs.readFileSync(eventsLogPath, 'utf8');
    return eventsData.trim().split('\n')
        .filter(line => line.trim())
        .map(line => {
            try {
                return JSON.parse(line);
            } catch (e) {
                return null;
            }
        })
        .filter(event => {
            if (!event) return false;
            
            const eventTime = new Date(event.timestamp);
            if (eventTime < cutoffTime) return false;
            
            if (taskNameFilter && event.taskName !== taskNameFilter) return false;
            
            return true;
        });
}

function predictFailures(events, horizon) {
    const taskFailureHistory = {};
    const taskSessions = {};

    // Build failure history for each task
    events.forEach(event => {
        const taskKey = `${event.taskName}_${event.target}`;
        
        if (!taskFailureHistory[taskKey]) {
            taskFailureHistory[taskKey] = {
                taskName: event.taskName,
                target: event.target,
                executions: [],
                failures: [],
                recentPattern: []
            };
        }

        const history = taskFailureHistory[taskKey];

        if (event.eventType === 'TASK_START') {
            taskSessions[taskKey] = {
                startTime: new Date(event.timestamp),
                event
            };
        } else if (event.eventType === 'TASK_END' || event.eventType === 'TASK_ERROR') {
            if (taskSessions[taskKey]) {
                const session = taskSessions[taskKey];
                const success = event.eventType === 'TASK_END';
                
                history.executions.push({
                    timestamp: event.timestamp,
                    success,
                    duration: new Date(event.timestamp) - session.startTime
                });

                if (!success) {
                    history.failures.push({
                        timestamp: event.timestamp,
                        error: event.message,
                        metadata: event.metadata
                    });
                }

                // Keep recent pattern (last 10 executions)
                history.recentPattern.push(success ? 1 : 0);
                if (history.recentPattern.length > 10) {
                    history.recentPattern.shift();
                }

                delete taskSessions[taskKey];
            }
        }
    });

    // Generate failure predictions
    const predictions = Object.values(taskFailureHistory).map(history => {
        if (history.executions.length < 5) {
            return {
                taskName: history.taskName,
                target: history.target,
                failureProbability: 0,
                confidence: 'low',
                reasoning: 'Insufficient execution history'
            };
        }

        // Calculate recent failure rate
        const recentFailureRate = history.recentPattern.length > 0 
            ? (history.recentPattern.filter(x => x === 0).length / history.recentPattern.length)
            : 0;

        // Calculate overall failure rate
        const overallFailureRate = history.failures.length / history.executions.length;

        // Weight recent pattern more heavily
        const weightedFailureRate = (recentFailureRate * 0.7) + (overallFailureRate * 0.3);

        // Adjust for time patterns
        const timeAdjustment = calculateTimeBasedFailureAdjustment(history.failures);
        const adjustedProbability = Math.min(1, weightedFailureRate + timeAdjustment);

        let confidence = 'medium';
        if (history.executions.length < 10) confidence = 'low';
        else if (history.executions.length > 50) confidence = 'high';

        return {
            taskName: history.taskName,
            target: history.target,
            failureProbability: Math.round(adjustedProbability * 100),
            confidence,
            reasoning: generateFailureReasoning(history, adjustedProbability),
            recentExecutions: history.executions.length,
            recentFailures: history.failures.length,
            lastFailure: history.failures.length > 0 
                ? history.failures[history.failures.length - 1].timestamp 
                : null
        };
    }).sort((a, b) => b.failureProbability - a.failureProbability);

    const overallConfidence = predictions.length > 0 
        ? (predictions.filter(p => p.confidence === 'high').length > predictions.length / 2 ? 'high' : 'medium')
        : 'low';

    return {
        predictions,
        confidence: overallConfidence,
        model: 'weighted_failure_rate'
    };
}

function predictDurations(events, horizon) {
    const taskDurationHistory = {};
    const taskSessions = {};

    // Build duration history
    events.forEach(event => {
        const taskKey = `${event.taskName}_${event.target}`;
        
        if (!taskDurationHistory[taskKey]) {
            taskDurationHistory[taskKey] = {
                taskName: event.taskName,
                target: event.target,
                durations: [],
                recentDurations: []
            };
        }

        const history = taskDurationHistory[taskKey];

        if (event.eventType === 'TASK_START') {
            taskSessions[taskKey] = {
                startTime: new Date(event.timestamp)
            };
        } else if (event.eventType === 'TASK_END') {
            if (taskSessions[taskKey]) {
                const duration = new Date(event.timestamp) - taskSessions[taskKey].startTime;
                
                history.durations.push({
                    timestamp: event.timestamp,
                    duration
                });

                history.recentDurations.push(duration);
                if (history.recentDurations.length > 20) {
                    history.recentDurations.shift();
                }

                delete taskSessions[taskKey];
            }
        }
    });

    // Generate duration predictions
    const predictions = Object.values(taskDurationHistory).map(history => {
        if (history.durations.length < 3) {
            return {
                taskName: history.taskName,
                target: history.target,
                predictedDuration: null,
                confidence: 'low',
                reasoning: 'Insufficient duration history'
            };
        }

        const recentDurations = history.recentDurations;
        const allDurations = history.durations.map(d => d.duration);

        // Calculate moving average
        const movingAverage = recentDurations.reduce((sum, d) => sum + d, 0) / recentDurations.length;

        // Calculate trend
        const trend = calculateDurationTrend(recentDurations);

        // Predict next duration
        const predictedDuration = Math.round(movingAverage + trend);

        // Calculate confidence based on variance
        const variance = calculateVariance(recentDurations);
        const coefficientOfVariation = movingAverage > 0 ? Math.sqrt(variance) / movingAverage : 1;
        
        let confidence = 'high';
        if (coefficientOfVariation > 0.5) confidence = 'low';
        else if (coefficientOfVariation > 0.2) confidence = 'medium';

        return {
            taskName: history.taskName,
            target: history.target,
            predictedDuration,
            predictedDurationFormatted: formatDuration(predictedDuration),
            confidence,
            reasoning: generateDurationReasoning(history, trend),
            statistics: {
                average: Math.round(movingAverage),
                min: Math.min(...allDurations),
                max: Math.max(...allDurations),
                variance: Math.round(variance)
            }
        };
    }).filter(p => p.predictedDuration !== null);

    const overallConfidence = predictions.length > 0 
        ? (predictions.filter(p => p.confidence === 'high').length > predictions.length / 2 ? 'high' : 'medium')
        : 'low';

    return {
        predictions,
        confidence: overallConfidence,
        model: 'moving_average_with_trend'
    };
}

function predictResourceUsage(events, horizon) {
    const resourceHistory = {
        cpu: [],
        memory: [],
        heap: [],
        disk: []
    };

    // Extract resource metrics from events
    events.forEach(event => {
        if (event.eventType === 'RESOURCE_REPORT' || event.eventType === 'DATABASE_METRICS') {
            const timestamp = new Date(event.timestamp);
            const metadata = event.metadata || {};

            if (metadata.cpu?.cpuUsed) {
                resourceHistory.cpu.push({
                    timestamp,
                    value: parseFloat(metadata.cpu.cpuUsed)
                });
            }

            if (metadata.memory?.percentUsed) {
                resourceHistory.memory.push({
                    timestamp,
                    value: parseFloat(metadata.memory.percentUsed)
                });
            }

            if (metadata.database?.heapUtilization) {
                resourceHistory.heap.push({
                    timestamp,
                    value: parseFloat(metadata.database.heapUtilization)
                });
            }

            if (metadata.disk?.percentUsed) {
                resourceHistory.disk.push({
                    timestamp,
                    value: parseFloat(metadata.disk.percentUsed)
                });
            }
        }
    });

    // Generate predictions for each resource type
    const predictions = {};
    let overallConfidence = 'low';
    let hasData = false;

    Object.entries(resourceHistory).forEach(([resource, data]) => {
        if (data.length >= 5) {
            hasData = true;
            const recentValues = data.slice(-10).map(d => d.value);
            const trend = calculateResourceTrend(recentValues);
            const average = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
            
            const predictedValue = Math.max(0, Math.min(100, average + trend * horizon));
            
            // Determine if resource will hit critical thresholds
            const criticalThreshold = resource === 'cpu' ? 90 : (resource === 'memory' ? 95 : 90);
            const warningThreshold = resource === 'cpu' ? 80 : (resource === 'memory' ? 85 : 80);
            
            let alertLevel = 'normal';
            if (predictedValue >= criticalThreshold) alertLevel = 'critical';
            else if (predictedValue >= warningThreshold) alertLevel = 'warning';

            predictions[resource] = {
                current: recentValues[recentValues.length - 1],
                predicted: Math.round(predictedValue * 100) / 100,
                trend: trend > 0.1 ? 'increasing' : (trend < -0.1 ? 'decreasing' : 'stable'),
                alertLevel,
                confidence: data.length > 20 ? 'high' : 'medium',
                hoursToThreshold: calculateHoursToThreshold(average, trend, criticalThreshold)
            };
        }
    });

    if (hasData) {
        const confidenceLevels = Object.values(predictions).map(p => p.confidence);
        overallConfidence = confidenceLevels.filter(c => c === 'high').length > confidenceLevels.length / 2 ? 'high' : 'medium';
    }

    return {
        predictions,
        confidence: overallConfidence,
        model: 'linear_trend_extrapolation'
    };
}

// Helper functions
function calculateTimeBasedFailureAdjustment(failures) {
    if (failures.length < 2) return 0;
    
    // Check if failures are clustering in time
    const recentFailures = failures.filter(f => 
        new Date() - new Date(f.timestamp) < 24 * 60 * 60 * 1000
    );
    
    return recentFailures.length > 1 ? 0.1 : 0;
}

function generateFailureReasoning(history, probability) {
    if (probability > 0.7) return 'High recent failure rate indicates elevated risk';
    if (probability > 0.3) return 'Moderate failure rate based on historical patterns';
    if (probability > 0.1) return 'Low but non-zero failure probability';
    return 'Very low failure probability based on stable execution history';
}

function calculateDurationTrend(durations) {
    if (durations.length < 3) return 0;
    
    const x = durations.map((_, i) => i);
    const y = durations;
    const n = durations.length;
    
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);
    
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) || 0;
}

function generateDurationReasoning(history, trend) {
    if (Math.abs(trend) < 1000) return 'Duration is stable with minimal trend';
    if (trend > 0) return 'Duration is increasing, tasks may be getting slower';
    return 'Duration is decreasing, tasks are getting faster';
}

function calculateVariance(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
}

function calculateResourceTrend(values) {
    if (values.length < 3) return 0;
    
    const x = values.map((_, i) => i);
    const y = values;
    const n = values.length;
    
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);
    
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) || 0;
}

function calculateHoursToThreshold(current, trend, threshold) {
    if (trend <= 0 || current >= threshold) return null;
    return Math.round((threshold - current) / trend);
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

module.exports = { handleTaskPredictions };
