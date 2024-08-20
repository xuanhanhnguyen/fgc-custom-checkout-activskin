import {
  reactExtension,
  BlockStack,
  Text,
  useApi,
  TextBlock,
} from "@shopify/ui-extensions-react/checkout";

const thankyou = reactExtension("purchase.thank-you.block.render", () => (
  <GtsBlock />
));

export { thankyou };

const orderStatus = reactExtension(
  "customer-account.order-status.block.render",
  () => <GtsBlock />
);

export { orderStatus };

function GtsBlock() {
  // 2. Use the extension API to gather context from the checkout and shop
  const api = useApi();

  const { cost, i18n, localization, lines, orderConfirmation, buyerIdentity } =
    api;

  function addWorkingDate(date_add: number) {
    let date_today = new Date();
    date_today.setDate(date_today.getDate() + date_add);
    if (date_today.getDay() == 6) {
      date_today.setDate(date_today.getDate() + 2);
    }
    if (date_today.getDay() == 0) {
      date_today.setDate(date_today.getDate() + 1);
    }
    return `${date_today.getFullYear()}-${
      date_today.getMonth() + 1
    }-${date_today.getDate()}`;
  }

  const shippingDays = 1;
  const deliveryDays = 2;

  const shippingDate = addWorkingDate(shippingDays);
  const deliveryDate = addWorkingDate(deliveryDays);

  const discount =
    cost?.totalAmount?.current?.amount -
    (cost.subtotalAmount?.current?.amount ||
      0 + cost.totalTaxAmount?.current?.amount ||
      0 + cost.totalShippingAmount?.current?.amount ||
      0);

  // 3. Render a UI
  return (
    <BlockStack display={"none"}>
      <TextBlock id="gts-order" translate="no">
        <Text id="gts-o-id">{orderConfirmation?.current?.number}</Text>
        <Text id="gts-o-domain">activeskin.com.au</Text>
        <Text id="gts-o-email">
          {buyerIdentity?.customer?.current?.email ||
            buyerIdentity?.email?.current}
        </Text>
        <Text id="gts-o-country">
          {localization?.country?.current?.isoCode}
        </Text>
        <Text id="gts-o-currency">
          {cost.subtotalAmount.current?.currencyCode}
        </Text>
        <Text id="gts-o-total">
          {i18n.formatCurrency(cost?.totalAmount?.current?.amount)}
        </Text>
        <Text id="gts-o-shipping-total">
          {i18n.formatCurrency(cost?.totalShippingAmount?.current?.amount)}
        </Text>
        <Text id="gts-o-tax-total">
          {i18n.formatCurrency(cost?.totalTaxAmount?.current?.amount)}
        </Text>
        <Text id="gts-o-discounts">{i18n.formatCurrency(discount)}</Text>
        <Text id="gts-o-est-ship-date">{shippingDate}</Text>
        <Text id="gts-o-est-delivery-date">{deliveryDate}</Text>
        <Text id="gts-o-has-preorder">N</Text>
        <Text id="gts-o-has-digital">N</Text>

        {lines?.current?.map((line, index) => (
          <TextBlock key={index} id="gts-item">
            <Text id="gts-i-name">{line?.merchandise?.title}</Text>
            <Text id="gts-i-price">
              {i18n.formatCurrency(line?.cost?.totalAmount?.amount)}
            </Text>
            <Text id="gts-i-quantity">{line?.quantity}</Text>
          </TextBlock>
        ))}
      </TextBlock>
    </BlockStack>
  );
}
