require File.expand_path('../../test_helper', __FILE__)

class CustomFieldSqlFormatTest < ActiveSupport::TestCase
  fixtures :projects, :users, :members, :member_roles, :roles, :enabled_modules, :issues, :issue_statuses,
           :trackers, :projects_trackers, :enumerations

  def setup
    @list = IssueCustomField.create!(name: 'Other issues', field_format: 'sql', is_for_all: true, trackers: Tracker.all,
                                     sql: "select subject, id from issues where project_id = 1 and id <> coalesce(%id%, 0) order by id")
  end

  def option_values(object)
    @list.format.possible_values_options(@list, object).map(&:last).map(&:to_i)
  end

  def test_options_leave_out_the_issue_itself
    assert_equal [2, 3, 7, 8, 11, 12], option_values(Issue.find(1))
  end

  def test_options_for_a_new_issue
    assert_equal [1, 2, 3, 7, 8, 11, 12], option_values(Issue.new(project_id: 1))
  end

  # bulk edit passes the selected issues (GEOxyz #6600)
  def test_options_for_several_issues
    assert_equal [2, 3, 7, 8, 11, 12], option_values([Issue.find(1), Issue.find(2)])
  end

  def test_options_for_another_kind_of_object
    assert_equal [1, 2, 3, 7, 8, 11, 12], option_values(Project.find(1))
  end

  def test_sql_search_default_value
    field = IssueCustomField.create!(name: 'First subject', field_format: 'sql_search', is_for_all: true, trackers: Tracker.all,
                                     sql: "select subject as value from issues",
                                     default_value: "select subject from issues where project_id = %{project_id} " \
                                                    "and tracker_id = %{tracker_id} order by id")
    issue = Issue.new(project_id: 1, tracker_id: 1)
    assert_equal 'Cannot print recipes', issue.custom_field_values.detect { |v| v.custom_field == field }.value
  end

  def test_sql_search_default_value_without_tracker_or_issue
    sql = "select coalesce(max(name), 'none') from projects where id = coalesce(%{project_id}, 1) " \
          "and coalesce(%{tracker_id}, 1) = 1"
    IssueCustomField.create!(name: 'Default issue', field_format: 'sql_search', is_for_all: true, trackers: Tracker.all,
                             sql: "select 1 as value", default_value: sql)
    project_field = ProjectCustomField.create!(name: 'Default project', field_format: 'sql_search',
                                               sql: "select 1 as value", default_value: sql)
    assert_equal 'eCookbook', Project.new.custom_field_values.detect { |v| v.custom_field == project_field }.value
    issue = Issue.new # no project, no tracker yet
    assert_equal 'eCookbook', CustomValue.new(custom_field: IssueCustomField.find_by(name: 'Default issue'), customized: issue).value
  end

  # upstream 3d36b17 (Jan's decision 3): multi select stores a JSON array
  def test_multi_select_value_is_shown_as_a_list
    field = IssueCustomField.create!(name: 'Subjects', field_format: 'sql_search', is_for_all: true, trackers: Tracker.all,
                                     sql: "select subject as value from issues", multi_select: '1')
    assert_equal '1', field.reload.multi_select
    format = field.format
    assert_equal 'a, b <c>', format.formatted_value(nil, field, '["a","b <c>"]', nil, false)
    assert_equal '1, 2', format.formatted_value(nil, field, '[1,2]', nil, false)
    assert_equal 'plain', format.formatted_value(nil, field, 'plain', nil, false) # a value from before multi select
    assert_equal '123', format.formatted_value(nil, field, '123', nil, false)    # JSON, but not a list
    assert_equal '', format.formatted_value(nil, field, '', nil, false)
    field.multi_select = '0'
    assert_equal '["a","b"]', format.formatted_value(nil, field, '["a","b"]', nil, false)
  end

  def test_multi_select_default_value_is_a_list
    field = IssueCustomField.create!(name: 'Subjects', field_format: 'sql_search', is_for_all: true, trackers: Tracker.all,
                                     sql: "select subject as value from issues", multi_select: '1',
                                     default_value: "select subject from issues where id = 1")
    issue = Issue.new(project_id: 1, tracker_id: 1)
    assert_equal '["Cannot print recipes"]', issue.custom_field_values.detect { |v| v.custom_field == field }.value
  end

  def test_multi_select_is_a_safe_attribute
    field = IssueCustomField.new
    field.safe_attributes = { 'name' => 'Subjects', 'field_format' => 'sql_search', 'multi_select' => '1' }
    assert_equal '1', field.multi_select
  end
end
