// Jan's decision 2 (2026-10-07): sql_search fields of projects, users and time
// entries keep working. The plugin wires only issue forms (as upstream); these
// fields are wired by a script of one's own, as a view_customize script would do:
// observeSqlField('<input id>', '/custom_sql_search/search?...', {}, {}).
// Each field as admin, manager, reporter and outsider, with the refusals: no
// edit_project, no log_time, a private project, a user field that is not editable,
// anonymous.
import { e2e } from '../../.codex/e2e/lib.mjs';

const P = 'e2e-project';
const t = await e2e('other_fields');
const XHR = { headers: { 'X-Requested-With': 'XMLHttpRequest' } };
const menu = () => t.page.locator('ul.sql-autocomplete:visible');
const ids = {};

async function inputFor(label) {
  const id = await t.page.evaluate(n => {
    const l = [...document.querySelectorAll('label')].find(x => x.textContent.replace('*', '').trim() === n);
    return l && l.getAttribute('for');
  }, label);
  if (!id) throw new Error(`no field "${label}" on ${t.page.url()}`);
  return id;
}

// the script of one's own
async function wire(id, query) {
  await t.page.evaluate(([i, u]) => observeSqlField(i, u, {}, { search_by_click: '0', strict_selection: '0', strict_error_message: '' }),
    [id, `/custom_sql_search/search?${query}`]);
}

async function type(id, text, item) {
  await t.page.fill(`#${id}`, '');
  await t.page.locator(`#${id}`).pressSequentially(text, { delay: 80 });
  await menu().waitFor({ timeout: 10000 }).catch(() => t.problems.push(`${t.page.url()} "${text}": no result list`));
  const found = await menu().locator('li').allTextContents();
  if (item) await menu().locator('li', { hasText: item }).first().click();
  return found;
}

async function status(query) {
  const res = await t.page.request.get(`${t.BASE}/custom_sql_search/search?${query}`, XHR);
  return res.status();
}

function expect(what, got, want) {
  if (got !== want) t.problems.push(`${what}: HTTP ${got}, expected ${want}`);
  return got;
}

// field ids, as the administrator sees them
await t.login('admin');
for (const [tab, name] of [['ProjectCustomField', 'E2E project search'], ['UserCustomField', 'E2E user search'], ['TimeEntryCustomField', 'E2E time search']]) {
  await t.go(`/custom_fields?tab=${tab}`);
  const href = await t.page.locator('table.custom_fields a', { hasText: name }).first().getAttribute('href');
  ids[name] = href.match(/custom_fields\/(\d+)/)[1];
}
const pq = (project = P) => `custom_field_id=${ids['E2E project search']}&project_id=${project}`;
const uq = () => `custom_field_id=${ids['E2E user search']}`;
const tq = (project = P) => `custom_field_id=${ids['E2E time search']}&project_id=${project}`;

// project field, new project form (admin: may create projects)
await t.go('/projects/new');
let id = await inputFor('E2E project search');
await wire(id, `custom_field_id=${ids['E2E project search']}`);
let found = await type(id, 'e2e');
await t.shot('project-new', `Admin, new project form: the project field "E2E project search", wired by a script of one's own, lists ${found.join(' | ')}`, { full: false });

