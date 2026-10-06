// GEOxyz #6211: the plugin's styles apply to its own lists and tooltips only.
// Core uses jQuery UI autocomplete too (parent task); that list must keep the
// core style, while the plugin's list gets the class sql-autocomplete with its
// 300px scroll height.
import { e2e } from '../../.codex/e2e/lib.mjs';
import fields from './support/fields.cjs';

const P = 'e2e-project';
const t = await e2e('css_scope');

await t.login('manager');
await t.go(`/projects/${P}/issues/new`);
const search = await fields.fieldId(t.page, 'E2E SQL search');

const style = sel => t.page.locator(sel).first().evaluate(el => {
  const cs = getComputedStyle(el);
  return { classes: el.className, maxHeight: cs.maxHeight, overflowY: cs.overflowY };
});

// core: the parent task autocomplete
await t.page.locator('#issue_parent_issue_id').pressSequentially('E2E', { delay: 80 });
const core = t.page.locator('ul.ui-autocomplete:visible');
await core.waitFor({ timeout: 10000 }).catch(() => t.problems.push('core autocomplete did not open'));
const coreStyle = await style('ul.ui-autocomplete:visible');
if (coreStyle.classes.includes('sql-autocomplete') || coreStyle.maxHeight === '300px') {
  t.problems.push(`core list has the plugin's style: ${JSON.stringify(coreStyle)}`);
}
await t.shot('core-autocomplete', `Core parent task list: class "${coreStyle.classes}", max-height ${coreStyle.maxHeight}: not touched by the plugin`, { full: false });
await t.page.keyboard.press('Escape');
await t.page.fill('#issue_parent_issue_id', '');

// plugin: the sql_search list
await t.page.fill(`#${search}`, '');
await t.page.locator(`#${search}`).pressSequentially('E2E', { delay: 80 });
await t.page.locator('ul.sql-autocomplete:visible').waitFor({ timeout: 10000 }).catch(() => t.problems.push('plugin list did not open'));
const pluginStyle = await style('ul.sql-autocomplete:visible');
if (pluginStyle.maxHeight !== '300px' || pluginStyle.overflowY !== 'auto') t.problems.push(`plugin list style: ${JSON.stringify(pluginStyle)}`);
await t.shot('plugin-autocomplete', `Plugin list: class "${pluginStyle.classes}", max-height ${pluginStyle.maxHeight}, overflow-y ${pluginStyle.overflowY}`, { full: false });

// the stylesheet comes from the Propshaft plugin asset path
const css = await t.page.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet], script[src]')]
  .map(e => e.href || e.src).filter(u => u.includes('custom_field_sql')));
if (css.length !== 2 || !css.every(u => u.includes('/assets/plugin_assets/custom_field_sql/'))) t.problems.push(`assets: ${JSON.stringify(css)}`);
for (const u of css) {
  const res = await t.page.request.get(u);
  if (res.status() !== 200) t.problems.push(`${u}: HTTP ${res.status()}`);
}
console.log('plugin assets:', css.join(' '));

await t.done();
