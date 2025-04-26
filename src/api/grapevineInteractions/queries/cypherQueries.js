// This file contains the cypher queries for the Grapevine Interactions API

module.exports = {
    cypherQueries: [
        {
            interactionType: 'follows',
            title: 'Follows',
            description: `All profiles followed by {{observee}}.`,
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[f:FOLLOWS]->(followee:NostrUser)
                RETURN followee.pubkey AS pubkey, followee.hops AS hops, followee.influence AS influence
            `
        },
        {
            interactionType: 'verifiedFollows',
            title: 'Verified Follows',
            description: `All verified (influence > 0.05) profiles followed by {{observee}}.`,
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[f:FOLLOWS]->(followee:NostrUser)
                WHERE followee.influence > 0.05
                RETURN followee.pubkey AS pubkey, followee.hops AS hops, followee.influence AS influence
            `
        },
        {
            interactionType: 'followers',
            title: 'Followers',
            description: `All profiles following {{observee}}.`,
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (follower:NostrUser)-[f:FOLLOWS]->(observee)
                RETURN follower.pubkey AS pubkey, follower.hops AS hops, follower.influence AS influence
            `
        },
        {
            interactionType: 'verifiedFollowers',
            title: 'Verified Followers',
            description: `All verified (influence > 0.05) profiles following {{observee}}.`,
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (follower:NostrUser)-[f:FOLLOWS]->(observee)
                WHERE follower.influence > 0.05
                RETURN follower.pubkey AS pubkey, follower.hops AS hops, follower.influence AS influence
            `
        },
        {
            interactionType: 'mutes',
            title: 'Mutes',
            description: 'All profiles muted by {{observee}}.',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[m:MUTES]->(mutee:NostrUser)
                RETURN mutee.pubkey AS pubkey, mutee.hops AS hops, mutee.influence AS influence
            `
        },
        {
            interactionType: 'muters',
            title: 'Muters',
            description: 'All profiles muting {{observee}}.',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (muter:NostrUser)-[m:MUTES]->(observee)
                RETURN muter.pubkey AS pubkey, muter.hops AS hops, muter.influence AS influence
            `
        },
        {
            interactionType: 'reports',
            title: 'Reports',
            description: 'lorem ipsum',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[r:REPORTS]->(reportee:NostrUser)
                RETURN reportee.pubkey AS pubkey, reportee.hops AS hops, reportee.influence AS influence
            `
        },
        {
            interactionType: 'reporters',
            title: 'Reporters',
            description: 'All profiles reporting {{observee}}.',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (reporter:NostrUser)-[r:REPORTS]->(observee)
                RETURN reporter.pubkey AS pubkey, reporter.hops AS hops, reporter.influence AS influence
            `
        },
        {
            interactionType: 'frens',
            title: 'Frens',
            description: 'All profiles following {{observee}} and followed by {{observee}}.',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (follower:NostrUser)-[r:FOLLOWS]->(observee)
                WHERE (observee)-[:FOLLOWS]->(follower)
                RETURN follower.pubkey AS pubkey, follower.hops AS hops, follower.influence AS influence
            `
        },
        {
            interactionType: 'groupies',
            title: 'Groupies',
            description: 'All profiles following {{observee}} but not followed by {{observee}}.',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (groupie:NostrUser)-[r:FOLLOWS]->(observee)
                WHERE NOT (observee)-[:FOLLOWS]->(groupie)
                RETURN groupie.pubkey AS pubkey, groupie.hops AS hops, groupie.influence AS influence
            `
        },
        {
            interactionType: 'idols',
            title: 'Idols',
            description: 'All profiles followed by {{observee}} but not following {{observee}}.',
            cypherQuery: `
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[r:FOLLOWS]->(idol:NostrUser)
                WHERE NOT (idol)-[:FOLLOWS]->(observee)
                RETURN idol.pubkey AS pubkey, idol.hops AS hops, idol.influence AS influence
            `
        },
        {
            interactionType: 'mutualFollows',
            title: 'Mutual Follows',
            description: 'All profiles followed by both {{observer}} and {{observee}}.',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observer)-[r:FOLLOWS]->(mutualFollow:NostrUser)
                WHERE (observee)-[:FOLLOWS]->(mutualFollow)
                RETURN mutualFollow.pubkey AS pubkey, mutualFollow.hops AS hops, mutualFollow.influence AS influence
            `
        },
        {
            interactionType: 'mutualFollowers',
            title: 'Mutual Followers',
            description: 'All profiles following both {{observer}} and {{observee}}.',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (mutualFollower:NostrUser)-[r:FOLLOWS]->(observee)
                WHERE (mutualFollower)-[:FOLLOWS]->(observer)
                RETURN mutualFollower.pubkey AS pubkey, mutualFollower.hops AS hops, mutualFollower.influence AS influence
            `
        },
        {
            interactionType: 'mutualFrens',
            title: 'Mutual Frens',
            description: 'All profiles following both {{observer}} and {{observee}} and also followed by {{observer}} and {{observee}}.',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observer)-[r:FOLLOWS]->(mutualFren:NostrUser)
                WHERE (mutualFren)-[:FOLLOWS]->(observer)
                AND (observee)-[:FOLLOWS]->(mutualFren)
                AND (mutualFren)-[:FOLLOWS]->(observee)
                RETURN mutualFren.pubkey AS pubkey, mutualFren.hops AS hops, mutualFren.influence AS influence
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
            interactionType: 'mutualGroupies',
            title: 'Mutual Groupies',
            description: 'All groupies of both {{observer}} and {{observee}}.',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (groupie:NostrUser)-[m5:FOLLOWS]->(observee)
                WHERE NOT (observee)-[:FOLLOWS]->(groupie)
                AND (groupie)-[:FOLLOWS]->(observer)
                AND NOT (observer)-[:FOLLOWS]->(groupie)
                RETURN groupie.pubkey AS pubkey, groupie.hops AS hops, groupie.influence AS influence
            `
        },
        {
            interactionType: 'mutualIdols',
            title: 'Mutual Idols',
            description: 'All idols of both {{observer}} and {{observee}}.',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observee)-[f2:FOLLOWS]->(idol:NostrUser)
                WHERE NOT (idol)-[:FOLLOWS]->(observee)
                AND (observer)-[:FOLLOWS]->(idol)
                AND NOT (idol)-[:FOLLOWS]->(observer)
                RETURN idol.pubkey AS pubkey, idol.hops AS hops, idol.influence AS influence
            `
        },
        {
            interactionType: 'mutualFollowers',
            title: 'Mutual Followers',
            description: 'All profiles following both {{observer}} and {{observee}}.',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (follower:NostrUser)-[f2:FOLLOWS]->(observer)
                WHERE (follower)-[:FOLLOWS]->(observee)
                RETURN follower.pubkey AS pubkey, follower.hops AS hops, follower.influence AS influence
            `
        },
        {
            interactionType: 'mutualFollows',
            title: 'Mutual Follows',
            description: 'All profiles followed by both {{observer}} and {{observee}}.',
            cypherQuery: `
                MATCH (observer:NostrUser {pubkey: $observer})
                MATCH (observee:NostrUser {pubkey: $observee})
                OPTIONAL MATCH (observer)-[f2:FOLLOWS]->(followee:NostrUser)
                WHERE (observee)-[:FOLLOWS]->(followee)
                RETURN followee.pubkey AS pubkey, followee.hops AS hops, followee.influence AS influence
            `
        }
    ]
};