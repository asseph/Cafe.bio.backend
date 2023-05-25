const express = require("express");
const url = require("url");
const { v4: uuidv4 } = require("uuid");
const {
  catalogApi,
  squareApplicationId,
  retrieveOrderAndLocation,
  getLoyaltyAccountByPhoneNumber,
  getLoyaltyRewardInformation,
  getDefaultLoyaltyProgram,
  getpromotionDiscount,
  ordersApi,
  paymentsApi,
  loyaltyApi,
  locationsApi,
} = require("../util/square-client");
const DeliveryPickUpTimes = require("../models/delivery-pickup-times");

const router = express.Router();

const { Client } = require("square");

const client = new Client({
  accessToken:
    "EAAAEBlp_GIyuMyiSUQ_4yUNiSjzIuj_X4_mVHY_Fmk7zcH49SzQnv86HkDy023Q",
  environment: "sandbox",
});

router.get("/choose-delivery-pickup", async (req, res, next) => {
  const { orderId, locationId } = req.query;
  try {
    const { orderInfo, locationInfo } = await retrieveOrderAndLocation(
      orderId,
      locationId
    );
    res.render("checkout/choose-delivery-pickup", {
      locationInfo,
      orderInfo,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/choose-delivery-pickup", async (req, res, next) => {
  const { orderId, locationId, fulfillmentType } = req.body;
  if (fulfillmentType === "PICKUP") {
    res.redirect(
      `/checkout/add-pickup-details?orderId=${orderId}&locationId=${locationId}`
    );
  } else {
    // if (fulfillmentType === "SHIPMENT")
    res.redirect(
      `/checkout/add-delivery-details?orderId=${orderId}&locationId=${locationId}`
    );
  }
});

router.get("/add-pickup-details", async (req, res, next) => {
  const { orderId, locationId } = req.query;
  try {
    const { orderInfo, locationInfo } = await retrieveOrderAndLocation(
      orderId,
      locationId
    );
    res.render("checkout/add-pickup-details", {
      locationInfo,
      expectedPickUpTimes: new DeliveryPickUpTimes(),
      orderInfo,
      idempotencyKey: uuidv4(),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/add-pickup-details", async (req, res, next) => {
  const {
    orderId,
    locationId,
    idempotencyKey,
    pickupName,
    pickupEmail,
    pickupNumber,
    pickupTime,
  } = req.body;
  try {
    const {
      result: { orders },
    } = await ordersApi.batchRetrieveOrders({
      locationId,
      orderIds: [orderId],
    });
    const order = orders[0];
    await ordersApi.updateOrder(order.id, {
      order: {
        locationId,
        fulfillments: [
          {
            // replace fulfillment if the order is updated again, otherwise add a new fulfillment details.
            uid:
              order.fulfillments && order.fulfillments[0]
                ? order.fulfillments[0].uid
                : undefined,
            type: "PICKUP", // pickup type is determined by the endpoint
            state: "PROPOSED",
            pickupDetails: {
              recipient: {
                displayName: pickupName,
                phoneNumber: pickupNumber,
                email: pickupEmail,
              },
              pickupAt: pickupTime,
            },
          },
        ],
        // Add an 10% Curbside Pickup promotion discount to the order
        discounts: [
          {
            // replace discount if the order is updated again, otherwise add a new discount.
            uid:
              order.discounts && order.discounts[0]
                ? order.discounts[0].uid
                : undefined,
            name: "Curbside Pickup Promotion",
            percentage: "10",
            scope: "ORDER",
          },
        ],
        version: order.version,
        idempotencyKey,
      },
    });
    res.redirect(
      `/checkout/payment?orderId=${order.id}&locationId=${order.locationId}`
    );
  } catch (error) {
    next(error);
  }
});

router.get("/add-delivery-details", async (req, res, next) => {
  const { orderId, locationId } = req.query;
  try {
    const { orderInfo, locationInfo } = await retrieveOrderAndLocation(
      orderId,
      locationId
    );
    res.render("checkout/add-delivery-details", {
      locationInfo,
      expectedDeliveryTimes: new DeliveryPickUpTimes(),
      orderInfo,
      idempotencyKey: uuidv4(),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/add-delivery-details", async (req, res, next) => {
  const {
    orderId,
    locationId,
    idempotencyKey,
    deliveryName,
    deliveryEmail,
    deliveryNumber,
    deliveryTime,
    deliveryAddress,
    deliveryCity,
    deliveryState,
    deliveryPostal,
  } = req.body;
  try {
    const {
      result: { orders },
    } = await ordersApi.batchRetrieveOrders({
      locationId,
      orderIds: [orderId],
    });
    const order = orders[0];

    // get the currency for the location
    const locationResponse = await locationsApi.retrieveLocation(locationId);
    const currency = locationResponse.result.location.currency;

    await ordersApi.updateOrder(order.id, {
      order: {
        locationId,
        fulfillments: [
          {
            // replace fulfillment if the order is updated again, otherwise add a new fulfillment details.
            uid:
              order.fulfillments && order.fulfillments[0]
                ? order.fulfillments[0].uid
                : undefined,
            type: "SHIPMENT", // SHIPMENT type is determined by the endpoint
            state: "PROPOSED",
            shipmentDetails: {
              recipient: {
                displayName: deliveryName,
                phoneNumber: deliveryNumber,
                email: deliveryEmail,
                address: {
                  addressLine1: deliveryAddress,
                  administrativeDistrictLevel1: deliveryState,
                  locality: deliveryCity,
                  postalCode: deliveryPostal,
                },
              },
              expectedShippedAt: deliveryTime,
            },
          },
        ],
        // Add an arbitratry $2.00 taxable delivery fee to the order
        serviceCharges: [
          {
            // replace serviceCharges if the order is updated again, otherwise add a new serviceCharge.
            uid:
              order.serviceCharges && order.serviceCharges[0]
                ? order.serviceCharges[0].uid
                : undefined,
            name: "delivery fee",
            amountMoney: {
              amount: 200,
              currency: currency,
            },
            taxable: true,
            calculationPhase: "SUBTOTAL_PHASE",
          },
        ],
        version: order.version,
        idempotencyKey,
      },
    });
    res.redirect(
      `/checkout/payment?orderId=${order.id}&locationId=${order.locationId}`
    );
  } catch (error) {
    next(error);
  }
});

router.get("/payment", async (req, res, next) => {
  const { orderId, locationId, loyaltyAccountId } = req.query;
  try {
    const { orderInfo, locationInfo } = await retrieveOrderAndLocation(
      orderId,
      locationId
    );
    if (!orderInfo.hasFulfillments) {
      // if the order doesn't have any fulfillment informaiton, fallback to previous step to collect fulfillment information
      res.redirect(
        `/checkout/choose-delivery-pickup?orderId=${orderId}&locationId=${locationId}`
      );
    }

    // collect loyalty account and reward tiers information so that the page can render reward options for customer to choose
    const loyaltyRewardInfo = await getLoyaltyRewardInformation(
      orderInfo,
      loyaltyAccountId
    );

    

    res.render("checkout/payment", {
      orderInfo,
      locationInfo,
      loyaltyRewardInfo,
      applicationId: squareApplicationId,
      idempotencyKey: uuidv4(), // Payments api has 45 max length limit on idempotencyKey
    });
     
  } catch (error) {
    next(error);
  }
});

router.post("/payment", async (req, res, next) => {
  const { orderId, locationId, idempotencyKey, token } = req.body;

  try {
    // get the latest order information in case the price is changed from a different session
    const {
      result: { orders },
    } = await ordersApi.batchRetrieveOrders({
      locationId,
      orderIds: [orderId],
    });
    const order = orders[0];
    if (order.totalMoney.amount > 0) {
      try {
        // Payment can only be made when order amount is greater than 0
        const {
          result: { payment },
        } = await paymentsApi.createPayment({
          sourceId: token, // Card nonce created by the payment form
          idempotencyKey,
          amountMoney: order.totalMoney, // Provides total amount of money and currency to charge for the order.
          orderId: order.id, // Order that is associated with the payment
        });

        const result = JSON.stringify(
          payment,
          (key, value) => {
            return typeof value === "bigint" ? parseInt(value) : value;
          },
          4
        );
        res.json(result);
      } catch (error) {
        res.json(error.result);
      }
    } else {
      try {
        // Settle an order with a total of 0.
        const {
          result: { payment },
        } = await ordersApi.payOrder(orderId, {
          idempotencyKey,
        });

        const result = JSON.stringify(
          payment,
          (key, value) => {
            return typeof value === "bigint" ? parseInt(value) : value;
          },
          4
        );
        res.json(result);
      } catch (error) {
        res.json(error.result);
      }
    }
  } catch (error) {
    next(error);
  }
});

router.post("/add-loyalty-account", async (req, res, next) => {
  const { orderId, locationId, phoneNumber } = req.body;
  try {
    const formattedPhoneNumber = `+1${phoneNumber}`;
    const currentLoyaltyAccount = await getLoyaltyAccountByPhoneNumber(
      formattedPhoneNumber
    );
    if (currentLoyaltyAccount) {
      // Get the referrer path and redirect back with the loyalty account id
      const referrerPath = url.parse(req.get("referrer")).pathname;
      res.redirect(
        `${referrerPath}?orderId=${orderId}&locationId=${locationId}&loyaltyAccountId=${
          currentLoyaltyAccount && currentLoyaltyAccount.id
        }`
      );
    } else {
      // Go back to confirmation page
      res.redirect(req.get("referrer"));
    }
  } catch (error) {
    next(error);
  }
});

router.post("/redeem-loyalty-reward", async (req, res, next) => {
  const {
    orderId,
    locationId,
    idempotencyKey,
    loyaltyAccountId,
    rewardTierId,
  } = req.body;
  try {
    // apply the specified reward with `rewardTierId` to the order
    await loyaltyApi.createLoyaltyReward({
      reward: {
        orderId,
        loyaltyAccountId,
        rewardTierId,
      },
      idempotencyKey,
    });

    // Get the referrer path and redirect back with the loyalty account id
    const referrerPath = url.parse(req.get("referrer")).pathname;
    res.redirect(
      `${referrerPath}?orderId=${orderId}&locationId=${locationId}&loyaltyAccountId=${loyaltyAccountId}`
    );
  } catch (error) {
    next(error);
  }
});

<<<<<<< HEAD
router.get("/fetch-promotions", async (req, res, next) => {
  const program = await getDefaultLoyaltyProgram();
 
  // If the desired program is found, retrieve the list of rewards for that program
    if (program) {
      
      try {
        const response = await loyaltyApi.listLoyaltyPromotions(program.id);
         res.send(response.result)
        // console.log(response.result);
      } catch(error) {
        console.log(error);
      }
    } else {
      console.log("No matching program found.");
    }
  
});






=======
// Create a Discount catalog of products
router.post("/create-discount", async (req, res, next) => {
  try {
    const {result: {catalogObject} }  = await catalogApi.upsertCatalogObject({
      idempotencyKey: uuidv4(),
      object: {
        type: 'DISCOUNT',
        id: '#bogoDiscount',
        discountData: {
          name: 'Buy one get one free',
          percentage: '100'
        }
      }
    });
  
    const result = JSON.stringify(
      catalogObject,
      (key, value) => {
        return typeof value === "bigint" ? parseInt(value) : value;
      },
      4
    );
    res.json(result);
    // console.log(result);
  } catch(error) {
    console.log(error);
  }
});

router.post("/create-category-items", async(req, res, next) => {
  try {
    const response = await catalogApi.upsertCatalogObject({
      idempotencyKey:  uuidv4(),
      object: {
        type: 'CATEGORY',
        id: '#cool',
        categoryData: {
          name: 'Cool'
        }
      }
    });
  
    console.log(response.result);
  } catch(error) {
    console.log(error);
  }
})

router.post("/create-product-set", async(req, res, next) => {
  try {
    const response = await catalogApi.upsertCatalogObject({
      idempotencyKey: uuidv4(),
      object: {
        type: 'PRODUCT_SET',
        id: '#OneFreePizza',
        productSetData: {
          productIdsAny: [
            'QK2L7N7OECN3MNYL7FP4L6OF'
          ],
          quantityExact: 1
        }
      }
    });
  
    console.log(response.result);
  } catch(error) {
    console.log(error);
  }
})

router.post("/search-catalogobject", async(req, res, next) => {
  try {
    const response = await catalogApi.searchCatalogObjects({
      objectTypes: [
        'CATEGORY'
      ],
      query: {
        exactQuery: {
          attributeName: 'name',
          attributeValue: 'Beer'
        }
      }
    });
  
    console.log(response.result);
  } catch(error) {
    console.log(error);
  }
})

router.post("/create-rulematching", async(req, res, next) => {
    try {
      const response = await client.catalogApi.upsertCatalogObject({
        idempotencyKey: uuidv4(),
        object: {
          type: 'PRODUCT_SET',
          id: '#MatchProductSet',
          productSetData: {
            productIdsAll: [
              'AIHGGGGYPXSLJMI24YB7QF4J',
              '6OX4QNESVLCEFYOV6CQ64WJ7'
            ],
            quantityExact: 1
          }
        }
      });
    
      console.log(response.result);
    } catch(error) {
      console.log(error);
    }
})

router.post("/search-catalogobject", async(req, res, next) => {
try {
  const response = await client.catalogApi.batchUpsertCatalogObjects({
    idempotencyKey: '{UNIQUE_KEY}',
    batches: [
      {
        objects: [
          {
            type: 'DISCOUNT',
            id: '#BOGODiscount',
            discountData: {
              name: '\"Buy one get one free\"',
              percentage: '100'
            }
          },
          {
            type: 'PRODUCT_SET',
            id: '#AnyTwoBeers',
            productSetData: {
              productIdsAny: [
                'GXFTT46M3RCBR6LV54HKALC6'
              ],
              quantityExact: 2
            }
          },
          {
            type: 'PRODUCT_SET',
            id: '#OneFreePizza',
            productSetData: {
              productIdsAny: [
                'HYEST56N3RDBR6LV57AGALC5'
              ],
              quantityExact: 1
            }
          },
          {
            type: 'PRODUCT_SET',
            id: '#MatchProductSet',
            productSetData: {
              productIdsAll: [
                '#TwoBeers',
                '#OneFreePizza'
              ],
              quantityExact: 1
            }
          }
        ]
      }
    ]
  });

  console.log(response.result);
} catch(error) {
  console.log(error);
}
});

// Create batch discount
router.post("/create-batch-discount", async(req, res, next) => {
  try {
    const response = await catalogApi.batchUpsertCatalogObjects({
      idempotencyKey: uuidv4(),
      batches: [
        {
          objects: [
            {
              type: 'DISCOUNT',
              id: '#BOGODiscount',
              discountData: {
                name: '\"Buy one get one free\"',
                percentage: '100'
              }
            },
            {
              type: 'PRODUCT_SET',
              id: '#AnyTwoBeers',
              productSetData: {
                productIdsAny: [
                  'AIHGGGGYPXSLJMI24YB7QF4J'
                ],
                quantityExact: 1
              }
            },
            {
              type: 'PRODUCT_SET',
              id: '#OneFreePizza',
              productSetData: {
                productIdsAny: [
                  '6OX4QNESVLCEFYOV6CQ64WJ7'
                ],
                quantityExact: 1
              }
            },
            {
              type: 'PRODUCT_SET',
              id: '#MatchProductSet',
              productSetData: {
                productIdsAll: [
                  '#AnyTwoBeers',
                  '#OneFreePizza'
                ],
                quantityExact: 1
              }
            }
          ]
        }
      ]
    });
  
    console.log(response.result);
  } catch(error) {
    console.log(error);
  }
});

// Create pricing rule
router.post("/create-pricing-rule", async(req, res, next) => {
  try {
    const response = await client.catalogApi.upsertCatalogObject({
      idempotencyKey: uuidv4(),
      object: {
        type: 'PRICING_RULE',
        id: '#BOGOPricingRule',
        pricingRuleData: {
          name: 'BOGO Rule for Buy Two Beers and Get One Free Pizza',
          discountId: '4PHXMF4K3GM2X2KL7QY5DGY7',
          matchProductsId: 'TYOJXDCHIRSN33WRUG2ZV7XI',
          excludeProductsId: 'JJIX72HPDSV7LGO53TM3OFAW'
        }
      }
    });
  
    console.log(response.result);
  } catch(error) {
    console.log(error);
  }
});

router.get("/fetch-promotion", async (req, res, next) => {
  // Retrieve the list of loyalty programs
  const program = await getDefaultLoyaltyProgram();

  // If the desired program is found, retrieve the list of rewards for that program
  if (matchingProgram) {
    client.loyaltyApi
      .listLoyaltyRewards(matchingProgram.id)
      .then((rewardData) => {
        // Find the reward with the desired promotion ID
        const matchingReward = rewardData.result.find(
          (reward) =>
            reward.reward_type === "DISCOUNT" &&
            reward.discount.discount_type === "FIXED_AMOUNT" &&
            reward.discount.amount_money.amount === 500
        ); // If the desired reward is found, log the details to the console
        if (matchingReward) {
          console.log(`Promotion ID: ${matchingReward.id}`);
          console.log(
            `Discount Amount: ${matchingReward.discount.amount_money.amount}`
          );
          console.log(`Start Date: ${matchingReward.valid_from}`);
          console.log(`End Date: ${matchingReward.expires_at}`);
        } else {
          console.log("No matching reward found.");
        }
      })
      .catch((error) => {
        console.error(error);
      });
  } else {
    console.log("No matching program found.");
  }
});
>>>>>>> 3837032ec5954bbeb99a103d8320a956d8bde831

module.exports = router;
