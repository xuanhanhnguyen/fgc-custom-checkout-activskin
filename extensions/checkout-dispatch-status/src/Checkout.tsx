import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { getDispatchMessage } from "./logic.mjs";

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const attributes = shopify.target.value.attributes ?? [];
  const dispatch = getDispatchMessage(attributes);

  if (!dispatch) return null;
  return (
    <s-text type="small" color="subdued">
      {dispatch}
    </s-text>
  );
}
