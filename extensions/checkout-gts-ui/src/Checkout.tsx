import "@shopify/ui-extensions/preact";
import { render } from "preact";
import {
  addWorkingDate,
  calculateDiscount,
  getOrderNumber,
} from "./logic.mjs";

export default function extension() {
  render(<GtsBlock />, document.body);
}

function GtsBlock() {
  const shippingDays = 1;
  const deliveryDays = 2;

  const now = new Date();
  const shippingDate = addWorkingDate(now, shippingDays);
  const deliveryDate = addWorkingDate(now, deliveryDays);

  const subtotal = shopify.cost.subtotalAmount.value?.amount ?? 0;
  const shipping = shopify.cost.totalShippingAmount.value?.amount ?? 0;
  const tax = shopify.cost.totalTaxAmount.value?.amount ?? 0;
  const total = shopify.cost.totalAmount.value?.amount ?? 0;
  const currencyCode =
    shopify.cost.totalAmount.value?.currencyCode ??
    shopify.cost.subtotalAmount.value?.currencyCode ??
    "AUD";
  const discount = calculateDiscount({ total, subtotal, tax, shipping });
  const buyerIdentity = shopify.buyerIdentity;
  const lines = shopify.lines.value;
  const orderNumber =
    "order" in shopify
      ? getOrderNumber(undefined, shopify.order.value)
      : getOrderNumber(shopify.orderConfirmation.value, undefined);
  const formatCurrency = (amount: number) =>
    shopify.i18n.formatCurrency(amount);

  return (
    <s-box display="none">
      <s-stack id="gts-order">
        <s-text id="gts-o-id">{orderNumber}</s-text>
        <s-text id="gts-o-domain">activeskin.com.au</s-text>
        <s-text id="gts-o-email">
          {buyerIdentity?.customer?.value?.email ?? buyerIdentity?.email?.value}
        </s-text>
        <s-text id="gts-o-country">
          {shopify.localization.country?.value?.isoCode}
        </s-text>
        <s-text id="gts-o-currency">{currencyCode}</s-text>
        <s-text id="gts-o-total">{formatCurrency(total)}</s-text>
        <s-text id="gts-o-shipping-total">
          {formatCurrency(shipping)}
        </s-text>
        <s-text id="gts-o-tax-total">{formatCurrency(tax)}</s-text>
        <s-text id="gts-o-discounts">{formatCurrency(discount)}</s-text>
        <s-text id="gts-o-est-ship-date">{shippingDate}</s-text>
        <s-text id="gts-o-est-delivery-date">{deliveryDate}</s-text>
        <s-text id="gts-o-has-preorder">N</s-text>
        <s-text id="gts-o-has-digital">N</s-text>

        {lines.map((line, index) => (
          <s-stack key={index} id="gts-item">
            <s-text id="gts-i-name">{line.merchandise.title}</s-text>
            <s-text id="gts-i-price">
              {formatCurrency(line.cost.totalAmount.amount)}
            </s-text>
            <s-text id="gts-i-quantity">{line.quantity}</s-text>
          </s-stack>
        ))}
      </s-stack>
    </s-box>
  );
}
