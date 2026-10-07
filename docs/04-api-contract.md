# API contract

JSON over HTTP. Authentication is an httpOnly, signed session cookie set by
signup and login. Every route handler is wrapped so failures return a
consistent envelope.

## Errors

```json
{ "error": { "code": "insufficient_credits", "message": "…", "details": { } } }
```

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `unauthorized` | No session, or it expired |
| 402 | `insufficient_credits` | `details` carries `{ needed, balance }` |
| 404 | `not_found` | Missing, or not yours — the two are deliberately indistinguishable |
| 422 | `invalid_request` | `details` carries Zod issues |
| 400 | `no_script` · `no_scenes` · `no_voiceover` · `missing_scene_art` · `render_not_ready` | A pipeline precondition is unmet |
| 500 | `internal_error` | |

## Auth

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | `{ name, email, password }` | `{ user }`, grants 300 credits, sets cookie |
| POST | `/api/auth/login` | `{ email, password }` | `{ user }` |
| POST | `/api/auth/logout` | — | `{ ok }` |
| GET | `/api/auth/me` | — | `{ user \| null }` |

Login returns the same 401 for an unknown email and a wrong password, so the
endpoint cannot be used to enumerate accounts.

## Catalogue and health

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/catalog` | Styles, voices, caption presets, music beds, credit packs, costs, capability modes |
| GET | `/api/health` | `{ status, database, localStudioMode, capabilities[] }` |

## Projects

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/projects` | List with scene and render counts |
| POST | `/api/projects` | Unset pickers fall back to the chosen style's own pairings |
| GET | `/api/projects/:id` | The whole editor payload: project, script, scenes, voiceover, renders, resolved catalogue entries |
| PATCH | `/api/projects/:id` | Partial update of the creative configuration |
| DELETE | `/api/projects/:id` | Cascades to everything below it |

## Script

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/projects/:id/script` | Latest version |
| POST | `/api/projects/:id/script` | Generate. Charges 15 credits, appends a version, **replaces the scene list** |
| PUT | `/api/projects/:id/script` | Save edits. Re-plans scenes only if the narration changed; a metadata edit never discards paid-for scene art |

`maxDuration` 120 s.

## Scenes

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/projects/:id/scenes` | With resolved `imageUrl` |
| POST | `/api/projects/:id/scenes` | Generate every outstanding visual, 6 credits each. One failure does not strand the rest — failures are returned per scene |
| PATCH | `/api/projects/:id/scenes/:sceneId` | Edit narration, prompt, title card, motion. Changing the prompt marks the frame stale but keeps it visible |
| POST | `/api/projects/:id/scenes/:sceneId` | Re-roll this visual. Each call is a new revision and a new charge |

`maxDuration` 300 s for the batch.

## Voiceover

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/projects/:id/voiceover` | Latest, with `audioUrl` |
| POST | `/api/projects/:id/voiceover` | `{ voiceId? }`. Charges 0.4 credits per second. Synthesises narration and **re-times every scene** against it |

This is the step that converts estimates into a timeline. `maxDuration` 180 s.

## Renders

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/projects/:id/renders` | |
| POST | `/api/projects/:id/renders` | `{ ratios?: AspectRatio[] }`. Charges 0.25 credits per second per variant and queues one job each. 201 |
| GET | `/api/renders/:id` | Single render with `videoUrl` and `thumbnailUrl` |
| GET | `/api/renders/:id/events` | Progress feed: status, progress, stage, error, and the event log |

The progress feed is a poll, not SSE. A render emits a handful of events a
second at most, and polling survives the serverless timeouts and proxy
buffering that make long-lived SSE connections unreliable on Vercel.

## Library and media

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/library` | Every render across all projects |
| GET | `/api/media/*` | Local storage only. Honours `Range`, returning 206 — without it a browser cannot seek an MP4. Refuses in R2 mode, where media is served from the bucket |

## YouTube

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/youtube/status` | `{ mode, connected, channel }` |
| GET | `/api/youtube/connect` | Redirects into OAuth with `access_type=offline&prompt=consent` |
| GET | `/api/youtube/callback` | Verifies `state` against the live session before attaching a channel |
| POST | `/api/youtube/publish` | `{ renderId, privacy?, madeForKids?, title?, description?, tags? }` |

Every upload sets `status.containsSyntheticMedia: true`. It is not a
parameter. Without OAuth credentials the call is a dry run that returns the
exact request body that would have been sent, and records it in
`publications`. `maxDuration` 300 s.

## Billing

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/billing/credits` | Balance, plan, packs, billing mode, ledger |
| POST | `/api/billing/checkout` | `{ packId }`. Returns a Stripe Checkout URL, or grants directly in sandbox mode |
| POST | `/api/billing/webhook` | Stripe. Reads the raw body — signature verification is computed over the exact bytes sent |

Credits are granted by the webhook, never by the browser returning to a
success URL, which a user can forge.

## Walkthrough

```bash
BASE=http://localhost:3000
curl -sc jar -b jar -H 'content-type: application/json' \
  -d '{"name":"Glen","email":"glen@example.com","password":"supersecret123"}' \
  $BASE/api/auth/signup

PRJ=$(curl -sc jar -b jar -H 'content-type: application/json' \
  -d '{"sourceType":"prompt","sourceText":"why the Roman grain fleet collapsed",
       "styleId":"dark-documentary","aspectRatio":"9:16","targetSeconds":30}' \
  $BASE/api/projects | jq -r .project.id)

curl -sc jar -b jar -X POST $BASE/api/projects/$PRJ/script
curl -sc jar -b jar -X POST $BASE/api/projects/$PRJ/scenes
curl -sc jar -b jar -X POST -H 'content-type: application/json' -d '{}' \
  $BASE/api/projects/$PRJ/voiceover

RID=$(curl -sc jar -b jar -X POST -H 'content-type: application/json' -d '{}' \
  $BASE/api/projects/$PRJ/renders | jq -r '.queued[0].id')

curl -sc jar -b jar $BASE/api/renders/$RID/events | jq '{status,progress,videoUrl}'
```
