require File.expand_path('../../test_helper', __FILE__)

class CustomFieldSqlEagerLoadTest < ActiveSupport::TestCase
  # Production eager loads every class; `unloadable` no longer exists since Rails 7
  # and made the controller raise NameError, which stopped Redmine from booting.
  def test_plugin_controller_loads
    path = Rails.root.join('plugins', 'custom_field_sql', 'app', 'controllers', 'custom_sql_search_controller.rb')
    assert_nothing_raised { load path.to_s }
    assert CustomSqlSearchController < ApplicationController
  end
end
