// Multi select of the sql_search format (Jan's decision 3, upstream 3d36b17) and
// its compatibility with IssueHotButton (upstream 13d0792), which sends the form
// with form.submit(): tags under the input, a "+" for a value of one's own when
// strict selection is off, the values stored as a JSON array and shown as a list,
// on the new and edit issue form, the issue form update, bulk edit and the list;
// as manager, reporter and outsider, and the refusals.
import { e2e } from '../../.codex/e2e/lib.mjs';
import fields from './support/fields.cjs';

const P = 'e2e-project';
const NAME = 'E2E SQL multi';
const SUBJECT = `E2E multi select ${Date.now() % 100000}`; // a new issue per run
const t = await e2e('multi_select');
const menu = () => t.page.locator('ul.sql-autocomplete:visible');
const tags = id => t.page.locator(`#${id}_tags .sql-multi-tag-text`).allTextContents();
const stored = id => t.page.inputValue(`#${id}_value`);
const row = subject => t.page.locator('table.issues tr.issue')
  .filter({ has: t.page.locator('td.subject a', { hasText: new RegExp(`^${subject}$`) }) });

async function pick(id, typed, item) {
  await t.page.fill(`#${id}`, '');
  await t.page.locator(`#${id}`).pressSequentially(typed, { delay: 80 });
  await menu().waitFor({ timeout: 10000 }).catch(() => t.problems.push(`"${typed}": no result list`));
  const found = await menu().locator('li').allTextContents();
  if (item) await menu().locator('li', { hasText: item }).first().click();
  return found;
}

// administration: the setting
await t.login('admin');
await t.go('/custom_fields?tab=IssueCustomField');
await t.page.locator('table.custom_fields a', { hasText: NAME }).first().click();
await t.settle();
const fieldUrl = t.page.url().replace(t.BASE, '');
const fid = fieldUrl.match(/custom_fields\/(\d+)/)[1];
if (!(await t.page.isChecked('#custom_field_multi_select'))) t.problems.push('admin: multiple selection not checked');
await t.page.locator('#custom_field_multi_select').scrollIntoViewIfNeeded();
await t.shot('admin-setting', `Administration > Custom fields > ${NAME}: the new setting "Multiple selection" (checked), under the other sql search settings`);

// manager, new issue: two values from the list and one of one's own
await t.login('manager');
await t.go(`/projects/${P}/issues/new`);
const id = await fields.fieldId(t.page, NAME);
await t.page.fill('#issue_subject', SUBJECT);
let found = await pick(id, 'subt', 'E2E subtask');
if (!found.some(x => x.includes('E2E subtask'))) t.problems.push(`new: results ${JSON.stringify(found)}`);
await pick(id, 'rela', 'E2E related issue');
found = await pick(id, 'e2e ');
if (found.some(x => /E2E subtask|E2E related issue/.test(x))) t.problems.push(`chosen values are offered again: ${JSON.stringify(found)}`);
await t.shot('new-tags', `New issue: "E2E subtask" and "E2E related issue" picked as tags; typing "e2e " offers the other issues only: ${found.join(' | ')}`, { full: false });
await t.page.keyboard.press('Escape');

// strict selection off: a value that is not in the list, with "+"
await t.page.fill(`#${id}`, '');
await t.page.locator(`#${id}`).pressSequentially('zz own value', { delay: 60 });
const add = t.page.locator(`#${id}`).locator('xpath=..').locator('.sql-multi-add-btn');
await add.waitFor({ state: 'visible', timeout: 10000 }).catch(() => t.problems.push('"+" not shown without results'));
await t.shot('new-add-button', `Strict selection off: "zz own value" has no result, the green "+" (title "${await add.getAttribute('title')}") adds it`, { full: false });
await add.click();
let now = await tags(id);
if (now.join('|') !== 'E2E subtask|E2E related issue|zz own value') t.problems.push(`tags after +: ${JSON.stringify(now)}`);

// remove a tag
await t.page.locator(`#${id}_tags .sql-multi-tag`, { hasText: 'E2E related issue' }).locator('.sql-multi-tag-remove').click();
now = await tags(id);
if (now.join('|') !== 'E2E subtask|zz own value') t.problems.push(`tags after remove: ${JSON.stringify(now)}`);
const edited = await t.page.evaluate(i => $.data(document.getElementById(i + '_value'), 'edited') === true, id);
if (!edited) t.problems.push('jQuery data "edited" not set (redmine_inline_edit_issues)');

