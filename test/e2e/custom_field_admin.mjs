// Administration > Custom fields: the two formats this plugin adds, with their
// own settings on the form (sql; sql_search with form parameters, database
// configuration, search by click, strict selection, message, default value
// query). Saving and reading back, a refused save, and the refusal for a user
// who is not an administrator.
import { e2e } from '../../.codex/e2e/lib.mjs';

const t = await e2e('custom_field_admin');
const stamp = Date.now().toString().slice(-6);

await t.login('admin');
await t.go('/custom_fields/new?type=IssueCustomField');
const formats = await t.page.locator('#custom_field_field_format option').allTextContents();
for (const f of ['sql', 'sql search']) if (!formats.includes(f)) t.problems.push(`format list lacks "${f}": ${JSON.stringify(formats)}`);

await t.page.locator('#custom_field_field_format').evaluate(el => { el.size = el.options.length; });
await t.shot('formats', `The format list offers "sql" and "sql search" (${formats.length} formats)`, { full: false });

// the form reloads itself when the format changes, so open it with the format
await t.go('/custom_fields/new?type=IssueCustomField&custom_field[field_format]=sql');
t.check('format sql');
if (!(await t.page.locator('#custom_field_sql').count())) t.problems.push('sql format: no sql expression field');
if (await t.page.locator('#custom_field_form_params').count()) t.problems.push('sql format shows sql_search settings');
await t.page.fill('#custom_field_name', `Admin SQL list ${stamp}`);
await t.page.fill('#custom_field_sql', 'select subject, id from issues where id <> coalesce(%id%, 0) order by id');
await t.page.check('#custom_field_is_for_all');
await t.page.locator('input[name="custom_field[tracker_ids][]"]').first().check();
await t.shot('new-sql', 'New issue field, format "sql": the sql expression is the only plugin setting');
await t.page.click('input[name=commit]');
await t.sudo();
await t.settle();
t.check('save sql');
if (!(await t.page.locator('#flash_notice').count())) t.problems.push(`save sql: no confirmation (${t.page.url()})`);
if (await t.page.locator('#custom_field_field_format').inputValue().catch(() => '') !== '') t.problems.push('save sql: still on the form');

await t.go('/custom_fields/new?type=IssueCustomField&custom_field[field_format]=sql_search');
t.check('format sql search');
const settings = ['#custom_field_sql', '#custom_field_form_params', '#custom_field_db_config', '#custom_field_search_by_click',
                  '#custom_field_strict_selection', '#custom_field_strict_error_message', '#custom_field_default_value'];
for (const s of settings) if (!(await t.page.locator(s).count())) t.problems.push(`sql search format: ${s} missing`);
await t.page.fill('#custom_field_name', `Admin SQL search ${stamp}`);
await t.page.fill('#custom_field_sql', "select subject as value, id as label from issues where lower(subject) like lower('%%%{term}%%')");
await t.page.fill('#custom_field_form_params', "p0=$('#issue_subject').val()");
await t.page.check('#custom_field_search_by_click');
await t.page.check('#custom_field_strict_selection');
await t.page.fill('#custom_field_strict_error_message', 'Choose from the list');
await t.page.fill('#custom_field_default_value', 'select subject from issues where project_id = %{project_id} order by id');
await t.page.check('#custom_field_is_for_all');
await t.page.locator('input[name="custom_field[tracker_ids][]"]').first().check();
await t.shot('new-sql-search', 'New issue field, format "sql search": sql expression, form parameters, database configuration, search by click, strict selection, message and default value query');
await t.page.click('input[name=commit]');
await t.sudo();
await t.settle();
t.check('save sql search');

// read back what was saved
await t.go('/custom_fields?tab=IssueCustomField');
await t.page.locator('a', { hasText: `Admin SQL search ${stamp}` }).click();
await t.settle();
const saved = {
  form: await t.page.inputValue('#custom_field_form_params'),
  click: await t.page.isChecked('#custom_field_search_by_click'),
  strict: await t.page.isChecked('#custom_field_strict_selection'),
  message: await t.page.inputValue('#custom_field_strict_error_message'),
  default: await t.page.inputValue('#custom_field_default_value'),
};
if (saved.form !== "p0=$('#issue_subject').val()" || !saved.click || !saved.strict || saved.message !== 'Choose from the list' ||
    !saved.default.includes('%{project_id}')) t.problems.push(`saved settings: ${JSON.stringify(saved)}`);
await t.shot('edit-sql-search', 'The saved sql search field: every plugin setting reads back as entered');

// a refused save: the name is required (core validation, the plugin settings stay filled in)
await t.go('/custom_fields/new?type=IssueCustomField&custom_field[field_format]=sql_search');
await t.page.fill('#custom_field_sql', 'select 1 as value');
await t.page.click('input[name=commit]');
await t.sudo();
await t.settle();
t.check('refused save');
const error = await t.page.locator('#errorExplanation').textContent().catch(() => '');
if (!error.includes('Name') || await t.page.inputValue('#custom_field_sql') !== 'select 1 as value') t.problems.push(`refused save: "${error}"`);
await t.shot('invalid', `Saving without a name is refused ("${error.trim()}") and the sql expression is kept`, { full: false });

// clean up the two fields so repeated runs leave the issue form as it was
for (const name of [`Admin SQL list ${stamp}`, `Admin SQL search ${stamp}`]) {
  await t.go('/custom_fields?tab=IssueCustomField');
  t.page.once('dialog', d => d.accept());
  await t.page.locator('tr', { has: t.page.locator('a', { hasText: name }) }).locator('a.icon-del, a[data-method=delete]').first().click();
  await t.sudo();
  await t.settle();
  t.check(`delete ${name}`);
}

await t.login('manager');
await t.go('/custom_fields', { status: 403 });
await t.shot('manager-refused', 'Manager (every project permission, not an administrator): Administration > Custom fields is refused');

await t.done();
