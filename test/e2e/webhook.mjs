// Redmine 7 webhooks: core sends the issue as issues/show.api.rsb, rendered as
// the webhook's owner. This plugin hides nothing and adds nothing: its fields
// are plain values, so they must arrive in the payload like any custom field.
// A real delivery to a listener on this machine's own address (core refuses
// loopback addresses).
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { e2e } from '../../.codex/e2e/lib.mjs';
import fields from './support/fields.cjs';

const P = 'e2e-project';
const OUT = process.env.RMP_E2E_OUT || 'docs/e2e';
const host = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address;
const received = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => { received.push({ headers: req.headers, body }); res.end('ok'); });
});
await new Promise(r => server.listen(4567, host, r));

const t = await e2e('webhook');
if (!host) t.problems.push('no non-loopback IPv4 address for the listener');

// webhooks are off by default: Administration > Settings > Integrations
await t.login('admin');
await t.go('/settings?tab=integrations');
await t.page.check('#settings_webhooks_enabled');
await t.page.locator('form', { has: t.page.locator('#settings_webhooks_enabled') }).locator('input[type=submit]').click();
await t.sudo();
await t.settle();
t.check('enable webhooks');

// the manager owns the hook (use_webhooks is in the "E2E full" role)
await t.login('manager');
await t.go('/webhooks/new');
await t.page.fill('#webhook_url', `http://${host}:4567/redmine`);
await t.page.check('#webhook_active');
await t.page.check('#webhook_events_issue\\.updated');
await t.page.locator('label', { hasText: 'E2E project' }).locator('input[type=checkbox]').check();
await t.shot('new-webhook', `The manager creates a webhook for issue.updated in e2e-project to http://${host}:4567/redmine`);
await t.page.locator('#content input[type=submit]').first().click();
await t.sudo();
await t.settle();
t.check('create webhook');

// change both plugin fields on an issue
await t.go(`/projects/${P}/issues?set_filter=1&f[]=subject&op[subject]=~&v[subject][]=E2E+closed+issue`);
const href = await t.page.locator('table.issues td.subject a').first().getAttribute('href');
await t.go(`${href}/edit`);
const list = await fields.fieldId(t.page, 'E2E SQL list');
const search = await fields.fieldId(t.page, 'E2E SQL search by form');
await t.page.selectOption(`#${list}`, { label: 'E2E subtask' });
const listValue = await t.page.inputValue(`#${list}`);
const searchValue = `Webhook ${Date.now()}`;
await t.page.fill(`#${search}`, searchValue);
await t.page.click('#issue-form input[name=commit]');
await t.settle();
t.check('update issue');

for (let i = 0; i < 40 && !received.length; i++) await new Promise(r => setTimeout(r, 500));
server.close();
if (!received.length) {
  t.problems.push('no webhook delivery within 20 s');
} else {
  const payload = JSON.parse(received[0].body);
  fs.writeFileSync(path.join(OUT, 'webhook-payload.json'), JSON.stringify(payload, null, 2) + '\n');
  const cfs = JSON.stringify(payload).match(/"custom_fields":\[[^\]]*\]/)?.[0] || '';
  const want = [['E2E SQL list', listValue], ['E2E SQL search by form', searchValue]];
  for (const [name, value] of want) {
    if (!cfs.includes(`"name":"${name}"`) || !cfs.includes(`"value":"${value}"`)) t.problems.push(`payload lacks ${name} = ${value}: ${cfs}`);
  }
  if (!cfs.includes('"name":"E2E SQL managers only"')) t.problems.push('payload lacks the field visible to the owner\'s role');
  await t.page.setContent(`<h3>Webhook delivery received by ${host}:4567 (${received[0].headers['content-type']})</h3>` +
    `<pre style="white-space:pre-wrap;font-size:12px">${JSON.stringify(JSON.parse(cfs.slice(16)), null, 1).replace(/</g, '&lt;')}</pre>`);
  await t.shot('payload', `The issue.updated delivery carries both plugin fields as plain values: E2E SQL list = ${listValue}, E2E SQL search by form = "${searchValue}" (full payload: webhook-payload.json)`);
}

// remove the hook and leave webhooks off again, as a fresh Redmine has them
await t.go('/webhooks');
t.page.once('dialog', d => d.accept());
await t.page.locator('tr', { hasText: `${host}:4567` }).locator('a.icon-del').first().click();
await t.sudo();
await t.settle();
t.check('delete webhook');
await t.login('admin');
await t.go('/settings?tab=integrations');
await t.page.uncheck('#settings_webhooks_enabled');
await t.page.locator('form', { has: t.page.locator('#settings_webhooks_enabled') }).locator('input[type=submit]').click();
await t.sudo();
await t.settle();
await t.done();
