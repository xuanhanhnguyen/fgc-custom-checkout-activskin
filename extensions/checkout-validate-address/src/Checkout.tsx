import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useBuyerJourneyIntercept } from "@shopify/ui-extensions/checkout/preact";
import { getAddressInterception } from "./logic.mjs";

export default function extension() {
  render(<App />, document.body);
}

function App() {
  useBuyerJourneyIntercept(({ canBlockProgress }) => {
    const address = shopify.shippingAddress?.value;
    return getAddressInterception(canBlockProgress, address);
  });

  return null;
}
