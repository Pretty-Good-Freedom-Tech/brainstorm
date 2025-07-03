Advantages of Neo4j Enterprise Edition over Community Edition:
- support for multiple databases
- allow: CALL db.checkpoint() to force pruning of transaction logs (currently I do this by restarting neo4j)
- online database backup and restore (community edition requires offline backup and restore)
