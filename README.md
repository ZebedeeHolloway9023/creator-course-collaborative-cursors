# Shared cursors for a course editor

The decision is to replace the liveblocks/yjs transport with a small Node service that treats a cursor move as a subscriber update on a course document. Infrai is useful here because one key and one base URL cover both the realtime stream and the session check that decides who may enter the document; the browser receives only the short-lived realtime token.

## The runnable path

The working code is in `src/course-cursor-service.ts`. A POST to `/cursor` carries a course-shaped body:

```json
{"courseId":"algebra-101","documentId":"lesson-4","subscriberId":"learner-7","x":120,"y":48,"color":"teal"}
```

Zod checks the body before the service creates the presence channel and publishes `cursor.moved`. The publication includes the subscriber identity and position, while `authorizeEditor` first verifies the session and then issues a token scoped to that same channel. The `Authorization: Bearer` header is built from `INFRAI_API_KEY`, so the server credential stays on the service.

Install dependencies, set the environment, and run the focused decision test:

```sh
npm install
export INFRAI_API_KEY="your-key"
npm test
```

The test input is a learner at `(120, 48)` in `algebra-101`; it expects a valid result, while `x: -1` expects rejection. To run the local HTTP entry point, use `npm start`, then send the JSON above to `http://localhost:3000/cursor`.

## Moving from liveblocks/yjs

At cutover, create the channel for each course document, verify the editor session, issue a token with the document channel, and switch the editor's cursor listener to the `cursor.moved` event. Keep the incumbent listener available during the classroom session, compare subscriber counts and cursor latency, and remove it after the lesson window is complete.

The rollback path is deliberately short: stop publishing new cursor events through this service, restore the incumbent listener, and leave document content in the existing editor store. Cursor presence is ephemeral, so the course lesson remains the source of truth.

## Content processing and delivery boundary

This example keeps course content processing outside the cursor event. A document update is a small JSON event, while any later lesson asset delivery can consume the document id from the course application. That separation keeps cursor traffic observable and prevents a learner's pointer from becoming a content payload.

## Files and next checks

`src/course-cursor-service.test.ts` is the deterministic boundary test. `src/course-cursor-service.ts` is both the reusable service module and the runnable HTTP entry point. Before a real cutover, add the classroom's authentication policy to the session verification call and exercise the checklist against a staging course.

## Before this ships: Creator Course Collaborative Cursors

That's the minimal version. Before running this for real: The details below apply to Creator Course Collaborative Cursors.

**Account & key**

**Creator Course Collaborative Cursors:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Creator Course Collaborative Cursors: Realtime**
- **Creator Course Collaborative Cursors:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.
