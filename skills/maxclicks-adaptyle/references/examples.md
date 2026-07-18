# Examples: 6 copy-paste RAW templates

Six complete templates, each with its `subject`, `body`, `expectedDataRepresentation`, and `recipientDataPath`. All six were verified to parse clean (strict mode, zero warnings) with the real Adaptyle parser, both as individual `subject`/`body` fields and as the combined document the platform builds internally for one customize call, before being written here.

**How to actually send one:** because these bodies are multi-line strings, do not hand-escape newlines into a JSON literal. Write the field to a file and let `jq` build the JSON payload safely, then pass that payload to `--data`:

```bash
subject=$(cat subject.txt)
body=$(cat body.mjml)
payload=$(jq -n --arg subject "$subject" --arg body "$body" '{
  transactional: true,
  recipientDataPath: ["contact"],
  expectedDataRepresentation: [{ key: "contact", type: "record", schema: "students", isArray: false }],
  content: { bodyFormat: "mjml", subject: $subject, body: $body }
}')
maxclicks templates create --data "$payload"
```

(Any language's JSON serializer handles this automatically; `jq` is shown here only because the CLI's `--data` flag takes a string on the command line. In application code, just build a normal object and `JSON.stringify`/`json.dumps` it.)

---

## 1. Welcome email (MJML, transactional, one hidden block, three prompts)

Demonstrates: manifest, `<mj-preview>` prompt, two body prompts, one hidden footer block, branding usage.

`expectedDataRepresentation`: `[{ "key": "contact", "type": "record", "schema": "students", "isArray": false }]`
`recipientDataPath`: `["contact"]`
`transactional`: `true`

**subject:**

```adaptyle
<<<Write a short, upbeat subject line under 60 characters welcoming the new contact by name. Avoid exclamation marks.>>>
```

**body:**

```adaptyle
<<#
title: Welcome Email
description: Sent right after a contact signs up.
#>>
<mjml>
  <mj-head>
    <mj-preview><<<Write a short, warm one-line preview (under 90 characters) welcoming the new contact by name.>>></mj-preview>
  </mj-head>
  <mj-body background-color="{{ branding.colorPalette.canvasBackgroundColor | default: '#f4f4f4' }}">
    <mj-section background-color="{{ branding.colorPalette.backgroundColor | default: '#ffffff' }}">
      <mj-column>
        <mj-image src="{{ branding.logoUrl }}" alt="{{ branding.brandName }}" width="140px" />
        <mj-text font-family="{{ branding.stylePack.headingFontFamily | default: 'Arial, sans-serif' }}" font-size="{{ branding.stylePack.heading2FontSizePixels | default: 24 }}px" color="{{ branding.colorPalette.headingColor | default: '#111111' }}">
          <<<Write a one-sentence, friendly welcome heading, greeting the contact by their first name.>>>
        </mj-text>
        <mj-text font-family="{{ branding.stylePack.textFontFamily | default: 'Arial, sans-serif' }}" color="{{ branding.colorPalette.textColor | default: '#333333' }}">
          <<<Write two short sentences telling the new contact what to expect next, in a warm, encouraging tone. Do not mention pricing.>>>
        </mj-text>
        <mj-button background-color="{{ branding.colorPalette.buttonBackgroundColor | default: '#414141' }}" color="{{ branding.colorPalette.buttonColor | default: '#ffffff' }}" href="{{ branding.websiteUrl }}">
          Get started
        </mj-button>
        <## welcome-footer-note ::: <mj-text font-size="11px" color="#999999" align="center">You are receiving this because you signed up at {{ branding.websiteUrl }}.</mj-text> ##>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

---

## 2. Order receipt (HTML, transactional, Liquid loop, one prompt, no manifest)

Demonstrates: HTML raw (no MJML), a JSON data-representation property with nested array, a hidden `<style>` block, deterministic Liquid loop kept fully separate from the one prompt.

`expectedDataRepresentation`:
```jsonc
[
  { "key": "contact", "type": "record", "schema": "students", "isArray": false },
  { "key": "order", "type": "json", "jsonSchema": { "type": "object", "properties": {
      "id": { "type": "string" },
      "items": { "type": "array", "items": { "type": "object", "properties": {
          "name": { "type": "string" }, "quantity": { "type": "number" }, "price": { "type": "number" } } } },
      "total": { "type": "number" }
  } } }
]
```
`recipientDataPath`: `["contact"]`
`transactional`: `true`

**subject:**

```adaptyle
<<<Write a short, clear order-confirmation subject line under 60 characters.>>>
```

**body:**

```adaptyle
<## receipt-styles ::: <style>.mc-receipt-table{width:100%;border-collapse:collapse;font-family:Arial,sans-serif;} .mc-receipt-table td{padding:8px;border-bottom:1px solid #eee;}</style> ##>
<div style="max-width:560px;margin:0 auto;font-family:Arial,sans-serif;color:{{ branding.colorPalette.textColor | default: '#333333' }};">
  <h1 style="color:{{ branding.colorPalette.headingColor | default: '#111111' }};font-size:20px;">Order #{{ order.id }} confirmed</h1>
  <p><<<Write one warm sentence thanking the customer for their order, in the brand's voice. Do not restate the order total, it is shown separately.>>></p>
  <table class="mc-receipt-table">
    {% for item in order.items %}
    <tr>
      <td>{{ item.name }}</td>
      <td>{{ item.quantity }}</td>
      <td>${{ item.price }}</td>
    </tr>
    {% endfor %}
    <tr>
      <td colspan="2"><strong>Total</strong></td>
      <td><strong>${{ order.total }}</strong></td>
    </tr>
  </table>
