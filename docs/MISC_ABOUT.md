Most of the below was written by AI (Claude) for the README.md file. I plan to go through it at some point and keep some, discard some.

### URL Structure

Hasenpfeffr uses the following URL structure:

- **Main Landing Page**: `https://your-domain/control/index.html` - Provides links to all components and shows authentication status
- **Control Panel**: `https://your-domain/control/control-panel.html` - Main control panel for managing Hasenpfeffr
- **NIP-85 Control Panel**: `https://your-domain/control/nip85-control-panel.html` - Specialized control panel for NIP-85 settings
- **Strfry Relay**: `https://your-domain` - The Strfry Nostr relay endpoint
- **Sign-in Page**: `https://your-domain/control/sign-in.html` - Authentication page for administrative actions

### Authentication

Hasenpfeffr's control panel is designed to be accessible in read-only mode without requiring sign-in. Only administrative actions require authentication with the owner's Nostr key. The authentication system uses the `HASENPFEFFR_OWNER_PUBKEY` from the server configuration file to verify the user's identity.

### Strfry Nostr Relay

The Strfry Nostr relay will be available at `https://your-domain/`.

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

## Configuration

Hasenpfeffr can be configured using environment variables or a configuration file at `/etc/hasenpfeffr.conf`.

### Session Security

For production environments, it's important to set a secure `SESSION_SECRET` to ensure user sessions remain valid across server restarts and to enhance security. You can set this in your configuration file:

```bash
# In /etc/hasenpfeffr.conf
export SESSION_SECRET="your-secure-random-string-here"
```

Or as an environment variable:

```bash
export SESSION_SECRET="your-secure-random-string-here"
```

A strong session secret should be at least 32 characters long and include a mix of letters, numbers, and special characters. You can generate a secure random string using:

```bash
openssl rand -base64 32
```

If not specified, a default secret will be used, but this is not recommended for production environments.

### Other Configuration Options

## Performance

The system is optimized for publishing large volumes of events (100,000+) with features such as:

- Connection pooling
- Memory management with garbage collection
- Streaming file processing
- Batch processing with configurable parameters
- Retry mechanisms for failed publications
- Detailed monitoring and logging
