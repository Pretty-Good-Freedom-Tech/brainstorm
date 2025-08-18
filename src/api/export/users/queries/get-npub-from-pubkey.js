/**
 * NostrUser Data Queries
 * Handles retrieval of individual NostrUser data from Neo4j
 * handles endpoint: /api/get-npub-from-pubkey
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
function handleGetNpubFromPubkey(req, res) {
  try {
    // Get query parameters for filtering
    const pubkey = req.query.pubkey;

    if (!pubkey) {
      return res.status(400).json({ error: 'Missing pubkey parameter' });
    }

    // Use nip19 to validate pubkey
    const npub1 = nip19.npubEncode(pubkey);
    // if string does not start with 'npub'
    if (!npub1.startsWith('npub')) {
      return res.status(400).json({ error: 'Invalid pubkey parameter' });
    }

    res.status(200).json({
      success: true,
      pubkey: pubkey,
      npub: npub1
    });
  } catch (error) {
    console.error('Error in handleGetNpubFromPubkey:', error);
    res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`
    });
  }
}

module.exports = {
  handleGetNpubFromPubkey
};