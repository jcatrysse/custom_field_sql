module CustomFieldSql
  module CustomFields
    module Formats

      class SqlSearch < Redmine::FieldFormat::StringFormat
        add 'sql_search'
        field_attributes :sql, :form_params, :search_by_click, :db_config, :strict_selection, :strict_error_message
        self.form_partial = 'custom_fields/formats/sql'

        def select_default_value(custom_field, object = nil)
          return if custom_field.default_value.blank?
          params = {}
          if object && object.is_a?(Issue)
            params[:tracker_id] = object.tracker_id
            params[:project_id] = object.project_id
          end
          ActiveRecord::Base.connection.select_value(custom_field.default_value % params)
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
