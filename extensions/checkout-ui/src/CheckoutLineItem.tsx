import {
  reactExtension,
  Text,
  TextBlock,
  useTarget,
} from "@shopify/ui-extensions-react/checkout";
import { useEffect, useState } from "react";

export default reactExtension(
  "purchase.checkout.cart-line-item.render-after",
  () => <Extension />,
);

function Extension() {
  const [dispatch, setDispatch] = useState<string>("");
  const {
    merchandise: { title, ...data },
    attributes,
  } = useTarget();

  useEffect(() => {
    const status = attributes?.find((v) => v?.key === "_status")?.value || "";
    let _dispatch: string = "Expected to ship in 3-5 business days";
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
  }, [attributes]);

  if (!dispatch) return null;
  return (
    <Text visibility="hidden" size="small" appearance="subdued">
      {dispatch}
    </Text>
  );
}