// the issue form update (another tracker) keeps the values
const trackers = await t.page.locator('#issue_tracker_id option').allTextContents();
await t.page.selectOption('#issue_tracker_id', { label: trackers.find(x => x !== 'Bug') || trackers[1] });
await t.page.waitForTimeout(1500);
await t.settle();
t.check('issue form update');
now = await tags(id);
if (now.join('|') !== 'E2E subtask|zz own value') t.problems.push(`tags after the form update: ${JSON.stringify(now)}`);
await t.shot('new-after-update', `After removing "E2E related issue" and switching the tracker (the form is rebuilt): tags ${now.join(', ')}; stored ${await stored(id)}`, { full: false });

await t.page.click('#issue-form input[name=commit]');
await t.settle();
t.check('create');
const issueUrl = t.page.url().replace(t.BASE, '');
let body = await t.page.locator('#content').innerText();
if (!body.includes(`${NAME}:\nE2E subtask, zz own value`) && !/E2E SQL multi:\s*E2E subtask, zz own value/.test(body)) t.problems.push(`created issue shows: ${body.slice(0, 400)}`);
await t.shot('saved', `Created ${issueUrl}: ${NAME} shows "E2E subtask, zz own value" (stored as ["E2E subtask","zz own value"])`);

// edit: the tags come back, send the form with form.submit() as IssueHotButton does
await t.go(`${issueUrl}/edit`);
now = await tags(id);
if (now.join('|') !== 'E2E subtask|zz own value') t.problems.push(`edit form tags: ${JSON.stringify(now)}`);
await t.page.locator(`#${id}_tags .sql-multi-tag`, { hasText: 'zz own value' }).locator('.sql-multi-tag-remove').click();
await pick(id, 'clos', 'E2E closed issue');
await t.shot('edit-tags', `Edit form: the saved values come back as tags; "zz own value" removed, "E2E closed issue" added`, { full: false });
await Promise.all([
  t.page.waitForNavigation(),
  t.page.evaluate(() => HTMLFormElement.prototype.submit.call(document.getElementById('issue-form'))),
]);
await t.settle();
t.check('form.submit()');
body = await t.page.locator('#content').innerText();
if (!/E2E SQL multi:\s*E2E subtask, E2E closed issue/.test(body)) t.problems.push(`after form.submit(): ${body.slice(0, 400)}`);
await t.shot('hot-button-submit', `Sent with form.submit() (no submit event, the way IssueHotButton sends it): ${NAME} = "E2E subtask, E2E closed issue"`);

// bulk edit: the same values on two issues; an empty multi field changes nothing
await t.go(`/projects/${P}/issues?set_filter=1&f[]=subject&op[subject]=~&v[subject][]=E2E+&sort=id`);
await row('E2E assigned issue').locator('input[type=checkbox]').check();
await row('E2E closed issue').locator('input[type=checkbox]').check();
await row('E2E closed issue').locator('td.status').click({ button: 'right' });
await t.page.locator('#context-menu a', { hasText: 'Bulk edit' }).click();
await t.settle();
t.check('open bulk edit');
const bulkId = await fields.fieldId(t.page, NAME);
await pick(bulkId, 'unas', 'E2E unassigned issue');
await pick(bulkId, 'rela', 'E2E related issue');
await t.shot('bulk-edit', `Bulk edit of 2 issues: tags ${(await tags(bulkId)).join(', ')}`, { full: false });
await t.page.click('#bulk_edit_form input[type=submit]');
await t.settle();
t.check('bulk update');
await t.go(`/projects/${P}/issues?set_filter=1&f[]=subject&op[subject]=~&v[subject][]=E2E+&c[]=subject&c[]=cf_${fid}&sort=id`);
for (const subject of ['E2E assigned issue', 'E2E closed issue']) {
  const text = await row(subject).innerText({ timeout: 5000 }).catch(() => 'missing');
  if (!text.includes('E2E unassigned issue, E2E related issue')) t.problems.push(`after bulk update ${subject}: ${text}`);
}
const untouched = await row(SUBJECT).innerText().catch(() => 'missing');
if (!untouched.includes('E2E subtask, E2E closed issue')) t.problems.push(`issue not in the bulk edit changed: ${untouched}`);
await t.shot('list', `Issue list with the column ${NAME}: the comma separated values; the two bulk edited issues have "E2E unassigned issue, E2E related issue"`);

