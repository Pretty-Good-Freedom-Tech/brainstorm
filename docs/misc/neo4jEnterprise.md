Advantages of Neo4j Enterprise Edition over Community Edition:
- support for multiple databases
- allow: CALL db.checkpoint() to force pruning of transaction logs (currently I do this by restarting neo4j)
