import {
  reactExtension,
  useShippingAddress,
  useBuyerJourneyIntercept,
} from "@shopify/ui-extensions-react/checkout";

// Set the entry points for the extension
export default reactExtension(
  "purchase.checkout.delivery-address.render-before",
  () => <App />
);

function App() {
  const address = useShippingAddress();

  useBuyerJourneyIntercept(({ canBlockProgress }) => {
    if (canBlockProgress) {
      if (
        (address.address1 && address.address1.length > 40) ||
        (address.address2 && address.address2.length > 40)
      ) {
        return {
          behavior: "block",
          reason: "Invalid shipping address",
          errors: [
            {
              // An error without a `target` property is shown at page level
              message: "Please keep address to max. 40 characters",
            },
          ],
        };
      }
    }
    return {
      behavior: "allow",
    };
  });

  return null;
}
