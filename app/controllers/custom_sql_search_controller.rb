class CustomSqlSearchController < ApplicationController

  before_action :require_login
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
    trusted = { project_id: @project.id, issue_id: @issue ? @issue.id : 'null' }

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
  # Only the sql_search fields of issues call this action (the issue form and the
  # bulk edit form).
  def find_custom_field
    @custom_field = IssueCustomField.where(field_format: 'sql_search').find(params[:custom_field_id])
  rescue ActiveRecord::RecordNotFound
    render_404
  end

  def find_project_and_issue
    @project = Project.find(params[:project_id])
    @issue = Issue.visible.find(params[:issue_id]) unless params[:issue_id].blank? || params[:issue_id] == 'null'
  rescue ActiveRecord::RecordNotFound
    render_404
  end

  # The user must be able to fill in this field: see it, in a project that has
  # it, with the right to create or edit issues there.
  def authorize_search
    allowed = @project.all_issue_custom_fields.include?(@custom_field) &&
              @custom_field.visible_by?(@project, User.current) &&
              [:add_issues, :edit_issues, :edit_own_issues].any? { |p| User.current.allowed_to?(p, @project) }
    deny_access unless allowed
  end
end
