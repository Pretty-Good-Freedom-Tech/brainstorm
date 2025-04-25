// This file contains the cypher queries for the Grapevine Interactions API

module.exports = {
    cypherQueries: [
        {
            interactionType: 'follows',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[f:FOLLOWS]->(u:NostrUser)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'verifiedFollows',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[f:FOLLOWS]->(u:NostrUser)
                WHERE u.influence > 0.05
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'followers',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[f:FOLLOWS]->(observee)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'mutes',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[m:MUTES]->(u:NostrUser)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'muters',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[m:MUTES]->(observee)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'reports',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[r:REPORTS]->(u:NostrUser)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'reporters',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:REPORTS]->(observee)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'frens',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:FOLLOWS]->(observee)
                WHERE (observee)-[:FOLLOWS]->(u)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'groupies',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:FOLLOWS]->(observee)
                WHERE NOT (observee)-[:FOLLOWS]->(u)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'idols',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:FOLLOWS]->(observee)
                WHERE NOT (observee)-[:FOLLOWS]->(u)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'mutualFollows',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observer)-[r:FOLLOWS]->(u:NostrUser)
                WHERE (observee)-[:FOLLOWS]->(u)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'mutualFollowers',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:FOLLOWS]->(observee)
                WHERE (u)-[:FOLLOWS]->(observer)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'mutualFrens',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observer)-[r:FOLLOWS]->(u:NostrUser)
                WHERE (u)-[:FOLLOWS]->(observer)
                AND (observee)-[:FOLLOWS]->(u)
                AND (u)-[:FOLLOWS]->(observee)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        }
    ]
};