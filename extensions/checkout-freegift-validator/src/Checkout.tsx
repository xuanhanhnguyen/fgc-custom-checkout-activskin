import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useEffect, useRef, useState} from "preact/hooks";
import {
  useBuyerJourneyIntercept,
  useExtensionCapability,
} from "@shopify/ui-extensions/checkout/preact";
import {
  evaluateFreeGifts,
  getFreeGiftRuleIds,
  hasPotentialFreeGift,
} from "./logic";
import {fetchCatalogEntries, fetchPrismicRules} from "./services";
import {
  acknowledgeRemovedGifts,
  isCheckoutAlreadyValidated,
  loadPrismicRulesForCheckout,
  needsRemovalAcknowledgement,
  recordValidatedCheckout,
} from "./rule-session";
import type {CartLine, InterceptorRequest} from "@shopify/ui-extensions/checkout";

const VALIDATION_ERROR_ATTRIBUTE = "Cart validation error";
const VALIDATION_ERROR_VALUE =
  "Unable to retrieve data from Prismic; free gift validation was skipped.";

type Notice = {
  tone: "critical" | "warning";
  message: string;
};

type InvalidLine = {
  lineId: string;
  variantId: string;
  ruleId: string;
  removeQuantity: number;
  reason: string;
};

type ValidationResult = {
  status: "validated";
  valid: boolean;
  removedCount: number;
  invalidLines: InvalidLine[];
};

type ValidationUnavailable = {
  status: "unavailable";
  error?: unknown;
};

type ValidationOutcome = ValidationResult | ValidationUnavailable;

export default function extension() {
  render(<FreeGiftValidator />, document.body);
}

