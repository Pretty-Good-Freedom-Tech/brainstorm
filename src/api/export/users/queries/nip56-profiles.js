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
    // Get query parameters
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

    // Cypher query (main): return all profiles for this report type, with null/missing values defaulted to 0
    const cypher = `
      MATCH (n:NostrUser)
      WHERE n.nip56_${reportType}_reportCount > 0
      RETURN n.pubkey AS pubkey,
             coalesce(n.nip56_${reportType}_reportCount, 0) AS totalCount,
             coalesce(n.nip56_${reportType}_grapeRankScore, 0) AS grapeRankScore,
             coalesce(n.nip56_${reportType}_verifiedReportCount, 0) AS totalVerifiedCount,
             coalesce(n.influence, 0) AS influence,
             coalesce(n.verifiedFollowerCount, 0) AS verifiedFollowerCount
      ORDER BY grapeRankScore DESC
    `;
    // Cypher query (count)
    const countCypher = `
      MATCH (n:NostrUser)
      WHERE n.nip56_${reportType}_reportCount > 0
      RETURN count(n) AS total
    `;

    // Run queries sequentially, closing and reopening session as in profiles.js
    session.run(countCypher)
      .then(countResult => {
        const total = countResult.records[0].get('total').toNumber();
        session.close();
        const session2 = driver.session();
        return session2.run(cypher)
          .then(result => {
            session2.close();
            driver.close();
            const profiles = result.records.map(r => ({
              pubkey: r.get('pubkey'),
              totalCount: typeof r.get('totalCount') === 'object' && r.get('totalCount') !== null && typeof r.get('totalCount').toNumber === 'function' ? r.get('totalCount').toNumber() : r.get('totalCount'),
              grapeRankScore: typeof r.get('grapeRankScore') === 'object' && r.get('grapeRankScore') !== null && typeof r.get('grapeRankScore').toNumber === 'function' ? r.get('grapeRankScore').toNumber() : r.get('grapeRankScore'),
              totalVerifiedCount: typeof r.get('totalVerifiedCount') === 'object' && r.get('totalVerifiedCount') !== null && typeof r.get('totalVerifiedCount').toNumber === 'function' ? r.get('totalVerifiedCount').toNumber() : r.get('totalVerifiedCount'),
              influence: typeof r.get('influence') === 'object' && r.get('influence') !== null && typeof r.get('influence').toNumber === 'function' ? r.get('influence').toNumber() : r.get('influence'),
              verifiedFollowerCount: typeof r.get('verifiedFollowerCount') === 'object' && r.get('verifiedFollowerCount') !== null && typeof r.get('verifiedFollowerCount').toNumber === 'function' ? r.get('verifiedFollowerCount').toNumber() : r.get('verifiedFollowerCount')
            }));
            res.json({ success: true, data: { profiles, total } });
          });
      })
      .catch(e => {
        session.close();
        driver.close();
        res.status(500).json({ success: false, message: e.message });
      });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

module.exports = {
  handleGetNip56Profiles
};
