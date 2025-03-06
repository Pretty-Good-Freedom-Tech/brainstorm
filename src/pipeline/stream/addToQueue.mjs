#!/usr/bin/node
import fs from 'fs';
import 'websocket-polyfill'
import dotenv from 'dotenv'
import NDK from '@nostr-dev-kit/ndk'
import { useWebSocketImplementation } from 'nostr-tools/pool'
import WebSocket from 'ws'
useWebSocketImplementation(WebSocket)

dotenv.config();

const myRelay = process.env.HASENPFEFFR_RELAY_URL || 'wss://relay.hasenpfeffr.com'

const explicitRelayUrls = [ myRelay ]

const pathToQueue = '/home/ubuntu/hasenpfeffr/pipeline/stream/queue/'

const ndk = new NDK({explicitRelayUrls})

const filter = { kinds: [3], limit: 0 }

// create file with pubkey as the name; this way, if multiple follows happen in rapid fire succession,
// we only process that pubkey one time
const addEventToQueue = (event) => {
    const dataToWrite = JSON.stringify(event) + '\n'
    const thisFilePath = pathToQueue + event.pubkey
    fs.writeFile(thisFilePath, dataToWrite, (err) => {
      if (err) {
        console.error('Error writing to file:', err);
      } else {
        console.log('File written successfully.');
      }
    });
}

const runListener = async () => {
  await ndk.connect()
  const sub1 = ndk.subscribe(filter)
  sub1.on('event', async (event) => {
    console.log(`event received; id: ${event.id}; pubkey: ${event.pubkey}`)
    // remove content field to decrease bloat and processing errors
    const event_stripped = {id: event.id, pubkey: event.pubkey, created_at: event.created_at, kind: event.kind}
    console.log(JSON.stringify(event_stripped,null,4))
    addEventToQueue(event_stripped)
  })
}

runListener()