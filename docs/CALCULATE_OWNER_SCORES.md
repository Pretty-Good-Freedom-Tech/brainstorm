Once you have populated your databases, you can calculate owner scores.

Go to Task Explorer: Card View. Set Category to Owner. Run these tasks in order, one at a time. Monitor their progress in the Log Data View.

1. calculateOwnerHops.

Once complete, in the Neo4j browser run the cypher query: `MATCH (n:NostrUser) WHERE n.hops < 100 RETURN count(n)`. Expect on the order of 200k nodes.

2. calculateOwnerPageRank.

Once complete, in the Neo4j browser run the cypher query: `MATCH (n:NostrUser) WHERE n.hops < 100 AND n.personalizedPageRank > 0 RETURN count(n)`. It should be less than what you got in the previous step.

3. calculateOwnerGrapeRank.

Once complete, in the Neo4j browser run the cypher query: `MATCH (n:NostrUser) WHERE n.hops < 100 AND n.personalizedPageRank > 0 AND n.influence > 0.01 RETURN count(n)`. It should be less than what you got in the previous step. (About 100k unless you changed the GrapeRank parameters from default.)

4. processOwnerFollowsMutesReports.

Once complete, go to the profiles page (alice.brainstorm.social/profiles.html) and verify that the table is populating with data as expected.

5. calculateReportScores.

As of 15 Sep 2025, calculateReportScores will say on the front end that it failed but it actually seems to work. once complete, you will see data populated at the Curated Reports (alice.brainstorm.social/nip56.html) page.
