var sys = require('util'),
  rest = require('restler');

var Client = function(url, username, password) {
  this.url = url;
  this.username = username;
  this.password = password;
  // create Restler service
}
Client.prototype = {
  request: function(url) {

  },
  operation: function() {

  }
}

var Request = function(url, service) {
  this.url = url;
  this.service = service;
}
Request.prototype = {
  path: function() {

  },
  done: function() {

  },
  fail: function() {

  },
  get: function() {

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
client.connect = function(options) {
  // check login - throw error if unable to connect
  // post sur automation login - retrieve login info
  return new Session(url, username, password);
}

function login() {

}
