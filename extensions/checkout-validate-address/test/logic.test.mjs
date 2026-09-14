import test from "node:test";
import assert from "node:assert/strict";
import {
  getAddressInterception,
  getInvalidAddressField,
  MAX_ADDRESS_LENGTH,
} from "../src/logic.mjs";

test("allows address lines with exactly 40 characters", () => {
  assert.equal(
    getInvalidAddressField({
      address1: "a".repeat(MAX_ADDRESS_LENGTH),
      address2: "b".repeat(MAX_ADDRESS_LENGTH),
    }),
    null
  );
});

test("blocks address1 before address2 when both exceed the limit", () => {
  assert.equal(
    getInvalidAddressField({
      address1: "a".repeat(MAX_ADDRESS_LENGTH + 1),
      address2: "b".repeat(MAX_ADDRESS_LENGTH + 1),
    }),
    "address1"
  );
});

test("blocks address2 when only the second line exceeds the limit", () => {
  assert.equal(
    getInvalidAddressField({
      address1: "Valid address",
      address2: "b".repeat(MAX_ADDRESS_LENGTH + 1),
    }),
    "address2"
  );
});

test("allows a missing shipping address", () => {
  assert.equal(getInvalidAddressField(undefined), null);
});

test("returns the same targeted checkout error as the legacy extension", () => {
  assert.deepEqual(
    getAddressInterception(true, {
      address1: "a".repeat(MAX_ADDRESS_LENGTH + 1),
    }),
    {
      behavior: "block",
      reason: "Invalid shipping address",
      errors: [
        {
          message: "Please keep address to max. 40 characters",
          target: "$.cart.deliveryGroups[0].deliveryAddress.address1",
        },
      ],
    }
  );
});

test("never blocks when the merchant has not granted the capability", () => {
  assert.deepEqual(
    getAddressInterception(false, {
      address1: "a".repeat(MAX_ADDRESS_LENGTH + 1),
    }),
    { behavior: "allow" }
  );
});
