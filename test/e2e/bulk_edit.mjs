// Bulk edit (GEOxyz #6600): the sql list offers its options and the sql_search
// field searches on the bulk edit form, and both values are saved on every
// selected issue.
import { e2e } from '../../.codex/e2e/lib.mjs';
import fields from './support/fields.cjs';

const P = 'e2e-project';
const t = await e2e('bulk_edit');
const row = subject => t.page.locator('table.issues tr.issue')
  .filter({ has: t.page.locator('td.subject a', { hasText: new RegExp(`^${subject}$`) }) });

await t.login('manager');
await t.go(`/projects/${P}/issues?set_filter=1&f[]=subject&op[subject]=~&v[subject][]=E2E+&sort=id`);
await row('E2E unassigned issue').locator('input[type=checkbox]').check();
await row('E2E related issue').locator('input[type=checkbox]').check();
await row('E2E related issue').locator('td.status').click({ button: 'right' });
await t.page.locator('#context-menu a', { hasText: 'Bulk edit' }).click();
await t.settle();
t.check('open bulk edit');
if (!t.page.url().includes('/issues/bulk_edit')) t.problems.push(`bulk edit not opened: ${t.page.url()}`);

const list = await fields.fieldId(t.page, 'E2E SQL list');
const search = await fields.fieldId(t.page, 'E2E SQL search');
const options = await t.page.locator(`#${list} option`).allTextContents();
if (!options.includes('E2E closed issue')) t.problems.push(`bulk list options: ${JSON.stringify(options)}`);
await t.page.selectOption(`#${list}`, { label: 'E2E closed issue' });
const listValue = await t.page.inputValue(`#${list}`);

await t.page.locator(`#${search}`).pressSequentially('subt', { delay: 80 });
const menu = t.page.locator('ul.sql-autocomplete:visible');
await menu.waitFor({ timeout: 10000 }).catch(() => t.problems.push('bulk search: no result list'));
const found = await menu.locator('li').allTextContents();
if (!found.some(x => x.includes('E2E subtask'))) t.problems.push(`bulk search: ${JSON.stringify(found)}`);
await t.shot('form', `Bulk edit of 2 issues: the sql list offers its options (picked "E2E closed issue" = ${listValue}) and the sql search lists "${found.join(' | ')}"`, { full: false });
await menu.locator('li', { hasText: 'E2E subtask' }).first().click();

await t.page.click('#bulk_edit_form input[type=submit]');
await t.settle();
t.check('bulk update');
await t.go(`/projects/${P}/issues?set_filter=1&f[]=subject&op[subject]=~&v[subject][]=E2E+&c[]=subject&c[]=cf_${list.split('_').pop()}&c[]=cf_${search.split('_').pop()}&sort=id`);
for (const subject of ['E2E unassigned issue', 'E2E related issue']) {
  const text = await row(subject).innerText({ timeout: 5000 }).catch(() => 'missing');
  if (!text.includes('E2E subtask') || !new RegExp(`\\b${listValue}\\b`).test(text)) t.problems.push(`after bulk update ${subject}: ${text}`);
}
await t.shot('saved', `Both issues now have "E2E subtask" in E2E SQL search and ${listValue} in E2E SQL list`);

await t.done();
