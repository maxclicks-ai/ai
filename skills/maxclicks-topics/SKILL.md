---
name: maxclicks-topics
description: Look up a maxclicks communication topic (e.g. "Marketing", "Product Updates"), the consent-scoped grouping for marketing sends, and use its id. Use when setting a contact's topicIds, reading a template's communicationTopicId, or building a preference center.
---

# Communication topics in maxclicks

**Coverage:** read the `maxclicks` entry skill for current REST coverage and client limits.

Builds on the `maxclicks` skill (read it first). A **topic** is a user-defined grouping, per communication channel, that marketing content is sent under (e.g. "Marketing", "Product Updates"). A contact must have consented to a topic (or the channel generally) before a marketing send under that topic proceeds; transactional content bypasses topics entirely. Today the only channel is `email`.

Topics are **authored in the app** (Settings, Communication Topics). Over the API you read them and use their ids. That is the right split: a topic is a consent boundary that contacts have already opted into by name, so renaming or deleting one silently rewrites what those people agreed to receive. The app puts a human in front of that.

## Read the space's topics

```bash
maxclicks topics list --all
maxclicks topics get top_01hx...
```

Each topic comes back with `id`, `name`, `description`, `color` (a badge color such as `blue`, `green`, `amber`), `channel` (`email`), `private`, and timestamps. `topics get` on an unknown id returns `404 topic_not_found`.

```ts
import { Maxclicks } from 'maxclicks'
const mc = new Maxclicks(process.env.MAXCLICKS_API_KEY!)

const page = await mc.topics.list({ limit: 100 })
const productUpdates = page.data.find(topic => topic.name === 'Product Updates')
```

Resolve topics by `name` once, then hold onto the `id`. Names are what a user says ("subscribe them to Product Updates"); ids are what every other endpoint takes.

## Using a topic id

**Set a contact's topic consent** on any record write (see `maxclicks-contacts`). `topicIds` replaces the contact's topic set, so send the full list, not just the addition:

```bash
maxclicks records upsert students --data '{"email":"ada@example.com","topicIds":["top_01hx...","top_02hy..."]}'
```

The ids are validated against the caller's own space: an id from another space fails the whole write with `400 topic_not_found` rather than linking the contact to a topic they never heard of. Reading a contact back returns its current `topicIds`, and `records audit-trail` shows every topic add/remove as a consent event.

**Read which topic a template sends under.** `communicationTopicId` is part of the content, not the send call, so it is set in the app when the email is authored and read back here:

```bash
maxclicks templates get tmpl_01hx...    # -> { ..., "transactional": false, "communicationTopicId": "top_01hx..." }
```

That is the field to check before `templates send`: a marketing template bound to a topic only reaches contacts who consented to that topic, so a send that appears to "do nothing" is usually a consent gap, not a failure. Forms also collect consent per topic, again configured in the app.

## Gotchas

- **Topics are read-only over the API.** `topics list` and `topics get` are the whole surface; create, rename, recolor and delete happen in the app. Ask the user to add a missing topic rather than reaching for a substitute.
- **`topicIds` on a record write is a replace, not an append.** Read the contact's current `topicIds` first and send the merged list, or you will silently unsubscribe them from everything you omitted.
- **A topic id from another space is rejected.** `400 topic_not_found` fails the entire record write; nothing is partially applied.
- **`private: true` hides the topic from the public preferences page** unless the contact has explicit access. Do not expect a private topic to be self-manageable by a contact.
- **Topics gate marketing, not transactional, sends.** A transactional template never checks topic consent regardless of `communicationTopicId`.
- **One channel today.** `channel` is always `email`; the field exists because SMS and push are planned, not because there is a choice to make now.
