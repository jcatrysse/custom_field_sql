# webhook

Run 2026-10-07T19:57:59.014Z against http://127.0.0.1:3000.

| screenshot | user | URL | shows |
|---|---|---|---|
| ![](webhook-new-webhook.png) | manager | `/webhooks/new` | The manager creates a webhook for issue.updated in e2e-project to http://192.0.2.2:4567/redmine |
| ![](webhook-payload.png) | manager | `/issues/5` | The issue.updated delivery carries both plugin fields as plain values: E2E SQL list = 3, E2E SQL search by form = "Webhook 1791403073154" (full payload: webhook-payload.json) |
