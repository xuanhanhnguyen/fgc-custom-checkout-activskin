import {
  reactExtension,
  Text,
  TextBlock,
  useTarget,
} from "@shopify/ui-extensions-react/checkout";
import { useEffect, useState } from "react";

const checkoutLineItem = reactExtension(
  "purchase.checkout.cart-line-item.render-after",
  () => <Extension />
);

export { checkoutLineItem };

const orderLineItem = reactExtension(
  "customer-account.order-status.cart-line-item.render-after",
  () => <Extension />
);

export { orderLineItem };

const thankyouLineItem = reactExtension(
  "purchase.thank-you.cart-line-item.render-after",
  () => <Extension />
);

export { thankyouLineItem };

function Extension() {
  const [dispatch, setDispatch] = useState<string>("");
  const {
    merchandise: { title, ...data },
    attributes,
  } = useTarget();

  useEffect(() => {
    const isFreeGift =
      attributes?.find((v) => v?.key === "_rule_id")?.value || "";
    const hasDispatchStatus =
      attributes?.find((v) => v?.key === "Dispatch status")?.value || "";

    if (!isFreeGift && !hasDispatchStatus) {
      const status = attributes?.find((v) => v?.key === "_status")?.value || "";
      let _dispatch: string = "";
      switch (status) {
        case "Dispatches in 7 business days":
          _dispatch = "Expected to ship in 7 business days";
          break;
        case "Dispatches in 1 - 2 business days":
          _dispatch = "Expected to ship in 1-2 business days";
          break;
        case "Dispatches in 2 - 3 business days":
          _dispatch = "Expected to ship in 2-3 business days";
          break;
        case "Dispatches in 3 - 5 business days":
          _dispatch = "Expected to ship in 3-5 business days";
          break;
        case "Ready":
        case "Ready to dispatch":
          _dispatch = "Ready to ship";
          break;
        default:
          break;
      }
      setDispatch(_dispatch);
      console.log({ data, attributes });
    }
  }, [attributes]);

  if (!dispatch) return null;
  return (
    <Text size="small" appearance="subdued">
      {dispatch}
    </Text>
  );
}
