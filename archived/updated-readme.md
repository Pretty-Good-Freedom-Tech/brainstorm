# Hasenpfeffr

Hasenpfeffr is a Nostr identity data publication system implementing the NIP-85 Trusted Assertions protocol. It allows you to generate and publish network metrics for Nostr users as kind 30382 events.

## Features

- Generate personalized PageRank scores for Nostr users
- Calculate network hops (degrees of separation)
- Publish trusted assertions as NIP-85 kind 30382 events
- Web-based control panel for easy management
- Optimized for large-scale data processing (100,000+ events)
- Performance monitoring and logging

## Installation

### From GitHub

```bash
# Clone the repository
git clone https://github.com/Prett-Good-Freedom-Tech/hasenpfeffr.git
cd hasenpfeffr

# Install dependencies
npm install
```

### As a Global Package

```bash
npm install -g hasenpfeffr
```

## Configuration

Create a configuration file at `/etc/hasenpfeffr.conf` with the following content:

```bash
# Relay configuration
export HASENPFEFFR_RELAY_URL="wss://your-relay-url.com"
export HASENPFEFFR_RELAY_PUBKEY="your-relay-pubkey"
export HASENPFEFFR_RELAY_NSEC="your-relay-private-key"
```

Alternatively, you can create a `.env` file in your project directory:

```
HASENPFEFFR_RELAY_URL=wss://your-relay-url.com
HASENPFEFFR_RELAY_PUBKEY=your-relay-pubkey
HASENPFEFFR_RELAY_NSEC=your-relay-private-key
```

## Usage

### Control Panel

```bash
# Start the control panel
hasenpfeffr-control-panel

# Using npm scripts
npm run control-panel
```

The control panel will be available at http://localhost:7778 by default.

You can also set up the control panel as a systemd service:

```bash
# Copy the service file
sudo cp /usr/local/lib/node_modules/hasenpfeffr/systemd/hasenpfeffr-control-panel.service /etc/systemd/system/

# Enable and start the service
sudo systemctl enable hasenpfeffr-control-panel.service
sudo systemctl start hasenpfeffr-control-panel.service
```

### Generating NIP-85 Data

```bash
# Using the CLI
hasenpfeffr-generate

# Using npm scripts
npm run generate
```

### Publishing NIP-85 Events

```bash
# Using the CLI
hasenpfeffr-publish

# Using npm scripts
npm run publish
```

## Architecture

Hasenpfeffr consists of several components:

1. **Data Generation**: Calculates personalized PageRank scores and network hops
2. **Event Creation**: Creates NIP-85 kind 30382 events with appropriate tags
3. **Publication**: Publishes events to Nostr relays with optimized connection handling
4. **Control Panel**: Web interface for managing the system

## Performance

The system is optimized for publishing large volumes of events (100,000+) with features such as:

- Connection pooling
- Memory management with garbage collection
- Streaming file processing
- Batch processing with configurable parameters
- Retry mechanisms for failed publications
- Detailed monitoring and logging

## License

GNU Affero General Public License v3.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
