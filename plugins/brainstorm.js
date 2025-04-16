#!/usr/bin/env node

const fs = require('node:fs');

const whitelist_pubkeys = JSON.parse(fs.readFileSync('/usr/local/lib/strfry/plugins/data/whitelist_pubkeys.json', 'utf8'))

const blacklist_pubkeys = JSON.parse(fs.readFileSync('/usr/local/lib/strfry/plugins/data/blacklist_pubkeys.json', 'utf8'))

const whitelist_kinds_acceptAll = JSON.parse(fs.readFileSync('/usr/local/lib/strfry/plugins/data/whitelist_kinds_acceptAll.json', 'utf8'))

const whitelist_kinds_filterPubkeyWhitelist = JSON.parse(fs.readFileSync('/usr/local/lib/strfry/plugins/data/whitelist_kinds_filterPubkeyWhitelist.json', 'utf8'))

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

    if (whitelist_kinds_acceptAll.includes(req.event.kind)) {
        res.action = 'accept';
    }

    if (whitelist_kinds_filterPubkeyWhitelist.includes(req.event.kind) && whitelist_pubkeys[req.event.pubkey]) {
        res.action = 'accept';
    }

    if (blacklist_pubkeys[req.event.pubkey]) {
        res.action = 'reject';
    }

    if (res.action == 'reject') {
        res.msg = 'blocked by the brainstorm plugin';
    }

    console.log(JSON.stringify(res));
});