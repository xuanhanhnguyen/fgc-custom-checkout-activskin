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
import type {CartLine, InterceptorRequest} from "@shopify/ui-extensions/checkout";

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
  valid: boolean;
  removedCount: number;
  invalidLines: InvalidLine[];
};

export default function extension() {
  render(<FreeGiftValidator />, document.body);
}

function FreeGiftValidator() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const validationInFlight = useRef<Promise<ValidationResult> | null>(null);
  const canBlockCheckout = useExtensionCapability("block_progress");
  const lines = shopify.lines.value;
  const lineSignature = createLineSignature(lines);
  const accessToken = String(
    shopify.settings.value.prismicAccessToken ?? "",
  ).trim();

  const validateAndRepair = () => {
    if (validationInFlight.current) return validationInFlight.current;

    const task = inspectAndRepair(accessToken).finally(() => {
      validationInFlight.current = null;
    });
    validationInFlight.current = task;
    return task;
  };

  useBuyerJourneyIntercept(async ({canBlockProgress}) => {
    if (!hasPotentialFreeGift(shopify.lines.value)) {
      return {behavior: "allow"};
    }

    try {
      const result = await validateAndRepair();

      if (result.valid && result.removedCount === 0) {
        return {behavior: "allow"};
      }

      if (result.valid) {
        const message = shopify.i18n.translate("invalidGiftsRemoved");
        return canBlockProgress
          ? blockCheckout(message, () => setNotice({tone: "warning", message}))
          : {
              behavior: "allow",
              perform: () => setNotice({tone: "warning", message}),
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
    if (!hasPotentialFreeGift(lines)) {
      setNotice(null);
      return;
    }

    let cancelled = false;
    validateAndRepair()
      .then((result) => {
        if (cancelled) return;
        if (result.removedCount > 0) {
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
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Free gift validation failed", error);
        setNotice({
          tone: "critical",
          message: shopify.i18n.translate("validationUnavailable"),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [lineSignature, accessToken]);

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

async function inspectAndRepair(accessToken: string): Promise<ValidationResult> {
  const initialEvaluation = await inspectCheckout(
    shopify.lines.value,
    accessToken,
  );

  if (initialEvaluation.invalidLines.length === 0) {
    return {valid: true, removedCount: 0, invalidLines: []};
  }

  if (!shopify.instructions.value.lines.canRemoveCartLine) {
    return {
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

  const finalEvaluation = await inspectCheckout(shopify.lines.value, accessToken);
  return {
    valid: finalEvaluation.invalidLines.length === 0,
    removedCount,
    invalidLines: finalEvaluation.invalidLines,
  };
}

async function inspectCheckout(lines: CartLine[], accessToken: string) {
  const ruleIds = getFreeGiftRuleIds(lines);
  if (ruleIds.length === 0) {
    return evaluateFreeGifts({lines, rulesById: new Map(), catalogByVariant: new Map()});
  }

  if (!accessToken) {
    throw new Error("The Prismic access token is not configured");
  }

  const paidVariantIds = lines
    .filter((line) => !getLineAttribute(line, "_rule_id"))
    .map((line) => line.merchandise.id);
  const [rulesById, catalogByVariant] = await Promise.all([
    fetchPrismicRules(ruleIds, accessToken),
    fetchCatalogEntries(paidVariantIds, shopify.query),
  ]);

  return evaluateFreeGifts({lines, rulesById, catalogByVariant});
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