</div>
```

---

## 3. Weekly newsletter (MJML, marketing, topic-bound, deterministic headline + one editorial prompt)

Demonstrates: a marketing email with a `communicationTopicId`, mixing deterministic Liquid insertion (`{{ topArticle.title }}`) with a separate, non-interpolated prompt for editorial tone.

`expectedDataRepresentation`:
```jsonc
[
  { "key": "contact", "type": "record", "schema": "students", "isArray": false },
  { "key": "topArticle", "type": "json", "jsonSchema": { "type": "object", "properties": {
      "title": { "type": "string" }, "summary": { "type": "string" }, "url": { "type": "string" } } } }
]
```
`recipientDataPath`: `["contact"]`
`transactional`: `false`
`communicationTopicId`: `"<your newsletter topic id>"`

**subject:**

```adaptyle
<<<Write a curiosity-driven newsletter subject line under 60 characters based on this week's featured article.>>>
```

**body:**

```adaptyle
<<#
title: Weekly Newsletter
description: Marketing digest featuring one article of the week.
#>>
<mjml>
  <mj-head>
    <mj-preview>{{ topArticle.title }}</mj-preview>
  </mj-head>
  <mj-body background-color="{{ branding.colorPalette.canvasBackgroundColor | default: '#f4f4f4' }}">
    <mj-section>
      <mj-column>
        <mj-text font-size="{{ branding.stylePack.heading1FontSizePixels | default: 28 }}px" color="{{ branding.colorPalette.headingColor | default: '#111111' }}">{{ topArticle.title }}</mj-text>
        <mj-text color="{{ branding.colorPalette.textColor | default: '#333333' }}">{{ topArticle.summary }}</mj-text>
        <mj-text color="{{ branding.colorPalette.textColor | default: '#333333' }}">
          <<<Write a two-sentence editorial intro that teases this week's featured article and encourages the reader to click through, in a lively, conversational tone.>>>
        </mj-text>
        <mj-button href="{{ topArticle.url }}" background-color="{{ branding.colorPalette.buttonBackgroundColor | default: '#414141' }}" color="{{ branding.colorPalette.buttonColor | default: '#ffffff' }}">Read the full story</mj-button>
        <## newsletter-footer ::: <mj-text font-size="11px" color="#999999" align="center">{{ branding.brandName }} · <a href="{{ branding.websiteUrl }}">{{ branding.websiteUrl }}</a></mj-text> ##>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

---

## 4. Cart abandonment reminder (HTML, marketing, zero prompt tags)

Demonstrates: a fully deterministic template, no `<<< >>>` anywhere. This is a valid, common Adaptyle document: `analyze` reports `needsLlm: false` and `customize` skips the LLM call entirely, no AI cost, same output every time for the same data. Reach for this shape whenever wording does not need to vary.

`expectedDataRepresentation`:
```jsonc
[
  { "key": "contact", "type": "record", "schema": "students", "isArray": false },
  { "key": "cart", "type": "json", "jsonSchema": { "type": "object", "properties": {
      "itemCount": { "type": "number" },
      "items": { "type": "array", "items": { "type": "object", "properties": {
          "name": { "type": "string" }, "quantity": { "type": "number" } } } },
      "checkoutUrl": { "type": "string" }
  } } }
]
```
`recipientDataPath`: `["contact"]`
`transactional`: `false`

**subject:**

```adaptyle
You left something in your cart
```

**body:**

