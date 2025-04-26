/**
 * NostrUser Data Queries
 * Handles retrieval of individual NostrUser data from Neo4j
 */

const neo4j = require('neo4j-driver');
const { getConfigFromFile } = require('../../../../utils/config');
const fs = require('fs');
const path = require('path');
const { nip19 } = require('nostr-tools');

function getNpub(pubkey) {
  try {
    if (!pubkey) return null;
    // If pubkey is already npub, return as-is
    if (pubkey.startsWith('npub')) return pubkey;
    // Use nostr-tools nip19
    return nip19.npubEncode(pubkey);
  } catch (e) {
    return null;
  }
}

/**
 * Get detailed data for a specific user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetUserData(req, res) {
  try {
    // TODO: Remove this when BRAINSTORM_MODULE_ALGOS_DIR is implemented
    // const BRAINSTORM_MODULE_ALGOS_DIR = getConfigFromFile('BRAINSTORM_MODULE_ALGOS_DIR', '');
    const reportTypesPath = "/usr/local/lib/node_modules/brainstorm/src/algos/reports/reportTypes.txt"
    const reportTypes = fs.readFileSync(reportTypesPath, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    // Get query parameters for filtering
    const pubkey = req.query.pubkey;

    const npub = getNpub(pubkey);
    
    if (!pubkey) {
      return res.status(400).json({ error: 'Missing pubkey parameter' });
    }

    // Get pubkey of the owner from brainstorm.conf
    const ownerPubkey = getConfigFromFile('BRAINSTORM_OWNER_PUBKEY', '');

    // Create Neo4j driver
    const neo4jUri = getConfigFromFile('NEO4J_URI', 'bolt://localhost:7687');
    const neo4jUser = getConfigFromFile('NEO4J_USER', 'neo4j');
    const neo4jPassword = getConfigFromFile('NEO4J_PASSWORD', 'neo4j');
    
    const driver = neo4j.driver(
      neo4jUri,
      neo4j.auth.basic(neo4jUser, neo4jPassword)
    );
    
    const session = driver.session();
    
    // Build the Cypher query to get user data and counts
    let query = `
      MATCH (u:NostrUser {pubkey: $pubkey}) // This works fine
      MATCH (owner:NostrUser {pubkey: $ownerPubkey}) // This causes an error!

      // Count users that this user follows
      OPTIONAL MATCH (u)-[f:FOLLOWS]->(following:NostrUser)
      WITH u, owner, count(following) as followingCount
      
      // Count users that follow this user
      OPTIONAL MATCH (follower:NostrUser)-[f2:FOLLOWS]->(u)
      WITH u, owner, followingCount, count(follower) as followerCount

      // Count verified users (influence > 0.05) that follow this user
      OPTIONAL MATCH (follower:NostrUser)-[f2:FOLLOWS]->(u)
      WHERE follower.influence > 0.05
      WITH u, owner, followingCount, followerCount, count(follower) as verifiedFollowerCount

      // Count users that this user mutes
      OPTIONAL MATCH (u)-[m:MUTES]->(muted:NostrUser)
      WITH u, owner, followingCount, followerCount, verifiedFollowerCount, count(muted) as mutingCount
      
      // Count users that mute this user
      OPTIONAL MATCH (muter:NostrUser)-[m2:MUTES]->(u)
      WITH u, owner, followingCount, followerCount, verifiedFollowerCount, mutingCount, count(muter) as muterCount
      
      // Count users that this user reports
      OPTIONAL MATCH (u)-[r:REPORTS]->(reported:NostrUser)
      WITH u, owner, followingCount, followerCount, verifiedFollowerCount, mutingCount, muterCount, count(reported) as reportingCount
      
      // Count users that report this user
      OPTIONAL MATCH (reporter:NostrUser)-[r2:REPORTS]->(u)
      WITH u, owner, followingCount, followerCount, verifiedFollowerCount, mutingCount, muterCount, reportingCount, count(reporter) as reporterCount

      ////////// Grapevine Analysis
      // frens FRENS (profiles that follow AND are followed by this user)
      OPTIONAL MATCH (u)-[m3:FOLLOWS]->(fren:NostrUser)-[m4:FOLLOWS]->(u)
      WITH u, owner, followingCount, followerCount, verifiedFollowerCount, mutingCount, muterCount, reportingCount, reporterCount, count(fren) as frenCount

      // groupies GROUPIES (profiles that follow but ARE NOT FOLLOWED BY this user)
      OPTIONAL MATCH (groupie:NostrUser)-[m5:FOLLOWS]->(u)
      WHERE NOT (u)-[:FOLLOWS]->(groupie)
      WITH u, owner, followingCount, followerCount, verifiedFollowerCount, mutingCount, muterCount, reportingCount, reporterCount, frenCount, count(groupie) as groupieCount

      // idols IDOLS (profiles that are followed by but DO NOT FOLLOW this user)
      OPTIONAL MATCH (u)-[f2:FOLLOWS]->(idol:NostrUser)
      WHERE NOT (idol)-[:FOLLOWS]->(u)
      WITH u, owner, followingCount, followerCount, verifiedFollowerCount, mutingCount, muterCount, reportingCount, reporterCount, frenCount, groupieCount, count(idol) as idolCount

      //////// RECOMMENDATIONS:
      // calculated as:
      // frens of the recommender
      // who also follow the recommendee
      // but whom the recommendee does not already follow

      // Intersection of owner frens and the groupies of this user
      // followRecommendationsToOwnerFromThisUser RECOMMENDED FOLLOWS A: (for owner to follow, recommended by this user)
      // Recommender: this user
      // Recommendee: owner
      OPTIONAL MATCH (u)-[m3:FOLLOWS]->(recommendation:NostrUser)-[m4:FOLLOWS]->(u)
      WHERE (recommendation)-[:FOLLOWS]->(owner)
      AND NOT (owner)-[:FOLLOWS]->(recommendation)
      WITH u, owner, followingCount, followerCount, verifiedFollowerCount, mutingCount, muterCount, reportingCount, reporterCount, frenCount, groupieCount, idolCount, count(recommendation) as recommendationsToOwnerCount

      // Intersection of this user's frens and the groupies of the owner
      // followRecommendationsFromOwnerToThisUser RECOMMENDED FOLLOWS B: (for this user to follow, recommended by owner)
      // Recommender: owner
      // Recommendee: this user
      OPTIONAL MATCH (owner)-[m3:FOLLOWS]->(recommendation:NostrUser)-[m4:FOLLOWS]->(owner)
      WHERE (recommendation)-[:FOLLOWS]->(u)
      AND NOT (u)-[:FOLLOWS]->(recommendation)
      WITH u, owner, followingCount, followerCount, verifiedFollowerCount, mutingCount, muterCount, reportingCount, reporterCount, frenCount, groupieCount, idolCount, recommendationsToOwnerCount, count(recommendation) as recommendationsFromOwnerCount
      
      // mutuals MUTUALS TODO: define mutuals.
      // EITHER: profiles followed by this user and by the owner (mutualFollows)
      // OR: frens of this user and frens of the owner (mutualFrens)
      // could also do: mutualFrens, mutualGroupies, mutualIdols, mutualFollowers, mutualFollows

      // mutualFrens MUTUAL FRENDS
      OPTIONAL MATCH (u)-[m3:FOLLOWS]->(fren:NostrUser)-[m4:FOLLOWS]->(u)
      WHERE (fren)-[:FOLLOWS]->(owner)
      AND NOT (owner)-[:FOLLOWS]->(fren)
      WITH u, owner, followingCount, followerCount, verifiedFollowerCount, mutingCount, muterCount, reportingCount, reporterCount, frenCount, groupieCount, idolCount, recommendationsToOwnerCount, recommendationsFromOwnerCount, count(fren) as mutualFrenCount

      RETURN u.pubkey as pubkey,
             u.personalizedPageRank as personalizedPageRank,
             u.hops as hops,
             u.influence as influence,
             u.average as average,
             u.confidence as confidence,
             u.input as input,
             u.nip56_totalGrapeRankScore as nip56TotalGrapeRankScore,
             u.nip56_totalVerifiedReportCount as nip56TotalVerifiedReportCount,
             u.nip56_totalReportCount as nip56TotalReportCount,`
    // cycle through each report type in ${BRAINSTORM_MODULE_ALGOS_DIR}/reports/reportTypes.txt
    // and add to query
    // use this format:
    // u.nip56_nudity_grapeRankScore as nip56NudityGrapeRankScore,
    // u.nip56_nudity_verifiedReportCount as nip56NudityVerifiedReportCount,
    // u.nip56_nudity_reportCount as nip56NudityReportCount,
    reportTypes.forEach(reportType => {
      query += `
             u.nip56_${reportType}_grapeRankScore as nip56${reportType}GrapeRankScore,
             u.nip56_${reportType}_verifiedReportCount as nip56${reportType}VerifiedReportCount,
             u.nip56_${reportType}_reportCount as nip56${reportType}ReportCount,`
    });
    query += `
             followingCount,
             verifiedFollowerCount,
             followerCount,
             mutingCount,
             muterCount,
             reportingCount,
             reporterCount,
             frenCount,
             groupieCount,
             idolCount,
             recommendationsToOwnerCount,
             recommendationsFromOwnerCount
    `;
    
    // Execute the query
    session.run(query, { pubkey, ownerPubkey })
      .then(result => {
        const user = result.records[0];
        
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({
          success: true,
          data: {
            ownerPubkey: ownerPubkey,
            pubkey: user.get('pubkey'),
            npub: npub,
            personalizedPageRank: user.get('personalizedPageRank') ? parseFloat(user.get('personalizedPageRank').toString()) : null,
            hops: user.get('hops') ? parseInt(user.get('hops').toString()) : null,
            influence: user.get('influence') ? parseFloat(user.get('influence').toString()) : null,
            average: user.get('average') ? parseFloat(user.get('average').toString()) : null,
            confidence: user.get('confidence') ? parseFloat(user.get('confidence').toString()) : null,
            input: user.get('input') ? parseFloat(user.get('input').toString()) : null,
            followingCount: user.get('followingCount') ? parseInt(user.get('followingCount').toString()) : 0,
            followerCount: user.get('followerCount') ? parseInt(user.get('followerCount').toString()) : 0,
            verifiedFollowerCount: user.get('verifiedFollowerCount') ? parseInt(user.get('verifiedFollowerCount').toString()) : 0,
            mutingCount: user.get('mutingCount') ? parseInt(user.get('mutingCount').toString()) : 0,
            muterCount: user.get('muterCount') ? parseInt(user.get('muterCount').toString()) : 0,
            reportingCount: user.get('reportingCount') ? parseInt(user.get('reportingCount').toString()) : 0,
            reporterCount: user.get('reporterCount') ? parseInt(user.get('reporterCount').toString()) : 0,
            frenCount: user.get('frenCount') ? parseInt(user.get('frenCount').toString()) : 0,
            groupieCount: user.get('groupieCount') ? parseInt(user.get('groupieCount').toString()) : 0,
            idolCount: user.get('idolCount') ? parseInt(user.get('idolCount').toString()) : 0,
            recommendationsToOwnerCount: user.get('recommendationsToOwnerCount') ? parseInt(user.get('recommendationsToOwnerCount').toString()) : 0,
            recommendationsFromOwnerCount: user.get('recommendationsFromOwnerCount') ? parseInt(user.get('recommendationsFromOwnerCount').toString()) : 0,
            nip56: {
              totals: {
                nip56TotalGrapeRankScore: user.get('nip56TotalGrapeRankScore') ? parseFloat(user.get('nip56TotalGrapeRankScore').toString()) : null,
                nip56TotalVerifiedReportCount: user.get('nip56TotalVerifiedReportCount') ? parseInt(user.get('nip56TotalVerifiedReportCount').toString()) : 0,
                nip56TotalReportCount: user.get('nip56TotalReportCount') ? parseInt(user.get('nip56TotalReportCount').toString()) : 0
              },
              byReportType: Object.fromEntries(
                reportTypes.map(reportType => [
                  reportType,
                  {
                    grapeRankScore: user.get(`nip56${reportType}GrapeRankScore`)
                      ? parseFloat(user.get(`nip56${reportType}GrapeRankScore`).toString())
                      : null,
                    verifiedReportCount: user.get(`nip56${reportType}VerifiedReportCount`)
                      ? parseInt(user.get(`nip56${reportType}VerifiedReportCount`).toString())
                      : 0,
                    reportCount: user.get(`nip56${reportType}ReportCount`)
                      ? parseInt(user.get(`nip56${reportType}ReportCount`).toString())
                      : 0
                  }
                ])
              )
            }
          }
        });
      })
      .catch(error => {
        console.error('Error fetching user data:', error);
        res.status(500).json({
          success: false,
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
