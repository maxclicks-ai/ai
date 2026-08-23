# maxclicks SDKs

Eight first-class, hand-written SDKs. **All eight are at full parity with Public API v1.1.0: the same 55 operations across the same 16 resource groups** (`me`, `schemas`, `attributes`, `records`, `suppressions`, `events`, `domains`, `senders`, `topics`, `segments`, `broadcasts`, `templates`, `webhooks`, `workflows`, `forms`, `emails`). They share typed errors, `Retry-After`-aware retries, auto-pagination, and warning surfacing. The key comes from the client argument or `MAXCLICKS_API_KEY`.

Use the SDK for the project's language; do not shell out to the CLI from application code.

**There is no coverage gap and no lag.** The methods listed in `references/api-reference.md` are exactly what each package ships, so if a method is not there, no SDK has it and no plain HTTP call will find it either: that operation is not on the server. Schemas, attributes, templates, broadcast content, domains, senders and topics are read-only here, and API keys are absent entirely, because they are authored in the maxclicks app; the SDK's job is to read them back and drive the sends, records, events and automations that depend on them.

## Two divergences worth knowing before you pick

- **`Idempotency-Key`** is accepted by seven operations (`records.create`, `records.upsert`, `suppressions.batchCreate`, `suppressions.batchDelete`, `broadcasts.send`, `templates.send`, `workflows.trigger`). Python, Go, PHP, Ruby and Rust let you pass one per call. **Node, Java and Elixir do not expose one.**
- **`templates.send` response.** Node, Python, Go, Java, Rust and Elixir return the `{ emailId, status, error }` body, which you must read because a genuine send failure comes back as `status: "failed"` on a `200`. **PHP and Ruby return void**, so on those two you cannot observe the send status.

## Node / TypeScript (`maxclicks`, npm)

```ts
import { Maxclicks, MaxclicksError, MaxclicksNotFoundError } from 'maxclicks'

const mc = new Maxclicks(process.env.MAXCLICKS_API_KEY!)

const me = await mc.me()
const contact = await mc.records.upsert('students', { email: 'ada@example.com', firstName: 'Ada' })
await mc.events.fire('purchase-completed', { eventId: 'ord_123', amount: 42 })
const result = await mc.templates.send(templateId, { data: { contact: { email: 'ada@example.com' } } })
if (result.status === 'failed') console.error(result.error)

// Every list returns a Page: one page, an async iterable over all pages, and .all()
for await (const record of await mc.records.list('students')) console.log(record.id)

try {
  await mc.records.get('students', 'missing')
} catch (e) {
  if (e instanceof MaxclicksNotFoundError) { /* 404 */ }
}
```

Errors throw a typed `MaxclicksError` subclass (`.status`, `.code`, `.type`, `.message`). Dual ESM+CJS, Node >= 18, zero runtime deps.

## Python (`maxclicks`, PyPI)

```python
from maxclicks import Maxclicks, MaxclicksNotFoundError

client = Maxclicks()  # reads MAXCLICKS_API_KEY
client.records.upsert("students", {"email": "ada@example.com", "firstName": "Ada"})

for record in client.records.list("students"):  # iterates all pages
    print(record["id"])

client.events.fire("purchase_completed", {"eventId": "evt_123", "amount": 49.0})
result = client.templates.send("tpl_welcome", data={"contact": {"email": "ada@example.com"}}, idempotency_key="send-42")
```

Snake_case methods; typed exceptions; zero required deps (stdlib `urllib`); ships `py.typed`. Takes `idempotency_key` on the six operations that support it.

## Go (`github.com/maxclicks-ai/maxclicks-go`)

```go
client := maxclicks.New(maxclicks.WithAPIKey(os.Getenv("MAXCLICKS_API_KEY")))
ctx := context.Background()

contact, err := client.Records.Upsert(ctx, "students", maxclicks.RecordInput{"email": "ada@example.com"})
var apiErr *maxclicks.APIError
if errors.As(err, &apiErr) { /* apiErr.Status, apiErr.Code */ }

res, err := client.Templates.Send(ctx, templateID, map[string]any{"contact": map[string]any{"email": "ada@example.com"}},
    maxclicks.WithIdempotencyKey("send-42"))
```

