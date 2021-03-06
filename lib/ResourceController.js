const blueprint = require("@onehilltech/blueprint");
const Mongoose = require("mongoose");
const BaseController = blueprint.BaseController;
const util = require("util");
const _ = require("lodash");
const debug = require("debug")("ResourceController");
const async = require("async");
const pluralize = require("pluralize");
const errors = require("./errors");

/**
 * @class ResourceController
 *
 * @param options {Object} Options for the ResourceController, such as 'model'.
 * @constructor
 */

function ResourceController (options) {
  debug("new");
  BaseController.call(this);

  options = options || {};

  /* istanbul ignore if  */
  if (!options.model) {
    throw new Error("'model' property must be defined in 'options' parameter");
  }

  this.model = options.model;

  this.hooks = {
    /**
     * By default, hooks are executed synchronously in this order:
     * - normalize.<operation>
     * - normalize.any
     * - authorize.any
     * - authorize.<operation>
     * - pre.any
     * - pre.<operation>
     * - execute.<operation>
     * - post.<operation>
     * - post.any
     *
     * Handlers are compiled in `compileHandlers()` method.
     */
    normalize: {
      create: [],
      get: [],
      getAll: [],
      update: [],
      delete: [],
      any: []
    },

    authorize: {
      any: [],
      create: [],
      get: [],
      getAll: [],
      update: [],
      delete: []
    },

    pre: {
      any: [],
      create: [],
      get: [],
      getAll: [],
      update: [],
      delete: []
    },

    execute: {
      create: this._create,
      get: this._get,
      getAll: this._getAll,
      update: this._update,
      delete: this._delete
    },

    post: {
      create: [],
      get: [],
      getAll: [],
      update: [],
      delete: [],
      any: []
    }
  };

  const self = this;
  _.each(Object.keys(this.hooks), function (key) {
    debug("key: " + key);
    if (options[key]) {
      debug("found %s in options", key);
      _.defaultsDeep(self.hooks[key], options[key]);
    }
  });

  this.plural = options.plural || pluralize.plural(this.model.modelName);
  debug("plural of " + this.model.modelName + " is " + this.plural);

  this.singular = options.singular || pluralize.singular(this.plural);
  debug("singular of " + this.model.modelName + " is " + this.singular);

  this.uniques = options.uniques || [];

  if (this.uniques.length === 0) {
    _.each(this.model.schema.paths, function (definition) {
      if (definition.path === "_id") {
        self.uniques.unshift(definition.path);
      } else if (definition.options.index && definition.options.index.unique) {
        self.uniques.push(definition.path);
      } else if (definition.options.unique) {
        self.uniques.push(definition.path);
      }
    });
  }

  debug("uniques: " + this.uniques);

  this.sensitivePaths = options.sensitivePaths || [];

  if (this.sensitivePaths.length === 0) {
    _.each(this.model.schema.paths, function (definition) {
      if (definition.path === ("password" || "secret")) {
        self.sensitivePaths.push(definition.path);
      }
    });
  }

  this.sensitivePaths.push("__v");

  this.defaultProjection = {};

  _.each(this.model.schema.paths, function (definition) {
    if (self.sensitivePaths.indexOf(definition.path) === -1) {
      self.defaultProjection[definition.path] = 1;
    }
  });

  debug("default projection: " + JSON.stringify(this.defaultProjection));
}

util.inherits(ResourceController, BaseController);

ResourceController.prototype.__defineGetter__("resourceId", function () {
  return "id";
});

ResourceController.prototype.create = function () {
  return this.task("create");
};

ResourceController.prototype.get = function () {
  return this.task("get");
};

ResourceController.prototype.getAll = function () {
  return this.task("getAll");
};

ResourceController.prototype.update = function () {
  return this.task("update");
};

ResourceController.prototype.delete = function () {
  return this.task("delete");
};

ResourceController.prototype.compileHandlers = function (operation) {
  const hooks = this.hooks;

  return _.concat(
    hooks.normalize[operation],
    hooks.normalize.any,
    hooks.authorize.any,
    hooks.authorize[operation],
    hooks.pre.any,
    hooks.pre[operation],
    hooks.execute[operation],
    hooks.post[operation],
    hooks.post.any
  );
};

ResourceController.prototype.task = function (operation) {
  const handlers = this.compileHandlers(operation);

  const self = this;

  return function executeTasks (request, response, next) {
    async.eachSeries(handlers, function (listener, callback) {
      listener.apply(self, [request, response, callback]);
    }, function handleTaskError (error) {
      if (error) {
        return next(error);
      }
      return next();
    });
  };
};

