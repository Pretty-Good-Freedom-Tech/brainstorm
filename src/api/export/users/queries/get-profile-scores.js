/**
 * NostrUser Individual Profile WoT Score Queries
 * pubkey is mandatory
 * observerPubkey is optional; defaults to 'owner'
 * If observerPubkey is not set, or is set to 'owner', then fetch most calculated results from NostrUser
 * If observerPubkey is set, then fetch most calculated results from NostrUserWotMetricsCard
 * In either case, some results are fetched from NostrUser: npub, followerCount, etc
 * /api/get-profile-scores?pubkey=<pubkey>&observerPubkey=<observerPubkey>
 */

const neo4j = require('neo4j-driver');
const { getConfigFromFile } = require('../../../../utils/config');

/**
 * Get user profiles with pagination and filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetProfileScores(req, res) {
  try {
    const ownerPubkey = getConfigFromFile('BRAINSTORM_OWNER_PUBKEY', '');

    // optional get observer pubkey from query parameter
    const pubkey = req.query.pubkey;
    const observerPubkey = req.query.observerPubkey || 'owner';

    let observer = 'owner';
    if (observerPubkey && observerPubkey != 'owner') {
      observer = 'customer';
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
    
    let query = '';
    // Build the Cypher query with filters
    // TODO: option to exclude null values for influence, etc.
    // Maybe add a checkbox for each filter to exclude null values
    if (observer == "owner") {
      query = `
        MATCH (u:NostrUser)
        WHERE u.pubkey IS NOT NULL
      `;
    } else {
      query = `
        MATCH (c:NostrUserWotMetricsCard {observer_pubkey: '${observerPubkey}'})<-[:SPECIFIC_INSTANCE]-(f:SetOfNostrUserWotMetricsCards)<-[:WOT_METRICS_CARDS]-(n:NostrUser)
        WHERE n.pubkey = c.observee_pubkey
      `;
    }
    
    if (observer == "owner") {
      query += `
        RETURN u.pubkey as pubkey, 
            COALESCE(u.npub, '') as npub,
            COALESCE(u.latestContentEventCreatedAt, 0) as latestContentEventCreatedAt,
            COALESCE(u.personalizedPageRank, 0) as personalizedPageRank,
            COALESCE(u.hops, 999) as hops,
            COALESCE(u.influence, 0) as influence,
            COALESCE(u.average, 0) as average,
            COALESCE(u.confidence, 0) as confidence,
            COALESCE(u.input, 0) as input,
            COALESCE(u.followerCount, 0) as followerCount,
            COALESCE(u.followingCount, 0) as followingCount,
            COALESCE(u.verifiedFollowerCount, 0) as verifiedFollowerCount,
            COALESCE(u.followerInput, 0) as followerInput,
            COALESCE(u.muterCount, 0) as muterCount,
            COALESCE(u.mutingCount, 0) as mutingCount,
            COALESCE(u.verifiedMuterCount, 0) as verifiedMuterCount,
            COALESCE(u.muterInput, 0) as muterInput,
            COALESCE(u.reportingCount, 0) as reportingCount,
            COALESCE(u.reporterCount, 0) as reporterCount,
            COALESCE(u.verifiedReporterCount, 0) as verifiedReporterCount,
            COALESCE(u.reporterInput, 0) as reporterInput
        `;
    } else {
      query += `
        RETURN c.observee_pubkey as pubkey,
            COALESCE(n.npub, '') as npub,
            COALESCE(n.latestContentEventCreatedAt, 0) as latestContentEventCreatedAt,
            COALESCE(c.hops, 999) as hops,
            COALESCE(c.influence, 0) as influence,
            COALESCE(c.average, 0) as average,
            COALESCE(c.confidence, 0) as confidence,
            COALESCE(c.input, 0) as input,
            COALESCE(c.personalizedPageRank, 0) as personalizedPageRank,
            COALESCE(n.followerCount, 0) as followerCount,
            COALESCE(n.followingCount, 0) as followingCount,
            COALESCE(n.muterCount, 0) as muterCount,
            COALESCE(n.mutingCount, 0) as mutingCount,
            COALESCE(n.reporterCount, 0) as reporterCount,
            COALESCE(n.reportingCount, 0) as reportingCount,
            COALESCE(c.verifiedFollowerCount, 0) as verifiedFollowerCount,
            COALESCE(c.verifiedMuterCount, 0) as verifiedMuterCount,
            COALESCE(c.verifiedReporterCount, 0) as verifiedReporterCount,
            COALESCE(c.followerInput, 0) as followerInput,
            COALESCE(c.muterInput, 0) as muterInput,
            COALESCE(c.reporterInput, 0) as reporterInput
      `;
    }
        
    // Get the total count (unfiltered)
    return session.run(query)
      .then(result => {
        const profileData = result.records.map(record => {
          return {
            pubkey: record.get('pubkey'),
            npub: record.get('npub'),
            personalizedPageRank: record.get('personalizedPageRank') ? parseFloat(record.get('personalizedPageRank').toString()) : 0,
            hops: record.get('hops') ? parseInt(record.get('hops').toString()) : 999,
            influence: record.get('influence') ? parseFloat(record.get('influence').toString()) : 0,
            average: record.get('average') ? parseFloat(record.get('average').toString()) : 0,
            confidence: record.get('confidence') ? parseFloat(record.get('confidence').toString()) : 0,
            input: record.get('input') ? parseFloat(record.get('input').toString()) : 0,
            followerCount: record.get('followerCount') ? parseInt(record.get('followerCount').toString()) : 0,
            followingCount: record.get('followingCount') ? parseInt(record.get('followingCount').toString()) : 0,
            muterCount: record.get('muterCount') ? parseInt(record.get('muterCount').toString()) : 0,
            mutingCount: record.get('mutingCount') ? parseInt(record.get('mutingCount').toString()) : 0,
            reporterCount: record.get('reporterCount') ? parseInt(record.get('reporterCount').toString()) : 0,
            reportingCount: record.get('reportingCount') ? parseInt(record.get('reportingCount').toString()) : 0,
            verifiedFollowerCount: record.get('verifiedFollowerCount') ? parseInt(record.get('verifiedFollowerCount').toString()) : 0,
            verifiedMuterCount: record.get('verifiedMuterCount') ? parseInt(record.get('verifiedMuterCount').toString()) : 0,
            verifiedReporterCount: record.get('verifiedReporterCount') ? parseInt(record.get('verifiedReporterCount').toString()) : 0,
            followerInput: record.get('followerInput') ? parseFloat(record.get('followerInput').toString()) : 0,
            muterInput: record.get('muterInput') ? parseFloat(record.get('muterInput').toString()) : 0,
            reporterInput: record.get('reporterInput') ? parseFloat(record.get('reporterInput').toString()) : 0,
            latestContentEventCreatedAt: record.get('latestContentEventCreatedAt') ? parseInt(record.get('latestContentEventCreatedAt').toString()) : 0
          };
        });
        
        // Send the response
        res.json({
          success: true,
          data: {
            cypherQuery: query.replaceAll("\n", " ").replaceAll("\t", " ").replaceAll("  ", " "),
            profileData
          }
        });
      })
      .catch(error => {
        console.error('Error fetching profiles:', error);
        res.status(500).json({
          success: false,
          message: 'Error fetching profiles from database'
        });
      })
      .finally(() => {
        session.close();
        driver.close();
      });
  } catch (error) {
    console.error('Error in handleGetProfileScores:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

module.exports = {
  handleGetProfileScores
};
