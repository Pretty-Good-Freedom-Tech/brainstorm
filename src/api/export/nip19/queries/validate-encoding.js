/**
 * NostrUser Validation Queries
 * handles endpoint: /api/validate-encoding?inputString=...
 * Uses nip19 to determine whether the input string is or is not a valid:
 * npub, pubkey, nsec, nprofile, nevent, naddr
 * returns:
 * success: true or false
 * type: npub, pubkey, nsec, nprofile, nevent, naddr, or null
 * inputString: the input string
 * alternateEncodings: array of alternate encodings
 * Example: if the input string is a valid npub, the alternate encodings would be [pubkey, nprofile]
 * if the input string is a valid pubkey, the alternate encodings would be [npub, nprofile]
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
function handleValidateEncoding(req, res) {
  try {
    // Get query parameters for filtering
    const inputString = req.query.inputString;
    let inputStringType = null
    let alternateEncodings = {}

    if (!inputString) {
      return res.status(400).json({ error: 'Missing inputString parameter' });
    }

    // Use nip19 to validate inputString
    const nip19DecodeData = nip19.decode(inputString)
    // inputStringType = nip19DecodeData.type;

    /*
    // use nip19 to encode inputString
    const encoded = nip19.npubEncode(inputString);
    if (encoded != inputString) {
      return res.status(400).json({ error: 'Invalid inputString parameter' });
    }

    if (inputStringType == 'npub') {
        alternateEncodings = {
            npub: inputString,
            pubkey: nip19.npubEncode(inputString),
            nprofile: nip19.nprofileEncode(inputString)
        }
    } else if (inputStringType == 'pubkey') {
        alternateEncodings = {
            npub: inputString,
            pubkey: nip19.npubEncode(inputString),
            nprofile: nip19.nprofileEncode(inputString)
        }
    }
    */

    res.status(200).json({
      success: true,
      inputString,
      nip19DecodeData,
      alternateEncodings
    });
  } catch (error) {
    console.error('Error in handleValidateEncoding:', error);
    res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`
    });
  }
}

module.exports = {
  handleValidateEncoding
};