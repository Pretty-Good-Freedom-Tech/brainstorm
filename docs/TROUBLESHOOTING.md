# Additional Troubleshooting

## Cannot log in to neo4j browser via web UI

If login fails at the neo4j web ui (http://<your-url>:7474), try using `neo4j` as both the username and password.  
If that doesn't work, try this:

- Edit (probably with sudo) `/etc/neo4j/neo4j.conf`
  - Find the commented out line `# dmbs.security.auth_enabled=false`
  - Uncomment it. Leave it `false`
- `sudo systemctl daemon-reload`
- `sudo systemctl restart neo4j`
` sudo cypher-shell -u neo4j`
  - At this shell, enter: `ALTER USER neo4j SET PASSWORD 'mynewpasswordhere';`
  - Then: `:exit` (note the colon)
- Back in `/etc/neo4j/neo4j.conf`...
  - `# dmbs.security.auth_enabled=false` comment this back out.
- `sudo systemctl restart neo4j`
- Try to login again
