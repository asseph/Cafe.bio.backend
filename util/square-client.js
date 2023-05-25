const { Client } = require("square");
require("dotenv").config();
const { v4: uuidv4 } = require("uuid");

const OrderInfo = require("../models/order-info");
const LocationInfo = require("../models/location-info");

const env = process.env.NODE_ENV;
const accessToken = process.env["SQUARE_ACCESS_TOKEN"];
const squareApplicationId = process.env["SQUARE_APPLICATION_ID"];

// Set Square credentials
const config = {
  accessToken,
  environment: env,
};

// Extract instances of Api that are used
// You can add additional APIs here if you so choose
const { catalogApi, locationsApi, ordersApi, paymentsApi, loyaltyApi } =
  new Client(config);

const client = new Client({
  accessToken:
    "EAAAEBlp_GIyuMyiSUQ_4yUNiSjzIuj_X4_mVHY_Fmk7zcH49SzQnv86HkDy023Q",
  environment: "sandbox", // replace with 'production' for live production data
});
const retrieveOrderAndLocation = async (orderId, locationId) => {
  const {
    result: { orders },
  } = await ordersApi.batchRetrieveOrders({
    locationId,
    orderIds: [orderId],
  });
  const {
    result: { location },
  } = await locationsApi.retrieveLocation(locationId);
  if (!orders || orders.length == 0 || !location) {
    const error = new Error("Cannot find order");
    error.status = 404;
    throw error;
  }

  return {
    orderInfo: new OrderInfo(orders[0]),
    locationInfo: new LocationInfo(location),
  };
};

const getDefaultLoyaltyProgram = async () => {
  const {
    result: { program },
  } = await loyaltyApi.retrieveLoyaltyProgram("main");
  return program;
};

async function getLoyaltyAccountByPhoneNumber(formattedPhoneNumber) {
  const {
    result: { loyaltyAccounts },
  } = await loyaltyApi.searchLoyaltyAccounts({
    query: {
      mappings: [
        {
          phoneNumber: formattedPhoneNumber,
        },
      ],
    },
  });

  return loyaltyAccounts ? loyaltyAccounts[0] : null;
}

async function getLoyaltyRewardInformation(orderInfo, loyaltyAccountId) {
  const loyaltyRewardInfo = {};
  const program = await getDefaultLoyaltyProgram();
  // Show loyalty reward option only when loyalty program is active and no reward has been redeemed for this order.
  // By default, the loyalty reward option is hidden.
  loyaltyRewardInfo.showRewardOption = false;
  if (program && program.status === "ACTIVE" && !orderInfo.rewards) {
    // Loyalty API support redeem multiple rewards for one order, this example only allows one reward for each order.
    loyaltyRewardInfo.showRewardOption = true;
    if (loyaltyAccountId) {
      // if loyaltyAccountId is specified, start list all the available rewards
      // A reward is available when:
      //  * the reward can be applied to the order item and
      //  * the point balance of the account is greater than the reward point
      try {
        const {
          result: { loyaltyAccount },
        } = await loyaltyApi.retrieveLoyaltyAccount(loyaltyAccountId);

        loyaltyRewardInfo.loyaltyAccountId = loyaltyAccountId;
        loyaltyRewardInfo.balance = loyaltyAccount.balance;
        loyaltyRewardInfo.availableRewardTiers = [];
        loyaltyRewardInfo.unavailableRewardTiers = [];

        // The category information is not in the orderInfo, so we need get the categoryId from the item
        // which is related to the current item variation object.
        const {
          result: { relatedObjects },
        } = await catalogApi.retrieveCatalogObject(
          orderInfo.lineItems[0].catalogObjectId,
          true
        );
        const relatedItems = relatedObjects.filter(
          (object) => object.type === "ITEM"
        );
        const eligibleCategoryId =
          relatedItems.length > 0 ? relatedItems[0].itemData.categoryId : null;
        // get the catalog item variation object id associated with this order in order to
        // check if the item based reward can apply to the order
        const eligibleItemId = orderInfo.lineItems[0].catalogObjectId;
        for (const rewardTier of program.rewardTiers) {
          if (
            rewardTier.points <= loyaltyAccount.balance &&
            (rewardTier.definition.scope === "ORDER" ||
              (rewardTier.definition.scope === "ITEM_VARIATION" &&
                rewardTier.definition.catalogObjectIds.indexOf(
                  eligibleItemId
                ) >= 0) ||
              (rewardTier.definition.scope === "CATEGORY" &&
                eligibleCategoryId &&
                rewardTier.definition.catalogObjectIds.indexOf(
                  eligibleCategoryId
                ) >= 0))
          ) {
            // In this example, the reward is available when:
            // loyalty account balance is enough to redeem this reward AND
            // the reward is either a order level reward or can be applied to this order item
            loyaltyRewardInfo.availableRewardTiers.push(rewardTier);
          } else {
            loyaltyRewardInfo.unavailableRewardTiers.push(rewardTier);
          }
        }
      } catch (error) {
        if (error.status === 404) {
          // If the loyalty account is not found, we mark this status so that the UI can show the account not found status.
          loyaltyRewardInfo.accountNotFound = true;
        } else {
          // Unknonw error, throw to display error page.
          throw error;
        }
      }
    }
  }

  return loyaltyRewardInfo;
}

