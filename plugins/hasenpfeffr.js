#!/usr/bin/env node

const fs = require('node:fs');

const whitelist_pubkeys = JSON.parse(fs.readFileSync('/usr/local/lib/node_modules/hasenpfeffr/plugins/whitelist_pubkeys.json', 'utf8'))

const blacklist_pubkeys = JSON.parse(fs.readFileSync('/usr/local/lib/node_modules/hasenpfeffr/plugins/blacklist_pubkeys.json', 'utf8'))

const whitelist_kinds = JSON.parse(fs.readFileSync('/usr/local/lib/node_modules/hasenpfeffr/plugins/whitelist_kinds.json', 'utf8'))

const rl = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
    let req = JSON.parse(line);

    if (req.type !== 'new') {
        console.error("unexpected request type"); // will appear in strfry logs
        return;
    }

    let res = { id: req.event.id };

    res.action = 'reject'

    if (whitelist_kinds.includes(req.event.kind)) {
        res.action = 'accept';
    }

    if (whitelist_pubkeys[req.event.pubkey]) {
        res.action = 'accept';
    }

    if (blacklist_pubkeys[req.event.pubkey]) {
        res.action = 'reject';
    }

    if (res.action == 'reject') {
        res.msg = 'blocked by the hasenpfeffr plugin';
    }

    console.log(JSON.stringify(res));
});