# Plugin data for the end-to-end checks, run by start_server.sh after the generic
# seed (.codex/e2e/seed.rb). Idempotent. The SQL is portable (PostgreSQL and
# MySQL/MariaDB), like the examples in the README.
project = Project.find_by!(identifier: 'e2e-project')
full = Role.find_by!(name: 'E2E full')

def e2e_field(name, attrs)
  field = IssueCustomField.find_by(name: name) || IssueCustomField.new(name: name)
  field.trackers = Tracker.all
  attrs.each { |k, v| field.send("#{k}=", v) }
  field.save!
  field
end

e2e_field('E2E SQL list',
          field_format: 'sql', is_for_all: true, visible: true, is_filter: true,
          sql: "select subject, id from issues where id <> coalesce(%id%, 0) order by id")

e2e_field('E2E SQL search',
          field_format: 'sql_search', is_for_all: true, visible: true,
          sql: "select subject as value, status_id as label from issues\n" \
               "where project_id = %{project_id} and lower(subject) like lower('%%%{term}%%')\n" \
               "order by id",
          form_params: '', search_by_click: '0', strict_selection: '1',
          strict_error_message: 'Pick a subject from the list',
          default_value: "select subject from issues where project_id = %{project_id} " \
                         "and tracker_id = %{tracker_id} order by id")

e2e_field('E2E SQL search by form',
          field_format: 'sql_search', is_for_all: true, visible: true,
          sql: "select subject as value, id as label from issues where subject like '%{p0}' order by id",
          form_params: "p0='%'+$('#issue_subject').val().substring(0, 3)+'%'",
          search_by_click: '0', strict_selection: '0', strict_error_message: '', default_value: '')

e2e_field('E2E SQL managers only',
          field_format: 'sql_search', is_for_all: true, visible: false, role_ids: [full.id],
          sql: "select login as value, lastname as label from users where lower(login) like lower('%{term}%%')",
          form_params: '', search_by_click: '0', strict_selection: '0', default_value: '')

# search by click searches for the term 'data' (jQuery UI), so this query lists
# the project's issues whatever the term
e2e_field('E2E SQL one project',
          field_format: 'sql_search', is_for_all: false, visible: true, project_ids: [project.id],
          sql: "select subject as value, id as label from issues where project_id = %{project_id} order by id",
          form_params: '', search_by_click: '1', strict_selection: '0', default_value: '')

puts "Plugin seed: #{IssueCustomField.where(field_format: %w[sql sql_search]).pluck(:id, :name).inspect}"
