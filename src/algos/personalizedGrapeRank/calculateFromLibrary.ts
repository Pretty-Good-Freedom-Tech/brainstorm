import { Calculator } from '@graperank/calculator';
import { execSync } from 'child_process';
import { CalculatorParams, protocol, ProtocolParams, ProtocolRequest, Rating, RatingsList, ScorecardsEntry } from '@graperank/util/types';
import neo4j from 'neo4j-driver';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
// const { Calculator } = require('/usr/local/lib/node_modules/graperank/src/Calculator/index.js');

const TEMP_DIR = '/var/lib/hasenpfeffr/algos/personalizedGrapeRank/tmp';
const CONTEXT = 'verifiedUsers';
const CONFIG_FILES = {
  graperank: '/etc/graperank.conf',
  hasenpfeffr: '/etc/hasenpfeffr.conf'
};

const observer = getPubkey();
const ratings = parseRatings();
const params = getCalculatorParams();
const calculator = new Calculator(observer,ratings,params)
calculator.calculate().then((scorecards) => {
  console.log(`scorecards.length: ${scorecards.length}`)
  updateNeo4j(scorecards);
})





function getCalculatorParams() : Partial<CalculatorParams> {
  const params = execSync(`source ${CONFIG_FILES.graperank} && echo $RIGOR,$ATTENUATION_FACTOR`, { 
    shell: '/bin/bash',
    encoding: 'utf8' 
  }).trim().split(',');
  
  return {
    rigor: parseFloat(params[0]),
    attenuation: parseFloat(params[1]),
  }
}

function getPubkey(){
      // Load Hasenpfeffr config
      return execSync(`source ${CONFIG_FILES.hasenpfeffr} && echo $HASENPFEFFR_OWNER_PUBKEY`, { 
        shell: '/bin/bash',
        encoding: 'utf8' 
      }).trim();
}


function getConfig() : Map<protocol,ProtocolParams> {
  try {
    // Load GrapeRank config
    const graperankConfig = execSync(`source ${CONFIG_FILES.graperank} && echo $FOLLOW_RATING,$FOLLOW_CONFIDENCE,$MUTE_RATING,$MUTE_CONFIDENCE,$REPORT_RATING,$REPORT_CONFIDENCE,$FOLLOW_CONFIDENCE_OF_OBSERVER`, { 
      shell: '/bin/bash',
      encoding: 'utf8' 
    }).trim().split(',');
    
    return new Map([
      ['nostr-follows' , {
        score: parseFloat(graperankConfig[0]),
        confidence: parseFloat(graperankConfig[1]),
        path : path.join(TEMP_DIR, 'follows.csv'),
      }],
      ['nostr-mutes' , {
        score: parseFloat(graperankConfig[2]),
        confidence: parseFloat(graperankConfig[3]),
        path : path.join(TEMP_DIR, 'mutes.csv'),
      }],
      ['nostr-reports' , {
        score: parseFloat(graperankConfig[4]),
        confidence: parseFloat(graperankConfig[5]),
        path : path.join(TEMP_DIR, 'reports.csv'),
      }]
      ]);
  } catch (error : any) {
    console.error(`Error loading configuration: ${error.message}`);
    process.exit(1);
  }
}

