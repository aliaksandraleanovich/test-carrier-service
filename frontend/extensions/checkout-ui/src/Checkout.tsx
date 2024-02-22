import {
  reactExtension,
  ChoiceList,
  Choice,
  useShippingAddress,
  Spinner,
  Text,
  Heading,
  BlockSpacer,
} from "@shopify/ui-extensions-react/checkout";
import { useEffect, useState } from "react";

//  Upon checkout make a call to a fake endpoint to receive shipping rates

export default reactExtension(
  "purchase.checkout.shipping-option-list.render-after",
  () => <Extension />
);

const ADDRESS_FROM_MOCK = {
  name: "John Doe",
  street1: "123 Main St",
  city: "San Francisco",
  state: "CA",
  zip: "94103",
  country: "US",
  phone: "+1  555  341  9393",
  email: "john.doe@example.com",
};

// REPLACE WITH REQUEST FOR CARRIERS
const getCarriers = async ({
  addressLine1,
  addressLine2,
  postalCode,
  country,
  city,
}) => {
  const response = await fetch(
    `https://65d719f527d9a3bc1d7a2ce7.mockapi.io/shipping/carriers`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return response.json();
};

function Extension() {
  const [shippingData, setShippingData] = useState([]);
  const [shippingChosen, setShippingChosen] = useState(undefined);
  const shippingAddress = useShippingAddress();

  useEffect(() => {
    const getAndSetCarriersData = async () => {
      const carriers = await getCarriers({
        addressLine1: shippingAddress.address1,
        addressLine2: shippingAddress.address2,
        postalCode: shippingAddress.zip,
        country: shippingAddress.countryCode,
        city: shippingAddress.city,
      });
      setShippingData(carriers);
    };
    getAndSetCarriersData();
  }, [shippingAddress]);

  useEffect(() => {
    if (shippingData.length) {
      setShippingChosen(shippingData[0].id);
    }
  }, [shippingData]);

  return (
    <>
      <Heading level={2}>Carriers</Heading>
      <BlockSpacer spacing="loose" />
      {shippingChosen ? (
        <ChoiceList
          name="group-single"
          variant="group"
          value={shippingChosen}
          onChange={(value) => setShippingChosen(value)}
        >
          {shippingData.map((shippingItem) => (
            <Choice id={shippingItem.id} key={shippingItem.id}>
              {shippingItem.name} (${shippingItem.price})
            </Choice>
          ))}
        </ChoiceList>
      ) : (
        <Spinner />
      )}
    </>
  );
}
