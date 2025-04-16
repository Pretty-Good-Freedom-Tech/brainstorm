# Nostr ETL Pipeline

This directory contains the ETL (Extract, Transform, Load) pipeline for processing Nostr events from a local strfry relay and loading them into Neo4j. The pipeline tracks three types of relationships between NostrUser nodes:

1. **FOLLOWS** relationships from kind 3 events
2. **MUTES** relationships from kind 10000 events
3. **REPORTS** relationships from kind 1984 events

All relationships include a `timestamp` property equal to the `created_at` value from the corresponding event.

## Pipeline Components

The ETL pipeline consists of three main components:

### 1. Stream Processing

Located in the `stream/` directory, this component handles real-time updates as new events are received.

- **addToQueue.mjs**: Subscribes to kind 3, 10000, and 1984 events from the strfry relay and adds them to the processing queue.
- **processQueue.sh**: Continuously monitors the queue and processes events as they arrive.
- **updateNostrRelationships.sh**: Processes a single event from the queue, updating the corresponding relationships in Neo4j.

### 2. Batch Processing

Located in the `batch/` directory, this component processes historical data in batch.

- **processNostrEvents.sh**: Main script that orchestrates the batch processing of all event kinds.
- **eventsToRelationships.js**: Processes events of a specific kind and extracts relationships to be added to Neo4j.
- **kind3EventsToFollows.js**: Legacy script for processing kind 3 events (maintained for backward compatibility).

### 3. Reconciliation

Located in the `reconcile/` directory, this component ensures consistency between strfry and Neo4j.

- **createReconciliationQueue.js**: Compares event IDs in Neo4j with the latest events in strfry to identify pubkeys that need updating.
- **processReconciliationQueue.js**: Processes the reconciliation queue, updating relationships in Neo4j based on the latest events in strfry.

## Configuration

All components read configuration from `/etc/brainstorm.conf`, which should contain:

```bash
# Neo4j connection details
NEO4J_URI="bolt://localhost:7687"
NEO4J_USER="neo4j"
NEO4J_PASSWORD="your_password"

# Relay URL
BRAINSTORM_RELAY_URL="wss://your-relay-url"
```

## Directory Structure

```
pipeline/
├── batch/                  # Batch processing components
│   ├── eventsToRelationships.js
│   ├── kind3EventsToFollows.js
│   ├── processNostrEvents.sh
│   └── ...
├── reconcile/              # Reconciliation components
│   ├── createReconciliationQueue.js
│   ├── processReconciliationQueue.js
│   └── ...
├── stream/                 # Stream processing components
│   ├── addToQueue.mjs
│   ├── processQueue.sh
│   ├── updateNostrRelationships.sh
│   └── ...
└── README.md               # This file
```

## Usage

### Stream Processing

1. Start the queue listener:
   ```bash
   node /usr/local/lib/node_modules/brainstorm/src/pipeline/stream/addToQueue.mjs
   ```

2. Start the queue processor:
   ```bash
   /usr/local/lib/node_modules/brainstorm/src/pipeline/stream/processQueue.sh
   ```

### Batch Processing

Run the batch processor to process all event kinds:
```bash
/usr/local/lib/node_modules/brainstorm/src/pipeline/batch/processNostrEvents.sh
```

### Reconciliation

1. Create the reconciliation queue:
   ```bash
   node /usr/local/lib/node_modules/brainstorm/src/pipeline/reconcile/createReconciliationQueue.js
   ```

2. Process the reconciliation queue:
   ```bash
   node /usr/local/lib/node_modules/brainstorm/src/pipeline/reconcile/processReconciliationQueue.js
   ```

## Relationship Properties

All relationships (FOLLOWS, MUTES, REPORTS) include a `timestamp` property equal to the `created_at` value from the corresponding event. This allows for temporal analysis of relationship changes over time.
