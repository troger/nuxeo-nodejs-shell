var util = require("util"),
  events = require("events"),
  extend = require("extend"),
  url = require('url'),
  rest = require("restler");

var REST_API_SUFFIX = "api/v1/"
var AUTOMATION_SUFFIX = "site/automation/"

function computePath(path, segments) {
  if (path[path.length - 1] !== "/") {
    path += "/";
  }
  if (segments[0] === "/") {
    segments = segments.substring(1);
  }
  if (segments.length === 0) {
    return path;
  }
  return path + segments;
}

var DEFAULT_CLIENT_OPTIONS = {
  baseURL: "http://localhost:8080/nuxeo/",
  username: "Administrator",
  password: "Administrator"
}

var Client = function(options) {
  options = extend(true, {}, DEFAULT_CLIENT_OPTIONS, options || {})
  this._baseURL = options.baseURL;
  if (this._baseURL[this._baseURL.length - 1] !== "/") {
    this._baseURL += "/";
  }
  this._username = options.username;
  this._password = options.password;
  this._repositoryName = options.repositoryName || "default";
  this._schemas = options.schemas || [];

  var that = this;
  var RestService = rest.service(function() {
    this.defaults.username = that._username;
    this.defaults.password = that._password;
  }, {
   baseURL: computePath(this._baseURL, REST_API_SUFFIX)
  });
  this._restService = new RestService();

  var AutomationService = rest.service(function() {
    this.defaults.username = that._username;
    this.defaults.password = that._password;
  }, {
   baseURL: computePath(this._baseURL, AUTOMATION_SUFFIX)
  });
  this._automationService = new AutomationService();

  this.connected = false;
}

Client.prototype = {
  connect: function(callback) {
    var that = this;

    function fetchOperationsDefs(callback) {
      rest.get(computePath(that._baseURL, "site/automation"), {
        username: that._username,
        password: that._password,
        parser: rest.parsers.json
      }).on("complete", function(result) {
        that.operations = result.operations;
        that.chains = result.chains;
        if (callback) {
          callback(null, that);
        }
      });
    }

    rest.post(computePath(this._baseURL, "site/automation/login"), {
      username: this._username,
      password: this._password,
      headers: {
        "Accept": "application/json"
      }
    }).on("complete", function(result) {
      if (result instanceof Error) {
        callback(result, that)
      } else {
        try {
          if (result["entity-type"] === "login" && result["username"] === that._username) {
            this.connected = true;
            fetchOperationsDefs(callback);
          } else {
            if (callback) {
              callback(result, that);
            }
          }
        } catch (e) {
          console.log(e)
          if (callback) {
            callback(result, that);
          }
        }
      }
    });
  },
  repositoryName: function(repositoryName) {
    this._repositoryName = repositoryName;
    return this;
  },
  schema: function(schema) {
    this._schemas.push(schema);
    return this;
  },
  request: function(path) {
    return new Request({
      service: this._restService,
      path: path,
      repositoryName: this._repositoryName,
      schemas: this._schemas
    });
  }
}

var Request = function(options) {
  this._path = options.path || "";
  this._service = options.service;
  this._repositoryName = options.repositoryName;
  this._schemas = options.schemas || [];
  this._headers = options.headers || {};
  this._query = options.query || {};
  this._doneCallbacks = [];
  this._failCallbacks = [];
}

Request.prototype.repositoryName = function(repositoryName) {
  this._repositoryName = repositoryName;
  return this;
}

Request.prototype.schema = function(schema) {
  this._schemas.push(schema);
  return this;
}

Request.prototype.headers = function(headers) {
  this._headers = extend({}, this._headers, headers);
  return this;
}

Request.prototype.query = function(query) {
  this._query = extend({}, this._query, query)
  return this;
}

Request.prototype.path = function(path) {
  this._path = computePath(this._path, path);
  return this;
}

Request.prototype.done = function() {
  for (var i = 0; i < arguments.length; i++) {
    var arg = arguments[i]
    var type = jQuery.type(arg);
    if (type === "array") {
      this.done.apply(this, arg);
    } else if (type === "function") {
      this._doneCallbacks.push(arg);
    }
  }
  return this
}

Request.prototype.fail = function() {
  for (var i = 0; i < arguments.length; i++) {
    var arg = arguments[i]
    var type = jQuery.type(arg);
    if (type === "array") {
      this.fail.apply(this, arg);
    } else if (type === "function") {
      this._failCallbacks.push(arg);
    }
  }
  return this
}

Request.prototype.get = function(options) {
  options = extend(true, options, {
    method: "get"
  });
  this.execute(options);
}

Request.prototype.post = function(options) {
  this.headers({ "Content-Type": "application/json" });
  if (options.data && typeof options.data !== "string") {
    options.data = JSON.stringify(options.data);
  }
  options = extend(true, options, {
    method: "post"
  });
  this.execute(options);
}

Request.prototype.put = function(options) {
  this.headers({ "Content-Type": "application/json" });
  if (options.data && typeof options.data !== "string") {
    options.data = JSON.stringify(options.data);
  }
  options = extend(true, options, {
    method: "put"
  });
  this.execute(options);
}

Request.prototype.delete = function(options) {
  options = extend(true, options, {
    method: "delete"
  });
  this.execute(options);
}

Request.prototype.execute = function(options) {
  options = options || {};
  options.method = options.method || "get";
  options.parser = rest.parsers.auto;

  var headers = extend({}, this._headers);
  headers["Accept"] = "application/json";
  if (this._schemas.length > 0) {
    var schemasHeader = this._schemas.join(",");
    headers["X-NXDocumentProperties"] = schemasHeader;
  }
  headers = extend(headers, options.headers || {});
  options.headers = headers;

  // stringify if needed
  if (options.headers["Content-Type"] === "application/json") {
    if (options.data && typeof options.data === "object") {
      options.data = JSON.stringify(options.data);
    }
  }

  // query params
  var query = extend({}, this._query);
  query = extend(query, options.query || {});
  options.query = query;

  var path = "";
  if (this._repositoryName !== undefined) {
    path = computePath("repo", this._repositoryName);
  }
  path = computePath(path, this._path);

  var that = this;
  var request = this._service.request(path, options);
  request.on("complete", function(result, response) {
    // for (var n in response) {
    //   console.log(n)
    // }
    if (result instanceof Error) {
      that._failCallbacks.forEach(function(callback) {
        callback(result);
      })
      if (options.fail) {
        options.fail(result)
      }
    } else {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        that._doneCallbacks.forEach(function(callback) {
          callback(result);
        })
        if (options.done) {
          options.done(result)
        }
      } else {
        that._failCallbacks.forEach(function(callback) {
          callback(result);
        })
        if (options.fail) {
          options.fail(result)
        }
      }
    }
  });
}

var nuxeo = module.exports = {
  Client: Client
}
