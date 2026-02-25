Decentralized Curation of Simple Lists
=====

## Method #1: NIP-32 Labeling
Use kind 1985 events as defined by NIP-32: Labeling to assign membership to a list.

```json
{
    "kind": 1985,
    "tags": [
        ["p", "pubkey"],
        ["l", "list_id"],
        ["L", "world.brainstorm.ontology"],
        ["r", "wss://lists.brainstorm.world"]
    ]
}
```

## Method #2: Custom NIP to publish a new list (as already implemented previously)

kinds 39901, 39902

