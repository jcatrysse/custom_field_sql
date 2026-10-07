# Decided by Jan, 2026-10-07

Jan Catrysse answered the open questions of this plugin on 2026-10-07, one at a time, with the
options, an explanation and the recommendation in front of him, in the coordinating session that
started the migration sessions (https://claude.ai/code/session_01GiSsYPm3bxvqrpZkdCxNoi).
This file records his answers as given; his free-text notes are quoted verbatim. The migration
session moves each into docs/REDMINE7-MIGRATION.md as decided and builds what it requires.

General decisions by Jan (2026-10-07), for every GEOxyz plugin:
- GEOxyz goes straight to Redmine 7: no backports to 5.1. Nothing is cherry-picked to the default branch or to the branch production runs today; `redmine70-migration` is what goes live with Redmine 7. Redmine 5.1 compatibility is no longer a requirement; drop that rule from the plan and do not add code paths that exist only for 5.1.
- GEOxyz does not use MariaDB or MySQL; production runs PostgreSQL 16. Run the tests and the e2e set on PostgreSQL only. Keep SQL portable where that costs nothing, but MariaDB runs are no longer required and a MariaDB-only problem is a note in the plan, not a blocker.
- A plugin that depends on deface requires it without a version constraint (change it when the Gemfile is touched anyway).
- A Redmine core method that other installed plugins also patch is patched with `prepend`, never with `alias_method`. Mixing both on one method recurses; that is what made Project > Settings return HTTP 500 with all GEOxyz plugins installed. Check this plugin: if it patches such a method with `alias_method`, switch it to `prepend` with a test, and confirm Project > Settings, the issue list and an issue page answer 200 with the other GEOxyz plugins installed (`RMP_EXTRA_PLUGINS`).
- GitHub Actions stay manual only (`workflow_dispatch`).

Decisions for this plugin:
1. custom_field_sql-q1: Mogen anonieme gebruikers weer suggesties krijgen in SQL-zoekvelden waar ze issues mogen aanmaken?
   Jan chose B: "Anoniem toelaten waar de anonieme rol issues mag aanmaken" (Anonieme gebruikers krijgen weer suggesties; de rechtencontrole blijft, maar het adres werkt weer zonder login.). Carry this out (see step 3).
2. custom_field_sql-q2: Gebruikt GEOxyz SQL-zoekvelden op projecten, gebruikers of tijdregistraties?
   Jan chose B: "Ja, die velden moeten blijven werken" (Vraagt een aanpassing van de plugin, anders stoppen die velden na de upgrade.). Carry this out (see step 3).
3. custom_field_sql-q3: Moeten de nieuwe upstream-functies (meervoudige keuze, IssueHotButton) erbij komen?
   Jan chose B: "Later toevoegen als aparte wijziging" (GEOxyz krijgt meervoudige keuze, maar dat vraagt apart werk en testen bovenop deze branch.). Carry this out (see step 3).
   Jan's note: "Jan: NU doen, in deze migratie (niet later): de upstream-functies meervoudige keuze en IssueHotButton meenemen."
4. custom_field_sql-q4: Moet een SQL-veld op het issue het label tonen in plaats van de opgeslagen waarde (bv. een id)?
   Jan chose A: "Zo laten, zoals upstream" (Niets verandert voor bestaande velden; per veld op te lossen met een query met één kolom.). Already built: keep it and record the decision.

What to do:
1. `git fetch && git checkout redmine70-migration && git pull`.
2. Record every decision above in docs/REDMINE7-MIGRATION.md: move it from open to decided, with the choice, the date 2026-10-07 and Jan's note verbatim where there is one. Update the plan's rules for the general decisions (no 5.1, PostgreSQL only).
3. Carry out each decision that needs a change: one commit per decision, each with a test that fails without it. A choice that says "later" or "separate change" is built now, in its own commit. A choice that says it happens after the upgrade goes under "After the upgrade". A decision that needs no code (not reporting to a vendor, accepting a loss, a role setting) is only recorded.
4. Plugin tests green on Redmine 7.0-stable-GEOxyz with PostgreSQL, alone and with the other GEOxyz plugins installed. Quote the numbers.
5. `./.codex/start_server.sh` and `./.codex/e2e.sh`: a scenario for every function a decision touches, as admin, manager, reporter and outsider, including the refusal paths. Open every screenshot, commit them in docs/e2e/ and list them in the inventory.
6. Your own adversarial review of the new commits, then `./.codex/openai_review.sh` when OPENAI_API_KEY is set; every finding gets a Resolution line. Without the key, say the review was skipped.
7. Update Status, the inventory, the work list and "After the upgrade". Push `redmine70-migration` after every commit.
8. These decisions are final; do not stop to ask about them. If one turns out to be impossible, write down why in the plan and carry on with the rest.
9. End with a short report in Dutch: per decision what you did (commit), test numbers, e2e numbers (scenarios, screenshots, problems), the review result, what is left for Jan.
