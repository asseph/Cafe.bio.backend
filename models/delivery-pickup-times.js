class DeliveryPickUpTimes {
  constructor() {
    this.dateFormat = {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    };
    this.timeFormat = {
      hour: "numeric",
      minute: "2-digit",
    };
    this.now = new Date(); // The Date object that all other date objects are created from.
    this.dates = [];

    // Creates date object for our four time options
    for (let i = 1; i < 5; i++) {
      const hourShift = 1 + Math.floor(i / 2);
      const minutes = i % 2 === 0 ? 0 : 30;
      this.dates.push(
        new Date(
          this.now.getFullYear(),
          this.now.getMonth(),
          this.now.getDate(),
          this.now.getHours() + hourShift,
          minutes
        )
      );
    }
  }

  // Returns objects with formatted times and an ISOString which the Orders API consumes
  get options() {
    return this.dates.map((date) => {
      return {
        value: date.toISOString(),
        date: date.toLocaleDateString("en-US", this.dateFormat),
        time: date.toLocaleTimeString("en-US", this.timeFormat),
      };
    });
  }
}

module.exports = DeliveryPickUpTimes;
