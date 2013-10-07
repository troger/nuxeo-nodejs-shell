var nuxeo = require("./client"),
  readline = require("readline"),
  pjson = require("../../package.json"),
  commander = require("commander");

var ctx = {
  path: undefined,
  client: undefined,
  doc: undefined,
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
    var parser = new commander.Command();
    bi.options.forEach(function(opt) {
      parser.option(joinArgs(opt) + " [arg]", opt.desc, opt.default);
    })
    bi.impl(parser.parse(["node"].concat(cmds)));
  }
}

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
          console.log(joinArgs(h) + ": " + h.desc || "");
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

var prettyPrinter = (function(pp) {
  pp.documents = function(docs) {
    docs.entries.forEach(function(doc) {
      pp.document(doc);
    });
    console.log("End of page.");
  }

  pp.document = function(doc) {
    console.log(doc.path + " - " + doc.uid);
  }

  pp.print = function(data) {
    if (data["entity-type"]) {
      pp[data["entity-type"]](data);
    }
  }

  return pp;
}({}));

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
    rl.prompt();
  }
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
    rl.prompt();
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

builtins.connect = {
  impl: function(args) {
    nuxeo.connect({
      username: args.username,
      password: args.password,
      baseURL: args.args.length > 0 ? args.args[0] : undefined,
      done: function(client) {
        ctx.client = client;
        builtins.cd.impl({
          args: [args.defaultPath]
        });
      },
      fail: function(error) {
        console.log(error);
        rl.prompt();
      }
    })
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
  impl: function(args) {
    ctx.client.request("id/" + ctx.doc.uid + "/@children").get({
      done: function(docs) {
        prettyPrinter.print(docs);
        rl.prompt();
      }
    })
  },
  help: "List current document children.",
  options: []
};

builtins.cd = {
  impl: function(args) {
    var path = args.args[0];
    if (!path) {
      rl.prompt();
      return;
    }

    path = path[0] === "/" ? path : ctx.path + "/" + path;
    ctx.client.request("path/" + path).get({
      done: function(doc) {
        if (doc["entity-type"] === "document") {
          ctx.path = doc.path;
          ctx.doc = doc;
          rl.setPrompt(doc.path + " > ");
        } else {
          console.log("Unknowd entity-type: " + doc["entity-type"]);
        }

        rl.prompt();
      }
    })
  },
  help: "Change current document.",
  options: []
};

builtins.pwd = {
  help: "Display current document path."
};

builtins.mkdir = {

};

builtins.cat = {

};
