var sys = require("util"),
  extend = require("extend"),
  url = require('url'),
  rest = require("restler");

var Client = function(options) {
  this.baseURL = options.baseURL;
  this.username = options.username;
  this.password = options.password;
  this.repositoryName = options.repositoryName || "default";

  var that = this;
  var Service = new rest.service(function() {
    this.defaults.username = that.username;
    this.defaults.password = that.password;
  }, {
   baseURL: options.baseURL
  });
  this.service = new Service();
}
Client.prototype = {
  repositoryName: function(repositoryName) {
    this.repositoryName = repositoryName;
    return this;
  },
  request: function(path) {
    return new Request(this.service, path);
  },
  operation: function() {
    // TODO
  }
}

var Request = function(service, path) {
  this.path = path;
  this.service = service;
  this.doneCallbacks = [];
  this.failCallbacks = [];
}
Request.prototype = {
  path: function(path) {
    this.path = url.resolve(this.path, path);
    return this;
  },

  done: function() {
    for (var i = 0; i < arguments.length; i++) {
      var arg = arguments[i]
      var type = jQuery.type(arg);
      if (type === "array") {
        this.done.apply(this, arg);
      } else if (type === "function") {
        this.doneCallbacks.push(arg);
      }
    }
    return this
  },

  fail: function() {
    for (var i = 0; i < arguments.length; i++) {
      var arg = arguments[i]
      var type = jQuery.type(arg);
      if (type === "array") {
        this.fail.apply(this, arg);
      } else if (type === "function") {
        this.failCallbacks.push(arg);
      }
    }
    return this
  },

  get: function(options) {
    options = extend(true, options, {
      method: "get"
    })
    this.execute(options);
  },

  post: function(options) {
    options = extend(true, options, {
      method: "post"
    })
    this.execute(options);
  },

  put: function(options) {
    options = extend(true, options, {
      method: "put"
    })
    this.execute(options);
  },

  delete: function(options) {
    options = extend(true, options, {
      method: "delete"
    })
    this.execute(options);
  },

  execute: function(options) {
    options = options || {}
    var method = options.method || "get";
    options.headers = options.headers || {};
    options.headers["Accept"] = "application/json";

    var that = this;
    var request = this.service.request(this.path, options)
    request.removeAllListeners(); // hack to remove all current listeners
    request.on("complete", function(result) {
      if (result instanceof Error) {
        that.failCallbacks.forEach(function(callback) {
          callback(result);
        })
        if (options.fail) {
          options.fail(result)
        }
      } else {
        that.doneCallbacks.forEach(function(callback) {
          callback(result);
        })
        if (options.done) {
          options.done(result)
        }
      }
    });
  }
}

var client = module.exports = {}

var DEFAULT_CLIENT_OPTIONS = {
  baseURL: "http://localhost:8080/nuxeo/",
  username: "Administrator",
  password: "Administrator"
}

client.connect = function(options) {
  options = extend(true, {}, DEFAULT_CLIENT_OPTIONS, options || {})
  var baseURL = options.baseURL;
  var username = options.username;
  var password = options.password;

  rest.post(url.resolve(baseURL, "site/automation/login"), {
    username: username,
    password: password,
    parser: rest.parsers.json
  }).on("complete", function(result) {
    if (result instanceof Error) {
      sys.puts("Error: " + result.message);
      if (options.fail) {
        options.fail(result);
      }
    } else {
      try {
        if (result["entity-type"] === "login" && result["username"] === username) {
          if (options.done) {
            options.done(new Client({
              baseURL: baseURL,
              username: username,
              password: password
            }));
          }
        } else {
          if (options.fail) {
            options.fail(result);
          }
        }
      } catch (e) {
        if (options.fail) {
          options.fail(result);
        }
      }
    }
  });
}
