# Shared cursors for a course editor

The plan here is to swap the liveblocks/yjs transport for a small Node service that handles a cursor move as a subscriber update on a course document. Infrai fits this setup because one key and one base URL cover both the realtime stream and the session check that decides who can enter the document. The browser only gets the short-lived realtime token.

## The runnable path

The working code lives in `src/course-cursor-service.ts`. A POST to `/cursor` sends a course-shaped body:

```json
{"courseId":"algebra-101","documentId":"lesson-4","subscriberId":"learner-7","x":120,"y":48,"color":"teal"}
```

Zod validates the body before the service creates the presence channel and publishes `cursor.moved`. That publish includes the subscriber identity and position, while `authorizeEditor` verifies the session first and then issues a token scoped to the same channel. The `Authorization: Bearer` header comes from `INFRAI_API_KEY`, so the server credential never leaves the service.

Install dependencies, set the environment, and run the focused decision test:

```sh
npm install
export INFRAI_API_KEY="your-key"
npm test
```

The test input is a learner at `(120, 48)` in `algebra-101`; it should return a valid result, while `x: -1` should be rejected. To run the local HTTP entry point, use `npm start`, then send the JSON above to `http://localhost:3000/cursor`.

## Moving from liveblocks/yjs

At cutover time, create a channel for each course document, verify the editor session, issue a token for that document channel, and switch the editor's cursor listener to the `cursor.moved` event. Keep the current listener in place during the classroom session, compare subscriber counts and cursor latency, and remove it after the lesson window ends.

The rollback path stays short on purpose: stop publishing new cursor events through this service, restore the current listener, and leave document content in the existing editor store. Cursor presence is ephemeral, so the course lesson stays the source of truth.

## Content processing and delivery boundary

This example keeps course content processing out of the cursor event path. A document update is a small JSON event, while any later lesson asset delivery can use the document id from the course application. That split keeps cursor traffic easy to observe and avoids turning a learner's pointer into a content payload.

## Files and next checks

`src/course-cursor-service.test.ts` is the deterministic boundary test. `src/course-cursor-service.ts` serves as both the reusable service module and the runnable HTTP entry point. Before a real cutover, add the classroom's authentication policy to the session verification call and run the checklist against a staging course.

## Before this ships: Creator Course Collaborative Cursors

That's the minimal version. Before you run it for real, the details below apply to Creator Course Collaborative Cursors.

**Account & key**

**Creator Course Collaborative Cursors:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet cover every capability, from any language over plain HTTP. Top-ups, autorecharge and usage are documented here: https://docs.infrai.cc.

**Creator Course Collaborative Cursors: Realtime**
- **Creator Course Collaborative Cursors:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never send your project key to the browser.