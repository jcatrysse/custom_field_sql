// Jan's general decision (2026-10-07): with the other GEOxyz plugins installed,
// Project > Settings, the issue list and an issue page answer 200 (an
// alias_method/prepend mix on one core method made Project > Settings 500).
// Needs the other plugins (RMP_EXTRA_PLUGINS, see docs/REDMINE7-MIGRATION.md):
//   RMP_E2E_OUT=docs/e2e/together node docs/e2e/together/pages.mjs
import { e2e } from '../../../.codex/e2e/lib.mjs';
const t = await e2e('pages');
for (const user of ['admin', 'manager']) {
  await t.login(user);
  await t.go('/projects/e2e-project/settings');
  await t.shot(`${user}-project-settings`, `${user}: Project > Settings answers 200 with 16 other GEOxyz plugins installed`, { full: false });
  await t.go('/projects/e2e-project/issues');
  await t.shot(`${user}-issue-list`, `${user}: the issue list answers 200`, { full: false });
  const href = await t.page.locator('table.issues td.subject a').first().getAttribute('href');
  await t.go(href);
  await t.shot(`${user}-issue`, `${user}: an issue page (${href}) answers 200`, { full: false });
  await t.go(`${href}/edit`);
  await t.shot(`${user}-issue-edit`, `${user}: its edit form answers 200, the sql_search fields are wired (observeSqlField/observeSqlMultiField)`, { full: false });
  const html = await t.page.content();
  if (!html.includes('observeSqlMultiField(') || !html.includes('observeSqlField(')) t.problems.push(`${user}: sql_search scripts missing on the edit form`);
}
await t.done();
