import test from "node:test";
import assert from "node:assert/strict";
import {
  acknowledgeRemovedGifts,
  isCheckoutAlreadyValidated,
  loadPrismicRulesForCheckout,
  needsRemovalAcknowledgement,
  recordValidatedCheckout,
  resetRuleSessionsForTests,
} from "../src/rule-session.ts";

const rule = {
  id: "rule-1",
  enabled: true,
  startDate: null,
  endDate: null,
  giftVariantIds: ["gift-1"],
  eligibleVariantIds: [],
  usesCollectionSelector: false,
  minimumCartValue: 100,
  minimumProductCount: null,
};

function createStorage() {
  const values = new Map();
  return {
    values,
    async read(key) {
      return values.get(key) ?? null;
    },
    async write(key, value) {
      values.set(key, value);
    },
  };
}

test("does not retry an initial failure until the final checkout action", async () => {
  resetRuleSessionsForTests();
  const storage = createStorage();
  let calls = 0;
  const fetchRules = async () => {
    calls += 1;
    if (calls === 1) throw new Error("Prismic unavailable");
    return new Map([[rule.id, rule]]);
  };
  const options = {
    ruleIds: [rule.id],
    accessToken: "token",
    checkoutToken: "checkout-1",
    storage,
    fetchRules,
  };

  assert.equal(
    (await loadPrismicRulesForCheckout({...options, finalAttempt: false})).status,
    "unavailable",
  );
  assert.equal(
    (await loadPrismicRulesForCheckout({...options, finalAttempt: false})).status,
    "unavailable",
  );
  assert.equal(calls, 1);

  const finalResult = await loadPrismicRulesForCheckout({
    ...options,
    finalAttempt: true,
  });
  assert.equal(finalResult.status, "success");
  assert.equal(calls, 2);
});

test("reuses a successful result for the rest of the checkout", async () => {
  resetRuleSessionsForTests();
  const storage = createStorage();
  let calls = 0;
  const options = {
    ruleIds: [rule.id],
    accessToken: "token",
    checkoutToken: "checkout-2",
    storage,
    fetchRules: async () => {
      calls += 1;
      return new Map([[rule.id, rule]]);
    },
  };

  await loadPrismicRulesForCheckout({...options, finalAttempt: false});
  await loadPrismicRulesForCheckout({...options, finalAttempt: false});
  await loadPrismicRulesForCheckout({...options, finalAttempt: true});
  assert.equal(calls, 1);

  resetRuleSessionsForTests();
  const restored = await loadPrismicRulesForCheckout({
    ...options,
    finalAttempt: false,
  });
  assert.equal(restored.status, "success");
  assert.equal(calls, 1);
});

test("does not loop after the final Prismic attempt also fails", async () => {
  resetRuleSessionsForTests();
  const storage = createStorage();
  let calls = 0;
  const options = {
    ruleIds: [rule.id],
    accessToken: "token",
    checkoutToken: "checkout-3",
    storage,
    fetchRules: async () => {
      calls += 1;
      throw new Error("Prismic unavailable");
    },
  };

  await loadPrismicRulesForCheckout({...options, finalAttempt: false});
  await loadPrismicRulesForCheckout({...options, finalAttempt: true});
  await loadPrismicRulesForCheckout({...options, finalAttempt: true});
  assert.equal(calls, 2);
});

test("passes an unchanged validated cart and acknowledges removals only once", () => {
  resetRuleSessionsForTests();
  const checkoutToken = "checkout-4";
  const signature = "validated-cart";

  recordValidatedCheckout(checkoutToken, signature, 1);
  assert.equal(isCheckoutAlreadyValidated(checkoutToken, signature), true);
  assert.equal(needsRemovalAcknowledgement(checkoutToken, signature), true);

  acknowledgeRemovedGifts(checkoutToken);
  assert.equal(needsRemovalAcknowledgement(checkoutToken, signature), false);
  assert.equal(isCheckoutAlreadyValidated(checkoutToken, signature), true);
  assert.equal(isCheckoutAlreadyValidated(checkoutToken, "changed-cart"), false);
});
