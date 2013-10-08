var readline = require("readline"),
  print = require("node-print"),
  commander = require("commander"),
  nuxeo = require("./nuxeo"),
  pjson = require("../package.json");

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

  pp.logEntries = function(data) {
    var entries = [];
    data.entries.forEach(function(logEntry) {
      entries.push({
        "eventId": logEntry.eventId,
        "eventDate": logEntry.eventDate,
        "username": logEntry.principalName,
        "category": logEntry.category
      })
    });
    print.pt(entries);
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
rl.on("close", function() {
  console.log("\nbye");
  process.exit(0);
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
    ctx.client = new nuxeo.Client({
      username: args.username,
      password: args.password,
      baseURL: args.args.length > 0 ? args.args[0] : undefined
    })
    ctx.client.connect(function(error, client) {
      if (error) {
        console.log(error);
        rl.prompt();
        return;
      }
      builtins.cd.impl({
        args: [args.defaultPath]
      });
    })
  },
  help: "Connect to a Nuxeo Server. Usage: connect [-u username] [-p password] [-d default-path] [host]",
  options: [{
    short: "u",
    long: "username",
    desc: "Specify authentication username. Default is 'Administrator'.",
    default: "Administrator"
  }, {
    short: "p",
    long: "password",
    desc: "Specify authentication password. Default is 'Administrator'.",
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

builtins.audit = {
  impl: function(args) {
    var request = ctx.client.request();
    if (args.id) {
      request.path("id").path(args.id)
    } else {
      var name = args.args[0];
      if (name) {
        if (name[0] === "/") {
          // full path
          request.path("path").path(name);
        } else {
          request.path("path").path(ctx.doc.path).path(name);
        }
      } else {
        request.path("path").path(ctx.doc.path);
      }
    }
    request.path("@audit");
    request.get({
      done: function(data) {
        prettyPrinter.print(data);
        rl.prompt();
      }
    })
  },
  help: "Display the audit logs for a document. Usage: audit [-i docId] [document]",
  options: [{
    short: "i",
    long: "id",
    desc: "The document id. If specified, override the 'document' argument."
  }]
};
