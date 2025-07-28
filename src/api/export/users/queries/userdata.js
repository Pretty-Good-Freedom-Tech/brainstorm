/**
 * NostrUser Data Queries
 * Handles retrieval of individual NostrUser data from Neo4j
 * able to pull from NostrUser nodes or from NostrUserWotMetricsCard nodes depending on whether a valid observerPubkey is provided.
 */

const neo4j = require('neo4j-driver');
const { getConfigFromFile } = require('../../../../utils/config');
const fs = require('fs');
const path = require('path');
const { nip19 } = require('nostr-tools');

/**
 * Get detailed data for a specific user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetUserData(req, res) {
  try {
    // Get query parameters for filtering
    const pubkey = req.query.pubkey;

    let observerPubkey = req.query.observerPubkey || 'owner';

    if (!pubkey) {
      return res.status(400).json({ error: 'Missing pubkey parameter' });
    }

    // Use nip19 to validate pubkey
    const npub1 = nip19.npubEncode(pubkey);
    // if string does not start with 'npub'
    if (!npub1.startsWith('npub')) {
      return res.status(400).json({ error: 'Invalid pubkey parameter' });
    }

    // Get pubkey of the owner from brainstorm.conf
    const ownerPubkey = getConfigFromFile('BRAINSTORM_OWNER_PUBKEY', '');

    let source = 'NostrUser'

    // If observerPubkey is set and is not owner, validate it
    if (observerPubkey && observerPubkey !== 'owner') {
      const npub2 = nip19.npubEncode(observerPubkey);
      if (!npub2.startsWith('npub')) {
        return res.status(400).json({ error: 'Invalid observerPubkey parameter' });
      }
      source = 'NostrUserWotMetricsCard'
    }

    // if no observerPubkey or if observerPubkey is 'owner', use owner pubkey
    if (!observerPubkey || observerPubkey === 'owner') {
      observerPubkey = ownerPubkey
    }
    
    // Create Neo4j driver
    const neo4jUri = getConfigFromFile('NEO4J_URI', 'bolt://localhost:7687');
    const neo4jUser = getConfigFromFile('NEO4J_USER', 'neo4j');
    const neo4jPassword = getConfigFromFile('NEO4J_PASSWORD', 'neo4j');
    
    const driver = neo4j.driver(
      neo4jUri,
      neo4j.auth.basic(neo4jUser, neo4jPassword)
    );
    
    const session = driver.session();

    let cypherQuery = `
    MATCH (u:NostrUser {pubkey: '${pubkey}'})
    MATCH (observer:NostrUser {pubkey: '${observerPubkey}'})
    `
    let nodeTrustScoreSource = ''
    let nodesToCarryWith = ''
    if (source === 'NostrUser') {
      nodeTrustScoreSource = 'u'
      nodesToCarryWith = 'u,'
    }
    if (source === 'NostrUserWotMetricsCard') {
      nodeTrustScoreSource = 'observeeCard'
      nodesToCarryWith = 'u, observeeCard, '
      cypherQuery += `
      MATCH (observeeCard:NostrUserWotMetricsCard {observer_pubkey: '${observerPubkey}', observee_pubkey: '${pubkey}'})
      `
    }
    ////////// Social Graph Analysis
    cypherQuery += `
      // frens FRENS (profiles that follow AND are followed by this user)
      OPTIONAL MATCH (u)-[m3:FOLLOWS]->(fren:NostrUser)-[m4:FOLLOWS]->(u)
      WITH ${nodesToCarryWith} observer, count(fren) as frenCount

      // groupies GROUPIES (profiles that follow but ARE NOT FOLLOWED BY this user)
      OPTIONAL MATCH (groupie:NostrUser)-[m5:FOLLOWS]->(u)
      WHERE NOT (u)-[:FOLLOWS]->(groupie)
      WITH ${nodesToCarryWith} observer, frenCount, count(groupie) as groupieCount

      // idols IDOLS (profiles that are followed by but DO NOT FOLLOW this user)
      OPTIONAL MATCH (u)-[f2:FOLLOWS]->(idol:NostrUser)
      WHERE NOT (idol)-[:FOLLOWS]->(u)
      WITH ${nodesToCarryWith} observer, frenCount, groupieCount, count(idol) as idolCount
    `
    ////////// Mutuals: Social Graph Overlaps & Interactions
    cypherQuery += `
      // mutualFrens MUTUAL FRENDS
      OPTIONAL MATCH (u)-[m3:FOLLOWS]->(fren:NostrUser)-[m4:FOLLOWS]->(u)
      WHERE (fren)-[:FOLLOWS]->(observer)
      AND (observer)-[:FOLLOWS]->(fren)
      WITH ${nodesToCarryWith} observer, frenCount, groupieCount, idolCount, count(fren) as mutualFrenCount

      // mutualGroupies MUTUAL GROUPIES
      OPTIONAL MATCH (groupie:NostrUser)-[m5:FOLLOWS]->(u)
      WHERE NOT (u)-[:FOLLOWS]->(groupie)
      AND (groupie)-[:FOLLOWS]->(observer)
      AND NOT (observer)-[:FOLLOWS]->(groupie)
      WITH ${nodesToCarryWith} observer, frenCount, groupieCount, idolCount, mutualFrenCount, count(groupie) as mutualGroupieCount

      // mutualIdols MUTUAL IDOLS
      OPTIONAL MATCH (u)-[f2:FOLLOWS]->(idol:NostrUser)
      WHERE NOT (idol)-[:FOLLOWS]->(u)
      AND (observer)-[:FOLLOWS]->(idol)
      AND NOT (idol)-[:FOLLOWS]->(observer)
      WITH ${nodesToCarryWith} observer, frenCount, groupieCount, idolCount, mutualFrenCount, mutualGroupieCount, count(idol) as mutualIdolCount

      // mutualFollowers MUTUAL FOLLOWERS
      OPTIONAL MATCH (follower:NostrUser)-[f2:FOLLOWS]->(u)
      WHERE (follower)-[:FOLLOWS]->(observer)
      WITH ${nodesToCarryWith} observer, frenCount, groupieCount, idolCount, mutualFrenCount, mutualGroupieCount, mutualIdolCount, count(follower) as mutualFollowerCount

      // mutualFollows MUTUAL FOLLOWS
      OPTIONAL MATCH (u)-[f2:FOLLOWS]->(followee:NostrUser)
      WHERE (observer)-[:FOLLOWS]->(followee)
      WITH ${nodesToCarryWith} observer, frenCount, groupieCount, idolCount, mutualFrenCount, mutualGroupieCount, mutualIdolCount, mutualFollowerCount, count(followee) as mutualFollowCount
    `
    ////////// Recommendations 
    cypherQuery += `
      // Intersection of observer frens and the groupies of this user
      // followRecommendationsToObserverFromThisUser RECOMMENDED FOLLOWS A: (for observer to follow, recommended by this user)
      // Recommender: this user
      // Recommendee: observer
      OPTIONAL MATCH (u)-[m3:FOLLOWS]->(recommendation:NostrUser)-[m4:FOLLOWS]->(u)
      WHERE (recommendation)-[:FOLLOWS]->(observer)
      AND NOT (observer)-[:FOLLOWS]->(recommendation)
      WITH ${nodesToCarryWith} observer, frenCount, groupieCount, idolCount, mutualFrenCount, mutualGroupieCount, mutualIdolCount, mutualFollowerCount, mutualFollowCount, count(recommendation) as recommendationsToObserverCount

      // Intersection of this user's frens and the groupies of the observer
      // followRecommendationsFromObserverToThisUser RECOMMENDED FOLLOWS B: (for this user to follow, recommended by observer)
      // Recommender: observer
      // Recommendee: this user
      OPTIONAL MATCH (observer)-[m3:FOLLOWS]->(recommendation:NostrUser)-[m4:FOLLOWS]->(observer)
      WHERE (recommendation)-[:FOLLOWS]->(u)
      AND NOT (u)-[:FOLLOWS]->(recommendation)
      WITH ${nodesToCarryWith} observer, frenCount, groupieCount, idolCount, mutualFrenCount, mutualGroupieCount, mutualIdolCount, mutualFollowerCount, mutualFollowCount, recommendationsToObserverCount count(recommendation) as recommendationsFromObserverCount

    `
    
    cypherQuery += `
    RETURN u.pubkey as pubkey,
    u.npub as npub,
    u.followerCount as followerCount,
    u.muterCount as muterCount,
    u.reporterCount as reporterCount,
    u.followingCount as followingCount,
    u.mutingCount as mutingCount,
    u.reportingCount as reportingCount,
    ${nodeTrustScoreSource}.personalizedPageRank as personalizedPageRank,
    ${nodeTrustScoreSource}.hops as hops,
    ${nodeTrustScoreSource}.influence as influence,
    ${nodeTrustScoreSource}.average as average,
    ${nodeTrustScoreSource}.confidence as confidence,
    ${nodeTrustScoreSource}.input as input,
    ${nodeTrustScoreSource}.verifiedFollowerCount as verifiedFollowerCount,
    ${nodeTrustScoreSource}.verifiedMuterCount as verifiedMuterCount,
    ${nodeTrustScoreSource}.verifiedReporterCount as verifiedReporterCount,
    ${nodeTrustScoreSource}.followerInput as followerInput,
    ${nodeTrustScoreSource}.muterInput as muterInput,
    ${nodeTrustScoreSource}.reporterInput as reporterInput,
    frenCount,
    groupieCount,
    idolCount,
    mutualFrenCount,
    mutualGroupieCount,
    mutualIdolCount,
    mutualFollowerCount,
    mutualFollowCount,
    recommendationsToObserverCount,
    recommendationsFromObserverCount
    `
    
    // Execute the query
    session.run(cypherQuery)
      .then(result => {
        const user = result.records[0];
        
        let isUserInNeo4j = true
        let userData = {}
        if (!user) {
          isUserInNeo4j = false;
          userData = {
            pubkey: pubkey,
            npub: npub,
            followerCount: null,
            muterCount: null,
            reporterCount: null,
            followingCount: null,
            mutingCount: null,
            reportingCount: null,
            personalizedPageRank: null,
            hops: null,
            influence: null,
            average: null,
            confidence: null,
            input: null,
            verifiedFollowerCount: null,
            verifiedMuterCount: null,
            verifiedReporterCount: null,
            followerInput: null,
            muterInput: null,
            reporterInput: null,
            frenCount: null,
            groupieCount: null,
            idolCount: null,
            mutualFrenCount: null,
            mutualGroupieCount: null,
            mutualIdolCount: null,
            mutualFollowerCount: null,
            mutualFollowCount: null,
            recommendationsToObserverCount: null,
            recommendationsFromObserverCount: null
          }
        }

        userData = {
          pubkey: user.get('pubkey') ? user.get('pubkey') : null,
          npub: user.get('npub') ? user.get('npub') : null,
          followerCount: user.get('followerCount') ? parseInt(user.get('followerCount').toString()) : 0,
          muterCount: user.get('muterCount') ? parseInt(user.get('muterCount').toString()) : 0,
          reporterCount: user.get('reporterCount') ? parseInt(user.get('reporterCount').toString()) : 0,
          followingCount: user.get('followingCount') ? parseInt(user.get('followingCount').toString()) : 0,
          mutingCount: user.get('mutingCount') ? parseInt(user.get('mutingCount').toString()) : 0,
          reportingCount: user.get('reportingCount') ? parseInt(user.get('reportingCount').toString()) : 0,
          personalizedPageRank: user.get('personalizedPageRank') ? parseFloat(user.get('personalizedPageRank').toString()) : null,
          hops: user.get('hops') ? parseInt(user.get('hops').toString()) : null,
          influence: user.get('influence') ? parseFloat(user.get('influence').toString()) : null,
          average: user.get('average') ? parseFloat(user.get('average').toString()) : null,
          confidence: user.get('confidence') ? parseFloat(user.get('confidence').toString()) : null,
          input: user.get('input') ? parseFloat(user.get('input').toString()) : null,
          verifiedFollowerCount: user.get('verifiedFollowerCount') ? parseInt(user.get('verifiedFollowerCount').toString()) : null,
          verifiedMuterCount: user.get('verifiedMuterCount') ? parseInt(user.get('verifiedMuterCount').toString()) : null,
          verifiedReporterCount: user.get('verifiedReporterCount') ? parseInt(user.get('verifiedReporterCount').toString()) : null,
          followerInput: user.get('followerInput') ? parseFloat(user.get('followerInput').toString()) : null,
          muterInput: user.get('muterInput') ? parseFloat(user.get('muterInput').toString()) : null,
          reporterInput: user.get('reporterInput') ? parseFloat(user.get('reporterInput').toString()) : null,
          frenCount: user.get('frenCount') ? parseInt(user.get('frenCount').toString()) : null,
          groupieCount: user.get('groupieCount') ? parseInt(user.get('groupieCount').toString()) : null,
          idolCount: user.get('idolCount') ? parseInt(user.get('idolCount').toString()) : null,
          mutualFrenCount: user.get('mutualFrenCount') ? parseInt(user.get('mutualFrenCount').toString()) : null,
          mutualGroupieCount: user.get('mutualGroupieCount') ? parseInt(user.get('mutualGroupieCount').toString()) : null,
          mutualIdolCount: user.get('mutualIdolCount') ? parseInt(user.get('mutualIdolCount').toString()) : null,
          mutualFollowerCount: user.get('mutualFollowerCount') ? parseInt(user.get('mutualFollowerCount').toString()) : null,
          mutualFollowCount: user.get('mutualFollowCount') ? parseInt(user.get('mutualFollowCount').toString()) : null,
          recommendationsToObserverCount: user.get('recommendationsToObserverCount') ? parseInt(user.get('recommendationsToObserverCount').toString()) : null,
          recommendationsFromObserverCount: user.get('recommendationsFromObserverCount') ? parseInt(user.get('recommendationsFromObserverCount').toString()) : null
        }

        const apiResponse = {
          success: true,
          isUserInNeo4j,
          metaData: {
            pubkey: pubkey,
            observerPubkey: observerPubkey,
            query: cypherQuery
          },
          data: userData
        };
        res.status(200).json(apiResponse);
      })
      .catch(error => {
        console.error('Error fetching user data:', error);
        res.status(500).json({
          success: false,
          query,
          message: `Error fetching user data: ${error.message}`
        });
      })
      .finally(() => {
        session.close();
        driver.close();
      });
  } catch (error) {
    console.error('Error in handleGetUserData:', error);
    res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`
    });
  }
}

module.exports = {
  handleGetUserData
};