// Needs redmine_inline_edit_issues next to this plugin (run with RMP_EXTRA_PLUGINS, see
// docs/REDMINE7-MIGRATION.md), so it lives here and not in test/e2e:
//   RMP_E2E_OUT=docs/e2e/together node docs/e2e/together/inline_edit.mjs
import { e2e } from '../../../.codex/e2e/lib.mjs';
const t = await e2e('inline_edit');
await t.login('manager');
await t.go('/projects/e2e-project/issues?set_filter=1&f[]=subject&op[subject]=~&v[subject][]=E2E+unassigned');
const id = (await t.page.locator('table.issues td.id a').first().textContent()).trim();
await t.go(`/projects/e2e-project/inline_issues/edit_multiple?set_filter=1&f[]=subject&op[subject]=~&v[subject][]=E2E+unassigned&c[]=subject&c[]=cf_2`);
const input = `issues_${id}_custom_field_values_2`;
if (!(await t.page.locator(`#${input}`).count())) t.problems.push('no inline input for cf 2');
// attach the plugin's autocomplete to the inline input, as a view_customize script would
await t.page.evaluate(i => observeSqlField(i, '/custom_sql_search/search?project_id=1&custom_field_id=2', {},
  { search_by_click: '0', strict_selection: '1', strict_error_message: 'Pick a subject from the list' }), input);
await t.page.fill(`#${input}`, '');
await t.page.locator(`#${input}`).pressSequentially('rela', { delay: 80 });
const menu = t.page.locator('ul.sql-autocomplete:visible');
await menu.waitFor({ timeout: 10000 }).catch(() => t.problems.push('no list'));
await menu.locator('li', { hasText: 'E2E related issue' }).first().click();
await t.page.locator('h2').first().click(); // blur: the inline plugin restores unedited inputs here
await t.page.waitForTimeout(300);
const kept = await t.page.inputValue(`#${input}`);
const flag = await t.page.evaluate(i => $.data(document.getElementById(i), 'edited'), input);
if (kept !== 'E2E related issue') t.problems.push(`value after blur: "${kept}" (edited=${flag})`);
await t.shot('picked', `Inline edit (redmine_inline_edit_issues): after picking and leaving the field the value stays "${kept}" (edited=${flag}, GEOxyz #6103)`, { full: false });
await t.page.locator('#inline_edit_form input[type=submit]').first().click();
await t.settle();
t.check('save inline');
await t.go(`/issues/${id}`);
const body = await t.page.locator('#content').innerText();
if (!/E2E SQL search:\s*E2E related issue/.test(body)) t.problems.push('inline save: value not on the issue');
await t.shot('saved', `Saved through the inline edit form: #${id} shows E2E SQL search = E2E related issue`, { full: false });
await t.done();