function parseRatings() : RatingsList {
  let ratings : RatingsList = [];
  let protocols = getConfig();
  protocols.forEach((params,protocol)=>{
    const fileStream = fs.createReadStream(params.path);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    // Skip header line
    let isFirstLine = true;

    // Process each line
    rl.on('line', (line : any) => {
      if (isFirstLine) {
        isFirstLine = false;
        return;
      }
          
      // Skip empty lines
      if (!line.trim()) return;
          
      // Parse line (format: "pk_rater","pk_ratee")
      const parts = line.split(',');
      if (parts.length < 2) return;
          
      const pk_rater = parts[0].replace(/"/g, '').trim();
      const pk_ratee = parts[1].replace(/"/g, '').trim();
          
      // Skip if either pubkey is empty
      if (!pk_rater || !pk_ratee) return;
          
      // Skip self-ratings (where pk_ratee equals pk_rater)
      if (pk_ratee === pk_rater) {
        return;
      }
      
      // Set the rating
      // ratings[CONTEXT][pk_ratee][pk_rater] = [rating, confidence];
      ratings.push({
        protocol, 
        ratee : pk_ratee,
        rater : pk_rater,
        score : params.score,
        confidence : params.confidence,
      } as Rating)
    });

  })
  return ratings;
}

// Update Neo4j with GrapeRank scores
async function updateNeo4j(scorecards : ScorecardsEntry[]) {
  const BATCH_SIZE = 500; // Number of users to update in a single batch
  // Get Neo4j configuration
  const neo4jConfig = getNeo4jConfig();
  console.log(`Using Neo4j URI: ${neo4jConfig.uri}`);
  console.log(`Using Neo4j username: ${neo4jConfig.username}`);
  
  const driver = neo4j.driver(
    neo4jConfig.uri,
    neo4j.auth.basic(neo4jConfig.username, neo4jConfig.password)
  );
  
  try {
    console.log('Connected to Neo4j');
    const session = driver.session();
    
    // Get all pubkeys
    // const pubkeys = Object.keys(scorecards);
    // console.log(`Updating ${pubkeys.length} users in Neo4j...`);
    
    // const batch = await sliceBigArray(scorecards, BATCH_SIZE);
    for (let i = 0; i < scorecards.length; i += BATCH_SIZE) {
      const batch = scorecards.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(scorecards.length/BATCH_SIZE)} (${batch.length} users)...`);
      
      const params = {
        updates: batch.map(entry => {
          let weights = 0
          Object.keys(entry[1].interpretersums || {}).forEach((protocol : any)=>{
            if(entry[1].interpretersums)
            weights += entry[1].interpretersums[protocol].weighted
          })

          let average = entry[1].score && entry[1].confidence  ? entry[1].score / entry[1].confidence : 0
          // const [influence, average, confidence, input] = scorecards[pubkey];
          return {
            pubkey : entry[0],
            influence : entry[1].score,
            average : average,
            confidence : entry[1].confidence,
            input : weights
          };
        })
      };
      
      // Update Neo4j
      const result = await session.run(`
        UNWIND $updates AS update
        MATCH (u:NostrUser {pubkey: update.pubkey})
        SET u.influence = update.influence,
            u.average = update.average,
            u.confidence = update.confidence,
            u.input = update.input
        RETURN count(u) AS updatedCount
      `, params);
      
      const updatedCount = result.records[0].get('updatedCount').toNumber();
      console.log(`Updated ${updatedCount} users in this batch`);
    }
    
    await session.close();
    console.log('Neo4j update completed successfully');
  } catch (error : any) {
    console.error(`Error updating Neo4j: ${error.message}`);
    process.exit(1);
  } finally {
    await driver.close();
  }
}

// Get Neo4j configuration from hasenpfeffr.conf
function getNeo4jConfig() {
  try {
    // Load Neo4j connection details from hasenpfeffr.conf
    const neo4jUri = execSync(`source ${CONFIG_FILES.hasenpfeffr} && echo $NEO4J_URI`, { 
      shell: '/bin/bash',
      encoding: 'utf8' 
    }).trim();
    
    const neo4jUsername = execSync(`source ${CONFIG_FILES.hasenpfeffr} && echo $NEO4J_USER`, { 
      shell: '/bin/bash',
      encoding: 'utf8' 
    }).trim();
    
    const neo4jPassword = execSync(`source ${CONFIG_FILES.hasenpfeffr} && echo $NEO4J_PASSWORD`, { 
      shell: '/bin/bash',
      encoding: 'utf8' 
    }).trim();
    
    if (!neo4jUri || !neo4jUsername || !neo4jPassword) {
      throw new Error('Missing Neo4j connection details in hasenpfeffr.conf. Please ensure NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD are defined.');
    }
    
    return {
      uri: neo4jUri,
      username: neo4jUsername,
      password: neo4jPassword
    };
  } catch (error : any) {
    console.error(`Error loading Neo4j configuration: ${error.message}`);
    process.exit(1);
  }
}