// The sql format: a drop-down list whose options come from the field's query,
// with %id% replaced by the issue id (here: every issue except this one). New
// issue, edit, show, issue list column, filter and group by.
import { e2e } from '../../.codex/e2e/lib.mjs';
import fields from './support/fields.cjs';

const P = 'e2e-project';
const t = await e2e('sql_list');

await t.login('manager');
await t.go(`/projects/${P}/issues/new`);
const list = await fields.fieldId(t.page, 'E2E SQL list');
const onNew = await t.page.locator(`#${list} option`).allTextContents();
if (!onNew.includes('E2E assigned issue')) t.problems.push(`new: options ${JSON.stringify(onNew)}`);
await t.page.locator(`#${list}`).focus();
await t.shot('new-options', `New issue: the options are the query's rows (${onNew.filter(x => x.trim()).length} issues, %id% is null)`, { full: false });

// edit the first seeded issue: it is not offered for itself
await t.go(`/projects/${P}/issues?set_filter=1&f[]=subject&op[subject]=~&v[subject][]=E2E+assigned+issue`);
const href = await t.page.locator('table.issues td.subject a', { hasText: /^E2E assigned issue$/ }).first().getAttribute('href');
const issueId = href.split('/').pop();
await t.go(`/issues/${issueId}/edit`);
const onEdit = await t.page.locator(`#${list} option`).allTextContents();
if (onEdit.includes('E2E assigned issue')) t.problems.push('edit: the issue is offered for itself (%id% not replaced)');
await t.page.selectOption(`#${list}`, { label: 'E2E related issue' });
const picked = await t.page.inputValue(`#${list}`);
await t.shot('edit-options', `Edit of #${issueId} "E2E assigned issue": it is not in its own list (%id% = ${issueId}); "E2E related issue" (value ${picked}) picked`, { full: false });
await t.page.click('#issue-form input[name=commit]');
await t.settle();
t.check('save');
// the query's second column is the stored value, and the issue shows the stored
// value (as on Redmine 5.1: a List format shows its value, not the option label)
const shown = await t.page.locator('#content').innerText();
if (!new RegExp(`E2E SQL list:\\s*${picked}\\b`).test(shown)) t.problems.push(`show: stored value ${picked} not shown`);
await t.shot('saved', `#${issueId} shows the stored value ${picked} (the id column of the query) and the journal records the change`);

// issue list: column, filter and group by the field
const cf = list.replace('issue_custom_field_values_', 'cf_');
await t.go(`/projects/${P}/issues?set_filter=1&f[]=${cf}&op[${cf}]=*&c[]=subject&c[]=${cf}&group_by=${cf}`);
const rows = await t.page.locator('table.issues tr.issue').count();
const groups = await t.page.locator('table.issues tr.group').count();
if (rows < 1 || groups < 1) t.problems.push(`list: ${rows} rows, ${groups} groups`);
await t.shot('issue-list', `Issue list filtered on "E2E SQL list" (any), with the column and grouped by it: ${rows} issue(s) in ${groups} group(s)`);

// a member with the core Reporter role sees the value and the options
await t.login('reporter');
await t.go(`/issues/${issueId}`);
if (!new RegExp(`E2E SQL list:\\s*${picked}\\b`).test(await t.page.locator('#content').innerText())) t.problems.push('reporter: value not shown');
await t.go(`/projects/${P}/issues/new`);
const repOptions = await t.page.locator(`#${list} option`).count();
if (repOptions < 2) t.problems.push(`reporter: ${repOptions} options`);
await t.shot('reporter', `Reporter: the new issue form offers the same ${repOptions - 1} options`, { full: false });

// outsider: the private project stays invisible
await t.login('outsider');
await t.go('/projects/e2e-private/issues/new', { status: 403 });
await t.shot('outsider-private', 'Outsider: the new issue form of the private project is refused');

await t.done();
