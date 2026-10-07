function observeSqlField(fieldId, url, form_params, options) {
    $(document).ready(function() {
        $('#'+fieldId).autocomplete($.extend({
            classes: {
                "ui-autocomplete": "sql-autocomplete"
            },
            create: function( event, ui ) {
                this.store = [];
                this.store.push(this.value);
                let input = $(this, 'input');
                input.tooltip({
                    classes: {
                        "ui-tooltip": "ui-state-highlight sql-tooltip"
                    }
                });
            },
            source: function(request, response) {
                var url_obj = {
                    url: url,
                    dataType: "json",
                    data: {
                        term: request.term
                    },
                    error: function(request, status, error){
                        $('#'+fieldId).removeClass('ajax-loading');
                        console.log(request.responseText)
                        console.log(error)
                    },
                    success: function(data) { response(data); }
                }
                for(let key in form_params){
                    url_obj.data[key]=eval(form_params[key]);
                }
                $.ajax(url_obj);
            },
            minLength: 2,
            position: {collision: "flipfit"},
            search: function(){ $('#'+fieldId).addClass('ajax-loading'); },
            response: function(){ $('#'+fieldId).removeClass('ajax-loading'); },
            change: function( event, ui ) {
                if (options.strict_selection=='0' ) {
                    return;
                }
                var input = $(this, 'input');
                var value = input.val();
                if (value !== '') $.data(this, 'edited', true);
                if ( this.store.includes(value) ) {
                    return;
                }
                input.val( "" );
                input.attr( "title", value  + " \n " + options.strict_error_message);
                input.tooltip( "open" );
                setTimeout(() => {
                    input.tooltip( "close" ).attr( "title", "" );
                }, 2500)
            },
            select: function( event, ui ) {
                if (!this.store.includes(ui.item.value))
                    this.store.push(ui.item.value);
                $.data(this, 'edited', true);
            }
        }, options));
        $('#'+fieldId).addClass('autocomplete');
        $('#' + fieldId).keypress(function (e) {
            if (e.keyCode == 13) return false;
        });
        if (options.search_by_click=='1') {
            $('#' + fieldId).click(function () {
                $(this).autocomplete('search', 'data')
            });
            $('#' + fieldId).keydown(function(e) {
                if (e.altKey && e.keyCode == 40)
                    $(this).autocomplete('search', 'data')
            });

        }
    });
}

// Multi select (upstream 3d36b17, adapted): the selected values are tags under
// the input, the input only searches. The field's name moves to a hidden input
// that holds the values as a JSON array (empty when there are none) and is kept
// up to date on every change, so every way of sending the form carries them:
// submit, the issue form update, redmine_inline_edit_issues, and form.submit()
// as the IssueHotButton plugin calls it (upstream 13d0792).
function sqlMultiValues(text) {
    if (!text || $.trim(text) === '') return [];
    try {
        var values = JSON.parse(text);
        if ($.isArray(values)) return $.map(values, function(v) { return String(v); });
    } catch(e) {}
    return [text];
}

function observeSqlMultiField(fieldId, url, form_params, options) {
    $(document).ready(function() {
        var $field = $('#' + fieldId);
        if (!$field.length || $field.data('sqlMulti')) return;
        $field.data('sqlMulti', true);
        var selected = sqlMultiValues($field.val());
        var $value = $('<input>', { type: 'hidden', id: fieldId + '_value', name: $field.attr('name') });
        $field.removeAttr('name').val('').attr('autocomplete', 'off');
        var $add = $('<button>', { type: 'button', 'class': 'sql-multi-add-btn', title: options.add_title, text: '+' }).hide();
        $field.wrap($('<span>', { 'class': 'sql-multi-wrapper' }));
        $field.after($value, $add);
        var $tags = $('<span>', { id: fieldId + '_tags', 'class': 'sql-multi-tags-container' });
        $field.parent().after($tags);

        function store() {
            $value.val(selected.length ? JSON.stringify(selected) : '');
            $.data($field[0], 'edited', true);
            $.data($value[0], 'edited', true);
        }
        function addValue(value) {
            value = $.trim(String(value));
            if (value !== '' && $.inArray(value, selected) === -1) {
                selected.push(value);
                render();
                store();
            }
            $field.val('');
            $add.hide();
        }
        function render() {
            $tags.empty();
            $.each(selected, function(i, value) {
                var $remove = $('<a>', { href: '#', 'class': 'sql-multi-tag-remove', title: options.remove_title, html: '&times;' });
                $remove.on('click', function(e) {
                    e.preventDefault();
                    selected = $.grep(selected, function(v) { return v !== value; });
                    render();
                    store();
                });
                $tags.append($('<span>', { 'class': 'sql-multi-tag' }).append($('<span>', { 'class': 'sql-multi-tag-text', text: value }), $remove));
            });
        }
        $value.val(selected.length ? JSON.stringify(selected) : '');
        render();

        $field.autocomplete({
            classes: {
                "ui-autocomplete": "sql-autocomplete"
            },
            source: function(request, response) {
                var url_obj = {
                    url: url,
                    dataType: "json",
                    data: {
                        term: request.term
                    },
                    error: function(request, status, error){
                        $field.removeClass('ajax-loading');
                        console.log(request.responseText)
                        console.log(error)
                    },
                    success: function(data) {
                        var found = $.grep(data, function(item) { return $.inArray(String(item.value), selected) === -1; });
                        response(found);
                        $add.toggle(options.strict_selection == '0' && found.length === 0 && $.trim($field.val()) !== '');
                    }
                }
                for(let key in form_params){
                    url_obj.data[key]=eval(form_params[key]);
                }
                $.ajax(url_obj);
            },
            minLength: 2,
            position: {collision: "flipfit"},
            search: function(){ $field.addClass('ajax-loading'); },
            response: function(){ $field.removeClass('ajax-loading'); },
            select: function(event, ui) {
                addValue(ui.item.value);
                return false;
            }
        });
        $field.addClass('autocomplete');
        $add.on('click', function() { addValue($field.val()); });
        $field.on('input', function() {
            if ($.trim($field.val()) === '') $add.hide();
        });
        $field.keypress(function(e) {
            if (e.keyCode == 13) {
                if ($add.is(':visible')) $add.click();
                return false;
            }
        });
        if (options.search_by_click == '1') {
            $field.click(function () {
                $(this).autocomplete('search', 'data')
            });
            $field.keydown(function(e) {
                if (e.altKey && e.keyCode == 40)
                    $(this).autocomplete('search', 'data')
            });
        }
    });
}
