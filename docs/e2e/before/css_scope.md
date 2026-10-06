# css_scope

Run 2026-10-06T19:57:21.259Z against http://127.0.0.1:3001.

| screenshot | user | URL | shows |
|---|---|---|---|
| ![](css_scope-core-autocomplete.png) | manager | `/projects/e2e-project/issues/new` | Core parent task list: class "ui-menu ui-widget ui-widget-content ui-autocomplete ui-front", max-height none: not touched by the plugin |
| ![](css_scope-plugin-autocomplete.png) | manager | `/projects/e2e-project/issues/new` | Plugin list: class "ui-menu ui-widget ui-widget-content ui-autocomplete sql-autocomplete ui-front", max-height 300px, overflow-y auto |

## Problems

- assets: ["http://127.0.0.1:3001/plugin_assets/custom_field_sql/stylesheets/sql_search.css?1791316468","http://127.0.0.1:3001/plugin_assets/custom_field_sql/javascripts/sql_field.js?1791316468"]
