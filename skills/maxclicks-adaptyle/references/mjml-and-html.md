# MJML vs HTML raw bodies

`bodyFormat` picks which markup language `body` is written in. Both are plain strings you author directly, no rich block editor involved via the public API.

## MJML (`bodyFormat: "mjml"`)

A restricted MJML v4 tag set, chosen for email-client compatibility. Only use these tags:

```
mjml, mj-head, mj-body, mj-raw, mj-section, mj-column, mj-group, mj-wrapper,
mj-text, mj-button, mj-image, mj-divider, mj-spacer, mj-hero,
mj-attributes, mj-breakpoint, mj-font, mj-preview, mj-style, mj-title
```

Structure:

```xml
<mjml>
  <mj-head>
    <mj-preview>Your one-line inbox preview text</mj-preview>
  </mj-head>
  <mj-body background-color="{{ branding.colorPalette.canvasBackgroundColor | default: '#f4f4f4' }}">
    <mj-section background-color="{{ branding.colorPalette.backgroundColor | default: '#ffffff' }}">
      <mj-column>
        <mj-text font-family="{{ branding.stylePack.textFontFamily | default: 'Arial, sans-serif' }}" color="{{ branding.colorPalette.textColor | default: '#333333' }}">
          Hello
        </mj-text>
        <mj-button href="{{ branding.websiteUrl }}" background-color="{{ branding.colorPalette.buttonBackgroundColor | default: '#414141' }}" color="{{ branding.colorPalette.buttonColor | default: '#ffffff' }}">
          Click here
        </mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

**Always include `<mj-preview>` inside `<mj-head>` when you can.** It is the inbox preview snippet most email clients show next to the subject line; there is no separate `preview` field on the raw content shape, this tag is the only place to set it.

`mj-raw` is your escape hatch for anything the restricted tag set does not cover (e.g. a raw `<!--[if mso]>` conditional comment block), but prefer the native tags first.

## HTML (`bodyFormat: "html"`)

Plain, hand-written HTML with inline styles. No MJML wrapper, no separate rich block model:

```html
<div style="max-width:560px;margin:0 auto;font-family:Arial,sans-serif;color:{{ branding.colorPalette.textColor | default: '#333333' }};">
  <h1 style="color:{{ branding.colorPalette.headingColor | default: '#111111' }};font-size:20px;">
    Order #{{ order.id }} confirmed
  </h1>
  <p>Thanks for your order.</p>
</div>
```

Use standard email-safe HTML practices: inline styles (many clients strip `<style>` blocks, though a hidden `<style>` block for a few shared classes is a common, safe pattern, see the examples), table-based layout for anything that needs to survive Outlook, explicit `width`/`height` on images. This skill does not enforce a specific email-HTML framework; write what you would write for any HTML email, then layer Adaptyle/Liquid into it exactly as shown above.

## Liquid works the same in both

`{{ }}` and `{% %}` tags are valid anywhere in either body, including inside attribute values (`background-color="{{ ... }}"`, `href="{{ ... }}"`) and inside loops/conditionals around whole blocks:

```liquid
{% if cart.itemCount == 1 %}You left an item in your cart{% else %}You left {{ cart.itemCount }} items in your cart{% endif %}

{% for item in order.items %}
  <tr><td>{{ item.name }}</td><td>{{ item.quantity }}</td></tr>
{% endfor %}
```

Adaptyle's parser does not look at `{{ }}`/`{% %}` at all (they are resolved earlier, in the Liquid stage), so there is no special interaction to worry about beyond keeping Adaptyle's own delimiters (`<<< >>>`, `<## ##>`, `<<# #>>`) intact and unambiguous.
