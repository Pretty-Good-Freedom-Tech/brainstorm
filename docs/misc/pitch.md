Brainstorm Pitch
#####

Brainstorm is a personalized database that stores and organizes information as a knowledge graph. It is designed to interface with other similarly structured databases to curate information in a communal fashion. Much of the structure of the knowledge graph is dictated by this goal.

A central component of Brainstorm is the Grapevine: a tool to enable you and your community to identify who is the most trustworthy to curate your content, facts, and information in any given context.

Brainstorm is built using the nostr protocol.

## Core Components

The database is built using Neo4j, an open-source graph database with a mature ecosystem including the cypher query language. It is paired with strfry, a nostr relay that enables efficient communication with other Brainstorm instances. Strfry uses a fork of LMDB for fast and reliable storage.
