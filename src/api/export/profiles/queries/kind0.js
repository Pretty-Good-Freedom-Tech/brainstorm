/**
 * Nostr Profiles Kind 0 Queries
 * Handles retrieval of kind 0 profile events
 */

const { exec } = require('child_process');
const { getConfigFromFile } = require('../../../../utils/config');
const neo4j = require('neo4j-driver');

// Check if NDK is available or needs to be imported
let NDK;
try {
    NDK = require('@nostr-dev-kit/ndk').NDK;
} catch (error) {
    console.warn('NDK not available for import, external relay fetching will not work');
}

/**
 * Get Kind 0 profile event for a pubkey
 * Tries to fetch from local strfry first, then external relays, then Neo4j
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetKind0Event(req, res) {
  try {
    // Get query parameters for filtering
    const pubkey = req.query.pubkey;
    
    if (!pubkey) {
      return res.status(400).json({
        success: false,
        message: 'Missing pubkey parameter'
      });
    }
    
    // Define the relays to query
    const relays = [
      'wss://relay.brainstorm.com',
      'wss://profiles.nostr1.com',
      'wss://relay.nostr.band',
      'wss://relay.damus.io',
      'wss://relay.primal.net'
    ];
    
    // First try to get the event from our local strfry relay
    const strfryCommand = `sudo strfry scan '{"kinds":[0],"authors":["${pubkey}"],"limit":1}'`;
    
    exec(strfryCommand, (error, stdout, stderr) => {
      if (error) {
        console.log(`Local strfry query failed, trying external relays: ${stderr || error.message}`);
        // If local strfry fails, continue to external relays
        fetchFromExternalRelays();
        return;
      }
      
      try {
        // Parse the JSON output from the script
        const events = stdout.trim().split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
        
        if (events.length > 0) {
          // Return the most recent event from local strfry
          return res.json({
            success: true,
            data: events[0],
            source: 'local_strfry'
          });
        } else {
          console.log('No kind 0 events found via local strfry, trying external relays');
          // If no events found, try external relays
          fetchFromExternalRelays();
        }
      } catch (parseError) {
        console.log('Error parsing strfry output, trying external relays:', parseError);
        // If parsing fails, continue to external relays
        fetchFromExternalRelays();
      }
    });
    
    // Function to fetch from external relays using NDK
    async function fetchFromExternalRelays() {
      console.log(`Fetching kind 0 event for ${pubkey} from external relays using NDK...`);
      
      // If NDK is not available, skip to Neo4j
      if (!NDK) {
        console.log('NDK not available, skipping external relay fetch');
        checkNeo4j();
        return;
      }
      
      try {
        // Initialize NDK with the relays
        console.log('Initializing NDK with relays:', relays);
        const ndk = new NDK({
          explicitRelayUrls: relays
        });
        
        // Connect to relays
        console.log('Attempting to connect to relays via NDK...');
        try {
          await ndk.connect();
          console.log('Successfully connected to relays via NDK');
        } catch (connectError) {
          console.error('Error connecting to relays via NDK:', connectError);
          throw connectError;
        }
        
        // Set a timeout to ensure we don't wait forever
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('NDK fetch timeout after 10 seconds')), 10000);
        });
        
        // Create a filter for the kind 0 event
        const filter = {
          kinds: [0],
          authors: [pubkey],
          limit: 1
        };
        console.log('Using filter:', JSON.stringify(filter));
        
        // Fetch the events with a timeout
        console.log('Fetching events from relays...');
        let fetchPromise;
        try {
          fetchPromise = ndk.fetchEvents(filter);
        } catch (fetchError) {
          console.error('Error creating fetch promise:', fetchError);
          throw fetchError;
        }
        
        // Race between fetch and timeout
        console.log('Waiting for events or timeout...');
        const events = await Promise.race([fetchPromise, timeoutPromise]);
        
        // Convert the NDK events to an array
        console.log('Processing events received from relays...');
        const eventArray = Array.from(events || []);
        console.log(`Found ${eventArray.length} events`);
        
        if (eventArray.length > 0) {
          // Get the raw event data
          const rawEvent = eventArray[0].rawEvent();
          console.log('Found kind 0 event via NDK:', JSON.stringify(rawEvent).substring(0, 100) + '...');
          
          // Return the event
          return res.json({
            success: true,
            data: rawEvent,
            source: 'ndk_external_relay'
          });
        } else {
          console.log('No kind 0 events found via NDK, checking Neo4j');
          // If no events found, check Neo4j
          checkNeo4j();
        }
      } catch (error) {
        console.error('Error fetching from external relays via NDK:', error);
        console.error('Error details:', error.stack || 'No stack trace available');
        console.log('Falling back to Neo4j due to NDK error');
        // If NDK fetch fails, check Neo4j
        checkNeo4j();
      }
    }
    
    // Function to check Neo4j for metadata
    function checkNeo4j() {
      console.log(`Checking Neo4j for metadata for ${pubkey}`);
      
      // Create Neo4j driver
      const neo4jUri = getConfigFromFile('NEO4J_URI', 'bolt://localhost:7687');
      const neo4jUser = getConfigFromFile('NEO4J_USER', 'neo4j');
      const neo4jPassword = getConfigFromFile('NEO4J_PASSWORD', 'neo4j');
      
      const driver = neo4j.driver(
        neo4jUri,
        neo4j.auth.basic(neo4jUser, neo4jPassword)
      );
      
      const session = driver.session();
      
      // Query for any metadata we might have stored
      const query = `
        MATCH (u:NostrUser {pubkey: $pubkey})
        RETURN u.metadata as metadata
      `;
      
      session.run(query, { pubkey })
        .then(result => {
          if (result.records.length > 0 && result.records[0].get('metadata')) {
            try {
              // If we have metadata stored in Neo4j, use that
              const metadata = result.records[0].get('metadata');
              const metadataObj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
              
              // Construct a kind 0 event from the metadata
              const kind0Event = {
                kind: 0,
                pubkey: pubkey,
                content: JSON.stringify(metadataObj),
                created_at: Math.floor(Date.now() / 1000),
                tags: []
              };
              
              return res.json({
                success: true,
                data: kind0Event,
                source: 'neo4j'
              });
            } catch (parseError) {
              console.error('Error parsing metadata from Neo4j:', parseError);
              return res.json({
                success: false,
                message: 'No profile data found for this user'
              });
            }
          } else {
            // If no metadata in Neo4j, return empty
            return res.json({
              success: false,
              message: 'No profile data found for this user'
            });
          }
        })
        .catch(neo4jError => {
          console.error('Error querying Neo4j:', neo4jError);
          return res.status(500).json({
            success: false,
            message: `Error querying Neo4j: ${neo4jError.message}`
          });
        })
        .finally(() => {
          session.close();
          driver.close();
        });
    }
  } catch (error) {
    console.error('Error in handleGetKind0Event:', error);
    res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`
    });
  }
}

module.exports = {
  handleGetKind0Event
};
