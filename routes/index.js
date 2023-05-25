const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { catalogApi, locationsApi, ordersApi, getDefaultLoyaltyProgram, loyaltyApi } = require("../util/square-client");

const router = express.Router();
const CatalogList = require("../models/catalog-list");
const LocationInfo = require("../models/location-info");

router.use("/checkout", require("./checkout"));
router.use("/order-confirmation", require("./order-confirmation"));

router.get("/", async (req, res, next) => {

  // Set to retrieve ITEM and IMAGE CatalogObjects
  const types = "ITEM,IMAGE"; // To retrieve TAX or CATEGORY objects add them to types
  try {
    // Retrieves locations in order to display the store name
    const {
      result: { locations },
    } = await locationsApi.listLocations();
    // Get CatalogItem and CatalogImage object
    const {
      result: { objects },
    } = await catalogApi.listCatalog(undefined, types);
 
    const program = await getDefaultLoyaltyProgram();

    // Renders index view, with catalog and location information
    res.render("index", {
      items: new CatalogList(objects).items,
      locationInfo: new LocationInfo(locations[0]), // take the first location for the sake of simplicity.
      programStatus: program.status,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/create-promotion", async (req, res, next) => {
  const { promoTitle, dateStart, dateEnd, loyaltyProgramId } = req.body;
  try {
    const loyaltyPromotionRequestBody = {
      idempotencyKey: uuidv4(), // Unique identifier for request
      promotion: {
        name: promoTitle,
        incentive: {
          type: "POINTS_MULTIPLIER",
          pointsMultiplierData: {
            pointsMultiplier: 3,
          },
        },
        availableTime: {
          timePeriods: ["BEGIN:VEVENT\nDTSTART:20220816T160000\nDURATION:PT2H\nRRULE:FREQ=WEEKLY;BYDAY=TU\nEND:VEVENT"],
        },
        triggerLimit: {
          times: 1,
          interval: "DAY",
        },
        minimumSpendAmountMoney: {
          amount: BigInt(2000),
          currency: "USD",
        },
        qualifyingCategoryIds: ["XTQPYLR3IIU9C44VRCB3XD12"],
        startedAt: dateStart,
        canceledAt: dateEnd,
      },
    };
    const {
      result: { promotion },
    } = await loyaltyApi.createLoyaltyPromotion(loyaltyProgramId, loyaltyPromotionRequestBody);

    res.send(promotion.id);
  } catch (err) {
    next(err);
  }
});

router.post("/create-order", async (req, res, next) => {
  const { itemVarId, itemId, itemQuantity, locationId } = req.body;
  
  try {
    const orderRequestBody = {
      idempotencyKey: uuidv4(), // Unique identifier for request
      order: {
        locationId,
        lineItems: [
          {
            quantity: itemQuantity,
            catalogObjectId: itemVarId, // Id for CatalogItem object
          },
        ],
      },
    };
    // Apply the taxes that's related to this catalog item.
    // Order API doesn't calculate the tax automatically even if you have apply the tax to the catalog item
    // You must add the tax yourself when create order.
    const {
      result: { object },
    } = await catalogApi.retrieveCatalogObject(itemId);
    if (!!object.itemData.taxIds && object.itemData.taxIds.length > 0) {
      orderRequestBody.order.taxes = [];
      for (let i = 0; i < object.itemData.taxIds.length; i++) {
        orderRequestBody.order.taxes.push({
          catalogObjectId: object.itemData.taxIds[i],
          scope: "ORDER",
        });
      }
    }
    const {
      result: { order },
    } = await ordersApi.createOrder(orderRequestBody);
    res.redirect(`/checkout/choose-delivery-pickup?orderId=${order.id}&locationId=${locationId}`);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
