# Hasenpfeffr

Hasenpfeffr is a _Personalized Webs of Trust Nostr relay_ that uses advanced techniques to calculate personalized webs of trust, resulting in high-quality, spam-free nostr content, curated by _your_ Nostr community.

## Why use Hasenpfeffr?

- You and your friends can use your hasenpfeffr relay as a normal Nostr content relay, with spam and other unwanted content removed using state of the art WoT technology
- Export personalized WoT scores as NIP-85 Trusted Assertions (kind 30382 events), ready for usage by all NIP-85-compliant clients

## What do I need?

- A Linux server (e.g., Ubuntu 22.04 LTS)
- A domain name (e.g., `relay.myCoolDomain.com`)

## Features

- ✅ strfry and Neo4j integration
- ✅ personalized GrapeRank
- ✅ personalized PageRank
- ✅ personalized hops (degrees of separation by follows)
- ✅ page to modify GrapeRank parameters
- ✅ Publish personalized WoT scores as NIP-85 Trusted Assertions (kind 30382 events)
- ✅ Web-based control panels
- ✅ table of all profiles with WoT scores
- ✅ individual profile pages
- ✅ Performance monitoring and logging
- ☐ verify calculation of GrapeRank scores on profile page
- ☐ PageRank vs GrapeRank vs dos charts, similar to previous work at https://grapevine-brainstorm.vercel.app/
- ☐ add verified followers score to profile page
- ☐ calculate separate GrapeRank scores: gr_basic, gr_muted, gr_reported
- ☐ make WoT scores accessible through API (WoT DVM)
- ☐ neo4j update password
- ☐ access neo4j password from neo4j.conf rather than hasenpfeffr.conf
- ☐ view / change relay nsec 
- ☐ data navigation pages: table of all pubkeys, my followers, recommended follows, etc

