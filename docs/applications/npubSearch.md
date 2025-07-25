# Profile (npub) search

Like npub.world, except scores come from Brainstorm (NIP-85 events) rather than the Vertex WoT API

### Search page
- order results by GrapeRank
- a variety of "perspectives" will be offered: global, npubA, npubB, etc (with button to "get your own perspective" which will take them to the brainstorm signup page)

A variety of visual cues will be used to communicate Grapevine scores: background color and thickness, border color and thickness, opacity, font weights.
- Border: Verified or not. ("good" signal.) Green, with intensity and thickness proportional to GrapeRank score. White border indicates unverified (low or zero GrapeRank.). Low GrapeRank scores approach "invisibility". Opacity of picture also proportional to GrapeRank score.
- Background: Reported (red), muted (black), or both. ("bad" signal.)

Combination of good and bad: border is bad, background is good color
- Verified but Reported or Muted: Green background, Red or Black border

### Individual profile pages 
- show ALL Brainstorm scores

### Goals
- advertize Brainstorm
- get people to subscribe to Brainstorm
- get developers to build apps that use Brainstorm scores by accessing NIP-85 events

### potential URLs

- nip85.com (not yet registered)
- npub.directory (not yet registered)
- npub.brainstorm.world (already own)