// This file contains the cypher queries for the Grapevine Interactions API

module.exports = {
    cypherQueries: [
        {
            interactionType: 'follows',
            title: 'Follows',
            description: `All profiles followed by {{observee}}.`,
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[f:FOLLOWS]->(u:NostrUser)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'verifiedFollows',
            title: 'Verified Follows',
            description: `All verified profiles followed by {{observee}}.`,
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[f:FOLLOWS]->(u:NostrUser)
                WHERE u.influence > 0.05
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'followers',
            title: 'Followers',
            description: `All profiles following {{observee}}.`,
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[f:FOLLOWS]->(observee)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'verifiedFollowers',
            title: 'Verified Followers',
            description: `All verified profiles following {{observee}}.`,
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[f:FOLLOWS]->(observee)
                WHERE u.influence > 0.05
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'mutes',
            title: 'Mutes',
            description: 'lorem ipsum',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[m:MUTES]->(u:NostrUser)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'muters',
            title: 'Muters',
            description: 'lorem ipsum',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[m:MUTES]->(observee)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'reports',
            title: 'Reports',
            description: 'lorem ipsum',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[r:REPORTS]->(u:NostrUser)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'reporters',
            title: 'Reporters',
            description: 'lorem ipsum',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:REPORTS]->(observee)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'frens',
            title: 'Frens',
            description: 'lorem ipsum',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:FOLLOWS]->(observee)
                WHERE (observee)-[:FOLLOWS]->(u)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'groupies',
            title: 'Groupies',
            description: 'lorem ipsum',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:FOLLOWS]->(observee)
                WHERE NOT (observee)-[:FOLLOWS]->(u)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'idols',
            title: 'Idols',
            description: 'lorem ipsum',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:FOLLOWS]->(observee)
                WHERE NOT (observee)-[:FOLLOWS]->(u)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'mutualFollows',
            title: 'Mutual Follows',
            description: 'lorem ipsum',
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
            title: 'Mutual Followers',
            description: 'lorem ipsum',
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
            title: 'Mutual Frens',
            description: 'lorem ipsum',
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