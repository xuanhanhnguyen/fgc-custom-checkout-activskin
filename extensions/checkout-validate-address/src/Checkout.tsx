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
      if (address.address1 && address.address1.length > 40) {
        return {
          behavior: "block",
          reason: "Invalid shipping address",
          errors: [
            {
              message: "Please keep address to max. 40 characters",
              // Show an error underneath the country code field
              target: "$.cart.deliveryGroups[0].deliveryAddress.address1",
            },
          ],
        };
      } else if (address.address2 && address.address2.length > 40) {
        return {
          behavior: "block",
          reason: "Invalid shipping address",
          errors: [
            {
              message: "Please keep address to max. 40 characters",
              // Show an error underneath the country code field
              target: "$.cart.deliveryGroups[0].deliveryAddress.address2",
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
