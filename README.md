# Hasenpfeffr

Hasenpfeffr is a Nostr identity data publication system implementing the NIP-85 Trusted Assertions protocol. It allows you to generate and publish network metrics for Nostr users as kind 30382 events.

## Features

- Generate personalized PageRank scores for Nostr users
- Calculate network hops (degrees of separation)
- Publish trusted assertions as NIP-85 kind 30382 events
- Web-based control panel for easy management
- Optimized for large-scale data processing (100,000+ events)
- Performance monitoring and logging
- Integrated Strfry Nostr relay (optional)

## Installation

### From GitHub

```bash
# Clone the repository
git clone https://github.com/Prett-Good-Freedom-Tech/hasenpfeffr.git
cd hasenpfeffr

# Install dependencies
npm install

# Run the installation script (requires sudo)
sudo npm run install-hasenpfeffr
```

### As a Global Package

```bash
# Install globally
npm install -g hasenpfeffr

# Run the installation script (requires sudo)
sudo hasenpfeffr-install
```

The installation script will:
1. Create a configuration file at `/etc/hasenpfeffr.conf`
2. Install and configure Neo4j Community Edition
3. Install Neo4j Graph Data Science plugin
4. Install Neo4j APOC plugin
5. Set up Neo4j constraints and indices
6. Optionally install and configure Strfry Nostr relay
7. Configure the Hasenpfeffr Control Panel service

## Configuration

The installation script will create a configuration file at `/etc/hasenpfeffr.conf` with the following content:

```bash
# Relay configuration
export HASENPFEFFR_RELAY_URL="wss://your-relay-url.com"
export HASENPFEFFR_RELAY_PUBKEY="your-relay-pubkey"
export HASENPFEFFR_RELAY_NSEC="your-relay-private-key"

# Neo4j configuration
export NEO4J_PASSWORD="your-neo4j-password"

# Strfry configuration
export STRFRY_DOMAIN="your-relay-domain.com"

# Reference pubkey for PageRank calculations
export GRAPEVINE_REFERENCE_PUBKEY="your-reference-pubkey"
```

You can also manually create this file or use a `.env` file in your project directory with the same variables.

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

### Nginx Configuration

If you installed Strfry during the setup process, Nginx has already been configured to serve both the Strfry relay and the Hasenpfeffr control panel. The control panel is available at `https://your-domain/control/`.

If you did not install Strfry and are running the control panel behind Nginx, add the following configuration to your Nginx server block:

```nginx
# Hasenpfeffr Control Panel
location /control/ {
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $host;
    proxy_pass http://127.0.0.1:7778/;
    proxy_http_version 1.1;
}
```

This configuration ensures that requests to `/control/` are properly routed to the control panel, and that API requests to `/control/api/` work correctly.

### Strfry Nostr Relay

If you chose to install Strfry during the setup process, it will be configured as a systemd service and started automatically. The relay will be available at `https://your-domain/`.

To check the status of the Strfry service:

```bash
sudo systemctl status strfry
```

To view logs:

```bash
sudo journalctl -u strfry
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
4. **Strfry Relay**: Optional integrated Nostr relay for publishing and consuming events

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
