// This file contains the cypher queries for the Grapevine Interactions API

module.exports = {
    cypherQueries: [
        {
            interactionType: 'follows',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[f:FOLLOWS]->(u:NostrUser)
                RETURN u, count(u) as NumFollows
            `
        },
        {
            interactionType: 'verifiedFollows',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[f:FOLLOWS]->(u:NostrUser)
                WHERE u.influence > 0.05
                RETURN u, count(u) as NumVerifiedFollows
            `
        },
        {
            interactionType: 'followers',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[f:FOLLOWS]->(observee)
                RETURN u, count(u) as NumFollowers
            `
        },
        {
            interactionType: 'mutes',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[m:MUTES]->(u:NostrUser)
                RETURN u, count(u) as NumMutes
            `
        },
        {
            interactionType: 'muters',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[m:MUTES]->(observee)
                RETURN u, count(u) as NumMuters
            `
        },
        {
            interactionType: 'reports',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[r:REPORTS]->(u:NostrUser)
                RETURN u, count(u) as NumReports
            `
        },
        {
            interactionType: 'reporters',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:REPORTS]->(observee)
                RETURN u, r
            `
        },
        {
            interactionType: 'frens',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:FOLLOWS]->(observee)
                WHERE (observee)-[:FOLLOWS]->(u)
                RETURN u, count(u) as NumFrens
            `
        },
        {
            interactionType: 'groupies',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:FOLLOWS]->(observee)
                WHERE NOT (observee)-[:FOLLOWS]->(u)
                RETURN u, count(u) as NumGroupies
            `
        },
        {
            interactionType: 'idols',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:FOLLOWS]->(observee)
                WHERE NOT (observee)-[:FOLLOWS]->(u)
                RETURN u, count(u) as NumIdols
            `
        },
        {
            interactionType: 'mutualFollows',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observer)-[r:FOLLOWS]->(u:NostrUser)
                WHERE (observee)-[:FOLLOWS]->(u)
                RETURN u, count(u) as NumMutualFollows
            `
        },
        {
            interactionType: 'mutualFollowers',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:FOLLOWS]->(observee)
                WHERE (u)-[:FOLLOWS]->(observer)
                RETURN u, count(u) as NumMutualFollowers
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
                RETURN u, count(u) as NumMutualFrens
            `
        }
    ]
};