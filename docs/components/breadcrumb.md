# Breadcrumb

Displays the path to the current resource using a hierarchy of links.

## Overview

The Breadcrumb component is a navigation aid that shows users their current location within the site's hierarchy. It uses an array-based approach for clean, maintainable code.

## Usage

```jinja
{% with
  items=[
    {'href': url_for('home'), 'label': _('Home')},
    {'href': '/products', 'label': _('Products')},
    {'label': _('All Products')}
  ]
%}
  {% include 'components/ui/breadcrumb.jinja' %}
{% endwith %}
```

## Basic Example

```jinja
{% with
  items=[
    {'href': '/', 'label': _('Home')},
    {'label': _('Current Page')}
  ]
%}
  {% include 'components/ui/breadcrumb.jinja' %}
{% endwith %}
```

**Output:**
```
Home → Current Page
```

## Examples

### Product Page Breadcrumb

```jinja
{% with
  items=[
    {'href': url_for('home'), 'label': _('Home')},
    {'href': url_for('products'), 'label': _('Products')},
    {'href': url_for('category', slug=product.category.slug), 'label': product.category.name},
    {'label': product.name}
  ]
%}
  {% include 'components/ui/breadcrumb.jinja' %}
{% endwith %}
```

**Output:**
```
Home → Products → Electronics → iPhone 15 Pro
```

### Category Hierarchy

```jinja
{% with
  items=[
    {'href': url_for('home'), 'label': _('Home')},
    {'href': '/electronics', 'label': _('Electronics')},
    {'href': '/electronics/phones', 'label': _('Phones')},
    {'label': _('Smartphones')}
  ]
%}
  {% include 'components/ui/breadcrumb.jinja' %}
{% endwith %}
```

### Custom Separator Icon

```jinja
{% set custom_separator %}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 2L8 14" stroke="currentColor" stroke-width="2"/>
  </svg>
{% endset %}

{% with
  items=[
    {'href': '/', 'label': _('Home')},
    {'href': '/products', 'label': _('Products')},
    {'label': _('All Products')}
  ],
  separator_icon=custom_separator
%}
  {% include 'components/ui/breadcrumb.jinja' %}
{% endwith %}
```

**Output:**
```
Home | Products | All Products
```

### Custom Styling

Add custom classes to the navigation or individual items:

```jinja
{% with
  items=[
    {'href': '/', 'label': _('Home'), 'class': 'text-blue-600'},
    {'label': _('Products'), 'page_class': 'text-red-600'}
  ],
  class='mb-6',
  separator_class='opacity-50'
%}
  {% include 'components/ui/breadcrumb.jinja' %}
{% endwith %}
```

### Dynamic Breadcrumbs from Data

Build breadcrumbs dynamically from a list:

```jinja
{% set breadcrumb_data = [
  {'url': url_for('home'), 'name': _('Home')},
  {'url': '/category', 'name': category.name},
  {'url': None, 'name': product.name}
] %}

{% set breadcrumb_items = [] %}
{% for crumb in breadcrumb_data %}
  {% if crumb.url %}
    {% set _ = breadcrumb_items.append({'href': crumb.url, 'label': crumb.name}) %}
  {% else %}
    {% set _ = breadcrumb_items.append({'label': crumb.name}) %}
  {% endif %}
{% endfor %}

{% with items=breadcrumb_items %}
  {% include 'components/ui/breadcrumb.jinja' %}
{% endwith %}
```

### HTML Content in Labels

Use icons or formatted content in breadcrumb labels:

```jinja
{% set home_icon %}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 2L2 7h2v5h3V9h2v3h3V7h2L8 2z"/>
  </svg>
{% endset %}

{% with
  items=[
    {'href': '/', 'label': home_icon},
    {'href': '/products', 'label': _('Products')},
    {'label': _('All Products')}
  ]
%}
  {% include 'components/ui/breadcrumb.jinja' %}
{% endwith %}
```

## API Reference

### Parameters

| Parameter        | Type     | Default       | Description                                      |
|------------------|----------|---------------|--------------------------------------------------|
| `items`          | `array`  | Required      | Array of breadcrumb items                        |
| `aria_label`     | `string` | `breadcrumb`  | Accessible label for navigation                  |
| `separator_icon` | `string` | Chevron right | Custom separator icon (HTML/SVG)                 |
| `separator_class`| `string` | -             | CSS classes for separator elements               |
| `class`          | `string` | -             | Additional CSS classes for nav element           |
| `attrs`          | `string` | -             | Raw HTML attributes (data-*, aria-*, etc.)       |

### Item Object Properties

Each item in the `items` array can have:

| Property     | Type     | Description                                           |
|--------------|----------|-------------------------------------------------------|
| `label`      | `string` | Required. Text or HTML content to display             |
| `href`       | `string` | Optional. Link URL (omit for current page)            |
| `class`      | `string` | Optional. CSS classes for the `<li>` element          |
| `link_class` | `string` | Optional. CSS classes for the `<a>` element           |
| `page_class` | `string` | Optional. CSS classes for current page `<span>`       |

**Important:** If an item has no `href`, it's treated as the current page (non-clickable).

## Accessibility

### Semantic HTML
- `<nav>` for navigation landmark
- `<ol>` for ordered list semantics
- `<li>` for list items
- `<a>` for links
- `<span>` for current page
- `aria-label="breadcrumb"` - Navigation label
- `aria-current="page"` - Current page indicator
- `aria-disabled="true"` - Current page is not interactive
- `role="presentation"` - Separators are presentational
- `aria-hidden="true"` - Separators hidden from screen readers

## Source Code

[`components/ui/breadcrumb.jinja`](../../components/ui/breadcrumb.jinja)
