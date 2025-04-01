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

I encourage discussion regarding [NIP-85](https://github.com/vitorpamplona/nips/blob/user-summaries/85.md) at the [NIP-85 PR discussion](https://github.com/nostr-protocol/nips/pull/1534), and discussion of the WoT DVM at the relevant [PR discussion](https://github.com/nostr-protocol/data-vending-machines/pull/38).

## Installation

```bash
# Clone the Hasenpfeffr repository
git clone https://github.com/Pretty-Good-Freedom-Tech/hasenpfeffr.git
cd hasenpfeffr

# Install dependencies
npm install

# Run the installation script
sudo npm run install-hasenpfeffr
```

If the above doesn't work, follow the instructions in docs/INSTALLATION_INSTRUCTIONS.md.

To update:

```bash
cd ~/hasenpfeffr
sudo npm run update
```

If the above doesn't work, follow the instructions in docs/UPDATE_INSTRUCTIONS.md.

The installation script will:

1. Install and configure Neo4j Community Edition, the Neo4j Graph Data Science plugin, and the Neo4j APOC plugin
2. Set up Neo4j constraints and indexes
3. Install and configure Strfry Nostr relay
4. Configure the Hasenpfeffr systemd services; see `systemd/README.md` for details.
5. Create hasenpfeffr configuration files: `/etc/hasenpfeffr.conf`, `/etc/graperank.conf`, `/etc/blacklist.conf`

## Usage

Once installed, go to https://your-domain.com/control/index.html to access the main page where you can flip all the switches to activate your WoT relay. It should take several hours to download data from the network and calculate webs of trust scores, and to begin generating filtered content. Once this is complete, you and your friends can start to use your relay as a normal Nostr relay, one that is filtered by your WoT to remove spam and other unwanted content.

Best way to test whether your WoT relay is working: Create a new npub; use your WoT relay as your sole relay; and set the feed to global. Not every client can do this. Try nosdrudel.ninja if your favorite client can't.

## License

GNU Affero General Public License v3.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Troubleshooting

If you encounter issues during installation or operation, please refer to the [Troubleshooting Guide](TROUBLESHOOTING.md) for common problems and solutions.

For issues not covered in the troubleshooting guide, please create a new issue on GitHub with detailed information about your problem.
