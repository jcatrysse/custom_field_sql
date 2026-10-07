// Jan's decision 1 (2026-10-07): /custom_sql_search/search works without login
// again; anonymous users get suggestions where the anonymous role may add
// issues, the other checks stay. The administrator gives the anonymous role
// "Add issues", the anonymous user searches on the new issue form and creates
// an issue; refused: a private project, an issue anonymous may not edit, the
// role without the permission, and "Authentication required" in the settings.
import { e2e } from '../../.codex/e2e/lib.mjs';
import fields from './support/fields.cjs';

const P = 'e2e-project';
const t = await e2e('anonymous_search');
const XHR = { headers: { 'X-Requested-With': 'XMLHttpRequest' } };
let fieldIds = {};

async function setAnonymousAddIssues(on) {
  await t.login('admin');
  await t.go('/roles');
  await t.page.locator('table.roles a', { hasText: 'Anonymous' }).first().click();
  await t.settle();
  const box = t.page.locator('input[name="role[permissions][]"][value=add_issues]');
  if (on) {
    await box.check();
    // "Add issues" also needs trackers: all of them
    await t.page.locator('input[type=checkbox][name="role[permissions_all_trackers][add_issues]"]').check({ force: true });
  } else {
    await box.uncheck();
  }
  await t.page.click('input[name=commit]');
  await t.settle();
  t.check(`anonymous add_issues ${on}`);
}

async function setLoginRequired(on) {
  await t.login('admin');
  await t.go('/settings?tab=authentication');
  await t.page.selectOption('#settings_login_required', on ? '1' : '0');
  await t.page.locator('#tab-content-authentication input[name=commit]').click();
  await t.settle();
  t.check(`login required ${on}`);
}

async function status(query) {
  const res = await t.page.request.get(`${t.BASE}/custom_sql_search/search?${query}`, XHR);
  return [res.status(), res.ok() ? await res.json() : null];
}

// start from the default: no "Add issues" for anonymous (also after an interrupted run)
await setAnonymousAddIssues(false);

// field ids from the issue form, as the manager sees it
await t.login('manager');
await t.go(`/projects/${P}/issues/new`);
for (const n of ['E2E SQL search', 'E2E SQL multi']) fieldIds[n] = (await fields.fieldId(t.page, n)).split('_').pop();
const issueId = (await t.page.request.get(`${t.BASE}/projects/${P}/issues.json?subject=E2E+assigned+issue&status_id=*`)
  .then(r => r.json())).issues[0].id;
const q = (extra = '') => `project_id=${P}&custom_field_id=${fieldIds['E2E SQL search']}&term=e2e${extra}`;

// before: the anonymous role may not add issues (default)
await t.anonymous();
let [code] = await status(q());
if (code !== 401) t.problems.push(`anonymous without add_issues: HTTP ${code}`);
await t.go(`/projects/${P}/issues/new`);
if (!t.page.url().includes('/login')) t.problems.push(`anonymous new issue without add_issues: ${t.page.url()}`);
await t.shot('refused-without-permission', `Anonymous, the anonymous role without "Add issues": the new issue form sends to the login form, the search answers HTTP ${code}`, { full: false });

// the administrator gives the anonymous role "Add issues"
await setAnonymousAddIssues(true);
await t.page.locator('table.roles a', { hasText: 'Anonymous' }).first().click();
await t.settle();
if (!(await t.page.isChecked('input[name="role[permissions][]"][value=add_issues]'))) t.problems.push('anonymous role: add_issues not saved');
await t.page.locator('input[name="role[permissions][]"][value=add_issues]').scrollIntoViewIfNeeded();
await t.shot('role-add-issues', 'Administration > Roles and permissions > Anonymous: "Add issues" ticked (all trackers) and saved', { full: false });

