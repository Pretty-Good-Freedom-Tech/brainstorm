# Hasenpfeffr Troubleshooting Guide

This guide addresses common issues that may arise during the installation and operation of Hasenpfeffr.

## Installation Issues

### 1. Installation Script Hangs

**Symptom:** The installation script appears to hang or freeze, especially after running `systemctl status` commands.

**Solution:** 
- We've updated the scripts to use `systemctl is-active` instead of `systemctl status` to avoid this issue.
- If you're still experiencing hanging, you can press `Ctrl+C` to interrupt the current step and then continue manually.
- Try running the installation with the `script` command: `script -q -c "sudo npm run install-hasenpfeffr" /dev/null`

### 2. SSL Certificate Setup Hangs

**Symptom:** When prompted to set up an SSL certificate, the script hangs after entering 'y'.

**Solution:**
- The latest version includes a timeout for this prompt.
- If you're still experiencing issues, you can skip this step during installation and run it manually later:
  ```bash
  sudo certbot --nginx -d your-domain.com
  ```

### 3. Neo4j Constraints and Indices Error

**Symptom:** Error message: `Unmatched arguments from index 1: 'run', '--user=neo4j', '--password=neo4j', '--database=neo4j'`

**Solution:**
- The latest version uses `cypher-shell` instead of `neo4j-admin dbms run`.
- If you still encounter issues, you can manually set up the constraints and indices:
  1. Access Neo4j Browser at http://your-server-ip:7474
  2. Log in with username "neo4j" and your password
  3. Run the following Cypher commands:
     ```cypher
     CREATE CONSTRAINT IF NOT EXISTS FOR (u:NostrUser) REQUIRE u.pubkey IS UNIQUE;
     CREATE CONSTRAINT IF NOT EXISTS FOR (e:NostrEvent) REQUIRE e.id IS UNIQUE;
     CREATE INDEX IF NOT EXISTS FOR (e:NostrEvent) ON (e.pubkey);
     CREATE INDEX IF NOT EXISTS FOR (e:NostrEvent) ON (e.kind);
     ```

### 4. Neo4j Password Issues

**Symptom:** Unable to connect to Neo4j after changing the password.

**Solution:**
- Make sure to update the password in your Hasenpfeffr configuration:
  ```bash
  sudo nano /etc/hasenpfeffr.conf
  # Update the NEO4J_PASSWORD value
  ```
- Restart the Hasenpfeffr control panel:
  ```bash
  sudo systemctl restart hasenpfeffr-control-panel
  ```

## Runtime Issues

### 1. Strfry Relay Not Working

**Symptom:** Unable to connect to the Strfry relay.

**Solution:**
- Check if the service is running:
  ```bash
  sudo systemctl is-active strfry
  ```
- If it's not running, start it:
  ```bash
  sudo systemctl start strfry
  ```
- Check the logs for errors:
  ```bash
  sudo journalctl -u strfry
  ```
- Verify that your firewall allows incoming connections:
  ```bash
  sudo ufw status
  ```

### 2. Hasenpfeffr Control Panel Not Accessible

**Symptom:** Unable to access the control panel at http://your-server-ip:7778 or https://your-domain/control/

**Solution:**
- Check if the service is running:
  ```bash
  sudo systemctl is-active hasenpfeffr-control-panel
  ```
- If it's not running, start it:
  ```bash
  sudo systemctl start hasenpfeffr-control-panel
  ```
- Check the logs for errors:
  ```bash
  sudo journalctl -u hasenpfeffr-control-panel
  ```
- If the service is failing because it can't find the control panel script, you can reinstall it:
  ```bash
  sudo bash /usr/local/lib/node_modules/hasenpfeffr/setup/install-control-panel.sh
  ```
- If using Nginx, verify your configuration:
  ```bash
  sudo nginx -t
  sudo systemctl restart nginx
  ```

### 3. Neo4j Connection Issues

**Symptom:** The Hasenpfeffr control panel cannot connect to Neo4j.

**Solution:**
- Verify Neo4j is running:
  ```bash
  sudo systemctl is-active neo4j
  ```
- Check if Neo4j is listening on the correct ports:
  ```bash
  sudo netstat -tulpn | grep neo4j
  ```
- Verify the password in `/etc/hasenpfeffr.conf` matches your Neo4j password.
- Restart Neo4j:
  ```bash
  sudo systemctl restart neo4j
  ```

## Updating Hasenpfeffr

If you need to update Hasenpfeffr to the latest version:

```bash
cd /path/to/hasenpfeffr
git pull
npm install
sudo npm run install-hasenpfeffr
```

## Getting Help

If you encounter issues not covered in this guide, please:

1. Check the [GitHub Issues](https://github.com/Pretty-Good-Freedom-Tech/hasenpfeffr/issues) for similar problems
2. Create a new issue with detailed information about your problem
3. Include relevant logs and error messages
