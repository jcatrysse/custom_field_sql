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
end
