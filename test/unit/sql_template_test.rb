require File.expand_path('../../test_helper', __FILE__)

class CustomFieldSqlTemplateTest < ActiveSupport::TestCase
  fixtures :projects, :users, :issues, :issue_statuses, :trackers, :projects_trackers, :enumerations

  PAYLOADS = [
    "plain", "it's", "''", "\\", "\\'", "\\\\'", "' or 1=1 --", "') union select login, login from users --",
    "\\'; select 1; --", "*/ select 1 /*", "$$ or 1=1 $$", "\" or \"1\"=\"1", "` or 1",
    "a\nb -- c", "50%", "%{term}", "%%", "é 💥", "x\0y"
  ]

  def render(sql, values, options = {})
    CustomFieldSql::SqlTemplate.render(sql, values, **options)
  end

  def value_of(sql)
    rows = ActiveRecord::Base.connection.select_all(sql).rows
    assert_equal 1, rows.size, "one row expected from #{sql}"
    rows.first.first
  end

  def mysql?
    CustomFieldSql::SqlTemplate.dialect_of(ActiveRecord::Base.connection) == :mysql
  end

  def test_value_inside_a_string_literal_comes_back_unchanged
    PAYLOADS.each do |payload|
      assert_equal payload.delete("\0"), value_of(render("select '%{p0}' as v", 'p0' => payload)), payload.inspect
    end
  end

  def test_value_outside_quotes_becomes_a_string_literal
    PAYLOADS.each do |payload|
      assert_equal payload.delete("\0"), value_of(render("select %{p0} as v", 'p0' => payload)).to_s, payload.inspect
    end
  end

  def test_value_right_after_a_word_is_not_a_special_literal
    # E'..' (PostgreSQL) or X'..' would read the value with other rules
    sql = render("select 'a' as v where 'x' = E%{p0}", 'p0' => "\\' or 1=1 --")
    assert_raises(ActiveRecord::StatementInvalid) { ActiveRecord::Base.connection.select_all(sql) }
  end

  def test_numbers_and_integer_lists_stay_numbers
    assert_equal "select * from issues where id in (1, 2,3)", render("select * from issues where id in (%{p0})", 'p0' => '1, 2,3')
    assert_equal "select 12.5", render("select %{p0}", 'p0' => '12.5')
    assert_equal "select '-1'", render("select %{p0}", 'p0' => '-1')
    assert_equal "select '1 or 1=1'", render("select %{p0}", 'p0' => '1 or 1=1')
  end

  def test_like_pattern_with_percent_signs
    sql = render("select subject from issues where subject like '%%%{term}%%' order by id", 'term' => 'recipe')
    assert_equal "select subject from issues where subject like '%recipe%' order by id", sql
  end

  def test_comments_get_no_value
    PAYLOADS.each do |payload|
      assert_equal '1', value_of(render("select 1 as v -- %{p0}\n", 'p0' => payload)).to_s, payload.inspect
      assert_equal '1', value_of(render("select 1 as v /* %{p0} */", 'p0' => payload)).to_s, payload.inspect
    end
  end

  def test_backslash_in_the_template_before_a_placeholder
    skip 'needs a database that reads backslashes in string literals' unless mysql?
    PAYLOADS.each do |payload|
      assert_equal "\\#{payload.delete("\0")}", value_of(render("select '\\%{p0}' as v", 'p0' => payload)), payload.inspect
    end
  end

  def test_double_quotes
    PAYLOADS.each do |payload|
      if mysql?
        assert_equal payload.delete("\0\""), value_of(render('select "%{p0}" as v', 'p0' => payload)), payload.inspect
      else
        column = ActiveRecord::Base.connection.select_all(render('select 1 as "%{p0}"', 'p0' => payload)).columns.first
        assert_equal payload.delete("\0\""), column, payload.inspect
      end
    end
  end

  def test_postgresql_escape_strings_and_dollar_quotes
    skip 'PostgreSQL only' if mysql?
    PAYLOADS.each do |payload|
      assert_equal payload.delete("\0"), value_of(render("select E'%{p0}' as v", 'p0' => payload)), payload.inspect
      assert_equal payload.delete("\0$"), value_of(render("select $q$%{p0}$q$ as v", 'p0' => payload)), payload.inspect
      assert_equal payload.delete("\0$"), value_of(render("select $$%{p0}$$ as v", 'p0' => payload)), payload.inspect
      assert_equal '1', value_of(render("select 1 as v /* /* */ %{p0} */", 'p0' => payload)).to_s, payload.inspect
    end
  end

  def test_mysql_comments_and_backticks
    skip 'MySQL/MariaDB only' unless mysql?
    PAYLOADS.each do |payload|
      assert_equal '1', value_of(render("select 1 as v # %{p0}\n", 'p0' => payload)).to_s, payload.inspect
      next if payload =~ /[^\u0000-\uFFFF]/ # MySQL identifiers hold no characters outside the BMP

      column = ActiveRecord::Base.connection.select_all(render('select 1 as `%{p0}`', 'p0' => payload)).columns.first
      assert_equal payload.delete("\0`").lstrip, column, payload.inspect
    end
  end

  def test_mysql_needs_a_space_after_two_dashes_for_a_comment
    assert_equal "select 1--1 as v", render("select 1--%{p0} as v", { 'p0' => '1' }, dialect: :mysql)
    assert_equal "select 1 as v -- \n", render("select 1 as v -- %{p0}\n", { 'p0' => '1' }, dialect: :mysql)
    assert_equal "select 1--\n", render("select 1--%{p0}\n", { 'p0' => '1' }, dialect: :postgresql)
  end

  def test_trusted_values_are_put_in_as_given
    assert_equal "select 1 where project_id = 3 and id = null",
                 render("select 1 where project_id = %{project_id} and id = %{issue_id}",
                        { 'project_id' => "3 or 1=1", 'issue_id' => '' }, trusted: { project_id: 3, issue_id: 'null' })
  end

  def test_same_placeholder_in_two_places
    q = ActiveRecord::Base.connection.quote_string("a'b")
    assert_equal "select '#{q}' where x = '#{q}' -- ",
                 render("select %{p0} where x = '%{p0}' -- %{p0}", 'p0' => "a'b")
  end

  def test_unknown_placeholder_raises_key_error_as_before
    assert_raises(KeyError) { render("select '%{nothere}'", {}) }
  end

  def test_sqlserver_dialect
    assert_equal "select 'it''s \\' where [a] = 'x''' and \"b\" = 1",
                 render("select %{p0} where [%{p1}] = '%{p2}' and \"%{p3}\" = 1",
                        { 'p0' => "it's \\", 'p1' => 'a]', 'p2' => "x'", 'p3' => 'b"' }, dialect: :sqlserver)
  end

  # the examples in the README run on PostgreSQL and MySQL/MariaDB
  def test_readme_examples
    readme = File.read(Rails.root.join('plugins', 'custom_field_sql', 'README.md'))
    example1 = readme[/`(select subject as value, description as label from issues .*?)`/, 1]
    example2 = readme[/`(select subject as value from issues where '%\{p0\}' = 'new' .*?)`/, 1]
    example3 = readme[/`(select subject as value from issues where id = coalesce.*?)`/, 1]
    Issue.create!(project_id: 1, tracker_id: 1, author_id: 1, subject: 'Readme example', description: 'cream')
    run = ->(sql, values, trusted = {}) { ActiveRecord::Base.connection.select_all(render(sql, values, trusted: trusted)).rows.map(&:first) }

    assert_equal ['Readme example'], run.(example1, 'p0' => '%example%', 'p1' => '%cream%')
    assert_equal Issue.count, run.(example2, 'p0' => 'new').size
    assert_equal [Issue.find(2).subject], run.(example2, 'p0' => '2')
    assert_equal Issue.count, run.(example3, {}, issue_id: 'null').size
    assert_equal [Issue.find(2).subject], run.(example3, {}, issue_id: 2)
  end
end
