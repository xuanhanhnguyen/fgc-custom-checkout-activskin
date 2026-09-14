/**
 * Adds calendar days and moves dates landing on a weekend to Monday, matching
 * the legacy extension behavior.
 *
 * @param {Date} baseDate
 * @param {number} days
 * @returns {string}
 */
export function addWorkingDate(baseDate, days) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);

  if (date.getDay() === 6) date.setDate(date.getDate() + 2);
  if (date.getDay() === 0) date.setDate(date.getDate() + 1);

  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * Google Trusted Stores expects discounts as a negative adjustment. This is
 * the formula from the extension's initial implementation.
 *
 * @param {{total?: number, subtotal?: number, tax?: number, shipping?: number}} amounts
 * @returns {number}
 */
export function calculateDiscount({
  total = 0,
  subtotal = 0,
  tax = 0,
  shipping = 0,
}) {
  return total - (subtotal + tax + shipping);
}

/**
 * Uses the equivalent order identifier on Thank you and Order status targets.
 *
 * @param {{number?: string} | null | undefined} orderConfirmation
 * @param {{confirmationNumber?: string, name?: string} | null | undefined} order
 * @returns {string}
 */
export function getOrderNumber(orderConfirmation, order) {
  return orderConfirmation?.number ?? order?.confirmationNumber ?? order?.name ?? "";
}
