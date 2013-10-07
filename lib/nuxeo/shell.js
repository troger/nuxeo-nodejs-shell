var client = require("./client"),
  readline = require('readline'),
  pjson = require('../../package.json');


var completer = function(line, callback) {
  var cmds = line.split(" ");
  if (cmds.length > 1) {
    // delegate to registered cmd completer
  } else {
    callback(null, [["cmd1", "cmd2"], line]);
  }
};

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: completer
});

rl.on("line", function(line) {
  console.log("executed cmd: " + line);
  rl.pause();
  setTimeout(function() {
    rl.prompt();
  }, 500); // simulate request response time :]
});

rl.on("exit", function() {
  process.exit(0);
});

console.log(pjson.name + " version: " + pjson.version)
rl.prompt();
