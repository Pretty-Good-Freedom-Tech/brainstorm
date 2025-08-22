/**
 * NostrUser Validation Queries
 * handles endpoint: /api/validate-encoding?inputString=...
 * Uses nip19 to determine whether the input string is or is not a valid:
 * npub, pubkey, nsec, nprofile, nevent, naddr
 * returns:
 * success: true or false
 * type: npub, pubkey, nsec, nprofile, nevent, naddr, or null
 * inputString: the input string
 * pubkey: the pubkey if the input string is a valid pubkey
 * npub: the npub if the input string is a valid npub
 * validDecode: true or false
 * nip19DecodeData: the decoded data if the input string is a valid npub, pubkey, nsec, nprofile, nevent, or naddr
 */

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
    let validInputString = false
    let inputStringType = null
    let pubkey = null
    let npub = null

    if (!inputString) {
      return res.status(400).json({ error: 'Missing inputString parameter' });
    }

    // Use nip19 to decode inputString
    let nip19DecodeData = {}
    let validDecode = false
    try {
        nip19DecodeData = nip19.decode(inputString)
        validDecode = true
        validInputString = true
        inputStringType = nip19DecodeData.type
    } catch (error) {
        validDecode = false
    }

    // Use nip19 to encode inputString as npub
    let npubEncodeData = {}
    let validPubkey = false
    try {
        npubEncodeData = nip19.npubEncode(inputString)
        validPubkey = true
        validInputString = true
        inputStringType = 'pubkey'
        pubkey = inputString
        npub = npubEncodeData
    } catch (error) {
      validPubkey = false
    }

    res.status(200).json({
      success: true,
      inputString,
      validInputString,
      inputStringType,
      pubkey,
      npub,
      validDecode,
      nip19DecodeData,
      validPubkey,
      npubEncodeData
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