await t.anonymous();
await t.go(`/projects/${P}/issues/new`);
const search = await fields.fieldId(t.page, 'E2E SQL search');
await t.page.fill('#issue_subject', `E2E anonymous issue ${Date.now() % 100000}`);
await t.page.fill(`#${search}`, '');
await t.page.locator(`#${search}`).pressSequentially('subt', { delay: 80 });
const menu = t.page.locator('ul.sql-autocomplete:visible');
await menu.waitFor({ timeout: 10000 }).catch(() => t.problems.push('anonymous: no result list'));
const found = await menu.locator('li').allTextContents();
if (!found.some(x => x.includes('E2E subtask'))) t.problems.push(`anonymous results: ${JSON.stringify(found)}`);
t.check('anonymous typing');
await t.shot('typing', `Anonymous on the new issue form of public e2e-project: typing "subt" lists ${found.join(' | ')}`, { full: false });
await menu.locator('li', { hasText: 'E2E subtask' }).first().click();
const multi = await fields.fieldId(t.page, 'E2E SQL multi');
await t.page.locator(`#${multi}`).pressSequentially('rela', { delay: 80 });
await menu.waitFor({ timeout: 10000 }).catch(() => t.problems.push('anonymous multi: no result list'));
await menu.locator('li', { hasText: 'E2E related issue' }).first().click();
await t.page.click('#issue-form input[name=commit]');
await t.settle();
t.check('anonymous create');
const body = await t.page.locator('#content').innerText();
if (!/E2E SQL search:\s*E2E subtask/.test(body) || !/E2E SQL multi:\s*E2E related issue/.test(body)) t.problems.push(`anonymous issue: ${body.slice(0, 300)}`);
await t.shot('created', 'Anonymous created an issue with E2E SQL search = E2E subtask and E2E SQL multi = E2E related issue, both picked from the suggestions');

// the other checks stay
[code] = await status(`project_id=e2e-private&custom_field_id=${fieldIds['E2E SQL search']}&term=e2e`);
if (code !== 401) t.problems.push(`anonymous private project: HTTP ${code}`);
let [code2] = await status(q(`&issue_id=${issueId}`));
if (code2 !== 401) t.problems.push(`anonymous issue_id of an issue it may not edit: HTTP ${code2}`);
await t.go(`/custom_sql_search/search?${q(`&issue_id=${issueId}`)}`);
await t.shot('refused-issue-and-private', `Anonymous with "Add issues": private e2e-private HTTP ${code}, issue #${issueId} (anonymous may not edit it) HTTP ${code2}; opened as a page it sends to the login form`, { full: false });

// logged in users are unchanged
for (const user of ['admin', 'manager', 'reporter', 'outsider']) {
  await t.login(user);
  const [c, rows] = await status(q());
  if (c !== 200 || !rows.length) t.problems.push(`${user}: HTTP ${c}`);
  const [cp] = await status(`project_id=e2e-private&custom_field_id=${fieldIds['E2E SQL search']}&term=e2e`);
  const expect = ['admin', 'manager'].includes(user) ? 200 : (user === 'reporter' ? 403 : 403);
  if (cp !== expect) t.problems.push(`${user} private: HTTP ${cp}, expected ${expect}`);
  if (user === 'reporter') {
    await t.go(`/custom_sql_search/search?${q()}`);
    await t.shot('reporter', `Reporter: the search answers JSON (${rows.length} rows) on e2e-project, HTTP ${cp} on e2e-private`, { full: false });
  }
}

// "Authentication required" still refuses anonymous users
await setLoginRequired(true);
await t.anonymous();
[code] = await status(q());
if (code !== 401) t.problems.push(`anonymous with login required: HTTP ${code}`);
await t.go(`/custom_sql_search/search?${q()}`);
if (!t.page.url().includes('/login')) t.problems.push(`login required: not sent to login (${t.page.url()})`);
await t.shot('login-required', `Settings > Authentication > "Authentication required" on: anonymous gets HTTP ${code} and the login form, even with "Add issues"`, { full: false });
await setLoginRequired(false);

// and without "Add issues" again: refused
await setAnonymousAddIssues(false);
await t.anonymous();
[code] = await status(q());
if (code !== 401) t.problems.push(`anonymous after removing add_issues: HTTP ${code}`);
await t.go(`/custom_sql_search/search?${q()}`);
await t.shot('refused-again', `"Add issues" removed from the anonymous role again: the search answers HTTP ${code} (login form as a page)`, { full: false });

await t.done();
