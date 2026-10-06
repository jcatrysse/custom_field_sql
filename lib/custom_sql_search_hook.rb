class CustomSqlSearchHook < Redmine::Hook::ViewListener

  def view_layouts_base_html_head(context={})
    html = "\n<!-- [custom field sql plugin] -->\n"
    html << stylesheet_link_tag("sql_search", plugin: "custom_field_sql")
    html << javascript_include_tag("sql_field.js", plugin: "custom_field_sql")
    return html
  end

  def  view_issues_form_details_bottom(context={})
    html = ""
      context[:issue].available_custom_fields.each do |field|
        if field.is_a?(IssueCustomField)
          if field.field_format == 'sql_search'
              html << sql_search_script(field, context[:issue].project_id, context[:issue].id.to_s)
          end
        end
      end
    return html
  end

  def view_issues_bulk_edit_details_bottom(context={})
    html = ""
    issues = Array(context[:issues])
    project_id = issues.first && issues.first.project_id
    IssueCustomField.where(id: issues.map { |i| i.available_custom_fields.map(&:id) }.flatten.uniq).each do |field|
      next unless field.field_format == 'sql_search'
      html << sql_search_script(field, project_id)
    end
    html
  end

  private

  # The script that turns the field's input into an autocomplete, for the issue
  # form and the bulk edit form.
  def sql_search_script(field, project_id, issue_id = nil)
    p = Hash[field.form_params.to_s.each_line.map {|str| str.split("=", 2) }]
    options = {}
    options[:search_by_click] = field.search_by_click ||= 0
    options[:strict_selection] = field.strict_selection ||= 0
    options[:strict_error_message] = field.strict_error_message ||= l(:text_sql_strict_error_message_default)
    url = "#{Redmine::Utils.relative_url_root}/custom_sql_search/search?project_id=#{project_id}"
    url << "&issue_id=#{issue_id}" unless issue_id.nil?
    url << "&custom_field_id=#{field.id}"
    html = "<script>\n"
    html << "//<![CDATA[\n"
    html << "observeSqlField('issue_custom_field_values_#{field.id}', '#{url}', JSON.parse(#{p.to_json.dump}), JSON.parse(#{options.to_json.dump}))\n"
    html << "//]]>\n"
    html << "</script>\n"
  end
end

module CustomFieldSqlCore
  module Models
    module CustomSqlValue
      def initialize(attributes=nil, *args)
        super
        if new_record? && custom_field && (customized_type.blank? || (customized && customized.new_record?)) &&
           (custom_field.format.instance_of? CustomFieldSql::CustomFields::Formats::SqlSearch)
          self.value = custom_field.format.select_default_value(custom_field, customized)
        end
      end
    end
  end
end

CustomValue.send(:prepend, CustomFieldSqlCore::Models::CustomSqlValue)