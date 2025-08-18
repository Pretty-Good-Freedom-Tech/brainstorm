/**
 * NostrUser Data Queries
 * Handles retrieval of individual NostrUser data from Neo4j
 * handles endpoint: /api/get-pubkey-from-npub
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
function handleGetPubkeyFromNpub(req, res) {
  try {
    // Get query parameters for filtering
    const npub = req.query.npub;

    if (!npub) {
      return res.status(400).json({ error: 'Missing npub parameter' });
    }

    // Use nip19 to validate npub
    const data = nip19.decode(npub);
    // if string does not start with 'npub'
    if (!data.type.startsWith('npub')) {
      // return res.status(400).json({ error: 'Invalid npub parameter' });
    }

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error in handleGetPubkeyFromNpub:', error);
    res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`
    });
  }
}

module.exports = {
  handleGetPubkeyFromNpub
};