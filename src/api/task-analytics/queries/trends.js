const fs = require('fs');
const path = require('path');

/**
 * Task Trends Handler
 * Provides trend analysis and time-series data for task performance
 */
async function handleTaskTrends(req, res) {
    try {
        const timeRange = req.query.timeRange || '24h';
        const granularity = req.query.granularity || 'hour'; // minute, hour, day
        const metric = req.query.metric || 'duration'; // duration, success_rate, frequency

        const eventsLogPath = path.join(process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm', 'taskQueue', 'events.jsonl');
        
        if (!fs.existsSync(eventsLogPath)) {
            return res.json({
                timestamp: new Date().toISOString(),
                status: 'success',
                data: {
                    trends: [],
                    summary: {},
                    predictions: {}
                },
                metadata: {
                    dataSource: 'events.jsonl',
                    lastUpdated: new Date().toISOString(),
                    recordCount: 0,
                    filters: { timeRange, granularity, metric }
                }
            });
        }

        const timeRangeMs = parseTimeRange(timeRange);
        const cutoffTime = new Date(Date.now() - timeRangeMs);
        const events = readAndParseEvents(eventsLogPath, cutoffTime);

        // Generate time series data
        const timeSeries = generateTimeSeries(events, granularity, metric, cutoffTime);
        const trendAnalysis = analyzeTrends(timeSeries);
        const predictions = generateSimplePredictions(timeSeries);

        const responseData = {
            trends: timeSeries,
            summary: trendAnalysis,
            predictions,
            timeRange,
            granularity,
            metric
        };

        res.json({
            timestamp: new Date().toISOString(),
            status: 'success',
            data: responseData,
            metadata: {
                dataSource: 'events.jsonl',
                lastUpdated: new Date().toISOString(),
                recordCount: events.length,
                filters: { timeRange, granularity, metric }
            }
        });

    } catch (error) {
        console.error('Error in handleTaskTrends:', error);
        res.status(500).json({
            timestamp: new Date().toISOString(),
            status: 'error',
            error: 'Failed to get task trends',
            message: error.message
        });
    }
}

function parseTimeRange(timeRange) {
    const ranges = {
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
    };
    return ranges[timeRange] || ranges['24h'];
}

function readAndParseEvents(eventsLogPath, cutoffTime) {
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
            return eventTime >= cutoffTime;
        });
}

