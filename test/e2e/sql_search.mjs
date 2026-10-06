// The sql_search format on the issue form: default value, autocomplete while
// typing, search by click, strict selection, form parameters, the jQuery data
// flag redmine_inline_edit reads (GEOxyz #6103), and saving the value.
import { e2e } from '../../.codex/e2e/lib.mjs';
import fields from './support/fields.cjs';

const P = 'e2e-project';
const t = await e2e('sql_search');

await t.login('manager');
await t.go(`/projects/${P}/issues/new`);
const search = await fields.fieldId(t.page, 'E2E SQL search');
const byForm = await fields.fieldId(t.page, 'E2E SQL search by form');
const byClick = await fields.fieldId(t.page, 'E2E SQL one project');
const defaultValue = await t.page.inputValue(`#${search}`);
if (!defaultValue.startsWith('E2E')) t.problems.push(`default value: got "${defaultValue}"`);
await t.shot('default-value', `New issue: the default value query filled "${defaultValue}" (first issue of this project and tracker)`);

// typing two characters searches
await t.page.fill(`#${search}`, '');
await t.page.locator(`#${search}`).pressSequentially('subt', { delay: 80 });
let menu = t.page.locator('ul.sql-autocomplete:visible');
await menu.waitFor({ timeout: 10000 }).catch(() => t.problems.push('typing: no result list'));
const typed = await menu.locator('li').allTextContents();
if (!typed.some(x => x.includes('E2E subtask'))) t.problems.push(`typing: results ${JSON.stringify(typed)}`);
t.check('autocomplete while typing');
await t.shot('typing', `Typing "subt" lists the matching subjects of e2e-project: ${typed.join(' | ')}`, { full: false });

await menu.locator('li', { hasText: 'E2E subtask' }).first().click();
const picked = await t.page.inputValue(`#${search}`);
const edited = await t.page.evaluate(id => $.data(document.getElementById(id), 'edited') === true, search);
if (picked !== 'E2E subtask') t.problems.push(`select: value "${picked}"`);
if (!edited) t.problems.push('select: jQuery data "edited" is not set (redmine_inline_edit would not save)');
await t.shot('selected', `Picking a result sets the value "${picked}" and the jQuery data flag edited=${edited} (GEOxyz #6103)`, { full: false });

// strict selection: a value that is not in the list is refused
await t.page.fill(`#${search}`, 'not a subject');
await t.page.click('#issue_subject');
await t.page.locator('.sql-tooltip').waitFor({ timeout: 5000 }).catch(() => t.problems.push('strict: no tooltip'));
await t.page.waitForTimeout(500); // fade in; it closes again after 2.5 s
const tooltip = await t.page.locator('.sql-tooltip').first().textContent().catch(() => '');
const after = await t.page.inputValue(`#${search}`);
if (after !== '' || !tooltip.includes('Pick a subject from the list')) t.problems.push(`strict: value "${after}", tooltip "${tooltip}"`);
await t.shot('strict-refused', `Strict selection: "not a subject" is cleared and the tooltip says "${tooltip.replace(/\s+/g, ' ').trim()}"`, { full: false });

// strict selection: a value from the list stays
await t.page.waitForTimeout(2700); // the tooltip closes after 2.5 s
await t.page.locator(`#${search}`).pressSequentially('rela', { delay: 80 });
await menu.waitFor({ timeout: 10000 }).catch(() => t.problems.push('strict: no result list'));
await menu.locator('li', { hasText: 'E2E related issue' }).first().click();
await t.page.click('#issue_subject');
await t.page.waitForTimeout(500);
if (await t.page.inputValue(`#${search}`) !== 'E2E related issue') t.problems.push('strict: a listed value was cleared');

// search by click lists the project's issues without typing
await t.page.click(`#${byClick}`);
await menu.waitFor({ timeout: 10000 }).catch(() => t.problems.push('click: no result list'));
const clicked = await menu.locator('li').allTextContents();
if (clicked.length < 5) t.problems.push(`click: ${JSON.stringify(clicked)}`);
await t.shot('search-by-click', `Search by click: a click on the empty field lists ${clicked.length} issues of e2e-project without typing`, { full: false });
await menu.locator('li', { hasText: 'E2E unassigned issue' }).first().click();

// form parameters: the query takes p0 from the subject field
await t.page.fill('#issue_subject', 'E2E clo');
await t.page.locator(`#${byForm}`).pressSequentially('xx', { delay: 80 });
await menu.waitFor({ timeout: 10000 }).catch(() => t.problems.push('form params: no result list'));
const fromForm = await menu.locator('li').allTextContents();
if (!fromForm.length || !fromForm.every(x => x.startsWith('E2E'))) t.problems.push(`form params: ${JSON.stringify(fromForm)}`);
await t.shot('form-params', `Form parameter p0 is built from the subject "E2E clo" ('E2E' + '%'): ${fromForm.length} results`, { full: false });
await menu.locator('li', { hasText: 'E2E closed issue' }).first().click();

// strict selection off: any text stays
await t.page.fill(`#${byForm}`, 'Free text');
await t.page.click('#issue_subject');
await t.page.waitForTimeout(500);
if (await t.page.inputValue(`#${byForm}`) !== 'Free text') t.problems.push('not strict: free text was cleared');

await t.page.fill('#issue_subject', `E2E sql search ${Date.now()}`);
await t.page.click('#issue-form input[name=commit]');
await t.settle();
t.check('create issue');
const body = await t.page.locator('#content').textContent();
for (const v of ['E2E related issue', 'Free text', 'E2E unassigned issue']) if (!body.includes(v)) t.problems.push(`saved issue does not show "${v}"`);
await t.shot('saved', 'The issue is saved with the picked values and the free text');

// the same field as a member with only the core Reporter role
await t.login('reporter');
await t.go(`/projects/${P}/issues/new`);
menu = t.page.locator('ul.sql-autocomplete:visible');
const s2 = await fields.fieldId(t.page, 'E2E SQL search');
await t.page.fill(`#${s2}`, '');
await t.page.locator(`#${s2}`).pressSequentially('assi', { delay: 80 });
await menu.waitFor({ timeout: 10000 }).catch(() => t.problems.push('reporter: no result list'));
const rep = await menu.locator('li').allTextContents();
if (!rep.some(x => x.includes('E2E assigned issue'))) t.problems.push(`reporter: ${JSON.stringify(rep)}`);
const hidden = await t.page.locator('label', { hasText: 'E2E SQL managers only' }).count();
if (hidden) t.problems.push('reporter sees the field that is visible to "E2E full" only');
await t.shot('reporter', 'Reporter (core role, may add issues) gets results; the field visible to "E2E full" only is not on the form', { full: false });

await t.done();