function FreeGiftValidator() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const validationInFlight = useRef<{
    finalAttempt: boolean;
    promise: Promise<ValidationOutcome>;
  } | null>(null);
  const canBlockCheckout = useExtensionCapability("block_progress");
  const lines = shopify.lines.value;
  const lineSignature = createLineSignature(lines);
  const checkoutToken = shopify.checkoutToken.value;
  const accessToken = String(
    shopify.settings.value.prismicAccessToken ?? "",
  ).trim();

  const validateAndRepair = async (finalAttempt: boolean) => {
    const inFlight = validationInFlight.current;
    if (inFlight) {
      const result = await inFlight.promise;
      if (
        finalAttempt &&
        !inFlight.finalAttempt &&
        result.status === "unavailable"
      ) {
        return validateAndRepair(true);
      }
      return result;
    }

    const task = inspectAndRepair(accessToken, finalAttempt)
      .then((result) => {
        if (result.status === "validated" && result.valid) {
          recordValidatedCheckout(
            shopify.checkoutToken.value,
            createLineSignature(shopify.lines.value),
            result.removedCount,
          );
        }
        return result;
      })
      .finally(() => {
        validationInFlight.current = null;
      });
    validationInFlight.current = {finalAttempt, promise: task};
    return task;
  };

  useBuyerJourneyIntercept(async ({canBlockProgress}) => {
    const currentLines = shopify.lines.value;
    const currentSignature = createLineSignature(currentLines);
    const currentCheckoutToken = shopify.checkoutToken.value;

    if (needsRemovalAcknowledgement(currentCheckoutToken, currentSignature)) {
      const message = shopify.i18n.translate("invalidGiftsRemoved");
      const acknowledge = () => {
        acknowledgeRemovedGifts(currentCheckoutToken);
        setNotice({tone: "warning", message});
      };
      return canBlockProgress
        ? blockCheckout(message, acknowledge)
        : {behavior: "allow", perform: acknowledge};
    }

    if (
      isCheckoutAlreadyValidated(currentCheckoutToken, currentSignature) ||
      !hasPotentialFreeGift(currentLines)
    ) {
      return {behavior: "allow"};
    }

    const finalAttempt = isFinalCheckoutStep();
    if (!finalAttempt) {
      if (!validationInFlight.current) {
        void validateAndRepair(false).then(updateNoticeFromValidation).catch(
          showUnexpectedValidationError,
        );
      }
      return {behavior: "allow"};
    }

    try {
      const result = await validateAndRepair(finalAttempt);

      if (result.status === "unavailable") {
        console.error("Prismic free gift rules are unavailable", result.error);
        if (finalAttempt) {
          await markValidationUnavailableOnOrder();
        }
        return {
          behavior: "allow",
          perform: () =>
            setNotice({
              tone: "warning",
              message: shopify.i18n.translate("validationUnavailableAllowed"),
            }),
        };
      }

      if (result.valid && result.removedCount === 0) {
        return {behavior: "allow"};
      }

      if (result.valid) {
        const message = shopify.i18n.translate("invalidGiftsRemoved");
        const acknowledge = () => {
          acknowledgeRemovedGifts(shopify.checkoutToken.value);
          setNotice({tone: "warning", message});
        };
        return canBlockProgress
          ? blockCheckout(message, acknowledge)
          : {
              behavior: "allow",
              perform: acknowledge,
            };
      }

      const message = shopify.i18n.translate("invalidGiftsCouldNotBeRemoved");
      return canBlockProgress
        ? blockCheckout(message, () => setNotice({tone: "critical", message}))
        : {
            behavior: "allow",
            perform: () => setNotice({tone: "critical", message}),
          };
    } catch (error) {
      console.error("Free gift validation failed", error);
      const message = shopify.i18n.translate("validationUnavailable");
      return canBlockProgress
        ? blockCheckout(message, () => setNotice({tone: "critical", message}))
        : {
            behavior: "allow",
            perform: () => setNotice({tone: "critical", message}),
          };
    }
  });

  useEffect(() => {
    if (needsRemovalAcknowledgement(checkoutToken, lineSignature)) {
      setNotice({
        tone: "warning",
        message: shopify.i18n.translate("invalidGiftsRemoved"),
      });
      return;
    }

    if (isCheckoutAlreadyValidated(checkoutToken, lineSignature)) {
      setNotice(null);
      return;
    }

    if (!hasPotentialFreeGift(lines)) {
      setNotice(null);
      return;
    }

    let cancelled = false;
    validateAndRepair(false)
      .then((result) => {
        if (cancelled) return;
        updateNoticeFromValidation(result);
      })
      .catch((error) => {
        if (cancelled) return;
        showUnexpectedValidationError(error);
      });

    return () => {
      cancelled = true;
    };
  }, [lineSignature, accessToken, checkoutToken]);

  function updateNoticeFromValidation(result: ValidationOutcome) {
    if (result.status === "unavailable") {
      console.error("Prismic free gift rules are unavailable", result.error);
      setNotice({
        tone: "warning",
        message: shopify.i18n.translate("validationUnavailableAllowed"),
      });
    } else if (result.removedCount > 0) {
      setNotice({
        tone: "warning",
        message: shopify.i18n.translate("invalidGiftsRemoved"),
      });
    } else if (!result.valid) {
      setNotice({
        tone: "critical",
        message: shopify.i18n.translate("invalidGiftsCouldNotBeRemoved"),
      });
    } else {
      setNotice(null);
    }
  }

  function showUnexpectedValidationError(error: unknown) {
    console.error("Free gift validation failed", error);
    setNotice({
      tone: "critical",
      message: shopify.i18n.translate("validationUnavailable"),
    });
  }

  const editorType = shopify.extension.editor?.type;
  if (editorType === "checkout" && !canBlockCheckout) {
    return (
      <s-banner tone="critical" heading="Free gift validator">
        {shopify.i18n.translate("blockingCapabilityRequired")}
      </s-banner>
    );
  }

  if (!notice) return null;
  return (
    <s-banner tone={notice.tone} heading="Free gift validation">
      {notice.message}
    </s-banner>
  );
}

async function inspectAndRepair(
  accessToken: string,
  finalAttempt: boolean,
): Promise<ValidationOutcome> {
  const initialEvaluation = await inspectCheckout(
    shopify.lines.value,
    accessToken,
    finalAttempt,
  );

  if (initialEvaluation.status === "unavailable") return initialEvaluation;

  if (initialEvaluation.invalidLines.length === 0) {
    return {status: "validated", valid: true, removedCount: 0, invalidLines: []};
  }

  if (!shopify.instructions.value.lines.canRemoveCartLine) {
    return {
      status: "validated",
      valid: false,
      removedCount: 0,
      invalidLines: initialEvaluation.invalidLines,
    };
  }

  let removedCount = 0;
  for (const invalidLine of initialEvaluation.invalidLines) {
    const currentLine = findCurrentLine(invalidLine);
    if (!currentLine) continue;

    const quantity = Math.min(invalidLine.removeQuantity, currentLine.quantity);
    const result = await shopify.applyCartLinesChange({
      type: "removeCartLine",
      id: currentLine.id,
      quantity,
    });

    if (result.type === "error") {
      console.error("Unable to remove invalid free gift", result.message);
      break;
    }
    removedCount += quantity;
  }

  const finalEvaluation = await inspectCheckout(
    shopify.lines.value,
    accessToken,
    finalAttempt,
  );
  if (finalEvaluation.status === "unavailable") return finalEvaluation;
  return {
    status: "validated",
    valid: finalEvaluation.invalidLines.length === 0,
    removedCount,
    invalidLines: finalEvaluation.invalidLines,
  };
}

