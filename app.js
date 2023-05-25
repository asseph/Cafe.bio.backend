const express = require("express");
const path = require("path");
const logger = require("morgan");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");

const routes = require("./routes/index");
const app = express();

// Node creates cashed instance of square-client, on initial load
require("./util/square-client");

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')))
app.use(logger("dev"));
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: false,
  })
);
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, ".well-known")));

app.use("/", routes);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

// error handlers
// For simplicity, we print all error information
app.use(function (err, req, res, next) {
  res.status(err.status || 500);
  res.render("error", {
    status: err.status,
    message: err.message,
    // If it is a response error then format the JSON string, if not output the error
    error: err.errors ? JSON.stringify(err.errors, null, 4) : err.stack,
  });
});

module.exports = app;
