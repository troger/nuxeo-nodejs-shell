var sys = require('util'),
  client = require("./client")

client.connect({
  done: function(c) {
    c.schema("dublincore");
    c.request("path/default-domain").repo("eee").schema("common").get({
      done: function(res) {
        console.log("typeof : " + typeof res);
        console.log("done: %j", res);
      },
      fail: function(res) {
        console.log("fail: %j", res);
      }
    })
  },
  fail: function(error) {
    console.log("onerror connect")
    console.log("ERROR: %j", error)
  }
})
