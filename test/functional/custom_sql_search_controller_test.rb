require File.expand_path('../../test_helper', __FILE__)

class CustomSqlSearchControllerTest < Redmine::ControllerTest
  fixtures :projects, :users, :email_addresses, :user_preferences, :members, :member_roles, :roles,
           :enabled_modules, :issues, :issue_statuses, :trackers, :projects_trackers, :enumerations,
           :custom_fields, :custom_fields_projects, :custom_fields_trackers, :custom_values

  def setup
    User.current = nil
    @field = IssueCustomField.create!(
      name: 'Subject search', field_format: 'sql_search', is_for_all: true, visible: true,
      trackers: Tracker.all,
      sql: "select subject as value, id as label from issues " \
           "where project_id = %{project_id} and subject like '%%%{term}%%' order by id")
  end

  def search(params = {})
    get :search, params: { custom_field_id: @field.id, project_id: 1, term: 'recipe' }.merge(params), xhr: true
  end

  def values
    JSON.parse(response.body).map { |r| r['value'] }
  end

  def test_search_returns_the_rows_of_the_project
    @request.session[:user_id] = 2
    search
    assert_response :success
    assert_equal ['Cannot print recipes', 'Error 281 when updating a recipe'], values
    assert_equal 'Cannot print recipes (1)', JSON.parse(response.body).first['label']
  end

  def test_anonymous_is_refused_even_without_login_required
    with_settings login_required: '0' do
      search
      assert_response 401
    end
  end

  def test_term_cannot_inject_sql
    @request.session[:user_id] = 2
    ["zzz' or 1=1 or subject like '", "zzz%' union select login, id from users --",
     "zzz\\' or 1=1 -- "].each do |term|
      search(term: term)
      assert_response :success
      assert_equal [], values, term
    end
  end

  def test_project_id_cannot_inject_sql
    @request.session[:user_id] = 2
    search(project_id: '1 or 1=1') # not a project: it never reaches the SQL
    assert_response 404
  end

  def test_form_parameter_inside_and_outside_quotes
    @field.update!(sql: "select subject as value, id as label from issues where id in (%{p0}) and subject <> '%{p1}' order by id")
    @request.session[:user_id] = 2
    search(p0: '1,2,3', p1: "it's")
    assert_response :success
    assert_equal ['Cannot print recipes', 'Add ingredients categories', 'Error 281 when updating a recipe'], values

    # the value stays one string literal: never extra rows
    begin
      search(p0: '1) or (1=1', p1: 'x')
      assert_equal ['Cannot print recipes'], values # MySQL reads '1) or (1=1' as 1
    rescue ActiveRecord::StatementInvalid
      # PostgreSQL: '1) or (1=1' is not an integer
    end
  end

  def test_issue_id_is_the_visible_issue
    @field.update!(sql: "select subject as value, id as label from issues where id = %{issue_id} and '%{term}' <> ''")
    @request.session[:user_id] = 2
    search(issue_id: 3)
    assert_response :success
    assert_equal ['Error 281 when updating a recipe'], values

    search(issue_id: '')
    assert_response :success
    assert_equal [], values
  end

  def test_invisible_issue_is_refused
    @request.session[:user_id] = 3 # developer in project 1 only, issue 4 is in private project 2
    search(issue_id: 4)
    assert_response 404
  end

  def test_private_project_is_refused_to_a_non_member
    @request.session[:user_id] = 4 # no membership
    search(project_id: 2)
    assert_response 403
  end

  def test_non_member_of_a_public_project_with_add_issues_may_search
    @request.session[:user_id] = 4
    search
    assert_response :success
  end

  def test_user_who_cannot_add_or_edit_issues_is_refused
    Role.find(1).remove_permission!(:add_issues, :edit_issues, :edit_own_issues)
    @request.session[:user_id] = 2
    search
    assert_response 403
  end

  # with an issue the user must be able to edit that issue; without one (new
  # issue, bulk edit) adding or editing issues in the project is enough
  def test_issue_the_user_cannot_edit_is_refused
    Role.find(2).remove_permission!(:add_issues, :edit_issues)
    Role.find(2).add_permission!(:edit_own_issues)
    own = Issue.create!(project_id: 1, tracker_id: 1, author_id: 3, subject: 'Own recipe issue')
    @request.session[:user_id] = 3 # developer: may edit own issues only
    search(issue_id: 1) # by jsmith
    assert_response 403
    search(issue_id: own.id)
    assert_response :success
    assert_include 'Own recipe issue', values
    search # bulk edit of own issues
    assert_response :success
  end

  # an issue the user may edit does not open a project where the user may not
  # add or edit issues
  def test_editable_issue_does_not_open_another_project
    Role.non_member.remove_permission!(:add_issues, :edit_issues, :edit_own_issues)
    @request.session[:user_id] = 2 # manager in project 1, not a member of public project 3
    search(project_id: 3, issue_id: 1)
    assert_response 403
    search(project_id: 2, issue_id: 1) # developer in project 2: moving issue 1 there is allowed
    assert_response :success
  end

  def test_field_not_enabled_for_the_project_is_refused
    @field.update!(is_for_all: false, project_ids: [1])
    @request.session[:user_id] = 2 # developer in project 2
    search(project_id: 2)
    assert_response 403
    search(project_id: 1)
    assert_response :success
  end

  def test_field_hidden_from_the_role_is_refused
    @field.update!(visible: false, role_ids: [1])
    @request.session[:user_id] = 3 # developer
    search
    assert_response 403
    @request.session[:user_id] = 2 # manager
    search
    assert_response :success
  end

  def test_only_sql_search_fields_of_issues
    @request.session[:user_id] = 1
    search(custom_field_id: 2) # a string field
    assert_response 404
    other = ProjectCustomField.create!(name: 'Project search', field_format: 'sql_search', sql: "select 1 as value")
    search(custom_field_id: other.id)
    assert_response 404
    search(project_id: 999)
    assert_response 404
  end
end
