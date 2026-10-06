require File.expand_path('../../test_helper', __FILE__)

class CustomSqlSearchHookTest < ActiveSupport::TestCase
  fixtures :projects, :users, :members, :member_roles, :roles, :enabled_modules, :issues, :issue_statuses,
           :trackers, :projects_trackers, :enumerations

  def setup
    @field = IssueCustomField.create!(name: 'Subject search', field_format: 'sql_search', is_for_all: true,
                                      trackers: Tracker.all, sql: "select subject as value from issues",
                                      form_params: "p0=$('#issue_subject').val()\n", search_by_click: '1')
    @hook = CustomSqlSearchHook.instance
  end

  def test_issue_form_script
    html = @hook.view_issues_form_details_bottom(issue: Issue.find(1))
    assert_include "observeSqlField('issue_custom_field_values_#{@field.id}', " \
                   "'/custom_sql_search/search?project_id=1&issue_id=1&custom_field_id=#{@field.id}'", html
    assert_include %q(\\"p0\\":\\"$('#issue_subject').val()\\\\n\\"), html
    assert_include %q(\\"search_by_click\\":\\"1\\"), html
  end

  def test_new_issue_form_script
    html = @hook.view_issues_form_details_bottom(issue: Issue.new(project_id: 1, tracker_id: 1))
    assert_include "'/custom_sql_search/search?project_id=1&issue_id=&custom_field_id=#{@field.id}'", html
  end

  # GEOxyz #6600
  def test_bulk_edit_form_script
    html = @hook.view_issues_bulk_edit_details_bottom(issues: [Issue.find(1), Issue.find(2)])
    assert_include "observeSqlField('issue_custom_field_values_#{@field.id}', " \
                   "'/custom_sql_search/search?project_id=1&custom_field_id=#{@field.id}'", html
  end

  def test_field_without_form_params
    @field.update_column(:format_store, @field.format_store.merge('form_params' => nil))
    @field.reload
    assert_include "issue_custom_field_values_#{@field.id}", @hook.view_issues_form_details_bottom(issue: Issue.find(1))
    assert_include "issue_custom_field_values_#{@field.id}", @hook.view_issues_bulk_edit_details_bottom(issues: [Issue.find(1)])
  end
end