Standard library only; `(T, error)` returns; `context.Context` first; iterators for pagination. Per-call `RequestOption`s carry the idempotency key.

## PHP + Laravel (`maxclicks/maxclicks-php`)

```php
$mc = new Maxclicks\Maxclicks(getenv('MAXCLICKS_API_KEY'));
$contact = $mc->records->upsert('students', ['email' => 'ada@example.com', 'firstName' => 'Ada']);
echo $contact['favoriteColor'];   // unknown custom keys are preserved
$mc->templates->send('tpl_welcome', ['contact' => ['email' => 'ada@example.com']], 'send-42');
```

PHP 8.1+, PSR-18 HTTP, typed exceptions. Laravel: the package auto-registers a `Maxclicks` facade and a `config/maxclicks.php`; set `MAXCLICKS_API_KEY` in `.env`. Note `templates->send()` returns void.

## Ruby (`maxclicks`, RubyGems)

```ruby
client = Maxclicks::Client.new(api_key: ENV["MAXCLICKS_API_KEY"])
contact = client.records.upsert("students", { "email" => "ada@example.com" })
client.records.list("students").each { |record| puts record.id }   # auto-pages
client.templates.send_template("tpl_welcome", data: { "contact" => { "email" => "ada@example.com" } })
```

Ruby 2.7+. `send_template` is the primary name (`send` is aliased, since `send` is a core Object method); it returns void.

## Java (`ai.maxclicks:maxclicks-java`)

```java
Maxclicks mc = Maxclicks.builder().apiKey(System.getenv("MAXCLICKS_API_KEY")).build();
MaxclicksRecord contact = mc.records().upsert("students", Map.of("email", "ada@example.com", "firstName", "Ada"));
TemplateSendResponse result = mc.templates().send(templateId, Map.of("contact", Map.of("email", "ada@example.com")));
```

Java 17+, `java.net.http`; unchecked `MaxclicksException` hierarchy; `Page<T>` is `Iterable<T>`; typed accessors like `getString(key)` for custom attributes.

## Rust (`maxclicks`, crates.io)

```rust
let client = maxclicks::Client::new(std::env::var("MAXCLICKS_API_KEY")?)?;
let contact = client.records().upsert(
    "students",
    &serde_json::json!({ "email": "ada@example.com", "firstName": "Ada" }),
    None, // optional Idempotency-Key
)?;
for record in client.records().list_all("students") { println!("{}", record?.id); }
```

`reqwest` blocking; `Result<T, MaxclicksError>` via `thiserror`; `serde` models with `#[serde(flatten)]` for custom keys. The idempotency key is an explicit `Option<&str>` argument on the six operations that take one.

## Elixir (`:maxclicks`, Hex)

```elixir
client = Maxclicks.new(api_key: System.get_env("MAXCLICKS_API_KEY"))

{:ok, me} = Maxclicks.me(client)
{:ok, contact} = Maxclicks.Records.upsert(client, "students", %{"email" => "ada@example.com", "firstName" => "Ada"})
{:ok, result} = Maxclicks.Templates.send(client, template_id, %{"contact" => %{"email" => "ada@example.com"}})
```

Elixir 1.15+. `{:ok, result}` / `{:error, %Maxclicks.Error{}}` with `!` variants that raise; lazy `Stream` auto-pagination; swappable transport (Finch by default, with its own pool, so nothing goes in your supervision tree).

## Choosing

- Writing into an app: the SDK for that language.
- One-off terminal or agent task: the `maxclicks` CLI (52 of the 55 operations; the three public form/email endpoints are SDK-only).
- A host that speaks MCP: the maxclicks MCP server (`mcp.maxclicks.ai/mcp`), whose tool catalog matches the same surface.

All SDKs preserve unknown custom-attribute keys on records and events, so schema-specific fields round-trip even where the SDK has no typed field for them.
