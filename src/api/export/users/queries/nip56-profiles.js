/**
 * NostrUser NIP-56 Profiles Queries
 * Handles retrieval of NostrUser profiles from Neo4j according to the given reportType
 * The resulting profiles are those who have been reported
 * This page is created by copying profile.js and modifying it to handle NIP-56 profiles for the given reportType
 */

const neo4j = require('neo4j-driver');
const { getConfigFromFile } = require('../../../../utils/config');
const fs = require('fs');
const path = require('path');

/**
 * Get user profiles with pagination and filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetNip56Profiles(req, res) {
  try {
    // Get query parameters for filtering and pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const sortBy = req.query.sortBy || 'influence';
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    // Get reportType from query
    const reportType = req.query.reportType;
    if (!reportType) {
      return res.status(400).json({ success: false, message: 'Missing reportType parameter.' });
    }

    // Validate reportType against reportTypes.txt
    const reportTypesPath = path.resolve(__dirname, '../../../../algos/reports/reportTypes.txt');
    let validReportTypes;
    try {
      validReportTypes = fs.readFileSync(reportTypesPath, 'utf8').split(/\r?\n/).filter(Boolean);
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Could not read reportTypes.txt' });
    }
    if (!validReportTypes.includes(reportType)) {
      return res.status(400).json({ success: false, message: 'Invalid reportType.' });
    }

    // Neo4j connection
    const neo4jUri = getConfigFromFile('NEO4J_URI', 'bolt://localhost:7687');
    const neo4jUser = getConfigFromFile('NEO4J_USER', 'neo4j');
    const neo4jPassword = getConfigFromFile('NEO4J_PASSWORD', 'neo4j');
    const driver = neo4j.driver(neo4jUri, neo4j.auth.basic(neo4jUser, neo4jPassword));
    const session = driver.session();

    // Pagination & sorting
    const skip = (page - 1) * limit;
    const sortField = `nip56_${reportType}_grapeRankScore`;
    const allowedSortFields = [sortField, 'influence', 'verifiedFollowerCount', `nip56_${reportType}_totalCount`, `nip56_${reportType}_totalVerifiedCount`];
    const orderBy = allowedSortFields.includes(sortBy) ? sortBy : sortField;

    // Cypher query (main)
    const cypher = `
      MATCH (n:NostrUser)
      WHERE n.nip56_${reportType}_totalCount > 0
      RETURN n.pubkey AS pubkey,
             n.nip56_${reportType}_totalCount AS totalCount,
             n.nip56_${reportType}_grapeRankScore AS grapeRankScore,
             n.nip56_${reportType}_totalVerifiedCount AS totalVerifiedCount,
             n.influence AS influence,
             n.verifiedFollowerCount AS verifiedFollowerCount
      ORDER BY n.${orderBy} ${sortOrder}
      SKIP $skip
      LIMIT $limit
    `;
    // Cypher query (count)
    const countCypher = `
      MATCH (n:NostrUser)
      WHERE n.nip56_${reportType}_totalCount > 0
      RETURN count(n) AS total
    `;

    Promise.all([
      session.run(countCypher),
      session.run(cypher, { skip: neo4j.int(skip), limit: neo4j.int(limit) })
    ])
      .then(([countResult, result]) => {
        const total = countResult.records[0].get('total').toNumber();
        const profiles = result.records.map(r => ({
          pubkey: r.get('pubkey'),
          totalCount: r.get('totalCount')?.toNumber?.() ?? 0,
          grapeRankScore: r.get('grapeRankScore'),
          totalVerifiedCount: r.get('totalVerifiedCount')?.toNumber?.() ?? 0,
          influence: r.get('influence'),
          verifiedFollowerCount: r.get('verifiedFollowerCount')?.toNumber?.() ?? 0
        }));
        res.json({ success: true, data: { profiles, total } });
      })
      .catch(e => {
        res.status(500).json({ success: false, message: e.message });
      })
      .finally(() => session.close());
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

module.exports = {
  handleGetNip56Profiles
};
