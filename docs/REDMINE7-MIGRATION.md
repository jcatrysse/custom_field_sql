# Redmine 7 migration: custom_field_sql

Start a Claude Code (or Codex) session on this repository, branch `redmine70-migration`, with:

> Read CLAUDE.md and docs/REDMINE7-MIGRATION.md, then carry out the Redmine 7 migration of this
> plugin as described there, on branch redmine70-migration. That includes the plugin's tests on
> PostgreSQL and MariaDB, every function exercised end to end on a real running Redmine in a
> browser (with and without permissions, failure paths included) with screenshots you looked at,
> and an OpenAI review of the diff when OPENAI_API_KEY is set. Report to me in Dutch at the end.

This file is the plan and the memory of that work. Update it as you go: verdicts, results,
what is left. Written 2026-10-06 from a measured analysis (report at the bottom).

## Status

| | |
|---|---|
| Plugin id | `custom_field_sql` |
| GEOxyz runs today | `main` |
| Upstream | apsmir/custom_field_sql (main @ 13d0792, 2026-07-02) |
| Runs on Redmine 7 as is | DEELS (does not boot in production: `unloadable`) |
| Runs on Redmine 7 with this branch | JA: boots, eager load OK, tests green on PostgreSQL and MariaDB, every function end to end in the browser on both |
| Upstream sync | NIET NODIG: optioneel: upstream 3d36b17 (multi select) + 13d0792 (IssueHotButton) - features, geen R7-fixes, conflicten met GEOxyz JS/CSS-commits waarschijnlijk |
| After sync | n.v.t. |
| Complexity (1 trivial .. 5 rewrite) | 2 |
| Measured on | Redmine 7.0.1 (7.0-stable-GEOxyz + latest 7.0-stable), Rails 8.1.3.1, Ruby 3.3.6, PostgreSQL 16 and MariaDB 10.11 |
| Branch head when this file was written | `6106dfb` (plan); work finished at the commit that adds this line, see `git log` |
| Migration state | DONE, see "Results" and "Open questions for Jan" |

## Already on this branch

Code (each with a test that fails without it):

- `08830a1` `unloadable` removed from the search controller (work items 1/4); test/unit/eager_load_test.rb.
- `0363451`, `cce15f4`, `302acd5`, `06a0a3f` Security (work items 2/6): `/custom_sql_search/search` requires
  login, an issue `sql_search` field that is enabled for the project and visible to the user, and
  `add_issues`, `edit_issues` or `edit_own_issues` in that project; with an `issue_id` the issue must be
  visible (404) and editable by the user (403). Request values are no longer interpolated:
  `CustomFieldSql::SqlTemplate` (lib/custom_field_sql/sql_template.rb) escapes every value for its place in
  the SQL: string literal content inside quotes, a literal of its own outside quotes (unsigned numbers
  and integer lists stay as they are), dropped quote characters inside identifiers, nothing in comments;
  PostgreSQL E-strings and dollar quotes, MySQL backslashes and `#`/`-- ` comments, SQL Server for
  `db_config`. `%%` and `KeyError` behave as before. Measured before on 7.0 (anonymous): `term=zzz')
  union select login || ':' || hashed_password, null from users --` returned every user's login and
  password hash. test/unit/sql_template_test.rb runs the rendered SQL with injection payloads on the
  database itself; test/functional/custom_sql_search_controller_test.rb (10 of its first 13 tests fail on
  the old controller).
- `3dfc985` #6600 rework (see the GEOxyz table).
- `0e8ffd0` form parameters: an expression containing `=` raised ArgumentError and the issue form gave 500.
- `793fa81` default value query: `%{project_id}` raised KeyError for anything but an issue, and an issue
  without tracker gave `tracker_id = ` (SQL error); both are now `null` when unknown.
- `1e66808` locales: the default strict selection message is translated (en unchanged), ru.yml got the
  two keys it lacked; a test keeps the shipped locales on the same keys.
- `ef18c8a` README (work item 3): example 2 was MySQL-only (`if()`, `?`); portable now, with notes on writing
  queries that run on both databases and (21370ce) that a query is not limited to what the user may see.

