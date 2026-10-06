require File.expand_path('../../test_helper', __FILE__)

class CustomFieldSqlIssuesControllerTest < Redmine::ControllerTest
  tests IssuesController
  fixtures :projects, :users, :email_addresses, :user_preferences, :members, :member_roles, :roles,
           :enabled_modules, :issues, :issue_statuses, :trackers, :projects_trackers, :enumerations,
           :workflows, :custom_fields, :custom_fields_projects, :custom_fields_trackers, :custom_values

  def setup
    @list = IssueCustomField.create!(name: 'Other issues', field_format: 'sql', is_for_all: true, trackers: Tracker.all,
                                     sql: "select subject, id from issues where project_id = 1 and id <> coalesce(%id%, 0) order by id")
    @search = IssueCustomField.create!(name: 'Subject search', field_format: 'sql_search', is_for_all: true,
                                       trackers: Tracker.all, sql: "select subject as value from issues", form_params: '')
    @request.session[:user_id] = 2
  end

  def test_edit_form
    get :edit, params: { id: 1 }
    assert_response :success
    assert_select "select#issue_custom_field_values_#{@list.id}" do
      assert_select 'option[value="2"]', text: 'Add ingredients categories'
      assert_select 'option[value="1"]', 0
    end
    assert_include "observeSqlField('issue_custom_field_values_#{@search.id}'", response.body
  end

  def test_new_form
    get :new, params: { project_id: 1 }
    assert_response :success
    assert_select "select#issue_custom_field_values_#{@list.id} option[value=\"1\"]"
    assert_include "issue_id=&custom_field_id=#{@search.id}", response.body
  end

  # GEOxyz #6600
  def test_bulk_edit_form
    get :bulk_edit, params: { ids: [1, 2] }
    assert_response :success
    assert_select "select#issue_custom_field_values_#{@list.id} option[value=\"3\"]"
    assert_include "observeSqlField('issue_custom_field_values_#{@search.id}', " \
                   "'/custom_sql_search/search?project_id=1&custom_field_id=#{@search.id}'", response.body
  end

  def test_bulk_update_sets_both_fields
    post :bulk_update, params: { ids: [1, 2], issue: { custom_field_values: { @list.id.to_s => '3', @search.id.to_s => 'Picked' } } }
    assert_response 302
    assert_equal ['3', '3'], [1, 2].map { |id| Issue.find(id).custom_field_value(@list) }
    assert_equal ['Picked', 'Picked'], [1, 2].map { |id| Issue.find(id).custom_field_value(@search) }
  end
end
