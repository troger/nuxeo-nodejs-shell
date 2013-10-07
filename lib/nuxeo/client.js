var sys = require("util"),
  extend = require("extend"),
  url = require('url'),
  rest = require("restler");

var Client = function(options) {
  this.baseUrl = options.baseUrl;
  this.username = options.username;
  this.password = options.password;
  this.repositoryName = options.repositoryName || "default";
  // create Restler service
  var that = this;
  this.service = rest.service(function() {
    this.defaults.username = that.username;
    this.defaults.password = that.password;
  }, {
   baseURL: this.baseUrl
  })
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
  get: function() {
    this.service.get(path).on("complete", function(result) {
      if (result instanceof Error) {
        sys.puts("Error: " + result.message);
        if (options.fail) {
          options.fail(result);
        }
      } else {
        try {
          var loginInfo = JSON.parse(result)
          if (loginInfo["entity-type"] === "login" && loginInfo["username"] === username) {
            if (options.done) {
              options.done(new Client(url, username, password));
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
  },
  post: function() {

  },
  put: function() {

  },
  delete: function() {

  },
  execute: function(type) {
    // switch type
    // do rest call
  }
}


var client = module.exports = {}

var DEFAULT_CLIENT_OPTIONS = {
  baseUrl: "http://localhost:8080/nuxeo",
  username: "Administrator",
  password: "Administrator"
}

client.connect = function(options) {
  options = extend(true, {}, DEFAULT_CLIENT_OPTIONS, options || {})
  var baseUrl = options.baseUrl;
  var username = options.username;
  var password = options.password;

  rest.post(baseUrl + "/site/automation/login", {
    username: username,
    password: password,
  }).on("complete", function(result) {
    if (result instanceof Error) {
      sys.puts("Error: " + result.message);
      if (options.fail) {
        options.fail(result);
      }
    } else {
      try {
        var loginInfo = JSON.parse(result)
        if (loginInfo["entity-type"] === "login" && loginInfo["username"] === username) {
          if (options.done) {
            options.done(new Client({
              baseUrl: baseUrl,
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
