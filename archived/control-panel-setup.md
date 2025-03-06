# Hasenpfeffr Control Panel Setup

## Current Configuration

The Hasenpfeffr Control Panel is currently running as a standalone service in `/var/www/hasenpfeffr/`. This is separate from the main Hasenpfeffr package installed in `/home/ubuntu/hasenpfeffr/`.

### Control Panel Components

1. **API Server**: `/var/www/hasenpfeffr/api.js`
   - Running as systemd service: `hasenpfeffr-api.service`
   - Listening on port: 7778
   - Provides endpoints for database initialization, status checking, and NIP-85 operations

2. **HTML Interface**: `/var/www/hasenpfeffr/control-panel.html`
   - Served by the API server
   - Provides a user-friendly interface for managing Hasenpfeffr operations

3. **Nginx Configuration**:
   - Proxies requests from `/control/` to the API server
   - SSL termination and security handled by Nginx

### Access

The control panel is accessible at: https://relay4.hasenpfeffr.com/control/

## Maintenance Notes

### Starting/Stopping the Control Panel

```bash
# Start the control panel
sudo systemctl start hasenpfeffr-api.service

# Stop the control panel
sudo systemctl stop hasenpfeffr-api.service

# Check status
sudo systemctl status hasenpfeffr-api.service
```

### Logs

View logs for the control panel:

```bash
sudo journalctl -u hasenpfeffr-api.service
```

### Configuration Files

- Service definition: `/etc/systemd/system/hasenpfeffr-api.service`
- Nginx configuration: `/etc/nginx/sites-available/default`

## Troubleshooting

### API Endpoint Issues

If you encounter errors like `Error checking status: Unexpected token '<', "<html> <he"... is not valid JSON`, it's likely due to incorrect API endpoint paths in the frontend JavaScript.

The control panel HTML should use `/control/api/` paths (not just `/api/`) to ensure requests are properly routed through Nginx:

```javascript
// Correct API endpoint paths
fetch('/control/api/status')
fetch('/control/api/init-db')
fetch('/control/api/generate')
fetch('/control/api/publish')
```

This ensures that requests are properly routed through the Nginx proxy to the backend API server.

## Future Considerations

We have also integrated the control panel into the main Hasenpfeffr package in `/home/ubuntu/hasenpfeffr/`, but it is currently disabled to avoid port conflicts with the standalone service. If you want to switch to using the integrated control panel:

1. Stop the standalone service: `sudo systemctl stop hasenpfeffr-api.service`
2. Disable the standalone service: `sudo systemctl disable hasenpfeffr-api.service`
3. Enable the integrated service: `sudo systemctl enable hasenpfeffr-control-panel.service`
4. Start the integrated service: `sudo systemctl start hasenpfeffr-control-panel.service`

The integrated control panel has the same functionality but is part of the main Hasenpfeffr package, making it easier to maintain and update.
