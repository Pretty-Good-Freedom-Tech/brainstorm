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
    let encodings = {}

    if (!inputString) {
      return res.status(400).json({ error: 'Missing inputString parameter' });
    }

    // Use nip19 to decode inputString
    let nip19DecodeData = {}

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

    // if inputString is a valid pubkey, encode it as npub and nprofile
    // Use nip19 to encode inputString as npub
    let npubEncodeData = {}
    let nprofileEncodeData = {}

    try {
        npubEncodeData = nip19.npubEncode(inputString)
        nprofileEncodeData = nip19.nprofileEncode(inputString)
        validInputString = true
        inputStringType = 'pubkey'
        encodings.pubkey = inputString
        encodings.npub = npubEncodeData
        encodings.nprofile = nprofileEncodeData
    } catch (error) {

    }

    res.status(200).json({
      success: true,
      data: {
        inputString,
        valid: validInputString,
        inputStringType,
        encodings,
        nip19DecodeData,
        npubEncodeData,
        nprofileEncodeData
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