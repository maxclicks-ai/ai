# maxclicks SDKs

First-class, hand-written SDKs per language. All share the same surface: a client, resource groups (`me`, `schemas`, `attributes`, `records`, `events`, `templates`, `webhooks`, `suppressions`, `workflows`, `forms`, `emails`), typed errors, `Retry-After`-aware retries, and auto-pagination. The key comes from the client argument or `MAXCLICKS_API_KEY`. Use the SDK for the project's language; do not shell out to the CLI from application code.

**Coverage note (SDK lag, read before writing app code):** the Public API v1 has grown to 18 resource groups (~88 endpoints; see `references/api-reference.md`), and the **`maxclicks` CLI now wraps all of them**. These **SDKs still only wrap the groups listed above, at their original operation set** (e.g. `schemas`/`attributes` are read-only in the SDK even though the API itself now has write endpoints). The newer groups, schema/attribute writes, `segments`, `broadcasts`, template authoring (`templates.create/update/remove/duplicate`, as opposed to the already-wrapped `templates.send`), `domains`, `senders`, `topics`, `imports`, and `api-keys`, are **not yet wrapped by any SDK**. Do not invent a method name for these; reach them with a plain HTTP call in the project's language (same base URL, same `Bearer <api_key>` header, same JSON envelope described in `references/api-reference.md`) until the SDKs are regenerated against the full surface. Check the installed package's actual exports/changelog before assuming a method exists. From a terminal (not application code), the CLI already covers all of these, see the task skills: `maxclicks-segments`, `maxclicks-broadcasts`, `maxclicks-templates`, `maxclicks-deliverability`, `maxclicks-topics`, `maxclicks-imports`.

## Node / TypeScript (`maxclicks`, npm)

```ts
import { Maxclicks, MaxclicksError, MaxclicksNotFoundError } from 'maxclicks'

const mc = new Maxclicks(process.env.MAXCLICKS_API_KEY!)
const contact = await mc.records.upsert('students', { email: 'ada@example.com', firstName: 'Ada' })
for await (const record of await mc.records.list('students')) console.log(record.id) // auto-pages
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

mc = Maxclicks()  # reads MAXCLICKS_API_KEY
mc.records.upsert("students", {"email": "ada@example.com", "firstName": "Ada"})
for record in mc.records.list("students"):  # iterates all pages
    print(record["id"])
```

Snake_case methods; typed exceptions; zero required deps (stdlib `urllib`); ships `py.typed`.

## Go (`github.com/maxclicks-ai/maxclicks-go`)

```go
mc := maxclicks.New(maxclicks.WithAPIKey(os.Getenv("MAXCLICKS_API_KEY")))
rec, err := mc.Records.Upsert(ctx, "students", map[string]any{"email": "ada@example.com"})
var apiErr *maxclicks.APIError
if errors.As(err, &apiErr) { /* apiErr.Status, apiErr.Code */ }
```

Standard library only; `(T, error)` returns; `context.Context` first; iterator for pagination.

## PHP + Laravel (`maxclicks/maxclicks-php`)

```php
$mc = new Maxclicks\Maxclicks(apiKey: getenv('MAXCLICKS_API_KEY'));
$mc->records->upsert('students', ['email' => 'ada@example.com']);
```

PSR-18 HTTP; typed exceptions. Laravel: the package auto-registers a `Maxclicks` facade and a `config/maxclicks.php`; set `MAXCLICKS_API_KEY` in `.env`.

## Ruby (`maxclicks`, RubyGems)

```ruby
mc = Maxclicks::Client.new(api_key: ENV["MAXCLICKS_API_KEY"])
mc.records.upsert("students", email: "ada@example.com")
mc.records.list("students").each { |r| puts r["id"] }  # auto-pages
```

## Java (`ai.maxclicks:maxclicks-java`)

```java
Maxclicks mc = Maxclicks.builder().apiKey(System.getenv("MAXCLICKS_API_KEY")).build();
var contact = mc.records().upsert("students", Map.of("email", "ada@example.com"));
```

`java.net.http`; unchecked `MaxclicksException` hierarchy; `Page<T>` is `Iterable<T>`.

## Rust (`maxclicks`, crates.io)

```rust
let mc = maxclicks::Client::new(std::env::var("MAXCLICKS_API_KEY")?);
let contact = mc.records().upsert("students", serde_json::json!({ "email": "ada@example.com" }))?;
```

`reqwest` blocking; `Result<T, MaxclicksError>` via `thiserror`; `serde` models with `#[serde(flatten)]` for custom keys.

## Choosing

- Writing into an app -> the SDK for that language.
- One-off terminal/agent task -> the `maxclicks` CLI.
- A host that speaks MCP -> the maxclicks MCP server (`mcp.maxclicks.ai/mcp`).

All SDKs preserve unknown custom-attribute keys on records/events, so schema-specific fields round-trip even though the SDK does not have a typed field for them.
