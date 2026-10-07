module CustomFieldSql
  module CustomFields
    module Formats

      class SqlSearch < Redmine::FieldFormat::StringFormat
        add 'sql_search'
        field_attributes :sql, :form_params, :search_by_click, :db_config, :strict_selection, :strict_error_message, :multi_select
        self.form_partial = 'custom_fields/formats/sql'

        # With multi select the value is a JSON array of strings, shown as a
        # comma separated list; anything else is shown as it is.
        def self.multi_values(value)
          values = JSON.parse(value.to_s) rescue nil
          values.map(&:to_s) if values.is_a?(Array)
        end

        def formatted_value(view, custom_field, value, customized=nil, html=false)
          values = custom_field.multi_select.to_s == '1' && self.class.multi_values(value)
          values ? values.join(', ') : super
        end

        def select_default_value(custom_field, object = nil)
          return if custom_field.default_value.blank?
          params = { tracker_id: 'null', project_id: 'null' }
          if object && object.is_a?(Issue)
            params[:tracker_id] = object.tracker_id || 'null'
            params[:project_id] = object.project_id || 'null'
          end
          value = ActiveRecord::Base.connection.select_value(custom_field.default_value % params)
          value = [value.to_s].to_json if custom_field.multi_select.to_s == '1' && value.to_s != '' && !self.class.multi_values(value)
          value
        end
      end

      class Sql < Redmine::FieldFormat::List
        add 'sql'
        field_attributes :sql
        self.form_partial = 'custom_fields/formats/sql'

        def possible_values_options(custom_field, object = nil)
          sql = custom_field.sql
          return [] unless sql

          if object
            obj = object
            obj = obj.first if obj.is_a?(Array)
            if obj && (obj.class.to_s + 'CustomField') == custom_field.class.to_s
              sql = sql.gsub('%id%', obj.id.nil? ? 'null' : obj.id.to_s)
            else
              sql = sql.gsub('%id%', 'null')
            end
          end

          result = ActiveRecord::Base.connection.select_all(sql)
          result.rows
        end

        def group_statement(custom_field)
          order_statement(custom_field)
        end

        def validate_custom_field(custom_field)
          errors = []
          #errors << [:language, :blank] if custom_field.language.blank?
          errors
        end
      end

    end
  end
end
