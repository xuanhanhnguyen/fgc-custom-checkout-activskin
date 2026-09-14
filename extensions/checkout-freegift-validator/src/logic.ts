const RULE_ATTRIBUTE = "_rule_id";
const VALIDATE_ATTRIBUTE = "_validate";

type ValidationLine = {
  id: string;
  merchandise: {id: string};
  quantity: number;
  cost?: {totalAmount?: {amount?: string | number}};
  attributes?: Array<{key: string; value?: string}>;
  discountAllocations?: unknown[];
};

export type FreeGiftRule = {
  id: string;
  enabled: boolean;
  startDate: string | null;
  endDate: string | null;
  giftVariantIds: string[];
  eligibleVariantIds: string[];
  usesCollectionSelector: boolean;
  minimumCartValue: number | null;
  minimumProductCount: number | null;
};

export type CatalogEntry = {price: number};

export type InvalidFreeGiftLine = {
  lineId: string;
  variantId: string;
  ruleId: string;
  removeQuantity: number;
  reason: string;
};

export function hasPotentialFreeGift(lines: ValidationLine[]) {
  return lines.some(
    (line) =>
      Boolean(getAttribute(line, RULE_ATTRIBUTE)) ||
      (!getAttribute(line, RULE_ATTRIBUTE) &&
        Number(line.cost?.totalAmount?.amount) === 0),
  );
}

export function getFreeGiftRuleIds(lines: ValidationLine[]) {
  return [
    ...new Set(lines.map((line) => getAttribute(line, RULE_ATTRIBUTE)).filter(Boolean)),
  ];
}

export function evaluateFreeGifts({
  lines,
  rulesById,
  catalogByVariant,
  now = new Date(),
}: {
  lines: ValidationLine[];
  rulesById: Map<string, FreeGiftRule>;
  catalogByVariant: Map<string, CatalogEntry>;
  now?: Date;
}) {
  const giftLines = lines.filter((line) => getAttribute(line, RULE_ATTRIBUTE));
  const isZeroPriceLine = (line: ValidationLine) =>
    !getAttribute(line, RULE_ATTRIBUTE) &&
    getUnitPrice(line, catalogByVariant) === 0;
  const paidLines = lines.filter(
    (line) => !getAttribute(line, RULE_ATTRIBUTE) && !isZeroPriceLine(line),
  );
  const invalidLines = lines
    .filter(isZeroPriceLine)
    .map((line) => invalidLine(line, line.quantity, "unmarked-zero-price-line"));

  for (const line of giftLines) {
    const ruleId = getAttribute(line, RULE_ATTRIBUTE);
    const rule = rulesById.get(ruleId);

    if (!rule || !isRuleActive(rule, now)) {
      invalidLines.push(invalidLine(line, line.quantity, "missing-or-inactive-rule"));
      continue;
    }

    if (!rule.giftVariantIds.includes(line.merchandise.id)) {
      invalidLines.push(invalidLine(line, line.quantity, "gift-variant-not-allowed"));
      continue;
    }

    const validateKeys = parseValidateKeys(getAttribute(line, VALIDATE_ATTRIBUTE));
    const eligibleLines = paidLines.filter((paidLine) =>
      isEligibleLine(paidLine, rule, validateKeys),
    );
    const totals = eligibleLines.reduce(
      (result, paidLine) => {
        const unitPrice = getUnitPrice(paidLine, catalogByVariant);
        result.value += unitPrice * paidLine.quantity;
        result.count += paidLine.quantity;
        result.catalogComplete &&= Number.isFinite(unitPrice);
        return result;
      },
      {value: 0, count: 0, catalogComplete: true},
    );

    if (!totals.catalogComplete || !meetsRuleRequirements(rule, totals)) {
      invalidLines.push(invalidLine(line, line.quantity, "requirements-not-met"));
      continue;
    }

  }

  return {invalidLines};
}

export function parseValidateKeys(value: string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string" && item.trim())
      : [];
  } catch {
    return [];
  }
}

export function isRuleActive(rule: FreeGiftRule, now = new Date()) {
  if (!rule.enabled) return false;
  const timestamp = now.getTime();
  const start = parseDateBoundary(rule.startDate, false);
  const end = parseDateBoundary(rule.endDate, true);
  return (!start || timestamp >= start) && (!end || timestamp <= end);
}

function isEligibleLine(
  line: ValidationLine,
  rule: FreeGiftRule,
  validateKeys: string[],
) {
  if (rule.eligibleVariantIds.length > 0) {
    return rule.eligibleVariantIds.includes(line.merchandise.id);
  }

  if (rule.usesCollectionSelector) {
    if (validateKeys.length === 0) return false;
    const collections = parseValidateKeys(
      getAttribute(line, "_collections"),
    );
    return collections.some((collection) => validateKeys.includes(collection));
  }

  return true;
}

function meetsRuleRequirements(
  rule: FreeGiftRule,
  totals: {value: number; count: number; catalogComplete: boolean},
) {
  if (totals.count === 0) return false;
  const requirements = [];
  if (rule.minimumCartValue != null && rule.minimumCartValue > 0) {
    requirements.push(totals.value >= rule.minimumCartValue);
  }
  if (rule.minimumProductCount != null && rule.minimumProductCount > 0) {
    requirements.push(totals.count >= rule.minimumProductCount);
  }
  return requirements.some(Boolean);
}

function getUnitPrice(
  line: ValidationLine,
  catalogByVariant: Map<string, CatalogEntry>,
) {
  const catalogPrice = Number(catalogByVariant.get(line.merchandise.id)?.price);
  if (Number.isFinite(catalogPrice)) return catalogPrice;
  const total = Number(line.cost?.totalAmount?.amount);
  return line.quantity > 0 ? total / line.quantity : NaN;
}

function getAttribute(line: ValidationLine, key: string) {
  return line.attributes?.find((attribute) => attribute.key === key)?.value ?? "";
}

function invalidLine(
  line: ValidationLine,
  removeQuantity: number,
  reason: string,
): InvalidFreeGiftLine {
  return {
    lineId: line.id,
    variantId: line.merchandise.id,
    ruleId: getAttribute(line, RULE_ATTRIBUTE),
    removeQuantity,
    reason,
  };
}

function parseDateBoundary(value: string | null, endOfDay: boolean) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}
