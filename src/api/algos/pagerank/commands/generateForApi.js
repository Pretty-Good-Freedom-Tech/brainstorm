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

  const filePath = '/var/lib/brainstorm/api/personalizedPageRankForApi/' + pubkey + '/scores.json';

  try {
    // Use exec with timeout and maxBuffer options to handle large outputs
    const child = exec('sudo /usr/local/lib/node_modules/brainstorm/src/algos/personalizedPageRankForApi.sh ' + pubkey, {
      timeout: 170000, // slightly less than the HTTP timeout
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer to handle large outputs (default is 1MB)
    }, (error, stdout, stderr) => {
      console.log('PageRank calculation completed');        
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

      // const fileContent = fs.readFileSync(filePath, 'utf8');
      const fileContent = execSync('cat ' + filePath);
      const fileContentJson = JSON.parse(fileContent);

      return res.json({
        success: true,
        metaData: {
          pubkey: pubkey,
          about: 'PageRank scores for the given pubkey',
          use: '(Brainstorm base url)/api/personalized-pagerank?pubkey=abc123...'
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
