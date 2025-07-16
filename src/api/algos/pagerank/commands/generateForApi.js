/**
 * PageRank Generation and Return Command
 * Handles triggering the calculation of personalized PageRank data
 * The reference user is supplied as a query parameter
 * Results are returned as a JSON object
 * to call: 
 * <brainstorm url>/api/personalized-pagerank?pubkey=<pubkey>
 */

const { exec, execSync } = require('child_process');

/**
 * Generate PageRank data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGenerateForApiPageRank(req, res) {
  console.log('Generating PageRank data...');
  
  // Set a longer timeout for the response (3 minutes)
  req.setTimeout(180000); // 3 minutes in milliseconds
  res.setTimeout(180000);

  // retrieve pubkey as an argument
  const pubkey = req.query.pubkey;

  if (!pubkey) {
    return res.json({
      success: false,
      error: 'No pubkey provided'
    });
  }

  try {
    // Use exec with timeout options
    const child = exec('sudo /usr/local/lib/node_modules/brainstorm/src/algos/personalizedPageRankForApi.sh ' + pubkey, {
      timeout: 170000, // slightly less than the HTTP timeout
      maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
    }, (error, stdout, stderr) => {
    console.log('PageRank calculation completed');
        // fetch json file from /var/lib/brainstorm/api/personalizedPageRankForApi/<pubkey>/scores.json
        const filePath = '/var/lib/brainstorm/api/personalizedPageRankForApi/' + pubkey + '/scores.json';
        // const fileContent = fs.readFileSync(filePath, 'utf8');
        const fileContent = execSync('cat ' + filePath);
        const fileContentJson = JSON.parse(fileContent);
        
        if (error) {
          console.error('Error generating PageRank data:', error);
          return res.json({
            success: false,
            metaData: {
              pubkey: pubkey,
              about: 'PageRank scores for the given pubkey',
              use: '(Brainstorm base url)/api/personalized-pagerank?pubkey=abc123...'
            },
            error
          });
        }
        
        console.log('PageRank data generated successfully');
        return res.json({
          success: true,
          metaData: {
            pubkey: pubkey,
            about: 'PageRank scores for the given pubkey',
            use: '<Brainstorm base url>/api/personalized-pagerank?pubkey=<pubkey>'
          },
          data: {
            pageRankScores: fileContentJson
          }
        });
      });
    } catch (error) {
      console.error('Error generating PageRank data:', error);
      return res.json({
        success: false,
        metaData: {
          pubkey: pubkey,
          about: 'PageRank scores for the given pubkey',
          use: '<Brainstorm base url>/api/personalized-pagerank?pubkey=<pubkey>'
        },
        error
      });
    }
}

module.exports = {
  handleGenerateForApiPageRank
};
