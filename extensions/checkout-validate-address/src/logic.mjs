export const MAX_ADDRESS_LENGTH = 40;

/**
 * @typedef {{address1?: string | null, address2?: string | null}} Address
 */

/**
 * Returns the first invalid field using the same priority as the legacy logic.
 *
 * @param {Address | null | undefined} address
 * @returns {'address1' | 'address2' | null}
 */
export function getInvalidAddressField(address) {
  if (!address) return null;
  if (address.address1 && address.address1.length > MAX_ADDRESS_LENGTH) {
    return "address1";
  }
  if (address.address2 && address.address2.length > MAX_ADDRESS_LENGTH) {
    return "address2";
  }
  return null;
}

/**
 * Builds the exact buyer-journey response used by the legacy extension.
 *
 * @param {boolean} canBlockProgress
 * @param {Address | null | undefined} address
 * @returns {{behavior: 'allow'} | {behavior: 'block', reason: string, errors: Array<{message: string, target: string}>}}
 */
export function getAddressInterception(canBlockProgress, address) {
  if (!canBlockProgress || !address) return { behavior: "allow" };

  const invalidField = getInvalidAddressField(address);
  if (!invalidField) return { behavior: "allow" };

  return {
    behavior: "block",
    reason: "Invalid shipping address",
    errors: [
      {
        message: "Please keep address to max. 40 characters",
        target: `$.cart.deliveryGroups[0].deliveryAddress.${invalidField}`,
      },
    ],
  };
}
