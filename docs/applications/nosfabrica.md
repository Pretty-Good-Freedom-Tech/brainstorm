Incorporation of NIP-85: Trusted Assertions into NosFabrica
=====

## Motivations

1. screen out bad actors from the [NosFabrica](https://nosfabrica.com) physician list using standard [NIP-85: Trusted Assertions](https://github.com/vitorpamplona/nips/blob/user-summaries/85.md) ([pull request](https://github.com/nostr-protocol/nips/pull/1534)) metrics `rank` and `followers`
2. encourage the use of NIP-85 by other nostr clients
3. encourage the use of NIP-85 by other third party personalized trust metric providers 
4. outline a roadmap to develop and incorporate _contextual_ trust metrics relevant to NosFabrica, such as `verified physician`

## Background

Personalized trust metrics are currently being calculated and published according the NIP-85 specification by [straycat.brainstorm.social](https://straycat.brainstorm.social). Standard Brainstorm metrics include the GrapeRank metric, which ranges from 0 to 1 and is well-suited for conversion to the NIP-85 `rank` metric, and the GrapeRank verified followers count, which is well suited as the NIP-85 `followers` metric. GrapeRank is calculated using follows, mutes, and reports and does a better job than PageRank at removing bad actors. The intended interpretation of the GrapeRank metric is this: _“According to your web of trust, this user is probably a real user (as opposed to an impersonator, spammer or other bad actor), and can say that with a confidence of (GrapeRank*100) %.”_

# Step 1: default view

Show scores hardcoded to the perspective of NosFabrica (the default view)

At [straycat.brainstorm.social](https://straycat.brainstorm.social):

1. sign up NosFabrica at an active Brainstorm instance: straycat.brainstorm.social
2. NosFabrica to activate Trusted Assertions as prompted by Brainstorm (ie sign 10040 note which will point to wss://nip85.brainstorm.world and pk_brainstorm_nosfabrica)
3. Brainstorm to calculate NosFabrica’s personalized trust scores
4. Brainstorm to export NosFabrica’s Trusted Assertions as 30382 notes signed by `pk_brainstorm_nosfabrica` which is generated maintained by Brainstorm instance

On NosFabrica.com:

For each pubkey: `pk_physician` at NosFabrica:
1. Fetch the kind 30382 note from `wss://nip85.brainstorm.world` using this filter:
```json
{"kinds": [30382], "authors": [pk_brainstorm_nosfabrica], "#d": [pk_physician]}
```
2. Extract `rank`, `followers`, and (optionally) `verifiedReporterCount`. If no 30382 note is found, use default values of 0 for all 3 metrics.
3. Display metrics next to the physician profile.

# Step 2: personalized view

Show scores from the perspective of the logged in user, if kind 10040 Trusted Assertions are available for that user. If not, use the default view.

# Future roadmap: `verifiedPhysicians` 

Intended interpretation: “My Grapevine can state, with (score*100) confidence, that this is a licensed and practicing physician.”

Create one (or more) NIP-58 badges which can be used as signifiers for who is (and is not) a physician. Possible badges to consider:
- I attest I am a colleague of this physician 
- I attest I have been a patient of this physician
- I attest I have direct knowledge that this is a licensed and practicing physician

Once relevant badges are available, they will be used as raw data for calculation of a `verified physician` metric at Brainstorm using standard GrapeRank procedures, and will be incorporated into Brainstorm-generated Trusted Assertions. The end result will be the decentralized curation of a list of physicians.
