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

  def test_form_param_expression_with_an_equals_sign
    @field.update!(form_params: "p0=$('[name=\"issue[subject]\"]').val() == '' ? 'none' : 'some'\np1=1\n")
    html = @hook.view_issues_form_details_bottom(issue: Issue.find(1))
    form_params = JSON.parse(html[/JSON\.parse\((".*?[^\\]")\), JSON/, 1].undump)
    assert_equal({ 'p0' => "$('[name=\"issue[subject]\"]').val() == '' ? 'none' : 'some'\n", 'p1' => "1\n" }, form_params)
  end

  def test_default_strict_error_message_is_translated
    @field.update_column(:format_store, @field.format_store.merge('strict_error_message' => nil))
    @field.reload
    with_locale('ru') do
      html = @hook.view_issues_form_details_bottom(issue: Issue.find(1))
      options = JSON.parse(html.scan(/JSON\.parse\((".*?[^\\]")\)/).last.first.undump)
      assert_equal 'неверное значение', options['strict_error_message']
    end
  end

  def test_shipped_locales_have_the_same_keys
    root = Rails.root.join('plugins', 'custom_field_sql', 'config', 'locales')
    keys = Dir[root.join('*.yml').to_s].map { |f| YAML.load_file(f).values.first.keys.sort }
    assert_equal 1, keys.uniq.size, keys.inspect
  end

  def test_blank_and_comment_lines_in_form_params
    @field.update!(form_params: "p0=1\n\n# a note\n")
    html = @hook.view_issues_form_details_bottom(issue: Issue.find(1))
    form_params = JSON.parse(html[/JSON\.parse\((".*?[^\\]")\), JSON/, 1].undump)
    assert_equal "1\n", form_params['p0']
  end

  def test_settings_cannot_close_the_script_element
    @field.update!(strict_error_message: '</script><script>alert(1)</script>', form_params: "p0='</script>'")
    html = @hook.view_issues_form_details_bottom(issue: Issue.find(1))
    assert_equal 1, html.scan('</script>').size, html
  end

  # upstream 3d36b17 (Jan's decision 3), issue form and bulk edit
  def test_multi_select_script
    @field.update!(multi_select: '1')
    [@hook.view_issues_form_details_bottom(issue: Issue.find(1)),
     @hook.view_issues_bulk_edit_details_bottom(issues: [Issue.find(1), Issue.find(2)])].each do |html|
      assert_include "observeSqlMultiField('issue_custom_field_values_#{@field.id}', ", html
      assert_not_include 'observeSqlField(', html
      options = JSON.parse(html.scan(/JSON\.parse\((".*?[^\\]")\)/).last.first.undump)
      assert_equal 'Add', options['add_title']
      assert_equal 'Delete', options['remove_title']
    end
  end

  def test_single_select_script_has_no_multi_options
    html = @hook.view_issues_form_details_bottom(issue: Issue.find(1))
    options = JSON.parse(html.scan(/JSON\.parse\((".*?[^\\]")\)/).last.first.undump)
    assert_nil options['add_title']
  end
end