I encourage discussion regarding [NIP-85](https://github.com/vitorpamplona/nips/blob/user-summaries/85.md) at the [NIP-85 PR discussion](https://github.com/nostr-protocol/nips/pull/1534), and discussion of the WoT DVM at the relevant [PR discussion](https://github.com/nostr-protocol/data-vending-machines/pull/38).

## Installation

See instructions in docs/INSTALLATION_INSTRUCTIONS.md.

The installation script will:

1. Install and configure Neo4j Community Edition, the Neo4j Graph Data Science plugin, and the Neo4j APOC plugin
2. Set up Neo4j constraints and indices
3. Install and configure Strfry Nostr relay
4. Configure the Hasenpfeffr systemd services; see `systemd/README.md` for details.
5. Create hasenpfeffr configuration files: `/etc/hasenpfeffr.conf`, `/etc/graperank.conf`, `/etc/blacklist.conf`

## Pipeline from strfry to Neo4j

The strfry to Neo4j extract, transform, load (ETL) pipeline consists of three modules:

1. Batch: `src/pipeline/batch`, used for loading data in bulk. This should create 200 to 300 thousand NostrUser nodes and approximately 8 million FOLLOWS, MUTES, and REPORTS relationships. Typically run only once at installation but can be re-run as desired.
2. Streaming: `src/pipeline/stream`, used for real-time processing of new events. This is managed by systemd services listed below (strfry-router, addToQueue, and processQueue). Typically, this will run indefinitely, processing updates to FOLLOWS and new MUTES and REPORTS as they arrive, usually on the order of 3 to 5 per minute. 
3. Reconciliation: `src/pipeline/reconcile`, used to fix any data mismatches between strfry and Neo4j. This is managed by the systemd service `reconcile.timer`

## Usage

Upon installation, perform the following actions:

1. Access the Neo4j Browser at `http://your-domain:7474` (note: not https!!). You will be prompted to change the password. This should match the password that you entered during installation.

2. Access the Strfry relay at `https://your-domain` to verify it is working.

3. Access the Hasenpfeffr main page at `https://your-domain/control/index.html` and sign in via NIP-07.

4. Batch loading of data: 
- Use Negentropy to import kinds 3, 1984, and 10000 events to strfry in bulk from `wss://relay.hasenpfeffr.com`. Note that you can use this tool to import from other relays and using other filters. This can also be repeated to import any events that may have been missed. Monitor importation progress and verify successful import using the control panel, by checking the strfry logs, or at the command line `journalctl -u strfry.service` or `sudo strfry scan --count '{"kinds": [3, 1984, 10000]}'`.
- Bulk transfer from strfry to Neo4j. This should create 200 to 300 thousand NostrUser nodes and approximately 8 million FOLLOWS, MUTES, and REPORTS relationships. Monitor progress and verify successful transfer using the control panel or at the Neo4j browser: `http://your-domain:7474`.

5. At the control panel, turn on ETL pipeline systemd services, including:
- strfry-router, which will stream events in real time to strfry from a hardcoded list of relays (todo: edit relays)
- addToQueue and processQueue, which will stream events in real time from strfry to Neo4j.
- reconcile.timer, which will periodically check for discrepancies between strfry and Neo4j and will import any events from strfry to Neo4j that may have been missed

6. Calculate Webs of Trust by hand: 
- hops (needs a button!)
- personalized PageRank
- personalized GrapeRank

7. Export NIP-85 by clicking the export buttons in the NIP-85 control panel. These buttons should publish 10^5 kind 30382 events to your WoT relay, and one kind 10040 event to multiple relays. The NIP-85 control panel should indicate statistics on kind 30382 events, and you can also verify them at the command line. 

8. Activate Strfry Plugin (if desired), which streams content in real time to your relay, filtered by your whitelist and blacklist. You should only activate this is once your whitelist has been created and you have verified that it is working correctly. Once activated, you and your friends can use your relay as a normal Nostr relay, one that filters out spam and other unwanted content.

9. Turn on Webs of Trust calculation systemd services, including:
- calculateHops.timer, calculatePersonalizedPageRank.timer, and calculatePersonalizedGrapeRank.timer, which will periodically calculate hops, personalized page rank, and personalized grape rank for all NostrUsers.



### URL Structure

Hasenpfeffr uses the following URL structure:

- **Main Landing Page**: `https://your-domain/control/index.html` - Provides links to all components and shows authentication status
- **Control Panel**: `https://your-domain/control/control-panel.html` - Main control panel for managing Hasenpfeffr
- **NIP-85 Control Panel**: `https://your-domain/control/nip85-control-panel.html` - Specialized control panel for NIP-85 settings
- **Strfry Relay**: `https://your-domain` - The Strfry Nostr relay endpoint
- **Sign-in Page**: `https://your-domain/control/sign-in.html` - Authentication page for administrative actions

### Authentication

Hasenpfeffr's control panel is designed to be accessible in read-only mode without requiring sign-in. Only administrative actions require authentication with the owner's Nostr key. The authentication system uses the `HASENPFEFFR_OWNER_PUBKEY` from the server configuration file to verify the user's identity.

### Strfry Nostr Relay

The Strfry Nostr relay will be available at `https://your-domain/`.

To check the status of the Strfry service:

```bash
sudo systemctl status strfry
```

To view logs:

```bash
sudo journalctl -u strfry
```

### Generating NIP-85 Data

```bash
# Using the CLI
hasenpfeffr-generate

# Using npm scripts
npm run generate
```

### Publishing NIP-85 Events

```bash
# Using the CLI
hasenpfeffr-publish

# Using npm scripts
npm run publish
```

## Performance

The system is optimized for publishing large volumes of events (100,000+) with features such as:

- Connection pooling
- Memory management with garbage collection
- Streaming file processing
- Batch processing with configurable parameters
- Retry mechanisms for failed publications
- Detailed monitoring and logging

## License

GNU Affero General Public License v3.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Troubleshooting

If you encounter issues during installation or operation, please refer to the [Troubleshooting Guide](TROUBLESHOOTING.md) for common problems and solutions.

For issues not covered in the troubleshooting guide, please create a new issue on GitHub with detailed information about your problem.
