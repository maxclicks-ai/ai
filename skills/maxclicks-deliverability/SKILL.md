---
name: maxclicks-deliverability
description: Read a maxclicks sending domain's DNS verification state and records, or list saved sender profiles. Use before sending any email from a new domain, when DNS/SPF/DKIM/DMARC setup needs checking, or when a template or broadcast needs a verified "from" address.
---

# Domains and senders in maxclicks

Builds on the `maxclicks` skill (read it first). Domains and senders pair together: a **domain** is a business domain (`example.com`) with DNS-verified sending capability; a **sender** is a saved `{code, name}` slug on top of a verified domain (`support@example.com`, "Support Team"). A template's `from` field points at either a domain (with a manual `code`/`name`) or a saved sender. At least one verified domain is required before any email can send.

**Both are read-only over the API.** Domains and senders are registered in the maxclicks app (`https://app.maxclicks.ai`); this API reads them back. Adding a domain reserves that name globally across the platform and provisions AWS SES resources (an email identity, transactional and marketing configuration sets, a return-path subdomain), so it stays a human, in-app action. Your job here is the other half: read the DNS records back, tell the user exactly what to put in their DNS provider, and confirm when verification lands.

## Domains

### List

```bash
maxclicks whoami                # confirm the space
maxclicks domains list --all
```

Each item carries `id`, `name`, `customReturnPath`, `verificationStarted`, and `verifiedForSending`. `list` omits `records`.

### Get one, with its DNS records

```bash
maxclicks domains get dom_01hx...
```

`get` is the only place the DNS `records` array appears, and it is live-checked at request time. Each record is `{ type, name, value, priority, status }`, where `status` is one of `not started`, `pending`, `success`, `failed`, `temporary failure`. Read the failing ones back to the user verbatim (name and value are exact strings, do not paraphrase or re-case them) so they can fix just those entries at their DNS provider.

The pattern for "is this domain ready to send?":

1. `domains list` to find the domain by `name` and take its `id`.
2. `domains get <id>` and check `verifiedForSending`.
3. If it is `false`, walk the `records` array and report every record whose `status` is not `success`, with its `type`, `name`, and `value`.
4. If `verificationStarted` is `false`, the user has not kicked verification off yet: send them to the domain's page in the app.

Verification is not instant. After the records are added at the DNS provider, propagation can take minutes to hours before `verifiedForSending` flips to `true`, and `get` re-checks live on every call. Re-read later rather than concluding from one failed check that the setup is wrong.

## Senders

A sender is a convenience: a saved local-part plus display name on a domain, so content does not have to spell out `{ type: "domain", domainId, code, name }` every time.

```bash
maxclicks senders list --all
```

Each sender carries `id`, `name`, `description`, `code` (the local part), `domainId`, and `email`. There is no get-by-id: list and filter locally. New sender profiles are created in the app, on the same settings screen as domains.

`email` is derived (`code`@domain), not a field anyone sets directly, so it changes only when the underlying `code` or `domainId` changes.

## Reading a template's sender

`templates.get` echoes the template's `from` in one of two shapes:

```jsonc
// A verified domain plus a manual local part and display name:
{ "type": "domain", "domainId": "dom_01hx...", "code": "support", "name": "Support Team" }

// A saved sender profile:
{ "type": "sender", "senderId": "send_01hx..." }
```

Both give you an id, not a human-readable address. Resolve it: `domains get <domainId>` for the first shape, or match `senderId` against `senders list` for the second. A `from` of `null` means the template falls back to the space's default sender/domain at send time.

Which sender a template or broadcast uses is chosen in the app alongside its content. See `maxclicks-templates` and `maxclicks-broadcasts`.

## Gotchas

- **Verify before you send.** `templates send` against a template whose domain is not verified (directly or through a sender on it) fails with `422 domain_not_verified`. `broadcasts send` runs its own readiness gate (`422 broadcast_invalid`, with an `issues[]` array) that includes having a usable sender. Check `verifiedForSending: true` first rather than discovering it at send time.
- **`list` omits DNS records; `get` includes them.** Do not expect `domains list` to hand you the SPF/DKIM/DMARC values, fetch the specific domain.
- **DNS propagation is not instant.** A `get` right after the records are added can still show `verifiedForSending: false` and records `pending`; re-check later rather than assuming failure.
- **Verification can go backwards.** A previously verified domain flips back to `verifiedForSending: false` if its DNS records are removed or changed at the provider. Read the current value, do not cache it across a long-running job.
- **Registering a domain or sender is an app action.** There is no create, verify, update, or delete here, so if the domain does not exist yet, say so and point the user at `https://app.maxclicks.ai` rather than looking for an endpoint.
- **A sender's `email` is derived** (`code`@domain), not a field you set.
- **There is no get-by-id for senders.** `senders list --all` and filter client-side on `code`, `email`, or `domainId`.