```adaptyle
<## cart-styles ::: <style>.mc-cart-item{padding:6px 0;}</style> ##>
<div style="max-width:560px;margin:0 auto;font-family:Arial,sans-serif;color:{{ branding.colorPalette.textColor | default: '#333333' }};">
  <h1 style="color:{{ branding.colorPalette.headingColor | default: '#111111' }};font-size:20px;">
    {% if cart.itemCount == 1 %}You left an item in your cart{% else %}You left {{ cart.itemCount }} items in your cart{% endif %}
  </h1>
  <div>
    {% for item in cart.items %}
    <div class="mc-cart-item">{{ item.name }} &times; {{ item.quantity }}</div>
    {% endfor %}
  </div>
  <a href="{{ cart.checkoutUrl }}" style="display:inline-block;margin-top:16px;padding:10px 18px;background-color:{{ branding.colorPalette.buttonBackgroundColor | default: '#414141' }};color:{{ branding.colorPalette.buttonColor | default: '#ffffff' }};text-decoration:none;border-radius:4px;">Finish checkout</a>
</div>
```

---

## 5. Flash sale teaser (MJML, marketing, nested prompt, depth 2)

Demonstrates: a modification prompt whose base content contains a nested generation prompt (nesting depth 2, at the recommended limit, no warning). Note the order inside the outer tag: instruction, `:::`, then content, with the inner prompt embedded in that content.

`expectedDataRepresentation`: `[{ "key": "contact", "type": "record", "schema": "students", "isArray": false }]`
`recipientDataPath`: `["contact"]`
`transactional`: `false`

**subject:**

```adaptyle
<<<Write a short, urgent subject line for a limited-time member discount, under 60 characters.>>>
```

**body:**

```adaptyle
<mjml>
  <mj-body background-color="{{ branding.colorPalette.canvasBackgroundColor | default: '#f4f4f4' }}">
    <mj-section>
      <mj-column>
        <mj-text font-size="{{ branding.stylePack.heading2FontSizePixels | default: 24 }}px" color="{{ branding.colorPalette.headingColor | default: '#111111' }}">
          <<<Rewrite the following teaser to sound more urgent and exciting, in one sentence ::: This month only, members get <<<Write a punchy 3-6 word phrase for an exclusive member discount.>>> on their next order.>>>
        </mj-text>
        <mj-button href="{{ branding.websiteUrl }}" background-color="{{ branding.colorPalette.buttonBackgroundColor | default: '#414141' }}" color="{{ branding.colorPalette.buttonColor | default: '#ffffff' }}">Shop the sale</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

---

## 6. Personalized picks digest (MJML, marketing, array record property, Liquid loop + one prompt)

Demonstrates: an `isArray: true` record property (`topProducts`, an array of `products` schema records rather than a JSON blob), a deterministic loop over it, and one prompt that frames the section without ever interpolating the actual product data into the instruction.

`expectedDataRepresentation`:
```jsonc
[
  { "key": "contact", "type": "record", "schema": "students", "isArray": false },
  { "key": "topProducts", "type": "record", "schema": "products", "isArray": true }
]
```
`recipientDataPath`: `["contact"]`
`transactional`: `false`

**subject:**

```adaptyle
<<<Write a short subject line teasing a personalized set of picks for the reader, under 60 characters.>>>
```

**body:**

```adaptyle
<mjml>
  <mj-body background-color="{{ branding.colorPalette.canvasBackgroundColor | default: '#f4f4f4' }}">
    <mj-section>
      <mj-column>
        <mj-text font-size="{{ branding.stylePack.heading2FontSizePixels | default: 24 }}px" color="{{ branding.colorPalette.headingColor | default: '#111111' }}">
          <<<Write a two-sentence intro that frames the picks below as personally curated for the reader.>>>
        </mj-text>
        {% for product in topProducts %}
        <mj-text color="{{ branding.colorPalette.textColor | default: '#333333' }}">{{ product.name }} · ${{ product.price }}</mj-text>
        {% endfor %}
        <## digest-footer ::: <mj-text font-size="11px" color="#999999" align="center">{{ branding.brandName }}</mj-text> ##>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

---

## How these were validated

Each `subject` and `body` above was run through the real Adaptyle parser (`Adaptyle.strip` and `Adaptyle.analyze`, both with `strict: true`) individually, and again after being decomposed and recombined into one document the way `adaptyleCustomizeEmailTemplate.ts` actually does for a live customize call (merging each field's own manifest, then one shared `[**Subject**]:`/`[**Body**]:` document). All 18 checks (6 subjects, 6 bodies, 6 combined documents) passed with zero parse errors and zero analysis warnings, confirming: no duplicate hidden ids, no unclosed delimiters, nesting within limits, and correct manifest placement. See `../SKILL.md` Section 9 for how to re-check your own edits by the same discipline.