Evidence: test/e2e/*.mjs (7 scenarios + seed), docs/e2e (PostgreSQL), docs/e2e/mariadb, docs/e2e/before
(Redmine 5.1 with `main`), docs/e2e/together (with other GEOxyz plugins), docs/reviews (OpenAI).

## Baseline (2026-10-06, before any change, Redmine 7.0.1 = 7.0-stable-GEOxyz @ 8067e23, Ruby 3.3.6)

- Plugin tests: none existed ("This plugin has no tests.").
- `./.codex/start_server.sh` (production, PostgreSQL 16.15): FAIL, Redmine does not boot:
  `custom_sql_search_controller.rb:3: undefined local variable or method 'unloadable' for class
  CustomSqlSearchController (NameError)`. So no baseline e2e run on 7.0 was possible.
- Tooling notes: `test_setup.sh` with `RMP_PROVISION_DB=1` fails when run as root (`$SUDO -u postgres`
  with an empty `$SUDO` gives `-u: command not found`); worked around by creating the role by hand
  and `RMP_PROVISION_DB=0`. `rsync` had to be installed.

## Work list for the migration session

In this order: things that break, security, the GEOxyz changes, the open items, then the checks.

**Priority items**

1. Commit the fix from the analysis: remove `unloadable` from app/controllers/custom_sql_search_controller.rb (the plugin does not boot in production on Redmine 7). **DONE** `08830a1`.
2. SECURITY (fix in this migration): /custom_sql_search/search has no authorization and interpolates request params into SQL. Require login and the project/issue visibility of the field, and quote every parameter (connection.quote / bind params) instead of `sql % params`. **DONE** `0363451`, `cce15f4`, `302acd5`: bind parameters are impossible because stored SQL puts placeholders inside literals (`'%%%{term}%%'`), so every value is escaped for its place in the statement instead.
3. Make the shipped examples and any SQL the plugin itself generates portable (PostgreSQL and MySQL/MariaDB). **DONE** `ef18c8a` (README examples, run by a test on both databases) and `793fa81` (the default value query got `tracker_id = ` for an issue without tracker). The plugin generates no other SQL of its own.

**Open items from the analysis** (Dutch; where they conflict with a decision or a priority item above, those win)

4. app/controllers/custom_sql_search_controller.rb:3 'unloadable' verwijderen (getest in slot, niet gecommit: commit geweigerd door classifier) **DONE** = item 1.
5. Alle opgeslagen SQL (sql/form_params/default_value) naar PostgreSQL-dialect omzetten; één MySQL-dialect sql-veld geeft HTTP 500 op het nieuwe-issue-formulier (gemeten) **DEFERRED to the production upgrade**: the SQL is data in production, not in this repository; production already runs PostgreSQL. See "After the upgrade" for the audit.
6. Security (pre-existing): /custom_sql_search/search heeft geen autorisatie en interpoleert ruwe params in SQL - anoniem SQL-injectie gemeten **DONE** = item 2.

**Checks**

7. Run the plugin's whole test suite on Redmine 7.0-stable-GEOxyz with PostgreSQL AND MariaDB, and once on 5.1-stable if the branch is meant to stay 5.1-compatible. **DONE**, see "Results" (green on all three).
8. Check Redmine 7 webhooks against this plugin (see "Rules"), and note the result here even if nothing is needed. **DONE, nothing needed**: the plugin hides, adds and changes no issue data; both formats store plain values, which core's issues/show.api.rsb sends like any custom field (as the webhook owner, with core's field visibility). Proven with a real delivery: test/e2e/webhook.mjs, docs/e2e/webhook-payload.json.
9. Verify every feature of the plugin by hand on a running Redmine 7 (screenshots). **DONE**, see "Inventory of functions".

## GEOxyz changes to review or re-apply

These GEOxyz commits are on the branch GEOxyz runs today and therefore on this branch. Review each one against the code it now sits on (upstream merges and Redmine 7 core): drop it if upstream or core now does the same, rewrite it if it is not up to the quality rules below (tests, I18n, security, portability), keep it otherwise. Record the verdict per commit in this file.

| commit | date | subject | verdict |
|---|---|---|---|
| `c4b0bf9` | 2025-07-02 | Defect: bulk edit not working #6600 | KEEP, reworked: neither upstream nor core does it. The bulk edit hook was a copy of the issue form hook; both now share one script builder (so the issue form also survives a field without form params, which raised NoMethodError). Tests: test/unit/sql_format_test.rb (options for several issues), test/unit/custom_sql_search_hook_test.rb, test/functional/issues_controller_test.rb (bulk edit form and bulk update); 5 of them fail on the code before #6600. Browser: test/e2e/bulk_edit.mjs. |
| `e6740ae` | 2025-06-19 | Defect: ensuring that the styles only apply within the plugin’s context #6211 | KEEP as is: core 7.0 still uses jQuery UI autocomplete/tooltip for its own fields, so unscoped `.ui-autocomplete` CSS would still leak. Proof in the browser: test/e2e/css_scope.mjs (core autocomplete keeps its own style, the plugin list gets `sql-autocomplete`). |
| `62738d7` | 2025-06-18 | Defect: resolve compatibility with redmine_inline_edit #6103 | KEEP as is: sets jQuery data `edited` on select/change so redmine_inline_edit_issues keeps and saves the value (its blur handler restores every input not flagged as edited). Proof in the browser: test/e2e/sql_search.mjs reads the flag after a selection; docs/e2e/together/inline_edit.mjs picks a value on the inline edit page with redmine_inline_edit_issues installed, leaves the field and saves it. |

## After the upgrade (production)

Actions the person doing the upgrade must take, or know about, for this plugin:

- Production runs PostgreSQL, so stored SQL is PostgreSQL dialect already. After the upgrade, export every stored SQL field (`SELECT id, name, field_format, format_store FROM custom_fields WHERE field_format IN ('sql','sql_search')`) and run each statement once on 7.0: one broken statement breaks the whole new-issue form (HTTP 500, measured).
- In the same export, check the `sql_search` queries for these three changes of the security fix (work item 2):
  - only `%{name}` placeholders are filled; a `%<name>s` placeholder now raises (HTTP 500 on the search):
    rewrite it as `%{name}`;
  - a request value outside quotes is now a string literal (`where id = %{p0}` gets `'abc'`, not `abc`);
    numbers and integer lists (`1,2,3`) are unchanged, so `id = %{p0}` and `id in (%{p0})` keep working;
    a query that pasted SQL text through a form parameter (column names, operators) stops working, by design;
  - a value inside a comment is dropped.
- Users without `add_issues`, `edit_issues` or `edit_own_issues` in the project, anonymous users, and users
  who may not see the field get no search results any more (403/404); see "Open questions for Jan".
- Nothing else: no migrations, no settings, no cron, no files.


## Results (2026-10-06)

Plugin tests (`./.codex/test_plugin.sh`, Ruby 3.3.6 on 7.0, Ruby 3.2.6 on 5.1):

| Redmine | database | result |
|---|---|---|
| 7.0.1, 7.0-stable-GEOxyz @ 8067e23 | PostgreSQL 16.15 | 51 runs, 414 assertions, 0 failures, 0 errors, 2 skips |
| 7.0.1, 7.0-stable-GEOxyz @ 8067e23 | MariaDB 10.11.14 | 51 runs, 376 assertions, 0 failures, 0 errors, 1 skip |
| 5.1-stable | PostgreSQL 16.15 | 51 runs, 409 assertions, 0 failures, 0 errors, 2 skips |

The skips are database-specific cases that run on the other engine (MySQL comments/backticks/backslashes
on MariaDB, PostgreSQL E-strings/dollar quotes on PostgreSQL). Before this branch the plugin had no tests.
Production eager load (`rails runner 'Rails.application.eager_load!'`, production): OK. Migrations: the
plugin has none.

End to end (`./.codex/e2e.sh`, production mode, real Redmine from `start_server.sh`):

| run | scripts | screenshots | problems |
|---|---|---|---|
| 7.0 + PostgreSQL (docs/e2e) | smoke, core, 7 plugin scenarios | 11 + 6 + 43 = 60 | 0 |
| 7.0 + MariaDB, fresh database (docs/e2e/mariadb) | same | 60 | 0 |
| 7.0 + PostgreSQL with redmine_itil_priority, redmine_depending_custom_fields, computed_custom_field, redmine_inline_edit_issues, view_customize (`redmine70-migration` branches) | same + inline_edit (docs/e2e/together) | 60 + 2 | 0 |
| before: 5.1 + `main` (docs/e2e/before), run before the last two authorization cases were added | 6 plugin scenarios | 39 | 13 problems in search_authorization (every refusal missing, injection leaks hashes); css_scope 1 (5.1 has no Propshaft path); the rest 0 |

Plugin tests with the five other plugins installed: 47 runs, 0 failures (run before the last review
fixes). Every screenshot was opened and looked at.

Review: own adversarial review, then `./.codex/openai_review.sh` (gpt-5) four rounds, every finding with a
`Resolution:` in docs/reviews/: two accepted and fixed (`cce15f4`, `302acd5`), the rest measured and
rejected (locale keys exist, blank form-param lines do not raise, `</script>` is escaped by Rails' JSON,
`db_config` dialect has no effect); the last round brought nothing new that holds.

## Inventory of functions

| function | how a user reaches it | scenario | screenshots |
|---|---|---|---|
| Format `sql` (drop-down from a query, `%id%` = issue id) | Administration > Custom fields > New, format "sql" | custom_field_admin.mjs | custom_field_admin-formats, -new-sql |
| Format `sql_search` and its settings (query, form parameters, database configuration, search by click, strict selection, message, default value query) | same, format "sql search" | custom_field_admin.mjs | -new-sql-search, -edit-sql-search, -invalid (refused save), -manager-refused (403) |
| `sql` list on new and edit issue form, `%id%` | Issues > New / Edit | sql_list.mjs | sql_list-new-options, -edit-options, -saved, -reporter, -outsider-private (403) |
| `sql` list in issue list: column, filter, group by | Issues, options | sql_list.mjs | sql_list-issue-list |
| `sql_search` autocomplete while typing | issue form | sql_search.mjs | sql_search-typing, -selected, -reporter |
| default value query | new issue form | sql_search.mjs, sql_format_test.rb | sql_search-default-value |
| strict selection and its message | issue form, leaving the field | sql_search.mjs | sql_search-strict-refused |
| search by click | issue form, click | sql_search.mjs | sql_search-search-by-click |
| form parameters (jQuery expressions) | issue form | sql_search.mjs | sql_search-form-params, -saved |
| bulk edit: `sql` options and `sql_search` autocomplete (#6600) | issue list, context menu > Bulk edit | bulk_edit.mjs | bulk_edit-form, -list-options, -saved; core-context-menu shows the `sql` list in the context menu |
| CSS only on the plugin's widgets (#6211), Propshaft asset paths | issue form | css_scope.mjs | css_scope-core-autocomplete, -plugin-autocomplete |
| jQuery `edited` flag for redmine_inline_edit_issues (#6103) | issue form; inline edit page | sql_search.mjs, together/inline_edit.mjs | sql_search-selected, together/inline_edit-picked, -saved |
| `/custom_sql_search/search` (JSON, behind every `sql_search` field): authorization and escaping | XHR from the forms | search_authorization.mjs | 16 screenshots: allowed as manager/reporter/outsider on a public project; refused for anonymous, hidden field, field not in project, private project, invisible issue, issue the user cannot edit, wrong field type, unknown project; injection through term and form parameter returns nothing (before: hashes, docs/e2e/before) |
| webhooks (core 7) carry the plugin's values | Administration > Settings > Integrations, My webhooks | webhook.mjs | webhook-new-webhook, -payload (+ webhook-payload.json) |
| plugin page smoke, core flows | all | .codex smoke/core | smoke-01..11, core-* |
| `db_config` (query on an external SQL Server through TinyTds) | field setting | not testable here | needs a SQL Server and the `tiny_tds` gem, which the plugin does not declare; the escaping for it is unit tested (`test_sqlserver_dialect`) |
| view_customize helper script (view_customize/custom_field_autselect_first_value.js) | copy into view_customize | not run | an example script with hard-coded field ids (22, 23), not plugin code; view_customize itself was installed in the "together" run without problems |
| Russian locale | user language ru | unit tests only (custom_sql_search_hook_test.rb: translated default message, same keys as en) | none |

## Findings not fixed (outside this migration, or behaviour users may rely on)

- The `sql` format stores the query's second column and shows that stored value on the issue and in the
  list, not the label (seen: `4` instead of "E2E related issue"). Same on 5.1 (docs/e2e/before/sql_list.md
  passes the same check). Use a one-column query, or both columns equal, if the label matters.
- "Search by click" makes jQuery UI search for the literal term `data`, so it only makes sense with a query
  that does not filter on `%{term}` (upstream behaviour; the e2e seed models it that way).
- A field's query runs with Redmine's database account: it sees private projects too. Now in the README.
- In bulk edit `%id%` is the first selected issue (the #6600 choice), so that issue is left out of a list
  such as "every issue but this one".
- An SQL error in a stored query still gives HTTP 500 on the form or the search (unchanged).
- `db_config` naming a configuration that does not exist raises (nil adapter) and gives 500 (unchanged).
- The MySQL `NO_BACKSLASH_ESCAPES` mode with a template that itself contains `'\'` could confuse the
  placeholder scanner; Redmine does not set that mode.
- `.codex/test_setup.sh` cannot provision PostgreSQL as root (`$SUDO -u postgres` with an empty `$SUDO`);
  5.1-stable needs Ruby < 3.3 (used 3.2.6 from rbenv).

## Open questions for Jan

1. **Login and permissions for the SQL search.** Built as the plan asks: login required, and the user must
   be allowed to add or edit issues in the project (with an issue: edit that issue) and see the field.
   Effect: anonymous users who may create issues in a public project, and members who may only view
   issues, no longer get autocomplete results. Options: (a) keep this (recommended: the endpoint runs
   administrator SQL, it was open to anyone and leaked password hashes); (b) also allow anonymous users
   where the anonymous role may add issues (drop `require_login`, the permission check still applies).
2. **Only issue fields.** The search now serves `sql_search` fields of issues only (the hooks only wire issue
   forms). A `sql_search` field on projects, users or time entries that someone wired up with their own
   script would stop. Recommendation: keep; tell me if GEOxyz has such a field.
3. **Upstream sync** stays optional (decided NIET NODIG): upstream 3d36b17 (multi select) and 13d0792
   (IssueHotButton) are features; merging them would touch the same JS/CSS/hook as #6103/#6211/#6600.
   Recommendation: only when GEOxyz wants multi select, as a separate change on top of this branch.
4. **Stored value vs label** of the `sql` format (see findings): leave as upstream (recommended), or show
   the label on the issue and in lists (a behaviour change for existing fields).

## How to test

```sh
./.codex/redmine_clone.sh 7.0-stable-GEOxyz      # or 5.1-stable / 6.1-stable / 7.0-stable
./.codex/test_setup.sh                                 # RMP_DB=mariadb for MariaDB, RMP_PROVISION_DB=0 if a server runs
./.codex/test_plugin.sh                                # minitest + rspec of this plugin
```

```sh
./.codex/start_server.sh       # real Redmine (production mode) with this plugin, seeded users and projects
./.codex/e2e.sh                # browser: smoke over the plugin's pages, core issue flows, test/e2e/*.mjs
./.codex/openai_review.sh      # independent OpenAI review of the diff, only when OPENAI_API_KEY is set
```
Write one scenario per function in `test/e2e/<function>.mjs` (example at the top of
`.codex/e2e/lib.mjs`); screenshots and a table per scenario land in `docs/e2e/`. Users:
`admin`, `manager` (every permission), `reporter` (no plugin permissions), `outsider` (no
membership); password `Redmine7Test!`. Needs Node with Playwright and Chromium
(`npm install -g playwright && npx playwright install --with-deps chromium`).

On GitHub the same runs by hand only: Actions > "Redmine tests (manual)" > Run workflow (tick
"e2e" for the browser run; screenshots come back as an artifact).

The coordinator's harness (`plugin-check.sh` in the migration kit, kept outside this repo) adds a
browser smoke test of every page the plugin adds and runs all GEOxyz plugins together; the
results quoted in the analysis come from it.

## How the migration session works (same for every plugin)

1. **Start**: `git fetch && git checkout redmine70-migration && git pull`. Read this whole file,
   including the analysis report at the bottom. Do not reopen decisions recorded here.
2. **Baseline, before you change anything**:
   - the plugin's tests on Redmine 7.0-stable-GEOxyz with PostgreSQL and with MariaDB;
   - a real running Redmine with this plugin (`./.codex/start_server.sh`) and the browser run
     (`./.codex/e2e.sh`: smoke over every page the plugin adds, plus the core issue flows).
   Write the numbers here. Something already broken now is a finding, not your regression.
3. **Inventory of functions**: list every function of the plugin in this file, in a table
   "function | how a user reaches it | scenario | screenshot". Take them from the README,
   `init.rb` (permissions, menus, settings, project modules), routes, hooks and view
   overrides, macros, mail handling, API endpoints, rake tasks and cron jobs. This table is the
   coverage list for step 8; a function that is not in it will not be tested.
4. **GEOxyz changes**: go through the table above, one item at a time. Each kept or re-made change
   is its own commit with a test that proves it. Record the verdict in the table.
5. **Work list**: then the numbered list, in order. One concern per commit.
6. **Portability**: everything must run on Redmine's supported databases (PostgreSQL,
   MySQL/MariaDB; SQLite where the plugin already supports it). Migrations must be reversible and
   are run down and up on PostgreSQL and MariaDB.
7. **Together**: run with the other GEOxyz plugins installed (the migration kit's harness, or
   `RMP_EXTRA_PLUGINS`). A failure that only appears in combination is a finding to record here.
8. **End to end, visually, every function**: on the real Redmine from `start_server.sh`
   (production mode, the way GEOxyz runs it), write one scenario per function in
   `test/e2e/<function>.mjs` with `.codex/e2e/lib.mjs` and run them with `./.codex/e2e.sh`.
   - Each function as the users that matter: `admin`, `manager` (every permission, the
     plugin's included), `reporter` (member without the plugin's permissions), `outsider`
     (no membership, private project must stay invisible).
   - The failure paths too: setting off, permission absent, empty state, invalid input, the
     value that used to raise. A refusal that is shown is evidence as much as a success.
   - One screenshot per function and per path, with a caption saying what it proves. Open
     every screenshot and look at it: a picture nobody looked at proves nothing. Commit them
     in `docs/e2e/` and list them in the inventory table.
   - Functions without a page (mail in and out, REST API, rake tasks, cron, webhooks): exercise
     them against the same running instance (mails land in `redmine/tmp/mails`, `t.mails()`
     reads them; API through `t.page.request`) and record command and result.
   - Before pictures where behaviour or layout changes: the branch GEOxyz runs today, on
     Redmine 5.1, same scenarios, `RMP_E2E_OUT=docs/e2e/before`.
   - Run the whole e2e set once on MariaDB as well (`RMP_DB=mariadb`, then `start_server.sh --reset`).
9. **Independent review**: first your own, adversarial: re-read the whole diff as if someone
   else wrote it and you are paid to reject it. Then, **when `OPENAI_API_KEY` is set in the
   session**, `./.codex/openai_review.sh`: it sends the diff of this branch to an OpenAI model
   and writes `docs/reviews/openai-<date>-<sha>.md`. Every finding gets a `Resolution:` line
   there (fixed in <commit>, with a test, or why not). Fix, re-run the tests and the e2e set,
   and run the review again until it has nothing new that you accept. Without the key: write
   "OpenAI review: skipped, no OPENAI_API_KEY" in the report; never send code anywhere else.
10. **After the upgrade**: anything the production upgrade must do for this plugin (data fixes,
    settings, cron, files, removed features) goes into the section "After the upgrade".
11. **Finish**: update "Status", the inventory and the work list in this file, push
    `redmine70-migration`, and report: what changed, test numbers on both databases, e2e
    numbers (scenarios, screenshots, problems), the review result, what is left, what needs Jan.

### Stop and ask Jan when
- a GEOxyz change would be lost or behave differently for users;
- a new gem, a new setting with user impact, or a schema change not required by Redmine 7 seems needed;
- the change would send data to an external service (the OpenAI review of the code diff is the
  one exception Jan approved, and only when the key is present);
- upstream and GEOxyz disagree on behaviour and both are defensible.

## Rules

- **Target**: Redmine 7.0-stable-GEOxyz (https://github.com/jcatrysse/redmine), Rails 8.1, Ruby 3.3+.
  Core sources for comparison: branches `5.1-stable`, `6.1-stable`, `7.0-stable`, `7.0-stable-GEOxyz`.
- **Evidence**: never report a test, lint, browser check or review as passed without having seen
  it. Quote the summary lines; list the screenshots. "Should work" is not a result, and a green
  test suite is not proof that a feature works in the browser.
- **Tests**: never skip, delete or weaken a test. A test that encodes Redmine 5 markup or
  behaviour is updated to Redmine 7, with the reason in the commit. Every fix gets a test that
  fails without it.
- **Minimal diffs** in the plugin's own style. No reformatting, no unrelated refactoring.
  Something wrong elsewhere: write it down here, do not fix it in passing.
- **Security**: authorization on every action and entry point; `safe_attributes`, never
  `to_unsafe_hash` into `update`; no SQL built from params; no secrets in logs; no `html_safe` on
  user input.
- **Webhooks (new in Redmine 7)**: core sends issue payloads (core `issues/show.api.rsb`, rendered
  as the webhook owner) to webhook endpoints, past plugin hooks and controller patches. If the
  plugin hides, adds or changes issue data, make webhooks consistent with that or record why not.
- **Redmine 7 conventions**: SVG icons through `sprite_icon` (the `icon icon-*` CSS is gone),
  Propshaft assets under `assets/` (`/assets/plugin_assets/<id>/...`), the new header and user menu,
  `ContextMenus::*Controller`, Loofah-based text formatting, Chart.js as an ES module, sudo mode
  (on by default: `t.sudo()` in a scenario). The breaker list is in the migration kit's CHECKLIST.md.
- **Locales**: keep the locales the plugin ships in sync; translate a new key by matching the
  closest existing key in the same file, not from scratch; do not add new languages.
- **5.1 compatibility**: prefer fixes that also run on Redmine 5.1 so they can be merged early;
  say so when a fix cannot.
- **Git**: work on `redmine70-migration` only; never push to the default branch; never force-push
  a branch someone else uses. Descriptive commit messages (what and why). Push after every
  commit, together with the updated status in this file: a cloud session can stop at a usage
  limit, and work that is not pushed is lost with its container.
- **GitHub Actions**: manual only (`workflow_dispatch`). Do not add push, pull_request or schedule
  triggers.

## Definition of done

- All items of the work list are done or explicitly deferred with a reason, in this file.
- The plugin's tests are green on Redmine 7.0-stable-GEOxyz with PostgreSQL and MariaDB
  (numbers in this file); boot, production-like eager load, migrations up/down OK.
- Every function in the inventory exercised end to end on a real running Redmine, with and
  without permissions and on its failure paths; `./.codex/e2e.sh` green; screenshots looked at,
  committed in `docs/e2e/` and listed.
- Review done: your own, and the OpenAI review when the key is present, every finding resolved
  in `docs/reviews/`.
- No new failure when run together with the other GEOxyz plugins.
- "After the upgrade" lists every action production needs; "Status" is current.


## Analysis report (2026-10-06, Dutch)

# custom_field_sql
- Gebruikte branch: main @ c4b0bf9 (2025-07-02) - plugin id custom_field_sql, versie 2.8
- Upstream: apsmir/custom_field_sql - upstream HEAD main @ 13d0792 (2026-07-02)
- Fork t.o.v. upstream: 3 eigen commits (62738d7 redmine_inline_edit-compat #6103, e6740ae CSS-scope #6211, c4b0bf9 bulk edit #6600), 2 upstream-commits ontbreken (3d36b17 2026-05-15 "add new option multi select", 13d0792 2026-07-02 "compatibility with the IssueHotButton plugin")
- Andere relevante branches: upstream heeft alleen main. Geen migraties, geen tests, geen Gemfile (sqlserver-pad gebruikt `TinyTds` zonder gem-declaratie).

## 1. Werkt out of the box op Redmine 7?   DEELS
Harness `custom_field_sql@origin/main` (1006-085035-s2):
- OK bundle, boot (2.8), plugin migrations dev+test
- FAIL eager load: `undefined local variable or method 'unloadable' for class CustomSqlSearchController` - app/controllers/custom_sql_search_controller.rb:3 (`unloadable` bestaat niet meer sinds Rails 7). In productie (eager_load) faalt daarmee de boot van Redmine.
- FAIL smoke: 60/61, `[plugin] /custom_sql_search/search -> HTTP 500` (zelfde oorzaak bij het laden van de controller).

## 2. Upstream sync?   NIET NODIG
De 2 ontbrekende upstream-commits zijn features (multi select-optie voor sql_search, IssueHotButton-compatibiliteit); diffstat t.o.v. origin/main raakt init.rb, formats/sql.rb, custom_sql_search_hook.rb, _sql.html.erb, sql_field.js, sql_search.css, locales - níet de controller, dus upstream heeft dezelfde `unloadable`-blokker. Geen R6/R7-compat upstream. Upstream raakt dezelfde bestanden als de 3 GEOxyz-commits (JS/CSS/hook): conflicten waarschijnlijk. Trial-merge niet uitgevoerd: schrijven in de plugin-repo (branch/commit) werd in deze sessie door de permissie-classifier geweigerd, en een deel van het lezen van de upstream-diff ook. Pas syncen als GEOxyz de multi select-feature wil.

## 3. Werkt na sync op Redmine 7?   n.v.t.

## 4. Complexiteit en blokkers   score 2
- Blokkers: app/controllers/custom_sql_search_controller.rb:3 - `unloadable` - regel verwijderen. Fix niet gecommit (commit in de repo geweigerd door de classifier), wel getest door de regel in de slot-kopie te verwijderen: boot OK, eager load OK, migrations OK, smoke 61/61 (`/custom_sql_search/search` zonder parameters -> 404 i.p.v. 500). Diff:
  ```diff
  --- a/app/controllers/custom_sql_search_controller.rb
  +++ b/app/controllers/custom_sql_search_controller.rb
  @@ -1,7 +1,5 @@
   class CustomSqlSearchController < ApplicationController
   
  -  unloadable
  -
     #  before_action :find_project, :authorize
     before_action :find_custom_field
  ```
- Functioneel getest op Redmine 7 + PostgreSQL (met de fix in de slot): `sql_search`-veld met PG-SQL -> `/custom_sql_search/search?...&term=issue` geeft JSON 200; `sql`-lijstveld (`select subject, id from issues ...`) geeft de juiste opties; SQL-default value (`%{project_id}`) werkt op een nieuw issue.
- PostgreSQL vs MySQL (de SQL staat in de DB, `custom_fields.format_store`): gemeten dat één `sql`-veld met MySQL-dialect (backticks, `is_private = 0`) het hele nieuwe-issue-formulier laat crashen (HTTP 500, `PG::SyntaxError` uit formats/sql.rb:40 `possible_values_options`), en een `sql_search`-veld met MySQL-dialect (`limit 0,5`, `is_private = 0`) geeft 500 op de search-endpoint. Wat op PostgreSQL breekt in opgeslagen SQL:
  - backtick-identifiers (`` `subject` ``) en dubbele quotes als string (`"abc"` is in PG een identifier)
  - booleans vergeleken met integers (`is_closed = 1`, `is_private = 0`, `admin = 1`, `is_public = 1`): PG `operator does not exist: boolean = integer`; gebruik `= true`/`false`
  - `custom_values.value` (text) joinen/vergelijken met een integer-kolom (`cv.value = users.id`): PG eist een cast (`cv.value = users.id::text`)
  - `LIMIT x,y` -> `LIMIT y OFFSET x`; `IFNULL` -> `COALESCE`; `IF(a,b,c)` -> `CASE`; `GROUP_CONCAT` -> `string_agg`; `DATE_FORMAT`/`CURDATE()`/`DATE_SUB(... INTERVAL ...)` -> PG-functies; `||` is in MySQL OR, in PG concatenatie
  - `LIKE` is in MySQL (ci-collatie) hoofdletterongevoelig, in PG niet -> resultaten veranderen stil; gebruik `ILIKE` of `lower()`
  - niet-geaggregeerde kolommen in `GROUP BY`-queries (MySQL zonder ONLY_FULL_GROUP_BY) -> PG-fout
  - README-voorbeeld 2 (`where id = if( ? ='new', id, ?)`) is MySQL-only
  - een parameter met tekst in een integer-vergelijking (`id = 'new'`) wordt in MySQL 0, in PG een fout
  - PG breekt een transactie af na een SQL-fout ("current transaction is aborted"); MySQL laat alleen dat statement falen
  - NB: kolomaliassen worden in PG lowercase gevouwen; de plugin leest `record['value']`/`record['label']`, dus `AS Value` werkt in PG wél (in MySQL niet)
  - Audit-query voor productie: `SELECT id, name, field_format, format_store FROM custom_fields WHERE field_format IN ('sql','sql_search');` en elk statement (ook `default_value`) tegen de PG-staging draaien.
- Stille breuken: geen andere gevonden. `Redmine::FieldFormat::List`/`StringFormat`, `field_attributes`, `possible_values_options`, `group_statement`/`order_statement` bestaan in 7.0 ongewijzigd. Core 7.0 voegt `CustomField#default_value` toe (alleen anders voor date-velden), sql_search gebruikt `default_value` als SQL - werkt (gemeten).
- Security (pre-existing, ook op 5.1, niet migratie-gerelateerd maar ernstig): `CustomSqlSearchController` heeft geen autorisatie (`before_action :find_project, :authorize` staat in commentaar) en bouwt de SQL met `@custom_field.sql % params` uit ruwe request-parameters. Gemeten in de slot: anoniem (login_required=false) geeft 200, en `term=zzznomatch') or 1=1 or lower(subject) like lower('` geeft alle issues terug = SQL-injectie zonder login.
- Overlap met Redmine 7 core: geen.
- Pairwise (statisch): hook `view_issues_form_details_bottom` ook gebruikt door redmine_itil_priority; `view_issues_bulk_edit_details_bottom` idem; `CustomValue#initialize` prepend (geen andere plugin van deze set patcht CustomValue). Custom field formats naast redmine_depending_custom_fields en computed_custom_field: geen attribuutnaam-conflicten.
- Open werk voor ansif:
  - `unloadable` verwijderen (diff hierboven) en committen op `redmine70-migration`.
  - Alle opgeslagen SQL (sql, form_params, default_value) auditen en naar PostgreSQL-dialect omzetten vóór de cut-over (zie lijst).
  - Security: autorisatie op `/custom_sql_search/search` (minstens `authorize`/login + project-zichtbaarheid) en parameters quoten (`ActiveRecord::Base.connection.quote`) i.p.v. ruwe interpolatie.

## Branch redmine70-migration
- Niet aangemaakt: de commit van de fix werd door de permissie-classifier geweigerd ("Modify Shared Resources"). De fix staat hierboven als diff en is in de slot getest.
- Eindresultaat met fix (slot-kopie, eigen herhaling van de harness-stappen): OK boot, OK eager load, OK migrations dev+test, OK smoke 61/61 (1 plugin route, 404 zonder parameters).
- Rollback migraties: n.v.t. (geen migraties)


## Aanvulling coordinator
Branch `redmine70-migration` is wel gepusht, als startpunt zonder commits: gelijk aan de gebruikte branch (c4b0bf9). Fixes die hierboven als diff staan, zijn nog niet gecommit.

