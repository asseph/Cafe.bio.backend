class LoyaltyPromotion {
  constructor(loyaltyPromotionObj) {
    this.loyaltyPromotionObj = loyaltyPromotionObj;
  }

  // Returns the id of the loyalty promotion
  get id() {
    return this.loyaltyPromotionObj.id;
  }

  // Returns the name of the loyalty promotion
  get name() {
    return this.loyaltyPromotionObj.name;
  }

  // Returns the incentive of the loyalty promotion
  get incentive() {
    return this.loyaltyPromotionObj.incentive;
  }

  // Returns the available time of the loyalty promotion
  get availableTime() {
    return this.loyaltyPromotionObj.availableTime;
  }

  // Returns the trigger limit of the loyalty promotion
  get triggerLimit() {
    return this.loyaltyPromotionObj.triggerLimit;
  }

  // Returns the minimum mpend mmount money ids of the loyalty promotion
  get minimumSpendAmountMoney() {
    return this.loyaltyPromotionObj.minimumSpendAmountMoney;
  }

  // Returns the qualifying item variation ids of the loyalty promotion
  get qualifyingItemVariationIds() {
    return this.loyaltyPromotionObj.qualifyingItemVariationIds;
  }

  // Returns the qualifying category ids of the loyalty promotion
  get qualifyingCategoryIds() {
    return this.loyaltyPromotionObj.qualifyingCategoryIds;
  }

  // Returns the status of the loyalty promotion
  get status() {
    return this.loyaltyPromotionObj.status;
  }

  // Returns the created Time of the loyalty promotion
  get createdAt() {
    return this.loyaltyPromotionObj.createdAt;
  }

  // Returns the canceled Time of the loyalty promotion
  get canceledAt() {
    return this.loyaltyPromotionObj.canceledAt;
  }

  // Returns the updated Time of the loyalty promotion
  get updatedAt() {
    return this.loyaltyPromotionObj.updatedAt;
  }

  // Returns the loyalty program id of the loyalty promotion
  get loyaltyProgramId() {
    return this.loyaltyPromotionObj.loyaltyProgramId;
  }
}

module.exports = LoyaltyPromotion;
