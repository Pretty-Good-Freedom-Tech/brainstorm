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
    // Get query parameters for filtering and pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const sortBy = req.query.sortBy || 'influence';
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    // Get all filter parameters
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
    const filterMinVerifiedFollowers = req.query.filterMinVerifiedFollowers || '';
    const filterMaxVerifiedFollowers = req.query.filterMaxVerifiedFollowers || '';
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
    
    // Build the Cypher query with filters
    let query = `
      MATCH (u:NostrUser)
      WHERE u.pubkey IS NOT NULL
    `;
    
    // Add filters if provided
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
    
    if (filterMinVerifiedFollowers) {
      query += ` AND u.verifiedFollowerCount >= ${parseInt(filterMinVerifiedFollowers)}`;
    }
    
    if (filterMaxVerifiedFollowers) {
      query += ` AND u.verifiedFollowerCount <= ${parseInt(filterMaxVerifiedFollowers)}`;
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

    if (filterPubkey) {
      query += ` AND u.pubkey CONTAINS '${filterPubkey}'`;
    }
    
    // Add count query for pagination
    const countQuery = query + ` RETURN count(u) as total`;
    
    // Add sorting and pagination to the main query
    query += `
      RETURN u.pubkey as pubkey,
             u.personalizedPageRank as personalizedPageRank,
             u.hops as hops,
             u.influence as influence,
             u.average as average,
             u.confidence as confidence,
             u.input as input,
             u.mutingCount as mutingCount,
             u.muterCount as muterCount,
             u.reportingCount as reportingCount,
             u.reporterCount as reporterCount,
             u.verifiedFollowerCount as verifiedFollowerCount,
             u.nip56_totalGrapeRankScore as nip56_totalGrapeRankScore,
             u.nip56_totalReportCount as nip56_totalReportCount,
             u.nip56_totalVerifiedReportCount as nip56_totalVerifiedReportCount,
             u.latestContentEventCreatedAt as latestContentEventCreatedAt
      ORDER BY u.${sortBy} ${sortOrder}
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
                  return {
                    pubkey: record.get('pubkey'),
                    personalizedPageRank: record.get('personalizedPageRank') ? parseFloat(record.get('personalizedPageRank').toString()) : null,
                    hops: record.get('hops') ? parseInt(record.get('hops').toString()) : null,
                    influence: record.get('influence') ? parseFloat(record.get('influence').toString()) : null,
                    average: record.get('average') ? parseFloat(record.get('average').toString()) : null,
                    confidence: record.get('confidence') ? parseFloat(record.get('confidence').toString()) : null,
                    input: record.get('input') ? parseFloat(record.get('input').toString()) : null,
                    mutingCount: record.get('mutingCount') ? parseInt(record.get('mutingCount').toString()) : 0,
                    muterCount: record.get('muterCount') ? parseInt(record.get('muterCount').toString()) : 0,
                    reportingCount: record.get('reportingCount') ? parseInt(record.get('reportingCount').toString()) : 0,
                    reporterCount: record.get('reporterCount') ? parseInt(record.get('reporterCount').toString()) : 0,
                    verifiedFollowerCount: record.get('verifiedFollowerCount') ? parseInt(record.get('verifiedFollowerCount').toString()) : 0,
                    nip56_totalGrapeRankScore: record.get('nip56_totalGrapeRankScore') ? parseFloat(record.get('nip56_totalGrapeRankScore').toString()) : null,
                    nip56_totalReportCount: record.get('nip56_totalReportCount') ? parseInt(record.get('nip56_totalReportCount').toString()) : null,
                    nip56_totalVerifiedReportCount: record.get('nip56_totalVerifiedReportCount') ? parseFloat(record.get('nip56_totalVerifiedReportCount').toString()) : null,
                    latestContentEventCreatedAt: record.get('latestContentEventCreatedAt') ? parseInt(record.get('latestContentEventCreatedAt').toString()) : null
                  };
                });
                
                // Calculate pagination metadata
                const pages = Math.ceil(total / limit);
                
                // Send the response
                res.json({
                  success: true,
                  data: {
                    users,
                    pagination: {
                      total,
                      page,
                      limit,
                      pages
                    },
                    totalProfiles: totalProfiles
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