function generateTimeSeries(events, granularity, metric, startTime) {
    const buckets = createTimeBuckets(startTime, granularity);
    const taskSessions = {};

    // Process events to build task execution sessions
    events.forEach(event => {
        const taskKey = `${event.taskName}_${event.target}`;
        const eventTime = new Date(event.timestamp);

        if (event.eventType === 'TASK_START') {
            taskSessions[taskKey] = {
                startTime: eventTime,
                taskName: event.taskName,
                target: event.target
            };
        } else if (event.eventType === 'TASK_END' || event.eventType === 'TASK_ERROR') {
            if (taskSessions[taskKey]) {
                const session = taskSessions[taskKey];
                const duration = eventTime - session.startTime;
                const success = event.eventType === 'TASK_END';

                // Find the appropriate time bucket
                const bucketKey = getBucketKey(session.startTime, granularity);
                if (buckets[bucketKey]) {
                    buckets[bucketKey].executions.push({
                        taskName: session.taskName,
                        duration,
                        success,
                        startTime: session.startTime,
                        endTime: eventTime
                    });
                }

                delete taskSessions[taskKey];
            }
        }
    });

    // Calculate metrics for each time bucket
    const timeSeries = Object.entries(buckets).map(([bucketKey, bucket]) => {
        const executions = bucket.executions;
        let value = 0;

        switch (metric) {
            case 'duration':
                if (executions.length > 0) {
                    value = Math.round(executions.reduce((sum, exec) => sum + exec.duration, 0) / executions.length);
                }
                break;
            case 'success_rate':
                if (executions.length > 0) {
                    const successCount = executions.filter(exec => exec.success).length;
                    value = Math.round((successCount / executions.length) * 100);
                } else {
                    value = 100; // No executions = 100% success rate
                }
                break;
            case 'frequency':
                value = executions.length;
                break;
        }

        return {
            timestamp: bucket.timestamp,
            value,
            executions: executions.length,
            details: {
                successful: executions.filter(exec => exec.success).length,
                failed: executions.filter(exec => !exec.success).length,
                tasks: [...new Set(executions.map(exec => exec.taskName))]
            }
        };
    }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return timeSeries;
}

function createTimeBuckets(startTime, granularity) {
    const buckets = {};
    const now = new Date();
    let current = new Date(startTime);

    const incrementMap = {
        'minute': 60 * 1000,
        'hour': 60 * 60 * 1000,
        'day': 24 * 60 * 60 * 1000
    };

    const increment = incrementMap[granularity] || incrementMap['hour'];

    while (current <= now) {
        const bucketKey = getBucketKey(current, granularity);
        buckets[bucketKey] = {
            timestamp: current.toISOString(),
            executions: []
        };
        current = new Date(current.getTime() + increment);
    }

    return buckets;
}

function getBucketKey(date, granularity) {
    switch (granularity) {
        case 'minute':
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        case 'hour':
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}`;
        case 'day':
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        default:
            return date.toISOString();
    }
}

function analyzeTrends(timeSeries) {
    if (timeSeries.length < 2) {
        return {
            trend: 'insufficient_data',
            changePercent: 0,
            volatility: 0,
            peaks: [],
            valleys: []
        };
    }

    const values = timeSeries.map(point => point.value);
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    
    // Calculate trend
    let trend = 'stable';
    let changePercent = 0;
    
    if (firstValue > 0) {
        changePercent = Math.round(((lastValue - firstValue) / firstValue) * 100);
        if (changePercent > 10) trend = 'increasing';
        else if (changePercent < -10) trend = 'decreasing';
    }

    // Calculate volatility (coefficient of variation)
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const volatility = mean > 0 ? Math.round((Math.sqrt(variance) / mean) * 100) : 0;

    // Find peaks and valleys
    const peaks = [];
    const valleys = [];
    
    for (let i = 1; i < values.length - 1; i++) {
        if (values[i] > values[i - 1] && values[i] > values[i + 1]) {
            peaks.push({
                timestamp: timeSeries[i].timestamp,
                value: values[i],
                index: i
            });
        } else if (values[i] < values[i - 1] && values[i] < values[i + 1]) {
            valleys.push({
                timestamp: timeSeries[i].timestamp,
                value: values[i],
                index: i
            });
        }
    }

    return {
        trend,
        changePercent,
        volatility,
        peaks: peaks.slice(-5), // Last 5 peaks
        valleys: valleys.slice(-5), // Last 5 valleys
        statistics: {
            min: Math.min(...values),
            max: Math.max(...values),
            average: Math.round(mean * 100) / 100,
            median: calculateMedian(values)
        }
    };
}

function generateSimplePredictions(timeSeries) {
    if (timeSeries.length < 3) {
        return {
            nextValue: null,
            confidence: 'low',
            method: 'insufficient_data'
        };
    }

    // Simple moving average prediction
    const recentValues = timeSeries.slice(-5).map(point => point.value);
    const movingAverage = Math.round(recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length);

    // Linear trend prediction
    const x = timeSeries.map((_, index) => index);
    const y = timeSeries.map(point => point.value);
    const { slope, intercept } = calculateLinearRegression(x, y);
    const trendPrediction = Math.round(slope * timeSeries.length + intercept);

    // Weighted prediction (70% moving average, 30% trend)
    const weightedPrediction = Math.round(movingAverage * 0.7 + trendPrediction * 0.3);

    // Determine confidence based on volatility
    const values = timeSeries.map(point => point.value);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const coefficientOfVariation = mean > 0 ? Math.sqrt(variance) / mean : 1;

    let confidence = 'high';
    if (coefficientOfVariation > 0.5) confidence = 'low';
    else if (coefficientOfVariation > 0.2) confidence = 'medium';

    return {
        nextValue: weightedPrediction,
        confidence,
        method: 'weighted_average_trend',
        components: {
            movingAverage,
            trendPrediction,
            slope: Math.round(slope * 1000) / 1000
        }
    };
}

function calculateMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
        ? Math.round((sorted[mid - 1] + sorted[mid]) / 2 * 100) / 100
        : sorted[mid];
}

function calculateLinearRegression(x, y) {
    const n = x.length;
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
}

module.exports = { handleTaskTrends };
