// Stored SQL from before the security fix may use the String#% form %<name>s
// (rehearsal of the 5.1 -> 7.0 upgrade: KeyError, HTTP 500). It is filled and
// escaped like %{name}. The administrator writes a legacy query, the manager
// searches on the issue form; injection through the term returns nothing; the
// reporter is still refused a field hidden from that role.
import { e2e } from '../../.codex/e2e/lib.mjs';
import fields from './support/fields.cjs';

const P = 'e2e-project';
const NAME = 'E2E SQL one project';
const t = await e2e('legacy_placeholder');
const XHR = { headers: { 'X-Requested-With': 'XMLHttpRequest' } };

async function setSql(sql) {
  await t.login('admin');
  await t.go('/custom_fields?tab=IssueCustomField');
  await t.page.locator('table.custom_fields a', { hasText: NAME }).first().click();
  await t.settle();
  await t.page.fill('#custom_field_sql', sql);
  await t.page.click('input[name=commit]');
  await t.settle();
  t.check('save sql');
}

await t.login('admin');
await t.go('/custom_fields?tab=IssueCustomField');
await t.page.locator('table.custom_fields a', { hasText: NAME }).first().click();
await t.settle();
const original = await t.page.inputValue('#custom_field_sql');
const fid = t.page.url().match(/custom_fields\/(\d+)/)[1];
await setSql("select subject as value, id as label from issues where project_id = %<project_id>s and lower(subject) like lower('%%%<term>s%%') order by id");
await t.go(`/custom_fields/${fid}/edit`);
await t.page.locator('#custom_field_sql').scrollIntoViewIfNeeded();
await t.shot('admin-legacy-sql', `Administration: ${NAME} saved with the legacy placeholders %<project_id>s and %<term>s`, { full: false });

await t.login('manager');
await t.go(`/projects/${P}/issues/new`);
const id = await fields.fieldId(t.page, NAME);
await t.page.locator(`#${id}`).pressSequentially('subt', { delay: 80 });
const menu = t.page.locator('ul.sql-autocomplete:visible');
await menu.waitFor({ timeout: 10000 }).catch(() => t.problems.push('legacy: no result list'));
const found = await menu.locator('li').allTextContents();
if (!found.some(x => x.includes('E2E subtask'))) t.problems.push(`legacy results: ${JSON.stringify(found)}`);
t.check('legacy typing');
await t.shot('manager-typing', `Manager, new issue form: typing "subt" in ${NAME} (legacy SQL) lists ${found.join(' | ')}`, { full: false });

const inj = await t.page.request.get(`${t.BASE}/custom_sql_search/search?project_id=${P}&custom_field_id=${fid}&term=${encodeURIComponent("zzz') or 1=1 or lower(subject) like lower('")}`, XHR);
const injRows = inj.ok() ? await inj.json() : null;
if (inj.status() !== 200 || injRows.length !== 0) t.problems.push(`legacy injection: HTTP ${inj.status()} ${JSON.stringify(injRows)}`);
await t.go(`/custom_sql_search/search?project_id=${P}&custom_field_id=${fid}&term=${encodeURIComponent("zzz') or 1=1 or lower(subject) like lower('")}`);
await t.shot('injection', `Injection through the term into the legacy %<term>s: HTTP ${inj.status()}, ${injRows ? injRows.length : '?'} rows`, { full: false });

await t.login('outsider');
const priv = await t.page.request.get(`${t.BASE}/custom_sql_search/search?project_id=e2e-private&custom_field_id=${fid}&term=e2e`, XHR);
if (priv.status() !== 403) t.problems.push(`outsider private with legacy SQL: HTTP ${priv.status()}`);
await t.go(`/custom_sql_search/search?project_id=e2e-private&custom_field_id=${fid}&term=e2e`, { status: 403 });
await t.shot('outsider-refused', `Outsider on private e2e-private: still refused (HTTP ${priv.status()}); the legacy form changes nothing in the checks`, { full: false });

await setSql(original);
await t.done();