async function getLoyaltyPointAccumulateInformation(orderId) {
  const program = await getDefaultLoyaltyProgram();
  const loyaltyAccumulateInfo = {};

  // By default, isEligibleForAccruePoint is set to false to hide the loyalty point accumulate option.
  loyaltyAccumulateInfo.isEligibleForAccruePoint = false;

  // Add loyalty point accumulate only when the program is activated
  if (program && program.status === "ACTIVE") {
    // Check if this order is eligible for accumulating loyalty point, we check two things:
    // 1. If the order has had loyalty points accumulated
    // 2. If #1 is false, calculate how many points should be earned and check if the order amount meet the minimum accumulating amount.

    // First check if this order has had points accumulated
    // Filter the events that is related to accumulate point
    const {
      result: { events },
    } = await loyaltyApi.searchLoyaltyEvents({
      query: {
        filter: {
          orderFilter: {
            orderId: orderId,
          },
          typeFilter: {
            types: ["ACCUMULATE_POINTS"],
          },
        },
      },
    });

    // We skip accruing point if a loyalty accumulate point event has been found with the orderId,
    // which means this order has been used to accumulated points for an loyalty account,
    //
    // Otherwise, we check if the order amount is big enough to accumulate at least 1 point
    if (!events || events.length == 0) {
      // There is no event indicating the point is accumulated for this order.
      // Calculate how many points should be earned
      const {
        result: { points },
      } = await loyaltyApi.calculateLoyaltyPoints(program.id, {
        orderId: orderId,
      });
      // Set isEligibleForAccruePoint to true when there is more than 1 point to be accumulated
      loyaltyAccumulateInfo.isEligibleForAccruePoint = points > 0;
      // Set the eligiblePoint so that UI can show how many points can be accumulated
      loyaltyAccumulateInfo.eligiblePoint = points;
    } else {
      // The loyalty point has been accumulated from this current order
      // Set the points that is accumulated
      loyaltyAccumulateInfo.accumulatePoints = events[0].accumulatePoints;
    }
  }

  return loyaltyAccumulateInfo;
}

const getPromotionInformation = async () => {
  // console.log(client.catalogApi)
  // console.log(client[programId]);
  try {
    const response = await client.catalogApi.listCatalog({
      types: ["DISCOUNT"],
      query: '{"sorted_attribute_name":"updated_at","sort_order":"DESC"}',
      cursor: "abc123", // add a valid cursor value here
    });
    console.log(response.result.objects);
    console.log(response.result.cursor);
    return response.result;
  } catch (error) {
    console.log(error);
  }
};

const createCatalogDiscount = async() => {
    try {
      const response = await catalogApi.upsertCatalogObject({
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
    
      console.log(response.result);
    } catch(error) {
      console.log(error);
    }
}  

// Create a promotion for buy one get one free
const getpromotionDiscount = async () => {
  const discountApi = new squareConnect.DiscountsApi();
  const discount = {
    name: "Buy one get one free",
    discount_type: "FIXED_PERCENTAGE",
    percentage_discount: "100",
    max_discount_money: {
      amount: 0,
      currency: "USD",
    },
    min_purchase_money: {
      amount: 1000,
      currency: "USD",
    },
    valid_for: {
      discount_scope: "ORDER",
      item_ids: ["PRODUCT_1_ID"],
    },
  };
  const rule = {
    name: "Buy one get one free rule",
    discount_id: "YOUR_DISCOUNT_ID",
    rule_type: "QUANTITY",
    min_purchase_quantity: 2,
    max_purchase_quantity: 2,
  };

  discountApi
    .createDiscount(discount)
    .then((response) => {
      rule.discount_id = response.discount.id;
      return discountApi.createDiscountRule(rule);
    })
    .then((response) => {
      console.log(response);
    })
    .catch((error) => {
      console.log(error);
    });
};

// Makes API instances and util functions importable
module.exports = {
  squareApplicationId,
  catalogApi,
  locationsApi,
  paymentsApi,
  ordersApi,
  loyaltyApi,
  retrieveOrderAndLocation,
  getDefaultLoyaltyProgram,
  getLoyaltyAccountByPhoneNumber,
  getLoyaltyRewardInformation,
  getLoyaltyPointAccumulateInformation,
  getPromotionInformation,
  getpromotionDiscount
};
