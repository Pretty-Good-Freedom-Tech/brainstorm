/**
 * Get Customer Relay Keys - Owner Only
 * 
 * Returns relay keys for a specific customer (owner access only)
 */

const { getConfigFromFile } = require('../../../utils/config');
const { getCustomerRelayKeys } = require('../../../utils/customerRelayKeys');
const nostrTools = require('nostr-tools');

async function handleGetCustomerRelayKeys(req, res) {
  try {
    // Check if user is authenticated as owner
    const ownerPubkey = getConfigFromFile('BRAINSTORM_OWNER_PUBKEY', '');
    
    if (!req.session || !req.session.authenticated || !req.session.pubkey) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    if (req.session.pubkey !== ownerPubkey) {
      return res.status(403).json({
        success: false,
        message: 'Owner access required'
      });
    }
    
    // Get customer pubkey from query parameters
    const customerPubkey = req.query.pubkey;
    
    if (!customerPubkey) {
      return res.status(400).json({
        success: false,
        message: 'Customer pubkey is required'
      });
    }
    
    console.log(`Fetching relay keys for customer: ${customerPubkey.substring(0, 8)}...`);
    
    // Get relay keys from secure storage
    const relayKeys = await getCustomerRelayKeys(customerPubkey);
    
    if (!relayKeys) {
      return res.json({
        success: true,
        data: {
          found: false,
          pubkey: null,
          npub: null,
          nsec: null,
          privkey: null
        }
      });
    }
    
    // Convert keys to different formats
    let relayPubkey = '';
    let relayNpub = '';
    let relayNsec = relayKeys.nsec || '';
    let relayPrivkey = '';
    
    try {
      // If we have the private key in nsec format, convert it to hex
      if (relayNsec.startsWith('nsec')) {
        relayPrivkey = nostrTools.nip19.decode(relayNsec).data;
      } else {
        relayPrivkey = relayNsec;
      }
      
      // Derive the public key from the private key
      if (relayPrivkey) {
        relayPubkey = nostrTools.getPublicKey(relayPrivkey);
        relayNpub = nostrTools.nip19.npubEncode(relayPubkey);
      }
      
      // Ensure nsec format
      if (relayPrivkey && !relayNsec.startsWith('nsec')) {
        relayNsec = nostrTools.nip19.nsecEncode(relayPrivkey);
      }
      
    } catch (error) {
      console.error('Error processing relay keys:', error);
      return res.status(500).json({
        success: false,
        message: 'Error processing relay keys'
      });
    }
    
    res.json({
      success: true,
      data: {
        found: true,
        pubkey: relayPubkey,
        npub: relayNpub,
        nsec: relayNsec,
        privkey: relayPrivkey
      }
    });
    
  } catch (error) {
    console.error('Error fetching customer relay keys:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

module.exports = { handleGetCustomerRelayKeys };
