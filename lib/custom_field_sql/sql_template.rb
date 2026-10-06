module CustomFieldSql
  # Fills the %{name} placeholders of an administrator's SQL with values from the
  # request, escaped for the place each placeholder has in the statement:
  #
  #   inside '...'               the value is escaped as a string literal ('%{term}%%')
  #   inside "...", `...`, [...] the characters that would close it are dropped
  #   inside a comment           the placeholder is left empty
  #   anywhere else              an unsigned number or a list of integers as is,
  #                              anything else as a quoted string literal
  #
  # Trusted values (ids the controller looked up itself) are put in as given.
  # The result is then formatted with String#%, as before, so %% stays a percent
  # sign and an unknown placeholder still raises KeyError.
  class SqlTemplate
    NUMBER = /\A\d+(\.\d+)?\z/
    INTEGER_LIST = /\A\d+(\s*,\s*\d+)*\z/
    PLACEHOLDER = /\A%\{([^}]*)\}/
    CLOSING = { single: "'", double: '"', backtick: '`', bracket: ']' }

    # dialect: :postgresql, :mysql or :sqlserver (a db_config connection).
    def self.render(sql, values, trusted: {}, dialect: nil, connection: ActiveRecord::Base.connection)
      new(dialect || dialect_of(connection), connection).render(sql, values, trusted)
    end

    def self.dialect_of(connection)
      case connection.adapter_name.to_s.downcase
      when /mysql|maria|trilogy/ then :mysql
      when /sqlserver/ then :sqlserver
      else :postgresql
      end
    end

    def initialize(dialect, connection)
      @dialect = dialect
      @connection = connection
    end

    def render(sql, values, trusted)
      @values = values.to_h.transform_keys(&:to_s)
      @trusted = trusted.to_h.transform_keys(&:to_s)
      filled = {}
      out = +''
      state = :code
      depth = 0
      tag = nil
      backslash = false
      i = 0
      while i < sql.length
        c = sql[i]
        if sql[i, 2] == '%%'
          out << '%%'
          i += 2
          next
        end
        if c == '%' && (m = PLACEHOLDER.match(sql[i..]))
          key = :"__cfsql_#{filled.size}"
          filled[key] = substitute(m[1], state, backslash)
          # E'..', X'..', N'..': a literal right after a word is not a plain string
          filled[key] = " #{filled[key]}" if state == :code && filled[key].start_with?("'") && out =~ /[\w$'"`\]]\z/
          out << "%{#{key}}"
          i += m[0].length
          next
        end
        case state
        when :code
          if c == "'"
            state = :single
            backslash = @dialect == :mysql || (@dialect == :postgresql && e_string?(sql, i))
          elsif c == '"'
            state = :double
            backslash = @dialect == :mysql
          elsif c == '`'
            state = :backtick
          elsif c == '[' && @dialect == :sqlserver
            state = :bracket
          elsif line_comment?(sql, i)
            state = :line_comment
          elsif sql[i, 2] == '/*'
            state = :block_comment
            depth = 1
            out << '/*'
            i += 2
            next
          elsif @dialect == :postgresql && c == '$' && (i == 0 || sql[i - 1] !~ /[\w$]/) &&
                (m = /\A\$([A-Za-z_][A-Za-z0-9_]*)?\$/.match(sql[i..]))
            state = :dollar
            tag = m[0]
            out << tag
            i += tag.length
            next
          end
        when :single, :double
          if backslash && c == '\\'
            if sql[i + 1, 2] == '%{'
              # the template escapes the first character of the value: give it a
              # backslash of its own, so the value cannot close the literal
              out << '\\\\'
              i += 1
            elsif sql[i + 1] == '%'
              out << '\\'
              i += 1
            else
              out << sql[i, 2]
              i += 2
            end
            next
          elsif c == CLOSING[state]
            if sql[i + 1] == c
              out << c << c
              i += 2
              next
            end
            state = :code
          end
        when :backtick, :bracket
          state = :code if c == CLOSING[state]
        when :line_comment
          state = :code if c == "\n"
        when :block_comment
          if sql[i, 2] == '*/'
            depth -= 1
            state = :code if depth == 0
            out << '*/'
            i += 2
            next
          elsif sql[i, 2] == '/*' && @dialect == :postgresql
            depth += 1
            out << '/*'
            i += 2
            next
          end
        when :dollar
          if sql[i, tag.length] == tag
            out << tag
            i += tag.length
            state = :code
            next
          end
        end
        out << c
        i += 1
      end
      out % filled
    end

    private

    # PostgreSQL E'...': backslash escapes, unlike a plain '...'.
    def e_string?(sql, i)
      i > 0 && sql[i - 1] =~ /[eE]/ && (i < 2 || sql[i - 2] !~ /\w/)
    end

    # MySQL only starts a comment at "-- " (whitespace after the dashes) and "#".
    def line_comment?(sql, i)
      return false unless sql[i, 2] == '--' || (@dialect == :mysql && sql[i] == '#')
      return true unless @dialect == :mysql && sql[i] == '-'

      sql[i + 2].nil? || sql[i + 2] =~ /[[:space:][:cntrl:]]/
    end

    def substitute(name, state, backslash)
      return @trusted[name].to_s if @trusted.key?(name)
      raise KeyError, "key<#{name}> not found" unless @values.key?(name)

      value = scalar(@values[name])
      case state
      when :code
        value.match?(NUMBER) || value.match?(INTEGER_LIST) ? value : "'#{escape(value, @dialect == :mysql)}'"
      when :single
        escape(value, backslash)
      when :double
        @dialect == :mysql ? @connection.quote_string(value.delete('"')) : value.delete('"')
      when :backtick, :bracket
        value.delete(CLOSING[state])
      when :dollar
        value.delete('$')
      else
        ''
      end
    end

    def scalar(value)
      value = value.join(',') if value.is_a?(Array)
      value.to_s.delete("\0")
    end

    # The content of a string literal. The connection knows its own rules (MySQL
    # backslashes, NO_BACKSLASH_ESCAPES); PostgreSQL E'...' and SQL Server need help.
    def escape(value, backslash)
      case @dialect
      when :sqlserver
        value.gsub("'", "''")
      when :postgresql
        escaped = @connection.quote_string(value)
        backslash ? escaped.gsub('\\') { '\\\\' } : escaped
      else
        @connection.quote_string(value)
      end
    end
  end
end
