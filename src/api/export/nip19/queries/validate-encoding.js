/**
 * NostrUser Validation Queries
 * handles endpoint: /api/validate-encoding?inputString=...
 * Uses nip19 to determine whether the input string is a valid pubkey or npub
 * If valid, returns npub and pubkey
 * If not valid, returns null for both npub and pubkey
 * TODO: support for nprofile
 * TODO: support for note, nevent, naddr
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
    let nip19DecodeData = {}
    let npubEncodeData = null
    let nprofileEncodeData = null
    let encodings = {}

    if (!inputString) {
      return res.status(400).json({ error: 'Missing inputString parameter' });
    }

    // First check if if inputString is a valid pubkey
    // If so, then use nip19 to encode npub and nprofile
    try {
        npubEncodeData = nip19.npubEncode(inputString)
        validInputString = true
        inputStringType = 'pubkey'
        encodings.pubkey = inputString
        encodings.npub = npubEncodeData
    } catch (error) {

    }

    // If inputString is not a valid pubkey, then use nip19 to decode inputString
    // Use nip19 to decode inputString
    if (!validInputString) {
      try {
          nip19DecodeData = nip19.decode(inputString)
          validInputString = true
          inputStringType = nip19DecodeData.type
          if (inputStringType === 'npub') {
              encodings.pubkey = nip19DecodeData.data
              encodings.npub = inputString
          }
          if (inputStringType === 'nprofile') {
            encodings.pubkey = nip19DecodeData.data
            encodings.nprofile = inputString
        }
      } catch (error) {

      }
    }

    res.status(200).json({
      success: true,
      data: {
        inputString,
        valid: validInputString,
        inputStringType,
        encodings
      }
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