#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const INPUT_FILE = path.join(SCRIPT_DIR, 'conceptGraphEventsToAddToNeo4j.json');
const OUTPUT_FILE = path.join(SCRIPT_DIR, 'conceptGraphEventTagsToAddToNeo4j.json');

console.log('Processing tags from Nostr events...');

try {
    // Read the input file
    const fileContent = fs.readFileSync(INPUT_FILE, 'utf8');
    const events = fileContent.trim().split('\n').map(line => JSON.parse(line));
    
    console.log(`Found ${events.length} events to process`);
    
    const tagObjects = [];
    let skippedTags = 0;
    
    // Process each event
    events.forEach(event => {
        const eventId = event.id;
        const eventIdShort = eventId.slice(-8); // Last 8 characters
        const tags = event.tags;
        
        // Skip if no tags or tags is not an array
        if (!tags || !Array.isArray(tags)) {
            return;
        }
        
        // Process each tag
        tags.forEach(tag => {
            // Skip malformed tags (not an array or empty)
            if (!Array.isArray(tag) || tag.length === 0) {
                skippedTags++;
                return;
            }
            
            const type = tag[0]; // First element is the tag type
            
            // Skip if type is missing or empty
            if (!type) {
                skippedTags++;
                return;
            }
            
            // Create uuid: {last8chars_of_id}_{type}
            const uuid = `${eventIdShort}_${type}`;
            
            // Create the tag object
            const tagObject = {
                id: eventId,
                uuid: uuid,
                type: type
            };
            
            // Add value properties for remaining elements
            if (tag.length > 1) {
                tagObject.value = tag[1]; // Second element
                
                // Add value1, value2, value3, etc. for additional elements
                for (let i = 2; i < tag.length; i++) {
                    tagObject[`value${i - 1}`] = tag[i];
                }
            }
            
            tagObjects.push(tagObject);
        });
    });
    
    console.log(`Created ${tagObjects.length} tag objects`);
    if (skippedTags > 0) {
        console.log(`Skipped ${skippedTags} malformed/empty tags`);
    }
    
    // Write output file as JSONL (one JSON object per line)
    const output = tagObjects.map(obj => JSON.stringify(obj)).join('\n');
    fs.writeFileSync(OUTPUT_FILE, output, 'utf8');
    
    console.log(`Successfully wrote ${OUTPUT_FILE}`);
    
} catch (error) {
    console.error('Error processing tags:', error);
    process.exit(1);
}
