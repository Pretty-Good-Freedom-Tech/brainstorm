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

## Setup

Once installed, go to https://relay.myCoolDomain.com/control/index.html to access the main page where you can flip all the switches to activate your WoT relay. It should take several hours to download follows, mutes and reports data from the network, calculate personalized webs of trust scores, create blacklists and whitelists, and begin to curate filtered content.

## Customization

There are several ways to customize your WoT relay. Each of the following has its own control panel.

- Blacklist
- Whitelist
- GrapeRank parameters

## Usage

### As a normal Nostr relay

Once your WoT relay is active, you can use it as a normal Nostr relay, filtered by your WoT to remove spam and other unwanted content. A good way to test whether your WoT relay is working: Create a new npub; use your WoT relay as your sole relay; and set the feed to global. Not every client can do this. Try nosdrudel.ninja if your favorite client can't.

### Use your personalized WoT scores with other nostr clients

NIP-85 Trusted Assertions is a new feature of the Nostr protocol that allows you to publish your WoT scores to the network. This is a way to share your WoT scores with other relays and clients, and to make your WoT scores more accessible to the public.

To export NIP-85 Trusted Assertions, go to https://relay.myCoolDomain.com/control/nip85-control-panel.html and publish a kind 10040 event. This is how nostr clients know how to access your WoT scores.

As of April 2025, NIP-85 is not yet supported by any nostr clients. Hopefully it will be soon!

## License

GNU Affero General Public License v3.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Troubleshooting

If you encounter issues during installation or operation, please refer to the [Troubleshooting Guide](TROUBLESHOOTING.md) for common problems and solutions.

For issues not covered in the troubleshooting guide, please create a new issue on GitHub with detailed information about your problem.
