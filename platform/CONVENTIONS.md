# Conventions

What a reviewer — human or Gitar — should hold this codebase to.

## Architecture

- **Elasticsearch is the only datastore.** No Postgres, no ORM, no second cache. If something needs persisting it gets an index in `scripts/setup-es.ts`.
- **All Elasticsearch access goes through `lib/es.ts`.** Never construct a `Client` elsewhere. Use the `hitsToDocs` / `hitsToScoredDocs` helpers rather than hand-rolling `_id` / `_source` guards — the client types both as optional and the helpers narrow once.
- **All queries live in `lib/search.ts`.** Pages compose features; they do not write queries. One module means one span name per feature in Dash0 and one place where ranking is defined.
- **Server components by default.** `'use client'` only for genuine interactivity (`components/onboarding-form.tsx`, `auto-refresh.tsx`, the organizer forms). Mutations are server actions in `app/actions.ts`.

## Ranking

- **Ranking must be additive and must degrade.** Tag overlap and BM25 always contribute; the semantic retriever is fused in only when `semanticReady()` is true. No feature may depend on the e5 model being deployed.
- **Every score shown to a user must be explainable.** If a number appears in the UI, the same component shows which interests or signals produced it. No bare percentages.
- **Prefer fixing the data over distorting the ranking.** When results look wrong, check `lib/demo-data.ts` first. Arbitrary boosts to make a demo look good are a smell; a boost needs a product reason stated in a comment (see the `links.resumeText` boost in `findSimilarUsers`).

## External calls

- **Claude calls never throw and never block a feature.** Every function in `lib/ai.ts` has a deterministic fallback and returns it on error, refusal, or missing credentials. Results are written back to Elasticsearch so a render never waits on a model.
- **Telemetry never breaks a render.** Metric and span helpers in `lib/telemetry.ts` swallow their own errors. The OTel SDK is not started without Dash0 credentials.
- **No external asset hosts.** Avatars are generated from initials (`components/avatar.tsx`) so nothing in a demo depends on a third-party host being reachable.

## TypeScript

- No `any`. Use `unknown` plus narrowing, or a cast with a comment explaining what the generated types fail to model (the `semantic_text` mapping and the `retriever` request body are the two legitimate cases).
- Exported functions have explicit return types.
- Types for stored documents live in `lib/types.ts`. Documents are stored without their `id` (it is the Elasticsearch `_id`), hence the `Omit<T, 'id'>` generics on searches.

## Style

- Comments explain **why**, not what. Delete a comment that restates the code.
- British/neutral prose in user-facing copy; no exclamation marks, no marketing voice.
- Keep `lib/taxonomy.ts` the single source of interest slugs. Never inline a tag string literal in a page or component.

## Checks

`npm run typecheck` and `npm run lint` must both pass before a PR merges.
