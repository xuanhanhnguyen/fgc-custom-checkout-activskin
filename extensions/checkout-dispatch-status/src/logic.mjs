/**
 * @typedef {{key?: string | null, value?: string | null}} Attribute
 */

/**
 * Returns the legacy dispatch message for a cart line's attributes.
 *
 * @param {Attribute[]} [attributes]
 * @returns {string}
 */
export function getDispatchMessage(attributes = []) {
  const isFreeSamples =
    attributes.find((attribute) => attribute?.key === "_isFreeSamples")?.value ||
    "";
  const hasDispatchStatus =
    attributes.find((attribute) => attribute?.key === "Dispatch status")
      ?.value || "";

  if (isFreeSamples || hasDispatchStatus) return "";

  const status =
    attributes.find((attribute) => attribute?.key === "_status")?.value || "";

  switch (status) {
    case "Dispatches in 7 business days":
      return "Expected to ship in 7 business days";
    case "Dispatches in 1 - 2 business days":
      return "Expected to ship in 1-2 business days";
    case "Dispatches in 2 - 3 business days":
      return "Expected to ship in 2-3 business days";
    case "Dispatches in 3 - 5 business days":
      return "Expected to ship in 3-5 business days";
    case "Ready":
    case "Ready to dispatch":
      return "Ready to ship";
    default:
      return "";
  }
}