ResourceController.prototype.findOneByUnique = function (value, callback) {
  const self = this;

  try {
    value = Mongoose.Types.ObjectId(value);
  } catch (err) {
    debug("findOneByUnique: value is not ObjectId");
  }

  let len = this.uniques.length;
  _.find(this.uniques, function (field) {
    const criteria = {};
    criteria[field] = value;

    self.model.findOne(criteria, this.defaultProjection, function (error, result) {
      if (error && !(error.name === "CastError")) {
        return callback(errors.normalizeError(error));
      }

      if (result) {
        return callback(null, result);
      } else {
        len = len - 1;

        if (len === 0) {
          return callback(null, null);
        }
      }
    });
  });
};

ResourceController.prototype._create = function (request, response, next) {
  const self = this;

  this.model.create(request.body[this.singular], function (error, result) {
    if (error) {
      return next(errors.normalizeError(error));
    }

    self.findOneByUnique(result._id, function (error, result2) {
      /* istanbul ignore if  */
      if (error) {
        return next(errors.normalizeError(error));
      }

      response.status(201);

      const doc = {};
      doc[self.singular] = result2;

      response.format({
        default: function () {
          response.json(doc);
        }
      });

      return next();
    });
  });
};

ResourceController.prototype._get = function (request, response, next) {
  const self = this;
  this.findOneByUnique(request.params.id, function (error, result) {
    /* istanbul ignore if  */
    if (error) {
      return next(error);
    }

    if (!result) {
      return next(new errors.NotFoundError());
    }

    const doc = {};
    doc[self.singular] = result;

    response.format({
      default: function () {
        response.status(200).json(doc);
      }
    });

    return next();
  });
};

ResourceController.prototype._getAll = function (request, response, next) {
  if (request.query.limit) {
    if (request.query.limit > 100) {
      const error = new Error("'limit' must be less than 100");
      error.status = 400;
      return next(error);
    }
  }

  const options = {
    skip: 0,
    limit: 20,
    sort: null
  };

  _.defaultsDeep(options, _.pick(request.query, ["skip", "limit", "sort"]));
  const conditions = _.omit(request.query, ["skip", "limit", "sort"]);

  for (let i = 0; i < this.sensitivePaths.length; i++) {
    if (request.query.hasOwnProperty(this.sensitivePaths[i])) {
      const result = {
        count: 0,
        skip: options.skip,
        limit: options.limit
      };

      result[this.plural] = [];

      response.format({
        default: function () {
          // noinspection JSReferencingMutableVariableFromClosure
          response.status(200).json(result);
        }
      });

      return next();
    }
  }

  // Take advantage of mongoDB $sort + $limit memory optimization

  const aggParams = [];
  if (conditions) { aggParams.push({ $match: conditions }); }

  if (options.sort) {
    aggParams.push({ $sort: options.sort });
  } else if (this.model.schema.paths["updateAt"]) {
    aggParams.push({ $sort: { "updateAt": -1 } });
  }

  if (options.limit > 0) { aggParams.push({ $limit: options.limit }); }
  aggParams.push({ $project: this.defaultProjection });

  const self = this;
  this.model.aggregate(aggParams).exec(function (error, results) {
    /* istanbul ignore if  */
    if (error) {
      return next(errors.normalizeError(error));
    }

    const result = {
      count: Object.keys(results).length,
      skip: options.skip,
      limit: options.limit
    };

    result[self.plural] = results;

    response.format({
      default: function () {
        response.status(200).json(result);
      }
    });

    return next();
  });
};

ResourceController.prototype._update = function (request, response, next) {
  const self = this;

  this.findOneByUnique(request.params.id, function (error, result) {
    /* istanbul ignore if  */
    if (error) { return next(errors.normalizeError(error)); }
    if (!result) { return next(errors.normalizeError(error)); }

    // Merge request body into document and save
    Object.assign(result, request.body[self.singular]);
    result.save(function (error) {
      if (error) { return next(errors.normalizeError(error)); }
      return self._get(request, response, next);
    });
  });
};

ResourceController.prototype._delete = function (request, response, next) {
  const self = this;
  this.findOneByUnique(request.params.id, function (error, result) {
    if (error) {
      /* istanbul ignore if  */
      return next(errors.normalizeError(error));
    }

    if (!result) {
      return next(new errors.NotFoundError());
    }

    self.model.remove({_id: result._id}, function (error) {
      if (error) {
        return next(errors.normalizeError(error));
      }

      response.status(204).send();
      return next();
    });
  });
};

module.exports = ResourceController;
