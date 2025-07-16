/**
 * PageRank Generation and Return Command
 * Handles triggering the calculation of personalized PageRank data
 * The reference user is supplied as a query parameter
 * Results are returned as a JSON object
 * to call: 
 * <brainstorm url>/api/personalized-pagerank?pubkey=<pubkey>
 */

const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

  // retrieve limit as an argument
  const limit = req.query.limit;

  if (!pubkey) {
    return res.json({
      success: false,
      error: 'No pubkey provided'
    });
  }

  const filePath = '/var/lib/brainstorm/api/personalizedPageRankForApi/' + pubkey + '/scores.json';

  try {
    // Use exec with timeout and maxBuffer options to handle large outputs
    const personalizedPageRankForApiCommand = `sudo /usr/local/lib/node_modules/brainstorm/src/algos/personalizedPageRankForApi.sh ${pubkey} ${limit}`;
    const child = exec(personalizedPageRankForApiCommand, {
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
              use: '(Brainstorm base url)/api/personalized-pagerank?pubkey=abc123...',
              optional: 'limit=123'
            },
            error
        });
      }
      console.log('PageRank data generated successfully');

      // Check if the generated file exists
      if (!fs.existsSync(filePath)) {
        console.error('Generated file not found:', filePath);
        return res.json({
          success: false,
          metaData: {
            pubkey: pubkey,
            about: 'PageRank scores for the given pubkey',
            use: '(Brainstorm base url)/api/personalized-pagerank?pubkey=abc123...'
          },
          error: 'Generated file not found'
        });
      }

      // Get file stats to check size
      const stats = fs.statSync(filePath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`Generated file size: ${fileSizeMB} MB`);

      try {
        // For large files, stream the response with API structure
        if (stats.size > 5 * 1024 * 1024) { // If file is larger than 5MB
          console.log('File is large, streaming structured response...');
          
          // Set appropriate headers for JSON streaming
          res.setHeader('Content-Type', 'application/json');
          
          // Start streaming the API response structure
          res.write('{\n');
          res.write('  "success": true,\n');
          res.write('  "metaData": {\n');
          res.write(`    "pubkey": "${pubkey}",\n`);
          res.write('    "about": "PageRank scores for the given pubkey",\n');
          res.write('    "use": "(Brainstorm base url)/api/personalized-pagerank?pubkey=abc123...",\n');
          res.write(`    "fileSizeMB": "${fileSizeMB}",\n`);
          res.write('    "streamedResponse": true\n');
          res.write('  },\n');
          res.write('  "data": {\n');
          res.write('    "pageRankScores": ');
          
          // Stream the file content as the pageRankScores value
          const readStream = fs.createReadStream(filePath);
          
          readStream.on('error', (streamError) => {
            console.error('Error streaming file:', streamError);
            if (!res.headersSent) {
              res.status(500).json({
                success: false,
                error: 'Error streaming file'
              });
            }
          });
          
          readStream.on('end', () => {
            // Close the JSON structure
            res.write('\n  }\n');
            res.end('}');
          });
          
          readStream.pipe(res, { end: false }); // Don't end the response when stream ends
          
        } else {
          // For smaller files, load into memory and send as JSON response
          console.log('File is small, loading into memory...');
          
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const fileContentJson = JSON.parse(fileContent);
          
          return res.json({
            success: true,
            metaData: {
              pubkey: pubkey,
              about: 'PageRank scores for the given pubkey',
              use: '(Brainstorm base url)/api/personalized-pagerank?pubkey=abc123...',
              fileSizeMB: fileSizeMB,
              recordCount: Object.keys(fileContentJson).length
            },
            data: {
              pageRankScores: fileContentJson
            }
          });
        }
        
      } catch (fileError) {
        console.error('Error processing generated file:', fileError);
        return res.json({
          success: false,
          metaData: {
            pubkey: pubkey,
            about: 'PageRank scores for the given pubkey',
            use: '(Brainstorm base url)/api/personalized-pagerank?pubkey=abc123...'
          },
          error: 'Error processing generated file: ' + fileError.message
        });
      }
    });
  } catch (e) {
    console.error('Error generating PageRank data:', e);
    return res.json({
      success: false,
      metaData: {
        pubkey: pubkey,
        about: 'PageRank scores for the given pubkey',
        use: '<Brainstorm base url>/api/personalized-pagerank?pubkey=<pubkey>'
      },
      e
    });
  }
}

module.exports = {
  handleGenerateForApiPageRank
};
