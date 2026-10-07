class CustomSqlSearchController < ApplicationController

  # no require_login: anonymous users may search where the anonymous role may
  # add or edit issues (authorize_search)
  before_action :find_custom_field
  before_action :find_project_and_issue
  before_action :authorize_search

  def sqlserver_search(c, sql)
    begin
      client = TinyTds::Client.new username: c[:username], password: c[:password], host: c[:host],  port: c[:port],  timeout: 60000, database: c[:database]
      Rails.logger.info('TinyTds  sql ' + sql.to_s)
      result = client.execute(sql)
      dataset = []
      result.each do |row|
        dataset << row
      end
      dataset
    rescue => e
      Rails.logger.error('TinyTds error ' + e.message)
      []
    end
  end

  def  with_another_database(config, sql)
    c = ActiveRecord::Base.configurations.configs_for(env_name: config, name: 'primary')
    if c.adapter == 'sqlserver'
      sqlserver_search(c.configuration_hash, sql)
    else
      []
    end
  end

  def with_another_db(another_db_config)
    original_connection = ActiveRecord::Base.remove_connection
    ActiveRecord::Base.establish_connection(another_db_config)
    yield
  ensure
    ActiveRecord::Base.establish_connection(original_connection)
  end

  def search
    # every request value is escaped for its place in the SQL; the ids are the
    # ones looked up and checked above
    trusted = { project_id: @project ? @project.id : 'null', issue_id: @issue ? @issue.id : 'null' }

    if @custom_field.db_config.blank?
      sql = CustomFieldSql::SqlTemplate.render(@custom_field.sql, params.as_json, trusted: trusted)
      @dataset = ActiveRecord::Base.connection.select_all(sql)
    else
      sql = CustomFieldSql::SqlTemplate.render(@custom_field.sql, params.as_json, trusted: trusted, dialect: :sqlserver)
      @dataset = with_another_database(@custom_field.db_config, sql)
    end

    render json: @dataset.map {|record| {
      'value' => record['value'],
      'label' => "#{record['value'].to_s.truncate(60)} (#{record['label'].to_s.truncate(60)})"
    }}
  end

  private
  # The issue form and the bulk edit form call this action for issue fields; a
  # sql_search field of a project, user or time entry is wired by a script of
  # one's own (view_customize, for instance).
  def find_custom_field
    types = %w(IssueCustomField ProjectCustomField UserCustomField TimeEntryCustomField)
    @custom_field = CustomField.where(type: types, field_format: 'sql_search').find(params[:custom_field_id])
  rescue ActiveRecord::RecordNotFound
    render_404
  end

  # An issue field needs a project; the others may go without one (a new
  # project, the account page, time logged from the global form).
  def find_project_and_issue
    if @custom_field.is_a?(IssueCustomField) || !blank_id?(params[:project_id])
      @project = Project.find(params[:project_id])
    end
    if (@custom_field.is_a?(IssueCustomField) || @custom_field.is_a?(TimeEntryCustomField)) && !blank_id?(params[:issue_id])
      @issue = Issue.visible.find(params[:issue_id])
      @project ||= @issue.project
    end
  rescue ActiveRecord::RecordNotFound
    render_404
  end

  def blank_id?(id)
    id.blank? || id == 'null'
  end

  def authorize_search
    deny_access unless search_allowed?
  end

  # The user must be able to fill in this field on the form it belongs to.
  def search_allowed?
    user = User.current
    case @custom_field
    when IssueCustomField
      # see the field, in a project that has it and where the user may add or
      # edit issues, and edit the given issue (on the edit form the project can
      # be the one the issue is being moved to)
      @project.all_issue_custom_fields.include?(@custom_field) &&
        @custom_field.visible_by?(@project, user) &&
        [:add_issues, :edit_issues, :edit_own_issues].any? { |p| user.allowed_to?(p, @project) } &&
        (@issue.nil? || @issue.attributes_editable?(user))
    when ProjectCustomField
      # project settings, or the new project form
      @custom_field.visible_by?(@project, user) &&
        (@project ? user.allowed_to?(:edit_project, @project) :
                    user.allowed_to_globally?(:add_project) || user.allowed_to_globally?(:add_subprojects))
    when TimeEntryCustomField
      # log or edit time, in the project of the given issue
      @custom_field.visible_by?(@project, user) &&
        (@project ? [:log_time, :edit_time_entries, :edit_own_time_entries].any? { |p| user.allowed_to?(p, @project) } :
                    user.allowed_to_globally?(:log_time)) &&
        (@issue.nil? || @issue.project == @project)
    when UserCustomField
      # the user form (administrators) or the user's own account page
      user.admin? || (user.logged? && @custom_field.editable?)
    end
  end
end
