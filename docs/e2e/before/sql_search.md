# sql_search

Run 2026-10-06T19:56:58.893Z against http://127.0.0.1:3001.

| screenshot | user | URL | shows |
|---|---|---|---|
| ![](sql_search-default-value.png) | manager | `/projects/e2e-project/issues/new` | New issue: the default value query filled "E2E assigned issue" (first issue of this project and tracker) |
| ![](sql_search-typing.png) | manager | `/projects/e2e-project/issues/new` | Typing "subt" lists the matching subjects of e2e-project: E2E subtask (1) |
| ![](sql_search-selected.png) | manager | `/projects/e2e-project/issues/new` | Picking a result sets the value "E2E subtask" and the jQuery data flag edited=true (GEOxyz #6103) |
| ![](sql_search-strict-refused.png) | manager | `/projects/e2e-project/issues/new` | Strict selection: "not a subject" is cleared and the tooltip says "not a subject Pick a subject from the list" |
| ![](sql_search-search-by-click.png) | manager | `/projects/e2e-project/issues/new` | Search by click: a click on the empty field lists 5 issues of e2e-project without typing |
| ![](sql_search-form-params.png) | manager | `/projects/e2e-project/issues/new` | Form parameter p0 is built from the subject "E2E clo" ('E2E' + '%'): 6 results |
| ![](sql_search-saved.png) | manager | `/issues/7` | The issue is saved with the picked values and the free text |
| ![](sql_search-reporter.png) | reporter | `/projects/e2e-project/issues/new` | Reporter (core role, may add issues) gets results; the field visible to "E2E full" only is not on the form |
