import test from "node:test";
import assert from "node:assert/strict";
import {
  addWorkingDate,
  calculateDiscount,
  getOrderNumber,
} from "../src/logic.mjs";

test("keeps the legacy working-date behavior", () => {
  assert.equal(addWorkingDate(new Date(2026, 8, 17), 1), "2026-9-18");
  assert.equal(addWorkingDate(new Date(2026, 8, 18), 1), "2026-9-21");
  assert.equal(addWorkingDate(new Date(2026, 8, 19), 1), "2026-9-21");
});

test("returns the discount as the legacy negative adjustment", () => {
  assert.equal(
    calculateDiscount({ total: 110, subtotal: 100, shipping: 20, tax: 10 }),
    -20
  );
  assert.equal(
    calculateDiscount({ total: 130, subtotal: 100, shipping: 20, tax: 10 }),
    0
  );
});

test("uses equivalent order identifiers on both supported targets", () => {
  assert.equal(getOrderNumber({ number: "ABC123" }, undefined), "ABC123");
  assert.equal(
    getOrderNumber(undefined, {
      confirmationNumber: "ABC123",
      name: "#1001",
    }),
    "ABC123"
  );
  assert.equal(getOrderNumber(undefined, { name: "#1001" }), "#1001");
});
