// Shared by the scenarios in test/e2e (a .cjs file, so e2e.sh does not run it).
// The custom fields come from test/e2e/seed.rb; their ids depend on the database,
// so look them up by the label on the issue form.
async function fieldId(page, name) {
  const id = await page.evaluate(n => {
    const label = [...document.querySelectorAll('label')].find(l => l.textContent.replace('*', '').trim() === n);
    if (!label) return null;
    // the bulk edit form has labels without "for"
    const control = label.parentElement.querySelector('[id^=issue_custom_field_values_]');
    return label.getAttribute('for') || (control && control.id);
  }, name);
  if (!id) throw new Error(`no field "${name}" on ${page.url()}`);
  return id;
}

module.exports = { fieldId };