// bulk edit without touching the multi field keeps the values
await t.go(`/projects/${P}/issues?set_filter=1&f[]=subject&op[subject]=~&v[subject][]=E2E+&sort=id`);
await row('E2E assigned issue').locator('input[type=checkbox]').check();
await row(SUBJECT).locator('input[type=checkbox]').check();
await row('E2E assigned issue').locator('td.status').click({ button: 'right' });
await t.page.locator('#context-menu a', { hasText: 'Bulk edit' }).click();
await t.settle();
await t.page.fill('#notes', 'Bulk note, multi field left empty');
await t.page.click('#bulk_edit_form input[type=submit]');
await t.settle();
t.check('bulk update without the field');
await t.go(`/projects/${P}/issues?set_filter=1&f[]=subject&op[subject]=~&v[subject][]=E2E+&c[]=subject&c[]=cf_${fid}&sort=id`);
const kept = await row('E2E assigned issue').innerText().catch(() => 'missing');
const kept2 = await row(SUBJECT).innerText().catch(() => 'missing');
if (!kept.includes('E2E unassigned issue, E2E related issue')) t.problems.push(`bulk edit without the field cleared it: ${kept}`);
if (!kept2.includes('E2E subtask, E2E closed issue')) t.problems.push(`bulk edit without the field cleared it: ${kept2}`);
await t.shot('bulk-untouched', `Bulk edit of "E2E assigned issue" and "${SUBJECT}" with only a note: each keeps its own multi values`);

// bulk edit "Clear" empties the multi field of the selected issues
await t.go(`/projects/${P}/issues?set_filter=1&f[]=subject&op[subject]=~&v[subject][]=E2E+&sort=id`);
const closedId = (await row('E2E closed issue').getAttribute('id')).replace('issue-', '');
await t.go(`/issues/bulk_edit?ids[]=${closedId}`);
const clearId = await fields.fieldId(t.page, NAME);
await t.page.locator(`#${clearId}`).locator('xpath=ancestor::p[1]').locator('input[type=checkbox][value=__none__]').check();
await t.shot('bulk-clear', `Bulk edit of "E2E closed issue": "Clear" ticked under ${NAME} (the input is disabled)`, { full: false });
await t.page.click('#bulk_edit_form input[type=submit]');
await t.settle();
t.check('bulk clear');
await t.go(`/projects/${P}/issues?set_filter=1&f[]=subject&op[subject]=~&v[subject][]=E2E+&c[]=subject&c[]=cf_${fid}&sort=id`);
const cleared = await row('E2E closed issue').innerText().catch(() => 'missing');
const other = await row('E2E assigned issue').innerText().catch(() => 'missing');
if (cleared.includes('E2E unassigned issue')) t.problems.push(`bulk clear kept the values: ${cleared}`);
if (!other.includes('E2E unassigned issue, E2E related issue')) t.problems.push(`bulk clear touched another issue: ${other}`);
await t.shot('bulk-cleared', `After "Clear": "E2E closed issue" has no ${NAME} any more, "E2E assigned issue" keeps its values`);

// reporter (core role, may add issues) and outsider (non member of the public project)
for (const user of ['reporter', 'outsider']) {
  await t.login(user);
  await t.go(`/projects/${P}/issues/new`);
  const rid = await fields.fieldId(t.page, NAME);
  found = await pick(rid, 'subt', 'E2E subtask');
  if ((await tags(rid)).join('|') !== 'E2E subtask') t.problems.push(`${user}: tags ${JSON.stringify(await tags(rid))}`);
  await t.shot(`${user}-new`, `${user} on the new issue form of public e2e-project: the search answers (${found.join(' | ')}), "E2E subtask" picked as a tag`, { full: false });
}
await t.go('/projects/e2e-private/issues/new', { status: 403 });
await t.shot('outsider-private', 'Outsider: the new issue form of private e2e-private is refused (403), so no multi field there', { full: false });
const res = await t.page.request.get(`${t.BASE}/custom_sql_search/search?project_id=e2e-private&custom_field_id=${fid}&term=e2e`,
  { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
if (res.status() !== 403) t.problems.push(`outsider search in e2e-private: HTTP ${res.status()}`);

// strict selection on: no "+", only listed values
await t.login('admin');
await t.go(fieldUrl);
await t.page.check('#custom_field_strict_selection');
await t.page.click('input[name=commit]');
await t.settle();
t.check('strict on');
await t.login('manager');
await t.go(`/projects/${P}/issues/new`);
await t.page.fill(`#${id}`, '');
await t.page.locator(`#${id}`).pressSequentially('zz own value', { delay: 60 });
await t.page.waitForTimeout(1500);
const plus = await t.page.locator(`#${id}`).locator('xpath=..').locator('.sql-multi-add-btn').isVisible();
await t.page.keyboard.press('Enter');
if (plus || (await tags(id)).length) t.problems.push(`strict: "+" visible=${plus}, tags ${JSON.stringify(await tags(id))}`);
await t.shot('strict-no-add', `Strict selection on: "zz own value" has no result and there is no "+"; Enter adds nothing (tags: none)`, { full: false });
await t.login('admin');
await t.go(fieldUrl);
await t.page.uncheck('#custom_field_strict_selection');
await t.page.click('input[name=commit]');
await t.settle();
t.check('strict off');

await t.done();
