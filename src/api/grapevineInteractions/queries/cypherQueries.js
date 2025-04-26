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
            description: `All verified (influence > 0.05) profiles followed by {{observee}}.`,
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
            description: `All verified (influence > 0.05) profiles following {{observee}}.`,
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
            description: 'All profiles muted by {{observee}}.',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[m:MUTES]->(u:NostrUser)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'muters',
            title: 'Muters',
            description: 'All profiles muting {{observee}}.',
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
            description: 'All profiles reporting {{observee}}.',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:REPORTS]->(observee)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'frens',
            title: 'Frens',
            description: 'All profiles following {{observee}} and followed by {{observee}}.',
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
            description: 'All profiles following {{observee}} but not followed by {{observee}}.',
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
            description: 'All profiles followed by {{observee}} but not following {{observee}}.',
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
            description: 'All profiles followed by both {{observer}} and {{observee}}.',
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
            description: 'All profiles following both {{observer}} and {{observee}}.',
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
            description: 'All profiles following both {{observer}} and {{observee}} and also followed by {{observer}} and {{observee}}.',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observer)-[r:FOLLOWS]->(u:NostrUser)
                WHERE (u)-[:FOLLOWS]->(observer)
                AND (observee)-[:FOLLOWS]->(u)
                AND (u)-[:FOLLOWS]->(observee)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'recommendedToObserver',
            title: 'Recommended to Observer',
            description: 'All profiles recommended to {{observer}} by {{observee}}: Intersection of {{observee}} frens and the groupies of {{observer}}',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[m3:FOLLOWS]->(recommendation:NostrUser)-[m4:FOLLOWS]->(observee)
                WHERE (recommendation)-[:FOLLOWS]->(observer)
                AND NOT (observer)-[:FOLLOWS]->(recommendation)
                RETURN recommendation.pubkey AS pubkey, recommendation.hops AS hops, recommendation.influence AS influence
            `
        },
        {
            interactionType: 'recommendedToObservee',
            title: 'Recommended to Observee',
            description: 'All profiles recommended to {{observee}} by {{observer}}: Intersection of {{observer}} frens and the groupies of {{observee}}',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observer)-[m3:FOLLOWS]->(recommendation:NostrUser)-[m4:FOLLOWS]->(observee)
                WHERE (recommendation)-[:FOLLOWS]->(observee)
                AND NOT (observee)-[:FOLLOWS]->(recommendation)
                RETURN recommendation.pubkey AS pubkey, recommendation.hops AS hops, recommendation.influence AS influence
            `
        },
        {
            interactionType: 'mutualFrens',
            title: 'Mutual Frens',
            description: 'All profiles followed by both {{observer}} and {{observee}}.',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observer)-[r:FOLLOWS]->(u:NostrUser)
                WHERE (observee)-[:FOLLOWS]->(u)
                AND NOT (u)-[:FOLLOWS]->(observer)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'mutualGroupies',
            title: 'Mutual Groupies',
            description: 'All profiles following both {{observer}} and {{observee}}.',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:FOLLOWS]->(observee)
                WHERE (observer)-[:FOLLOWS]->(u)
                AND NOT (u)-[:FOLLOWS]->(observer)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'mutualIdols',
            title: 'Mutual Idols',
            description: 'All profiles followed by both {{observer}} and {{observee}}.',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:FOLLOWS]->(observee)
                WHERE (observee)-[:FOLLOWS]->(u)
                AND NOT (u)-[:FOLLOWS]->(observer)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'mutualFollowerCount',
            title: 'Mutual Followers',
            description: 'All profiles following both {{observer}} and {{observee}}.',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (u:NostrUser)-[r:FOLLOWS]->(observee)
                WHERE (observer)-[:FOLLOWS]->(u)
                AND NOT (u)-[:FOLLOWS]->(observer)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        },
        {
            interactionType: 'mutualFollowCount',
            title: 'Mutual Follows',
            description: 'All profiles followed by both {{observer}} and {{observee}}.',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observer)-[r:FOLLOWS]->(u:NostrUser)
                WHERE (observee)-[:FOLLOWS]->(u)
                AND NOT (u)-[:FOLLOWS]->(observer)
                RETURN u.pubkey AS pubkey, u.hops AS hops, u.influence AS influence
            `
        }
    ]
};