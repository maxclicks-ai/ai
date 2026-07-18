---
name: maxclicks-deliverability
description: Add and verify a sending domain, or create a saved sender profile, in maxclicks. Use before sending any email from a new domain, when DNS/SPF/DKIM/DMARC setup is needed, or when a template/broadcast needs a "from" address.
---

# Domains and senders in maxclicks

Builds on the `maxclicks` skill (read it first). Domains and senders pair together: a **domain** is a business domain (`example.com`) with DNS-verified sending capability; a **sender** is a saved `{code, name}` slug on top of a verified domain (`support@example.com`, "Support Team"). A template's or broadcast's `from` field points at either a domain (with a manual `code`/`name`) or a saved sender. At least one verified domain is required before any email can send.

## Domains

### Add a domain

```bash
maxclicks domains create --data '{"name":"example.com"}'
# or with a custom bounce-handling subdomain (defaults to "send"):
maxclicks domains create --data '{"name":"example.com","customReturnPath":"bounce"}'
```

**Requires an admin key.** `--idempotency-key` is supported. The response includes the DNS `records` you must add at your DNS provider (SPF, DKIM, DMARC, the return-path CNAME).

### Check DNS records and verify

```bash
maxclicks domains get dom_01hx...      # includes live-checked DNS records
maxclicks domains verify dom_01hx...   # re-checks DNS now and updates verifiedForSending
```

`get` and `verify` both include the live-checked `records` array; `list` omits it (call `get` per domain if you need the records). Verification is not instant: after adding DNS records at your provider, DNS propagation can take minutes to hours before `verify` flips `verifiedForSending` to `true`. Re-run `verify` rather than assuming a first failed check means misconfiguration, propagation may simply not be done yet.

```bash
maxclicks domains list --all
maxclicks domains delete dom_01hx...   # admin key
```

## Senders

A sender is a convenience: a saved local-part + display name on a domain, so callers don't have to type `{ type: "domain", domainId, code, name }` by hand every time.

```bash
maxclicks senders create --data '{"name":"Support Team","code":"support","domainId":"dom_01hx..."}'
maxclicks senders list --all
maxclicks senders get send_01hx...
maxclicks senders update send_01hx... --data '{"name":"Support"}'
maxclicks senders delete send_01hx...
```

`--idempotency-key` is supported on create. The resulting `email` field (`code`@domain) is derived, not settable directly, change `code` or `domainId` to change it.

## Wiring into a template or broadcast

```bash
# By domain, manual code/name:
"from": { "type": "domain", "domainId": "dom_01hx...", "code": "support", "name": "Support Team" }

# By saved sender (preferred once one exists):
"from": { "type": "sender", "senderId": "send_01hx..." }
```

See `maxclicks-templates` and `maxclicks-broadcasts` for where `from` sits in each resource's `content`/create body. Omitting `from` entirely falls back to the space's default sender/domain at send time.

## Gotchas

- **Verify before you send.** A template/broadcast referencing an unverified domain (directly or via a sender on it) fails send with `422 domain_not_verified`. Run `domains get <id>` or `verify` and confirm `verifiedForSending: true` before wiring it into content.
- **`domains create`/`delete` need an admin key**; a write-only key returns 403. Senders only need a write key.
- **`list` omits DNS records; `get`/`create`/`verify` include them.** Don't expect `domains list` to hand you the SPF/DKIM/DMARC values, fetch the specific domain.
- **DNS propagation is not instant.** A `verify` call right after adding records can still show `verifiedForSending: false`; re-check later rather than assuming failure.
- **A sender's `email` is derived** (`code`@domain), not a field you set directly.
- **`senderId`/`domainId` on `from` must point at a verified, existing domain/sender** in the same space; a stale or cross-space id fails with `sender_not_found`/`domain_not_found` at template/broadcast create or update time.
