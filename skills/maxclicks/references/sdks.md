# maxclicks SDKs

maxclicks publishes eight language clients plus a separate browser client. The Node client (`maxclicks` 1.1.0) follows the current REST contract, including event readiness, server-side identity changes, record-deletion status and workflow-history paging. The other language clients cover an earlier operation set, so match their examples to the installed version, not just the OpenAPI version string.

**Installation:** `npm install maxclicks` for Node and `npm install @maxclicks/browser` for the browser; `npm install -g maxclicks-cli` for the CLI, and `npx -y maxclicks-mcp` runs the MCP server locally. The registry names below are each language's package. Contract parity still varies between clients, so check a client's methods before use. `@maxclicks/ai` is private skill/plugin content, not a runtime AI SDK.

Use application-language code or direct HTTP; do not shell out to the CLI from an application. For the current wire contract, `references/api-reference.md` takes precedence over an older SDK return type.

## Differences to check before using a client

- The REST server accepts `Idempotency-Key` on 18 operations and requires it on `templates.send` and `records.delete`. The Node client accepts `{ idempotencyKey }` on all 18 and generates a key for those two when none is passed; a generated key covers only that call's own retries, so pass your own when you may retry later. Other clients expose different subsets; inspect their method signatures. Direct HTTP covers supported server operations that lack a client option.
- Template sends return `emailId`, `status` and `error`; HTTP 200 `failed` can include unknown provider outcomes, so preserve the original operation and reconcile before a replacement send. PHP/Ruby wrappers discard the send body.
- Node `events.fire` returns the acceptance receipt (`id`, `eventId`, `isDuplicate`, `readinessAtAcceptance`); `events.status(schema, id)` reads readiness. `eventIdentities.identify(input)` binds or unbinds a browser identity, `records.delete` returns the deletion operation that `records.getDeletion` and `records.cancelDeletion` follow, and `workflows.getRun(id, runId, { historyBefore })` pages step history.
- Node warnings are delivered via the `onWarning` callback, not attached to an individual returned record. Event lists preserve their cursor envelope; ordinary offset lists have a `Page` helper and `.all()`, subject to server caps.

## Node / TypeScript (`maxclicks`, npm)

```ts
import { Maxclicks, MaxclicksError, MaxclicksNotFoundError } from 'maxclicks'

const mc = new Maxclicks(process.env.MAXCLICKS_API_KEY!)

const me = await mc.me()
const contact = await mc.records.upsert('students', { email: 'ada@example.com', firstName: 'Ada' })
await mc.events.fire('purchase-completed', { eventId: 'ord_123', amount: 42 })
const result = await mc.templates.send(templateId, { data: { contact: { email: 'ada@example.com' } } })
if (result.status === 'failed') console.error(result.error)

// Offset lists return a Page; event lists use a cursor envelope.
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

Snake_case methods; typed exceptions; zero required deps (stdlib `urllib`); ships `py.typed`. Check each method's `idempotency_key` parameter; it does not imply support for every current REST write.

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

`reqwest` blocking; `Result<T, MaxclicksError>` via `thiserror`; `serde` models with `#[serde(flatten)]` for custom keys. Supported methods take an explicit `Option<&str>` idempotency argument; check the installed signature.

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
- One-off terminal or agent task: the `maxclicks` CLI (`npm install -g maxclicks-cli`) for the commands it implements, or direct HTTP. The public form and email endpoints have no CLI command.
- A host that speaks MCP: the hosted server at `https://mcp.maxclicks.ai/mcp`, which signs in with OAuth, or `npx -y maxclicks-mcp` over stdio or Streamable HTTP with an API key. Its tool catalog covers selected operations, not the entire REST contract.

All SDKs preserve unknown custom-attribute keys on records and events, so schema-specific fields round-trip even where the SDK has no typed field for them.
