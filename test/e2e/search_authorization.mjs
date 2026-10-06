// /custom_sql_search/search, the request behind every sql_search field: who
// gets results, who is refused, and request values that try to change the SQL.
// Each case is opened in the browser (the JSON is the page) and also requested
// the way the field does it (XHR, JSON).
import { e2e } from '../../.codex/e2e/lib.mjs';
import fields from './support/fields.cjs';

const t = await e2e('search_authorization');

// ids from the forms the manager sees
await t.login('manager');
await t.go('/projects/e2e-project/issues/new');
const projectId = (await t.page.content()).match(/search\?project_id=(\d+)/)[1];
const f = {};
for (const name of ['E2E SQL search', 'E2E SQL search by form', 'E2E SQL managers only', 'E2E SQL one project', 'E2E SQL list']) {
  f[name] = (await fields.fieldId(t.page, name)).split('_').pop();
}
await t.go('/projects/e2e-private/issues/new');
const privateId = (await t.page.content()).match(/search\?project_id=(\d+)/)[1];
await t.go('/projects/e2e-project/issues?set_filter=1&f[]=subject&op[subject]=~&v[subject][]=E2E+assigned+issue');
const publicIssue = (await t.page.locator('table.issues td.id a').first().textContent()).trim();
await t.go('/projects/e2e-private/issues');
const privateIssue = (await t.page.locator('table.issues td.id a').first().textContent()).trim();

const url = (field, params = {}) => '/custom_sql_search/search?' + new URLSearchParams({
  custom_field_id: f[field], project_id: projectId, issue_id: '', term: 'E2E', ...params });

async function check(shotName, caption, path, expected, test) {
  const res = await t.page.request.get(t.BASE + path, { headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } });
  const body = await res.text();
  if (res.status() !== expected) t.problems.push(`${shotName}: XHR HTTP ${res.status()}, expected ${expected}: ${body.slice(0, 200)}`);
  if (test && !test(body)) t.problems.push(`${shotName}: unexpected body ${body.slice(0, 300)}`);
  const nav = await t.page.goto(t.BASE + path);
  await t.settle();
  t.check(shotName, { requests: ['403', '404', '401'] });
  await t.shot(shotName, `${caption} (XHR: HTTP ${res.status()}${expected === 200 ? `, ${JSON.parse(body).length} rows` : ''}; page: HTTP ${nav.status()})`, { full: false });
}

await check('manager', 'Manager, field "E2E SQL search", term E2E: the subjects of e2e-project only',
  url('E2E SQL search'), 200, b => JSON.parse(b).length > 0 && !b.includes('E2E private issue'));
await check('manager-edit-issue', 'Manager, the edit form of an issue (issue_id given, may edit it): allowed',
  url('E2E SQL search', { issue_id: publicIssue }), 200, b => JSON.parse(b).length > 0);
await check('injection-term', "Manager, a term that closes the quote and adds a UNION over every login and password hash (the request that leaked them before): no rows, the term stays text",
  url('E2E SQL search', { term: "zzz') union select login || ':' || hashed_password, null from users --" }), 200, b => b === '[]');
await check('injection-quote', "Manager, field \"E2E SQL search\", term `x%') or 1=1 or ('`: no rows",
  url('E2E SQL search', { term: "x%') or 1=1 or ('" }), 200, b => b === '[]');
await check('injection-form-param', "Manager, form parameter p0 that closes the quote and adds a UNION over every login and password hash (test users): no rows",
  url('E2E SQL search by form', { p0: "zzz' union select login || ':' || hashed_password, null from users --" }), 200, b => b === '[]');
await check('managers-only', 'Manager, field visible to "E2E full" only: allowed', url('E2E SQL managers only', { term: 'man' }), 200,
  b => b.includes('manager'));
await check('field-not-in-project', 'Manager, field enabled for e2e-project only, asked for e2e-private: refused',
  url('E2E SQL one project', { project_id: privateId }), 403);
await check('not-sql-search', 'Manager, the id of an "sql" list field: not found', url('E2E SQL list'), 404);
await check('unknown-project', 'Manager, a project that does not exist: not found', url('E2E SQL search', { project_id: '999999' }), 404);

await t.login('reporter');
await check('reporter', 'Reporter (core role with add issues), field "E2E SQL search": allowed', url('E2E SQL search'), 200,
  b => JSON.parse(b).length > 0);
await check('reporter-issue-not-editable', 'Reporter (may add, not edit issues), issue_id of a visible issue of someone else: refused',
  url('E2E SQL search', { issue_id: publicIssue }), 403);
await check('reporter-hidden-field', 'Reporter, field visible to "E2E full" only: refused', url('E2E SQL managers only', { term: 'man' }), 403);
await check('reporter-private-issue', `Reporter, issue_id of private issue #${privateIssue}: not found`, url('E2E SQL search', { issue_id: privateIssue }), 404);

await t.login('outsider');
await check('outsider-private', 'Outsider, private project e2e-private: refused', url('E2E SQL search', { project_id: privateId }), 403);
await check('outsider-public', 'Outsider on public e2e-project (core role "Non member" may add issues): allowed', url('E2E SQL search'), 200);

await t.anonymous();
const res = await t.page.request.get(t.BASE + url('E2E SQL search'), { headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } });
// Redmine answers a JSON request without API auth with 403 (401 for HTML XHR)
if (res.status() !== 403) t.problems.push(`anonymous XHR: HTTP ${res.status()}`);
await t.go(url('E2E SQL search'));
if (!t.page.url().includes('/login')) t.problems.push(`anonymous page: not sent to login (${t.page.url()})`);
await t.shot('anonymous', `Anonymous (login not required in the settings): XHR HTTP ${res.status()}, the page sends to the login form`, { full: false });

await t.done();
