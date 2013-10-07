var client = require("./client"),
  readline = require("readline"),
  pjson = require("../../package.json");

var builtins = {}, completer = function(line, callback) {
    var cmds = line.split(" "),
      cmd = cmds.shift();

    // Known command ?
    if (cmds.length > 0) {
      var b = builtins[cmd];
      // Check if completer exists, empty one otherwise.
      if (b !== undefined && typeof b.completer === "function") {
        b.completer(line, callback);
      } else {
        callback(null, [
          [], line
        ]);
      }
    } else {
      // Completer based on registered commands
      var b = Object.keys(builtins),
        hits = b.filter(function(c) {
          return c.indexOf(line) == 0
        });

      callback(null, [
        hits.length > 0 ? hits : b, line
      ]);
    }
  };

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: completer
});

rl.on("line", function(line) {
  rl.pause();
  var cmds = line.trim().split(" "),
    cmd = cmds.shift();

  if (typeof builtins[cmd] === "object") {
    builtins[cmd].impl(cmds);
  } else {
    console.log(pjson.name + ": command not found: " + cmd);
  }

  setTimeout(function() {
    rl.prompt();
  }, 200); // simulate request response time :]
});

console.log(pjson.name + " version: " + pjson.version)
rl.prompt();

builtins.help = {
  impl: function(args) {
    if (args.length == 0) {
      console.log("Usage: help <cmd> [<cmd> ...]");
    } else if (args instanceof Array) {
      args.forEach(function(arg) {
        builtins.help.impl(arg);
      });
    } else if (typeof args === "string") {
      if (typeof builtins[args] === "object") {
        console.log(args + ": " + (builtins[args].help || "missing help message."));
      } else {
        console.log("Unknown command: " + args);
      }
    }
  },
  help: "Display help message for command."
};

/* Register commands */
builtins.exit = {
  impl: function() {
    process.exit(0);
  },
  help: "Exit " + pjson.name + "."
};

builtins.ls = {
  help: "List current document children."
};

builtins.cd = {
  help: "Change current document."
};

builtins.pwd = {
  help: "Display current document path."
};

builtins.mkdir = {

};

builtins.cat = {

};
