import test from "node:test";
import assert from "node:assert/strict";
import { CursorBody } from "./course-cursor-service.ts";

test("a cursor update accepts a course document position and rejects an unsafe coordinate", () => {
  const accepted = CursorBody.safeParse({ courseId: "algebra-101", documentId: "lesson-4", subscriberId: "learner-7", x: 120, y: 48, color: "teal" });
  const rejected = CursorBody.safeParse({ courseId: "algebra-101", documentId: "lesson-4", subscriberId: "learner-7", x: -1, y: 48, color: "teal" });
  assert.equal(accepted.success, true);
  assert.equal(rejected.success, false);
});