// user field on the user form (administrators)
await t.go('/users');
const reporterId = (await t.page.locator('#content a', { hasText: /^reporter$/ }).first().getAttribute('href')).match(/users\/(\d+)/)[1];
await t.go(`/users/${reporterId}/edit`);
id = await inputFor('E2E user search');
await wire(id, uq());
found = await type(id, 'out', 'outsider');
await t.page.locator('#content input[name=commit]').first().click();
await t.settle();
await t.sudo();
t.check('admin saves a user');
await t.go(`/users/${reporterId}/edit`);
if (await t.page.inputValue(`#${id}`) !== 'outsider') t.problems.push(`user form: value ${await t.page.inputValue(`#${id}`)}`);
await t.shot('user-admin-form', `Admin, Users > reporter: the user field "E2E user search" listed ${found.join(' | ')}; "outsider" picked and saved`, { full: false });

// manager: project settings (edit_project), My account, time entry (log_time)
await t.login('manager');
await t.go(`/projects/${P}/settings`);
id = await inputFor('E2E project search');
await wire(id, pq());
found = await type(id, 'priv', 'E2E private');
await t.page.locator('#tab-content-info input[name=commit], form.edit_project input[name=commit]').first().click();
await t.settle();
t.check('manager saves the project');
await t.go(`/projects/${P}`);
let body = await t.page.locator('#content').innerText();
if (!/E2E project search:\s*E2E private/.test(body)) t.problems.push(`project overview: ${body.slice(0, 300)}`);
await t.shot('project-settings', `Manager (edit_project), project settings: "priv" listed ${found.join(' | ')}; saved, the overview shows E2E project search = E2E private`);

await t.go('/my/account');
id = await inputFor('E2E user search');
await wire(id, uq());
found = await type(id, 'rep', 'reporter');
await t.page.locator('#content input[name=commit]').first().click();
await t.settle();
t.check('manager saves my account');
await t.go('/my/account');
if (await t.page.inputValue(`#${id}`) !== 'reporter') t.problems.push(`my account: value ${await t.page.inputValue(`#${id}`)}`);
await t.shot('user-my-account', `Manager, My account (an editable user field): "rep" listed ${found.join(' | ')}; "reporter" saved`, { full: false });

await t.go(`/projects/${P}/time_entries/new`);
id = await inputFor('E2E time search');
await wire(id, tq());
found = await type(id, 'subt', 'E2E subtask');
await t.page.fill('#time_entry_hours', '0.5');
const activity = await t.page.locator('#time_entry_activity_id option').evaluateAll(o => o.map(x => x.value).filter(Boolean)[0]);
await t.page.selectOption('#time_entry_activity_id', activity);
await t.page.locator('#new_time_entry input[name=commit]').first().click();
await t.settle();
t.check('manager logs time');
await t.go(`/projects/${P}/time_entries?set_filter=1&c[]=spent_on&c[]=user&c[]=hours&c[]=cf_${ids['E2E time search']}`);
body = await t.page.locator('#content').innerText();
if (!body.includes('E2E subtask')) t.problems.push(`time entry list: ${body.slice(0, 300)}`);
await t.shot('time-entry', `Manager (log_time), Spent time > Log time: the time entry field listed ${found.join(' | ')}; saved, the list shows E2E time search = E2E subtask`);

// global time entry form: no project, the query gets project_id null
await t.go('/time_entries/new');
id = await inputFor('E2E time search');
expect('manager, time field without project', await status(`custom_field_id=${ids['E2E time search']}&term=subt`), 200);
await t.shot('time-entry-global', 'Manager, global Log time form (no project yet): the search answers 200; the query has %{project_id} = null, so no rows', { full: false });

// reporter: no edit_project, may log time (core Reporter), editable user field
await t.login('reporter');
await t.go(`/projects/${P}/settings`, { status: 403 });
let code = expect('reporter project field', await status(`${pq()}&term=e2e`), 403);
await t.shot('project-reporter-refused', `Reporter (no edit_project): project settings 403, the project field search HTTP ${code}`, { full: false });
await t.go(`/projects/${P}/time_entries/new`);
id = await inputFor('E2E time search');
await wire(id, tq());
found = await type(id, 'rela');
await t.shot('time-entry-reporter', `Reporter (core role with log_time): the time entry field lists ${found.join(' | ')}`, { full: false });
await t.go('/my/account');
id = await inputFor('E2E user search');
await wire(id, uq());
found = await type(id, 'man');
await t.shot('user-reporter', `Reporter, My account: the editable user field lists ${found.join(' | ')}`, { full: false });

// outsider: no membership
await t.login('outsider');
code = expect('outsider project field e2e-private', await status(`${pq('e2e-private')}&term=e2e`), 403);
const code2 = expect('outsider time field e2e-project', await status(`${tq()}&term=e2e`), 403);
const code3 = expect('outsider project field new project', await status(`custom_field_id=${ids['E2E project search']}&term=e2e`), 403);
await t.go(`/custom_sql_search/search?${tq()}&term=e2e`, { status: 403 });
await t.shot('outsider-refused', `Outsider: project field on e2e-private HTTP ${code}, without project (may not create projects) HTTP ${code3}; time field on e2e-project (non member, no log_time) HTTP ${code2}`, { full: false });
await t.go('/my/account');
id = await inputFor('E2E user search');
await wire(id, uq());
found = await type(id, 'adm');
await t.shot('user-outsider', `Outsider, My account: the editable user field lists ${found.join(' | ')}`, { full: false });

// a user field that is not editable: administrators only
await t.login('admin');
await t.go(`/custom_fields/${ids['E2E user search']}/edit`);
await t.page.uncheck('#custom_field_editable');
await t.page.click('input[name=commit]');
await t.settle();
t.check('user field not editable');
await t.login('manager');
code = expect('manager, user field not editable', await status(`${uq()}&term=rep`), 403);
await t.go(`/custom_sql_search/search?${uq()}&term=rep`, { status: 403 });
await t.shot('user-not-editable', `User field no longer editable by users: the manager gets HTTP ${code} (the field is gone from My account too)`, { full: false });
await t.login('admin');
expect('admin, user field not editable', await status(`${uq()}&term=rep`), 200);
await t.go(`/custom_fields/${ids['E2E user search']}/edit`);
await t.page.check('#custom_field_editable');
await t.page.click('input[name=commit]');
await t.settle();

// anonymous: none of them
await t.anonymous();
for (const q of [`${pq()}&term=e2e`, `${uq()}&term=rep`, `${tq()}&term=e2e`]) expect(`anonymous ${q}`, await status(q), 401);
await t.go(`/custom_sql_search/search?${uq()}&term=rep`);
await t.shot('anonymous', 'Anonymous: project, user and time entry fields answer 401 (as a page: the login form)', { full: false });

await t.done();
