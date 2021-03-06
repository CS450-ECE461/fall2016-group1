const _ = require("lodash");
const util = require("util");

const ClientError = module.exports.ClientError = function ClientError (message, status, code, path) {
  Error.captureStackTrace(this, this.constructor);

  this.name = this.constructor.name;
  this.message = message || "Client error";
  this.status = status || 400;
  this.code = code || this.status;
  this.path = path;
};

util.inherits(ClientError, Error);

module.exports.AuthenticationError = function AuthenticationError (message, code, path) {
  ClientError.apply(this, [
    message || "Authentication is required to access protected resource",
    401,
    code,
    path
  ]);
};

util.inherits(module.exports.AuthenticationError, ClientError);

module.exports.BadRequestError = function BadRequestError (message, code, path) {
  ClientError.apply(this, [
    message || "Request was not understood",
    400,
    code,
    path
  ]);
};

util.inherits(module.exports.BadRequestError, ClientError);

module.exports.DuplicateError = function DuplicateError (message, code, path) {
  ClientError.apply(this, [
    message || "Resource already exists",
    409,
    code,
    path
  ]);
};

util.inherits(module.exports.DuplicateError, ClientError);

module.exports.ForbiddenError = function ForbiddenError (message, code, path) {
  ClientError.apply(this, [
    message || "Access is not authorized for protected resource",
    403,
    code,
    path
  ]);
};

util.inherits(module.exports.ForbiddenError, ClientError);

module.exports.InvalidCredentialsError = function InvalidCredentialsError (message, code, path) {
  ClientError.apply(this, [
    message || "Credentials are invalid, cannot authenticate",
    422,
    code,
    path
  ]);
};

util.inherits(module.exports.InvalidCredentialsError, ClientError);

module.exports.NotFoundError = function NotFoundError (message, code, path) {
  ClientError.apply(this, [
    message || "Resource cannot be found",
    404,
    code,
    path
  ]);
};

util.inherits(module.exports.NotFoundError, ClientError);

module.exports.ValidationError = function ValidationError (message, code, path) {
  ClientError.apply(this, [
    message || "Validation failed",
    422,
    code,
    path
  ]);
};

util.inherits(module.exports.ValidationError, ClientError);

/**
 * Normalize an already existing Error object into a standardized, response-ready Error object.
 *
 * @param errorObject {Error} The existing error object.
 */
module.exports.normalizeError = function normalizeError (errorObject) {
  if (errorObject instanceof module.exports.ClientError) {
    return errorObject;
  }

  const name = errorObject.name;

  if (name === "ValidationError") {
    if (errorObject.errors) {
      const errors = [];

      _.each(errorObject.errors, function (error) {
        errors.push(new module.exports.ValidationError(error.message, error.code, error.path));
      });

      return errors;
    } else {
      return new module.exports.ValidationError(errorObject.message, errorObject.code, errorObject.path);
    }
  }

  if (name === "MongoError") {
    if (errorObject.code === (11000 || 11001)) {
      return new module.exports.DuplicateError(null, null, errorObject.code, errorObject.path);
    }
  }

  return new module.exports.ClientError(errorObject.message, errorObject.status || 500, errorObject.code, errorObject.path);
};
