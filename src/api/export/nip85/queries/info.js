/**
 * NIP-85 Information Queries
 * Handlers for retrieving information about NIP-85 events
 */

const { execSync } = require('child_process');
const { getConfigFromFile } = require('../../../../utils/config');

/**
 * Get information about Kind 10040 events
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleKind10040Info(req, res) {
  try {
    // Get owner pubkey from config
    const ownerPubkey = getConfigFromFile('HASENPFEFFR_OWNER_PUBKEY', '');
    const relayUrl = getConfigFromFile('HASENPFEFFR_RELAY_URL', '');
    
    if (!ownerPubkey) {
      return res.json({
        success: false,
        message: 'Owner pubkey not found in configuration'
      });
    }
    
    // Get most recent kind 10040 event
    const latestCmd = `sudo strfry scan '{"kinds":[10040], "authors":["${ownerPubkey}"], "limit": 1}'`;
    let latestEvent = null;
    let timestamp = null;
    let eventId = null;
    
    try {
      const output = execSync(latestCmd).toString().trim();
      if (output) {
        latestEvent = JSON.parse(output);
        timestamp = latestEvent.created_at;
        eventId = latestEvent.id;
      }
    } catch (error) {
      console.error('Error getting latest event:', error);
    }
    
    return res.json({
      success: true,
      timestamp: timestamp,
      eventId: eventId,
      latestEvent: latestEvent,
      relayUrl: relayUrl
    });
  } catch (error) {
    return res.json({
      success: false,
      message: `Error getting kind 10040 info: ${error.message}`
    });
  }
}

/**
 * Get information about Kind 30382 events
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleKind30382Info(req, res) {
  try {
    // Get relay pubkey from config
    const relayPubkey = getConfigFromFile('HASENPFEFFR_RELAY_PUBKEY', '');
    const relayUrl = getConfigFromFile('HASENPFEFFR_RELAY_URL', '');
    
    if (!relayPubkey) {
      return res.json({
        success: false,
        message: 'Relay pubkey not found in configuration'
      });
    }
    
    // Get count of kind 30382 events
    const countCmd = `sudo strfry scan --count '{"kinds":[30382], "authors":["${relayPubkey}"]}'`;
    let count = 0;
    try {
      count = parseInt(execSync(countCmd).toString().trim(), 10);
    } catch (error) {
      console.error('Error getting event count:', error);
    }
    
    // Get most recent kind 30382 event
    const latestCmd = `sudo strfry scan '{"kinds":[30382], "authors":["${relayPubkey}"], "limit": 1}'`;
    let latestEvent = null;
    let timestamp = null;
    
    try {
      const output = execSync(latestCmd).toString().trim();
      if (output) {
        latestEvent = JSON.parse(output);
        timestamp = latestEvent.created_at;
      }
    } catch (error) {
      console.error('Error getting latest event:', error);
    }
    
    return res.json({
      success: true,
      count: count,
      timestamp: timestamp,
      latestEvent: latestEvent,
      relayUrl: relayUrl
    });
  } catch (error) {
    return res.json({
      success: false,
      message: `Error getting kind 30382 info: ${error.message}`
    });
  }
}

module.exports = {
  handleKind10040Info,
  handleKind30382Info
};
