/**
 * NostrUser Profiles Queries
 * Handles retrieval of NostrUser profiles from Neo4j
 */

const neo4j = require('neo4j-driver');
const { getConfigFromFile } = require('../../../../utils/config');

/**
 * Get user profiles with pagination and filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetProfiles(req, res) {
  try {
    const ownerPubkey = getConfigFromFile('BRAINSTORM_OWNER_PUBKEY', '');

    // optional get observer pubkey from query parameter
    const source = req.query.source || 'owner'; // 'owner' or 'NostrUserWotMetricsCards'
    const observerPubkey = req.query.observerPubkey || ownerPubkey;
    
    // Get query parameters for filtering and pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const sortBy = req.query.sortBy || 'influence';
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    // Get all filter parameters
    const filterNpub = req.query.filterNpub || '';
    const filterPubkey = req.query.filterPubkey || '';
    const filterMinHops = req.query.filterMinHops || '';
    const filterMaxHops = req.query.filterMaxHops || '';
    const filterMinRank = req.query.filterMinRank || '';
    const filterMaxRank = req.query.filterMaxRank || '';
    const filterMinInfluence = req.query.filterMinInfluence || '';
    const filterMaxInfluence = req.query.filterMaxInfluence || '';
    const filterMinAverage = req.query.filterMinAverage || '';
    const filterMaxAverage = req.query.filterMaxAverage || '';
    const filterMinConfidence = req.query.filterMinConfidence || '';
    const filterMaxConfidence = req.query.filterMaxConfidence || '';
    const filterMinInput = req.query.filterMinInput || '';
    const filterMaxInput = req.query.filterMaxInput || '';

    // follower/muter/reporter counts
    const filterMinFollowerCount = req.query.filterMinFollowerCount || '';
    const filterMaxFollowerCount = req.query.filterMaxFollowerCount || '';
    const filterMinFollowingCount = req.query.filterMinFollowingCount || '';
    const filterMaxFollowingCount = req.query.filterMaxFollowingCount || '';

    const filterMinMuterCount = req.query.filterMinMuterCount || '';
    const filterMaxMuterCount = req.query.filterMaxMuterCount || '';
    const filterMinMutingCount = req.query.filterMinMutingCount || '';
    const filterMaxMutingCount = req.query.filterMaxMutingCount || '';

    const filterMinReporterCount = req.query.filterMinReporterCount || '';
    const filterMaxReporterCount = req.query.filterMaxReporterCount || '';
    const filterMinReportingCount = req.query.filterMinReportingCount || '';
    const filterMaxReportingCount = req.query.filterMaxReportingCount || '';

    // verified follower/muter/reporter counts
    const filterMinVerifiedFollowerCount = req.query.filterMinVerifiedFollowerCount || '';
    const filterMaxVerifiedFollowerCount = req.query.filterMaxVerifiedFollowerCount || '';
    const filterMinVerifiedMuterCount = req.query.filterMinVerifiedMuterCount || '';
    const filterMaxVerifiedMuterCount = req.query.filterMaxVerifiedMuterCount || '';
    const filterMinVerifiedReporterCount = req.query.filterMinVerifiedReporterCount || '';
    const filterMaxVerifiedReporterCount = req.query.filterMaxVerifiedReporterCount || '';
    
    // input filters
    const filterMinFollowerInput = req.query.filterMinFollowerInput || '';
    const filterMaxFollowerInput = req.query.filterMaxFollowerInput || '';
    const filterMinMuterInput = req.query.filterMinMuterInput || '';
    const filterMaxMuterInput = req.query.filterMaxMuterInput || '';
    const filterMinReporterInput = req.query.filterMinReporterInput || '';
    const filterMaxReporterInput = req.query.filterMaxReporterInput || '';

    const filterMinNip56TotalGrapeRankScore = req.query.filterMinNip56TotalGrapeRankScore || '';
    const filterMaxNip56TotalGrapeRankScore = req.query.filterMaxNip56TotalGrapeRankScore || '';
    const filterMinNip56TotalVerifiedReportCount = req.query.filterMinNip56TotalVerifiedReportCount || '';
    const filterMaxNip56TotalVerifiedReportCount = req.query.filterMaxNip56TotalVerifiedReportCount || '';
    const filterMinNip56TotalReportCount = req.query.filterMinNip56TotalReportCount || '';
    const filterMaxNip56TotalReportCount = req.query.filterMaxNip56TotalReportCount || '';
    const filterMinLatestContentEventCreatedAt = req.query.filterMinLatestContentEventCreatedAt || '';
    const filterMaxLatestContentEventCreatedAt = req.query.filterMaxLatestContentEventCreatedAt || '';
    
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
    if (observerPubkey == "owner") {
      query = `
        MATCH (u:NostrUser)
        WHERE u.pubkey IS NOT NULL
      `;
    } else {
      query = `
        MATCH (u:NostrUserWotMetricsCard {observer_pubkey: '${observerPubkey}'})
        WHERE u.observee_pubkey IS NOT NULL
        OPTIONAL MATCH (u)<-[:SPECIFIC_INSTANCE]-(f:SetOfNostrUserWotMetricsCards)<-[:WOT_METRICS_CARDS]-(n:NostrUser)
        WHERE n.pubkey = u.observee_pubkey
      `;
    }
    
    // Add filters if provided

    if (filterMinInfluence) {
      query += ` AND u.influence >= ${parseFloat(filterMinInfluence)}`;
    }
    
    if (filterMaxInfluence) {
      query += ` AND u.influence <= ${parseFloat(filterMaxInfluence)}`;
    }
    
    if (filterMinAverage) {
      query += ` AND u.average >= ${parseFloat(filterMinAverage)}`;
    }
    
    if (filterMaxAverage) {
      query += ` AND u.average <= ${parseFloat(filterMaxAverage)}`;
    }
    
    if (filterMinConfidence) {
      query += ` AND u.confidence >= ${parseFloat(filterMinConfidence)}`;
    }
    
    if (filterMaxConfidence) {
      query += ` AND u.confidence <= ${parseFloat(filterMaxConfidence)}`;
    }
    
    if (filterMinInput) {
      query += ` AND u.input >= ${parseFloat(filterMinInput)}`;
    }
    
    if (filterMaxInput) {
      query += ` AND u.input <= ${parseFloat(filterMaxInput)}`;
    }
    
    

    // Add follower/muter/reporter filters
    if (filterMinFollowerCount) {
      query += ` AND u.followerCount >= ${parseInt(filterMinFollowerCount)}`;
    }
    
    if (filterMaxFollowerCount) {
      query += ` AND u.followerCount <= ${parseInt(filterMaxFollowerCount)}`;
    }
    
    if (filterMinFollowingCount) {
      query += ` AND u.followingCount >= ${parseInt(filterMinFollowingCount)}`;
    }
    
    if (filterMaxFollowingCount) {
      query += ` AND u.followingCount <= ${parseInt(filterMaxFollowingCount)}`;
    }
    
    if (filterMinMuterCount) {
      query += ` AND u.muterCount >= ${parseInt(filterMinMuterCount)}`;
    }
    
    if (filterMaxMuterCount) {
      query += ` AND u.muterCount <= ${parseInt(filterMaxMuterCount)}`;
    }
    
    if (filterMinMutingCount) {
      query += ` AND u.mutingCount >= ${parseInt(filterMinMutingCount)}`;
    }
    
    if (filterMaxMutingCount) {
      query += ` AND u.mutingCount <= ${parseInt(filterMaxMutingCount)}`;
    }
    
    if (filterMinReporterCount) {
      query += ` AND u.reporterCount >= ${parseInt(filterMinReporterCount)}`;
    }
    
    if (filterMaxReporterCount) {
      query += ` AND u.reporterCount <= ${parseInt(filterMaxReporterCount)}`;
    }
    
    if (filterMinReportingCount) {
      query += ` AND u.reportingCount >= ${parseInt(filterMinReportingCount)}`;
    }
    
    if (filterMaxReportingCount) {
      query += ` AND u.reportingCount <= ${parseInt(filterMaxReportingCount)}`;
    }

    if (filterMinVerifiedFollowerCount) {
      query += ` AND u.verifiedFollowerCount >= ${parseInt(filterMinVerifiedFollowerCount)}`;
    }
    
    if (filterMaxVerifiedFollowerCount) {
      query += ` AND u.verifiedFollowerCount <= ${parseInt(filterMaxVerifiedFollowerCount)}`;
    }
    
    if (filterMinVerifiedMuterCount) {
      query += ` AND u.verifiedMuterCount >= ${parseInt(filterMinVerifiedMuterCount)}`;
    }
    
    if (filterMaxVerifiedMuterCount) {
      query += ` AND u.verifiedMuterCount <= ${parseInt(filterMaxVerifiedMuterCount)}`;
    }
    
    if (filterMinVerifiedReporterCount) {
      query += ` AND u.verifiedReporterCount >= ${parseInt(filterMinVerifiedReporterCount)}`;
    }
    
    if (filterMaxVerifiedReporterCount) {
      query += ` AND u.verifiedReporterCount <= ${parseInt(filterMaxVerifiedReporterCount)}`;
    }

    // add input filters
    if (filterMinFollowerInput) {
      query += ` AND u.followerInput >= ${parseFloat(filterMinFollowerInput)}`;
    }
    
    if (filterMaxFollowerInput) {
      query += ` AND u.followerInput <= ${parseFloat(filterMaxFollowerInput)}`;
    }
    
    if (filterMinMuterInput) {
      query += ` AND u.muterInput >= ${parseFloat(filterMinMuterInput)}`;
    }
    
    if (filterMaxMuterInput) {
      query += ` AND u.muterInput <= ${parseFloat(filterMaxMuterInput)}`;
    }
    
    if (filterMinReporterInput) {
      query += ` AND u.reporterInput >= ${parseFloat(filterMinReporterInput)}`;
    }
    
    if (filterMaxReporterInput) {
      query += ` AND u.reporterInput <= ${parseFloat(filterMaxReporterInput)}`;
    }


    if (filterMinHops) {
      query += ` AND u.hops >= ${parseInt(filterMinHops)}`;
    }
    
    if (filterMaxHops) {
      query += ` AND u.hops <= ${parseInt(filterMaxHops)}`;
    }
    
    if (filterMinRank) {
      query += ` AND u.personalizedPageRank >= ${parseFloat(filterMinRank)}`;
    }
    
    if (filterMaxRank) {
      query += ` AND u.personalizedPageRank <= ${parseFloat(filterMaxRank)}`;
    }

    if (filterMinNip56TotalGrapeRankScore) {
      query += ` AND u.nip56_totalGrapeRankScore >= ${parseFloat(filterMinNip56TotalGrapeRankScore)}`;
    }
    
    if (filterMaxNip56TotalGrapeRankScore) {
      query += ` AND u.nip56_totalGrapeRankScore <= ${parseFloat(filterMaxNip56TotalGrapeRankScore)}`;
    }

    if (filterMinNip56TotalReportCount) {
      query += ` AND u.nip56_totalReportCount >= ${parseFloat(filterMinNip56TotalReportCount)}`;
    }
    
    if (filterMaxNip56TotalReportCount) {
      query += ` AND u.nip56_totalReportCount <= ${parseFloat(filterMaxNip56TotalReportCount)}`;
    }

    if (filterMinNip56TotalVerifiedReportCount) {
      query += ` AND u.nip56_totalVerifiedReportCount >= ${parseFloat(filterMinNip56TotalVerifiedReportCount)}`;
    }
    
    if (filterMaxNip56TotalVerifiedReportCount) {
      query += ` AND u.nip56_totalVerifiedReportCount <= ${parseFloat(filterMaxNip56TotalVerifiedReportCount)}`;
    }

    if (filterMinLatestContentEventCreatedAt) {
      query += ` AND u.latestContentEventCreatedAt >= ${filterMinLatestContentEventCreatedAt}`;
    }
    
    if (filterMaxLatestContentEventCreatedAt) {
      query += ` AND u.latestContentEventCreatedAt <= ${filterMaxLatestContentEventCreatedAt}`;
    }

    if (filterNpub) {
      query += ` AND u.npub CONTAINS '${filterNpub}'`;
    }

    if (filterPubkey) {
      query += ` AND u.pubkey CONTAINS '${filterPubkey}'`;
    }
    
    // Add count query for pagination
    const countQuery = query + ` RETURN count(u) as total`;
    
    // Add sorting and pagination to the main query
    if (observerPubkey == "owner") {
      query += `
        RETURN u.pubkey as pubkey, 
            u.npub as npub,
            u.personalizedPageRank as personalizedPageRank,
            u.hops as hops,
            u.influence as influence,
            u.average as average,
            u.confidence as confidence,
            u.input as input,
            u.followerCount as followerCount,
            u.followingCount as followingCount,
            u.verifiedFollowerCount as verifiedFollowerCount,
            u.followerInput as followerInput,
            u.muterCount as muterCount,
            u.mutingCount as mutingCount,
            u.verifiedMuterCount as verifiedMuterCount,
            u.muterInput as muterInput,
            u.reportingCount as reportingCount,
            u.reporterCount as reporterCount,
            u.verifiedReporterCount as verifiedReporterCount,
            u.reporterInput as reporterInput,
            u.nip56_totalGrapeRankScore as nip56_totalGrapeRankScore,
            u.nip56_totalReportCount as nip56_totalReportCount,
            u.nip56_totalVerifiedReportCount as nip56_totalVerifiedReportCount,
            u.latestContentEventCreatedAt as latestContentEventCreatedAt
        `;
    } else {
      query += `
        RETURN u.observee_pubkey as pubkey,
            n.npub as npub,
            u.hops as hops,
            u.influence as influence,
            u.average as average,
            u.confidence as confidence,
            u.input as input,
            u.personalizedPageRank as personalizedPageRank,
            n.followerCount as followerCount,
            n.followingCount as followingCount,
            n.muterCount as muterCount,
            n.mutingCount as mutingCount,
            n.reporterCount as reporterCount,
            n.reportingCount as reportingCount,
            u.verifiedFollowerCount as verifiedFollowerCount,
            u.verifiedMuterCount as verifiedMuterCount,
            u.verifiedReporterCount as verifiedReporterCount,
            u.followerInput as followerInput,
            u.muterInput as muterInput,
            u.reporterInput as reporterInput
      `;
    }

    // Define numeric columns that need to be cast for proper sorting
    const numericColumns = [
      'followingCount', 'mutingCount', 'reportingCount',
      'followerCount', 'muterCount', 'reporterCount',
      'verifiedFollowerCount', 'verifiedMuterCount', 'verifiedReporterCount',
      'followerInput', 'muterInput', 'reporterInput',
      'personalizedPageRank', 'hops', 'influence', 'average', 'confidence', 'input',
      'nip56_totalGrapeRankScore', 'nip56_totalVerifiedReportCount', 'nip56_totalReportCount',
      'latestContentEventCreatedAt'
    ];
    
    // Use proper casting for numeric columns in ORDER BY
    const orderByClause = numericColumns.includes(sortBy) 
      ? `toFloat(u.${sortBy})` 
      : `u.${sortBy}`;
    
    query += `
      ORDER BY ${orderByClause} ${sortOrder}
      SKIP ${(page - 1) * limit}
      LIMIT ${limit}
    `;
    
    // Execute count query first
    session.run(countQuery)
      .then(countResult => {
        const total = parseInt(countResult.records[0].get('total').toString());
        
        // Get the total count (unfiltered)
        return session.run('MATCH (u:NostrUser) WHERE u.pubkey IS NOT NULL RETURN count(u) as totalProfiles')
          .then(totalCountResult => {
            const totalProfiles = parseInt(totalCountResult.records[0].get('totalProfiles').toString());
            
            // Then execute the main query
            return session.run(query)
              .then(result => {
                const users = result.records.map(record => {
                  if (observerPubkey == "owner") {
                    return {
                      pubkey: record.get('pubkey'),
                      npub: record.get('npub'),
                      personalizedPageRank: record.get('personalizedPageRank') ? parseFloat(record.get('personalizedPageRank').toString()) : null,
                      hops: record.get('hops') ? parseInt(record.get('hops').toString()) : null,
                      influence: record.get('influence') ? parseFloat(record.get('influence').toString()) : null,
                      average: record.get('average') ? parseFloat(record.get('average').toString()) : null,
                      confidence: record.get('confidence') ? parseFloat(record.get('confidence').toString()) : null,
                      input: record.get('input') ? parseFloat(record.get('input').toString()) : null,
                      followerCount: record.get('followerCount') ? parseInt(record.get('followerCount').toString()) : 0,
                      followingCount: record.get('followingCount') ? parseInt(record.get('followingCount').toString()) : 0,
                      muterCount: record.get('muterCount') ? parseInt(record.get('muterCount').toString()) : 0,
                      mutingCount: record.get('mutingCount') ? parseInt(record.get('mutingCount').toString()) : 0,
                      reporterCount: record.get('reporterCount') ? parseInt(record.get('reporterCount').toString()) : 0,
                      reportingCount: record.get('reportingCount') ? parseInt(record.get('reportingCount').toString()) : 0,
                      verifiedFollowerCount: record.get('verifiedFollowerCount') ? parseInt(record.get('verifiedFollowerCount').toString()) : 0,
                      verifiedMuterCount: record.get('verifiedMuterCount') ? parseInt(record.get('verifiedMuterCount').toString()) : 0,
                      verifiedReporterCount: record.get('verifiedReporterCount') ? parseInt(record.get('verifiedReporterCount').toString()) : 0,
                      followerInput: record.get('followerInput') ? parseFloat(record.get('followerInput').toString()) : null,
                      muterInput: record.get('muterInput') ? parseFloat(record.get('muterInput').toString()) : null,
                      reporterInput: record.get('reporterInput') ? parseFloat(record.get('reporterInput').toString()) : null,
                      nip56_totalGrapeRankScore: record.get('nip56_totalGrapeRankScore') ? parseFloat(record.get('nip56_totalGrapeRankScore').toString()) : null,
                      nip56_totalReportCount: record.get('nip56_totalReportCount') ? parseInt(record.get('nip56_totalReportCount').toString()) : null,
                      nip56_totalVerifiedReportCount: record.get('nip56_totalVerifiedReportCount') ? parseFloat(record.get('nip56_totalVerifiedReportCount').toString()) : null,
                      latestContentEventCreatedAt: record.get('latestContentEventCreatedAt') ? parseInt(record.get('latestContentEventCreatedAt').toString()) : null
                    };
                  } else {
                    return {
                      pubkey: record.get('pubkey'),
                      npub: record.get('npub'),
                      personalizedPageRank: record.get('personalizedPageRank') ? parseFloat(record.get('personalizedPageRank').toString()) : null,
                      hops: record.get('hops') ? parseInt(record.get('hops').toString()) : null,
                      influence: record.get('influence') ? parseFloat(record.get('influence').toString()) : null,
                      average: record.get('average') ? parseFloat(record.get('average').toString()) : null,
                      confidence: record.get('confidence') ? parseFloat(record.get('confidence').toString()) : null,
                      input: record.get('input') ? parseFloat(record.get('input').toString()) : null,
                      followerCount: record.get('followerCount') ? parseInt(record.get('followerCount').toString()) : 0,
                      followingCount: record.get('followingCount') ? parseInt(record.get('followingCount').toString()) : 0,
                      muterCount: record.get('muterCount') ? parseInt(record.get('muterCount').toString()) : 0,
                      mutingCount: record.get('mutingCount') ? parseInt(record.get('mutingCount').toString()) : 0,
                      reporterCount: record.get('reporterCount') ? parseInt(record.get('reporterCount').toString()) : 0,
                      reportingCount: record.get('reportingCount') ? parseInt(record.get('reportingCount').toString()) : 0,
                      verifiedFollowerCount: record.get('verifiedFollowerCount') ? parseInt(record.get('verifiedFollowerCount').toString()) : 0,
                      verifiedMuterCount: record.get('verifiedMuterCount') ? parseInt(record.get('verifiedMuterCount').toString()) : 0,
                      verifiedReporterCount: record.get('verifiedReporterCount') ? parseInt(record.get('verifiedReporterCount').toString()) : 0,
                      followerInput: record.get('followerInput') ? parseFloat(record.get('followerInput').toString()) : null,
                      muterInput: record.get('muterInput') ? parseFloat(record.get('muterInput').toString()) : null,
                      reporterInput: record.get('reporterInput') ? parseFloat(record.get('reporterInput').toString()) : null
                    };
                  }
                });
                
                // Calculate pagination metadata
                const pages = Math.ceil(total / limit);
                
                // Send the response
                res.json({
                  success: true,
                  data: {
                    cypherQuery: query,
                    pagination: {
                      total,
                      page,
                      limit,
                      pages
                    },
                    totalProfiles: totalProfiles,
                    users
                  }
                });
              });
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
    console.error('Error in handleGetProfiles:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

module.exports = {
  handleGetProfiles
};