async function inspectCheckout(
  lines: CartLine[],
  accessToken: string,
  finalAttempt: boolean,
) {
  const ruleIds = getFreeGiftRuleIds(lines);
  if (ruleIds.length === 0) {
    return {
      status: "validated" as const,
      ...evaluateFreeGifts({
        lines,
        rulesById: new Map(),
        catalogByVariant: new Map(),
      }),
    };
  }

  if (!accessToken) {
    return {
      status: "unavailable" as const,
      error: new Error("The Prismic access token is not configured"),
    };
  }

  const paidVariantIds = lines
    .filter((line) => !getLineAttribute(line, "_rule_id"))
    .map((line) => line.merchandise.id);
  const [rulesResult, catalogResult] = await Promise.all([
    loadPrismicRulesForCheckout({
      ruleIds,
      accessToken,
      checkoutToken: shopify.checkoutToken.value,
      storage: shopify.storage,
      finalAttempt,
      fetchRules: fetchPrismicRules,
    }),
    fetchCatalogEntries(paidVariantIds, shopify.query).then(
      (catalogByVariant) => ({status: "success" as const, catalogByVariant}),
      (error) => ({status: "error" as const, error}),
    ),
  ]);

  if (rulesResult.status === "unavailable") return rulesResult;
  if (catalogResult.status === "error") throw catalogResult.error;

  return {
    status: "validated" as const,
    ...evaluateFreeGifts({
      lines,
      rulesById: rulesResult.rulesById,
      catalogByVariant: catalogResult.catalogByVariant,
    }),
  };
}

function isFinalCheckoutStep() {
  const activeStep = shopify.buyerJourney.activeStep.value?.handle;
  if (activeStep === "checkout") return true;

  const hasReviewStep = shopify.buyerJourney.steps.value.some(
    (step) => step.handle === "review",
  );
  return activeStep === (hasReviewStep ? "review" : "payment");
}

async function markValidationUnavailableOnOrder() {
  if (!shopify.instructions.value.attributes.canUpdateAttributes) {
    console.error("Checkout attributes cannot be updated for this checkout");
    return;
  }

  try {
    const result = await shopify.applyAttributeChange({
      type: "updateAttribute",
      key: VALIDATION_ERROR_ATTRIBUTE,
      value: `${VALIDATION_ERROR_VALUE} ${new Date().toISOString()}`,
    });
    if (result.type === "error") {
      console.error(
        "Unable to add the validation error to the order",
        result.message,
      );
    }
  } catch (error) {
    console.error("Unable to add the validation error to the order", error);
  }
}

function findCurrentLine(invalidLine: InvalidLine) {
  const currentLines = shopify.lines.value;
  return (
    currentLines.find((line) => line.id === invalidLine.lineId) ??
    currentLines.find(
      (line) =>
        line.merchandise.id === invalidLine.variantId &&
        getLineAttribute(line, "_rule_id") === invalidLine.ruleId,
    )
  );
}

function getLineAttribute(line: CartLine, key: string) {
  return line.attributes.find((attribute) => attribute.key === key)?.value ?? "";
}

function createLineSignature(lines: CartLine[]) {
  return JSON.stringify(
    lines.map((line) => ({
      id: line.id,
      quantity: line.quantity,
      amount: line.cost.totalAmount.amount,
      attributes: line.attributes,
    })),
  );
}

function blockCheckout(message: string, perform: () => void): InterceptorRequest {
  return {
    behavior: "block",
    reason: "Invalid free gift",
    errors: [{message}],
    perform,
  };
}
