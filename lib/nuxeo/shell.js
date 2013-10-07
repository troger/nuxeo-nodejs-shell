var client = require("./client"),
  readline = require("readline"),
  pjson = require("../../package.json");

var builtins = {},
  completer = function(line, callback) {
    var cmds = line.split(" "),
      cmd = cmds.shift();

    // Command aka first argument completed ?
    if (cmds.length > 0) {
      var b = builtins[cmd];
      if (cmds[cmds.length - 1].indexOf("-") == 0) {
        // Display help on arguments options.
        var options = b.options || [],
          option = line.split(" ").pop().replace(/^-*/, ""),
          hits = options.filter(function(o) {
            return (o.short || "").indexOf(option) == 0 || (o.name || "").indexOf(option) == 0;
          });

        // Simulate completer display.
        if (hits.length > 0) {
          console.log("");
        }
        hits.forEach(function(h) {
          var hp = [];
          if (h.short) {
            hp.push("-" + h.short)
          };
          if (h.name) {
            hp.push("--" + h.name)
          };
          console.log(hp.join(", ") + ": " + h.desc || "");
        });
        if (hits.length > 0) {
          console.log("");
        }
        rl.prompt(true);
      }
      // Check if a completer exists, empty completion otherwise.
      else if (b !== undefined && typeof b.completer === "function") {
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
  line = line.trim();
  if (line.length == 0) {
    rl.prompt();
    return;
  }

  rl.pause();
  var cmds = line.split(" "),
    cmd = cmds[0];

  if (typeof builtins[cmd] === "object") {
    executeLine(cmd, cmds);
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

function joinArgs(opt) {
  var hp = [];
  if (opt.short) {
    hp.push("-" + opt.short)
  };
  if (opt.long) {
    hp.push("--" + opt.long)
  };
  return hp.join(", ");
}

function executeLine(cmd, cmds) {
  var bi = builtins[cmd];
  if (typeof bi.options === "undefined") {
    cmds.shift();
    bi.impl(cmds);
  } else {
    var commander = require("commander");
    bi.options.forEach(function(opt) {
      commander.option(joinArgs(opt) + " [arg]", opt.desc, opt.default);
    })
    bi.impl(commander.parse(["node"].concat(cmds)));
  }
}

/* Register commands */
builtins.exit = {
  impl: function() {
    process.exit(0);
  },
  help: "Exit " + pjson.name + "."
};

builtins.connect = {
  impl: function(args) {
    console.log(args.username);
    console.log(args.password);
    console.log(args.defaultPath);
  },
  help: "Connect to a new Nuxeo Server. Usage: connect [-u username] [-p password] [-d default-path] [host]",
  options: [{
    short: "u",
    long: "username",
    desc: "Specify authentification username. Default is 'Administrator'.",
    default: "Administrator"
  }, {
    short: "p",
    long: "password",
    desc: "Specify authentification password. Default is 'Administrator'.",
    default: "Administrator"
  }, {
    short: "d",
    long: "default-path",
    desc: "Define default path. Default is '/'.",
    default: "/"
  }]
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
