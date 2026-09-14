import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateFreeGifts,
  getFreeGiftRuleIds,
  isRuleActive,
  parseValidateKeys,
} from "../src/logic.ts";
import {normalizePrismicRule} from "../src/services.ts";

const paidLine = (id, variantId, quantity = 1, amount = "50.00", extra = {}) => ({
  id,
  merchandise: {id: variantId},
  quantity,
  cost: {totalAmount: {amount}},
  attributes: [],
  discountAllocations: [],
  ...extra,
});

const giftLine = (id, variantId, ruleId, quantity = 1, validate = []) => ({
  id,
  merchandise: {id: variantId},
  quantity,
  cost: {totalAmount: {amount: "0.00"}},
  attributes: [
    {key: "_rule_id", value: ruleId},
    {key: "_validate", value: JSON.stringify(validate)},
  ],
  discountAllocations: [],
});

const rule = (overrides = {}) => ({
  id: "rule-1",
  enabled: true,
  startDate: null,
  endDate: null,
  giftVariantIds: ["gift-1"],
  eligibleVariantIds: [],
  usesCollectionSelector: false,
  minimumCartValue: 100,
  minimumProductCount: null,
  ...overrides,
});

const evaluate = ({lines, currentRule = rule(), catalog = []}) =>
  evaluateFreeGifts({
    lines,
    rulesById: new Map([[currentRule.id, currentRule]]),
    catalogByVariant: new Map(catalog),
    now: new Date(2026, 8, 14, 12),
  });

test("keeps a valid gift when the paid products still meet the rule", () => {
  const result = evaluate({
    lines: [paidLine("paid", "paid-1", 2), giftLine("gift", "gift-1", "rule-1")],
    catalog: [["paid-1", {price: 50}]],
  });
  assert.deepEqual(result.invalidLines, []);
});

test("removes the gift after the qualifying paid product is removed", () => {
  const result = evaluate({
    lines: [giftLine("gift", "gift-1", "rule-1")],
  });
  assert.equal(result.invalidLines[0].lineId, "gift");
  assert.equal(result.invalidLines[0].reason, "requirements-not-met");
});

test("keeps the legacy OR behavior when both minimums are configured", () => {
  const currentRule = rule({minimumCartValue: 100, minimumProductCount: 3});
  const result = evaluate({
    currentRule,
    lines: [paidLine("paid", "paid-1", 2), giftLine("gift", "gift-1", "rule-1")],
    catalog: [["paid-1", {price: 50}]],
  });
  assert.deepEqual(result.invalidLines, []);
});

test("correctly evaluates brand/category collection selectors", () => {
  const currentRule = rule({
    usesCollectionSelector: true,
    minimumCartValue: 50,
  });
  const result = evaluate({
    currentRule,
    lines: [
      paidLine("paid", "paid-1", 1, "50.00", {
        attributes: [{key: "_collections", value: JSON.stringify(["Skin Care"])}],
      }),
      giftLine("gift", "gift-1", "rule-1", 1, ["Skin Care"]),
    ],
    catalog: [["paid-1", {price: 50}]],
  });
  assert.deepEqual(result.invalidLines, []);
});

test("fails collection rules closed when _validate is missing or malformed", () => {
  const currentRule = rule({usesCollectionSelector: true, minimumCartValue: 50});
  const gift = giftLine("gift", "gift-1", "rule-1");
  gift.attributes[1].value = "not-json";
  const result = evaluate({
    currentRule,
    lines: [paidLine("paid", "paid-1"), gift],
    catalog: [["paid-1", {price: 50}]],
  });
  assert.equal(result.invalidLines[0].reason, "requirements-not-met");
  assert.deepEqual(parseValidateKeys("not-json"), []);
});

test("keeps the legacy behavior for multiple gifts and quantities", () => {
  const result = evaluate({
    lines: [
      paidLine("paid", "paid-1", 2),
      giftLine("gift-1", "gift-1", "rule-1", 2),
      giftLine("gift-2", "gift-1", "rule-1"),
    ],
    catalog: [["paid-1", {price: 50}]],
  });
  assert.deepEqual(result.invalidLines, []);
});

test("removes inactive, expired, and non-rule gift variants", () => {
  const cases = [
    rule({enabled: false}),
    rule({endDate: "2026-09-13"}),
    rule({giftVariantIds: ["another-gift"]}),
  ];
  assert.deepEqual(
    cases.map((currentRule) =>
      evaluate({
        currentRule,
        lines: [
          paidLine("paid", "paid-1", 2),
          giftLine("gift", "gift-1", "rule-1"),
        ],
        catalog: [["paid-1", {price: 50}]],
      }).invalidLines[0].reason,
    ),
    ["missing-or-inactive-rule", "missing-or-inactive-rule", "gift-variant-not-allowed"],
  );
});

test("uses catalog price when distinguishing a free product from a discounted line", () => {
  const suspicious = paidLine("zero", "zero-1", 1, "0.00");
  const discounted = paidLine("discounted", "paid-1", 2, "0.00", {
    discountAllocations: [{discountedAmount: {amount: "100.00"}}],
  });
  const result = evaluate({
    lines: [suspicious, discounted, giftLine("gift", "gift-1", "rule-1")],
    catalog: [
      ["zero-1", {price: 0}],
      ["paid-1", {price: 50}],
    ],
  });
  assert.deepEqual(
    result.invalidLines.map(({lineId, reason}) => ({lineId, reason})),
    [{lineId: "zero", reason: "unmarked-zero-price-line"}],
  );
});

test("keeps the legacy exact timestamp date behavior", () => {
  assert.equal(
    isRuleActive(
      rule({endDate: "2026-09-14T00:00:00.000Z"}),
      new Date("2026-09-14T12:00:00.000Z"),
    ),
    false,
  );
  assert.equal(
    isRuleActive(
      rule({startDate: "2026-09-15T00:00:00.000Z"}),
      new Date("2026-09-14T12:00:00.000Z"),
    ),
    false,
  );
});

test("keeps the legacy first gift variant and all qualifying variants", () => {
  const normalized = normalizePrismicRule({
    id: "rule-1",
    data: {
      status: true,
      free_gift_group: [
        {
          free_gift_product: {
            variants: [
              {admin_graphql_api_id: "gift-1"},
              {admin_graphql_api_id: "gift-2"},
            ],
          },
        },
      ],
      products: [
        {
          product: {
            variants: [
              {admin_graphql_api_id: "paid-1"},
              {admin_graphql_api_id: "paid-2"},
            ],
          },
        },
      ],
    },
  });
  assert.deepEqual(normalized.giftVariantIds, ["gift-1"]);
  assert.deepEqual(normalized.eligibleVariantIds, ["paid-1", "paid-2"]);
});

test("collects unique free-gift rule IDs", () => {
  assert.deepEqual(
    getFreeGiftRuleIds([
      giftLine("gift-1", "gift-1", "rule-1"),
      giftLine("gift-2", "gift-2", "rule-1"),
      giftLine("gift-3", "gift-3", "rule-2"),
    ]),
    ["rule-1", "rule-2"],
  );
});
