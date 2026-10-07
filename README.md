Redmine sql custom field
==================
This plugin add two sql format for custom fields
* **sql** - format for simple sql-expression.
* **sql_search** - format for search sql query with form parameters

Compatibility
-------------
* Redmine 5.0 or higher

Installation
----------------------
* Clone or [download](https://github.com/apsmir/custom_field_sql/archive/main.zip) this repo into your **redmine_root/plugins/** folder

```
$ git clone https://github.com/apsmir/custom_field_sql.git
```
* If you downloaded this repo, make sure to rename the extracted folder to `custom_field_sql`
* Restart Redmine

Usage
----------------------
1) Visit **Administration->Custom fields**. 
2) Press the button **New custom field**. Select format **Sql** or **Sql search**.
3) Enter sql query 

SQL fields and parameters
----------------------
You can use parameters for sql expression.
This may be id of issue %{issue_id} or id of project %{project_id}

You can use any form  values as query parameter.
`p0='%'+$('#issue_custom_field_values_31').val()+'%'`

where

p0 - parameter name

%'+$('#issue_custom_field_values_31').val()+'% - any jquery expression to calculate parameter value

**sql_search** 
Query must have field 'value'. This field used be as field value.
format: support multiply forms parameters. Parameters must be written in jquery. 

The search term typed in the field is available as %{term}.

Every value that comes from the browser (%{term} and the form parameters) is escaped
for the place it has in the query: inside quotes (`'%{p0}'`) as the content of a string
literal, outside quotes as a string literal of its own (a number or a list of integers,
like `1,2,3`, stays a number). %{project_id} and %{issue_id} are the ids of the project
and the issue the user may see; `null` for a new issue. Only `%{name}` placeholders are
supported; write `%%` for a literal percent sign.

Only users who can add or edit issues in the project, and who may see the field there,
get results; anonymous users too, where the anonymous role may add or edit issues.

The plugin wires **sql search** fields of issues (issue form and bulk edit). A **sql search**
field of a project, a user or a time entry works through a script of your own (view_customize,
for instance) that calls `observeSqlField('<input id>', '<url>', {}, {})` with the url
`/custom_sql_search/search?custom_field_id=<id>&project_id=<id>` (`&issue_id=<id>` for a time
entry). Who gets results: for a project field, users who may edit the project, or create
one when there is no project id; for a time entry field, users who may log or edit time in
the project (of the issue, when given), or log time anywhere when there is neither; for a
user field, administrators, and every logged in user when the field is editable (My account).
The field must be visible to the user in each case. The query itself runs with Redmine's database account, not
with the rights of the user: it sees every project, private ones included. Limit it
yourself where that matters, for example with `project_id = %{project_id}`.

----------------------
Example 1:

 "sql expression": 
 
 `select subject as value, description as label from issues where subject like '%{p0}' and description like '%{p1}'`
 
 "sql form params":
 
`p0='%'+$('#issue_custom_field_values_31').val()+'%'`
`p1='%'+$('#issue_custom_field_values_30').val()+'%'`

----------------------
Example 2:

 "sql expression": 
 
 `select subject as value from issues where '%{p0}' = 'new' or cast(id as char(10)) = '%{p0}'`
 
 
 "sql form params":
 
`p0=window.location.toString().split('/').pop()`


This expression `window.location.toString().split('/').pop()` calculate **issue id** on form. For new issues calculated value = 'new'.

The same without form parameters: `select subject as value from issues where id = coalesce(%{issue_id}, id)`

----------------------

PostgreSQL and MySQL/MariaDB
----------------------
The examples run on both. When you write your own query, keep it portable:
* no backticks around names, and single quotes for strings (`"abc"` is a column name in PostgreSQL)
* booleans as `= true` / `= false`, not `= 1` / `= 0`
* `LIKE` is case sensitive in PostgreSQL: compare `lower(...)` with `lower(...)`
* `limit 5 offset 10`, not `limit 10, 5`; `coalesce` instead of `ifnull`, `case when` instead of `if()`
* `custom_values.value` is text: cast the other side (`cast(users.id as char(10))`) before comparing

One query that fails stops the whole issue form, so try a new query in a test project first.

----------------------

Query in **sql search** field can be executed by mouse click. Use parameter "search by click" in settings page.

Default value
----------------------
**sql_search** -this  format support sql-query for calculate  default value . This query select initial custom field value for new issue from database.

Query can use parameters
* %{tracker_id}
* %{project_id}

Multiple selection
----------------------
A **sql search** field with "multiple selection" (upstream 2.9) keeps several values:
* the input searches; a picked value becomes a tag under it, the × on a tag removes it;
* with "strict selection" off, a value without a search result is added with the green "+" (or Enter);
* the values are stored as a JSON array (`["val1","val2"]`) and shown as `val1, val2` on the
  issue, in the issue list and in the history; a value from before the field had multiple
  selection is shown as it is;
* on the bulk edit form the tags replace the values of every selected issue; with no tag the
  values stay, "Clear" empties them;
* the default value query gives the first value;
* in an issue filter use "contains": the stored text is the JSON array.

The selected values are kept in a hidden input, so a form sent with `form.submit()` (the
IssueHotButton plugin does that) carries them as well.

Scripts
----------------------
view_customize/custom_field_autselect_first_value.js
It is script for plugin "view customize" https://www.redmine.org/plugins/view_customize
The script allows you to automatically select the first value for a custom field (drop-down list) 

Uninstall
----------------------
1) Delete all custom fields with format Sql.
2) Remove folder **redmine_root/plugins/custom_field_sql**
3) Restart Redmine
