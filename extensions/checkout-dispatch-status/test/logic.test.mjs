import test from "node:test";
import assert from "node:assert/strict";
import { getDispatchMessage } from "../src/logic.mjs";

const status = (value) => [{ key: "_status", value }];

test("maps every legacy dispatch status to the same message", () => {
  assert.equal(
    getDispatchMessage(status("Dispatches in 7 business days")),
    "Expected to ship in 7 business days"
  );
  assert.equal(
    getDispatchMessage(status("Dispatches in 1 - 2 business days")),
    "Expected to ship in 1-2 business days"
  );
  assert.equal(
    getDispatchMessage(status("Dispatches in 2 - 3 business days")),
    "Expected to ship in 2-3 business days"
  );
  assert.equal(
    getDispatchMessage(status("Dispatches in 3 - 5 business days")),
    "Expected to ship in 3-5 business days"
  );
  assert.equal(getDispatchMessage(status("Ready")), "Ready to ship");
  assert.equal(
    getDispatchMessage(status("Ready to dispatch")),
    "Ready to ship"
  );
});

test("does not show dispatch for free samples or an existing dispatch status", () => {
  assert.equal(
    getDispatchMessage([
      ...status("Ready"),
      { key: "_isFreeSamples", value: "true" },
    ]),
    ""
  );
  assert.equal(
    getDispatchMessage([
      ...status("Ready"),
      { key: "Dispatch status", value: "Already dispatched" },
    ]),
    ""
  );
});

test("does not show a message for an unknown or missing status", () => {
  assert.equal(getDispatchMessage(status("Unknown")), "");
  assert.equal(getDispatchMessage([]), "");
});
