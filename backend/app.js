const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const ngrok = require("ngrok");
const nonce = require("nonce")();
const request = require("request-promise");
const querystring = require("querystring");
const cookie = require("cookie");
const axios = require("axios");

const app = express();

app.use(bodyParser.json());

const PORT = 3000;

app.get("/shopify", (req, res) => {
  const shopName = req.query.shop;

  if (shopName) {
    const shopState = nonce();

    const redirectURL = process.env.API + "/shopify/callback";

    const installUrl =
      "https://" +
      shopName +
      "/admin/oauth/authorize?client_id=" +
      process.env.API_KEY +
      "&scope=" +
      process.env.SCOPES +
      "&state=" +
      shopState +
      "&redirect_uri=" +
      redirectURL;

    res.cookie("state", shopState);

    res.redirect(installUrl);
  } else {
    return res.status(400).send('Missing "Shop Name" parameter!!');
  }
});

//Install App to the store

app.get("/shopify/callback", (req, res) => {
  const { shop, hmac, code, shopState } = req.query;
  const stateCookie = cookie.parse(req.headers.cookie).shopState;

  if (shopState !== stateCookie) {
    return res.status(400).send("Request origin cannot be verified");
  }

  if (shop && hmac && code) {
    const Map = Object.assign({}, req.query);
    delete Map["hmac"];
    delete Map["signature"];

    const message = querystring.stringify(Map);
    const providedHmac = Buffer.from(hmac, "utf-8");
    const generatedHash = Buffer.from(
      crypto
        .createHmac("sha256", process.env.API_SECRET)
        .update(message)
        .digest("hex"),
      "utf-8"
    );

    let hashEquals = false;

    try {
      hashEquals = crypto.timingSafeEqual(generatedHash, providedHmac);
    } catch (e) {
      hashEquals = false;
    }

    if (!hashEquals) {
      return res.status(400).send("HMAC validation failed");
    }

    const accessTokenRequestUrl = `https://${shop}/admin/oauth/access_token`;
    const accessTokenPayload = {
      client_id: process.env.API_KEY,
      client_secret: process.env.API_SECRET,
      code,
    };

    request
      .post(accessTokenRequestUrl, { json: accessTokenPayload })
      .then((accessTokenResponse) => {
        const accessToken = accessTokenResponse.access_token;
        const apiRequestURL = `https://${shop}/admin/shop.json`;
        const apiRequestHeaders = {
          "X-Shopify-Access-Token": accessToken,
        };

        registerWebhook(shop, accessToken);

        request
          .get(apiRequestURL, { headers: apiRequestHeaders })
          .then((apiResponse) => {
            res.end(apiResponse);
          })
          .catch((error) => {
            res.status(error.statusCode).send(error.error.error_description);
          });
      })
      .catch((error) => {
        const errorMessage =
          error && error.error && error.error.error_description
            ? error.error.error_description
            : "Unknown error";
        res.status(error.statusCode || 500).send(errorMessage);
      });
  } else {
    res.status(400).send("Required parameters missing");
  }
});

// Create  subscribe to "Checkout" events

function registerWebhook(shop, accessToken) {
  const webhookUrl = `https://${shop}/admin/api/2024-01/webhooks.json`;
  const webhookData = {
    webhook: {
      topic: "checkouts/create",
      address: `${forwardingAddress}/webhook`,
      format: "json",
    },
  };

  request
    .post(webhookUrl, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(webhookData),
    })
    .then((response) => {
      console.log("Webhook registered successfully");
    })
    .catch((error) => {
      console.log("Error registering webhook", error.message);
    });
}

app.post("/webhook", (req, res) => {
  const checkoutData = req.body;

  if (checkoutData && checkoutData.id) {
    const orderId = checkoutData.id;
    const customerEmail = checkoutData.email;
    const totalPrice = checkoutData.total_price;
    const lineItems = checkoutData.line_items;

    res.status(200).send("Webhook Received");
  } else {
    res.status(400).send("Invalid Webhook Data");
  }
});

app.post("/webhooks/checkout/update", (req, res) => {
  const checkoutUpdateData = req.body;

  res.status(200).json({ message: "Checkout update received successfully" });
});

// Upon checkout the App shall call a fake API that will create a "Shipment". She can use something like this to fake an API (https://mockapi.io)
// The call shall pass selected shipment method, order ID, store ID, address, item dimensions

app.post("/webhooks/orders/create", async (req, res) => {
  try {
    const orderData = {
      shipmentMethod: req.body.shipmentMethod,
      orderId: req.body.orderId,
      storeId: req.body.storeId,
      address: req.body.address,
      dimensions: req.body.dimensions,
    };

    const response = await axios.post(
      "https://65d69431f6967ba8e3be3e65.mockapi.io/api/order",
      orderData
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error creating shipment:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(PORT, () => console.log(`Application listening on port ${PORT}`));
