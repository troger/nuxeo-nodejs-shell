var sys = require('util'),
  client = require("./client")

client.connect({
  done: function(client) {
    sys.puts(client.baseUrl)
    sys.puts(client.username)
  },
  fail: function(error) {
    console.log("ERROR:" + error)
  }
})
