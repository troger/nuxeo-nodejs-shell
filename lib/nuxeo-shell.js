var readline = require("readline"),
  print = require("node-print"),
  commander = require("commander"),
  nuxeo = require("./nuxeo"),
  pjson = require("../package.json");

var ctx = {
  client: undefined,
  user: undefined,
  path: undefined,
  doc: undefined,
}, prompt = (function() {
  var text = "> ".yellow,
    length = 2;


  return function() {
    if (arguments.length > 0) {
      text = arguments[0];
      length = arguments[1];
    }

    rl.setPrompt(text, length);
    rl.prompt();
  }
}());

function resolveRequest(path, id) {
  var request;
  if (typeof id !== "undefined" && id) {
    request = ctx.client.request("id");
    request.path(id);
  } else {
    request = ctx.client.request("path");
    if (typeof path === "undefined") {
      request.path(ctx.path)
    } else {
      if (path[0] !== "/") {
        request.path(ctx.path).path(path);
      } else {
        request.path(path)
      }
    }
  }

  return request;
}

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
  var bi = builtins[cmd], parser = new commander.Command();
  parser.unknownOption = function() { } // Override method to prevent process.exit

  if (typeof bi.options !== "undefined") {
    bi.options.forEach(function(opt) {
      parser.option(joinArgs(opt) + " [arg]", opt.desc, opt.default);
    });
  }

  bi.impl(parser.parse(["node"].concat(cmds)));
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
          console.log(joinArgs(h).yellow + ": " + h.desc || "");
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
  pp.documents = function(data) {
    data.entries.forEach(function(doc) {
      //console.log(doc.path.blue + " | ".grey + doc.title + (" (" + doc.type + ") ").yellow + ("| " +doc.uid).grey);
      var name = "." + doc.path.substring(doc.path.lastIndexOf("/"), doc.path.length);
      print.pf("%s %-25s %-50s  %s", doc.uid.grey, doc.type.yellow, name.blue, doc.title);
    });
  }

  pp.document = function(doc) {
    console.log(JSON.stringify(doc, null, 2));
  }

  pp.user = function(user) {
    console.log(JSON.stringify(user, null, 2));
  }

  pp.users = function(data) {
    print.pt(data.entries);
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

console.log(pjson.name.red + " version: " + pjson.version)
prompt();

builtins.help = {
  impl: function(args) {
    var _args = typeof args === "object" ? args.args : args;

    if (_args.length == 0) {
      console.log("Usage: help <cmd> [<cmd> ...]");
      rl.prompt();
    } else if (_args instanceof Array) {
      _args.forEach(function(arg) {
        builtins.help.impl(arg);
      });
      rl.prompt();
    } else if (typeof _args === "string") {
      if (typeof builtins[_args] === "object") {
        console.log(_args + ": " + (builtins[_args].help || "missing help message."));
      } else {
        console.log(("Unknown command: " + _args).red);
      }
    }
  },
  help: "Display help message for command."
};

/* Register commands */
builtins.exit = {
  impl: function() {
    console.log("bye");
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
      ctx.user = args.username;
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
      done: function(data) {
        prettyPrinter.print(data);
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
    ctx.client.request("path").path(path).get({
      done: function(doc) {
        if (doc["entity-type"] === "document") {
          ctx.path = doc.path;
          ctx.doc = doc;
          var t = doc.path.green + " > ".yellow;
          prompt(doc.path.green + " > ".yellow, t.length - 20);
        } else {
          console.log("Unknown entity-type: " + doc["entity-type"]);
          prompt();
        }
      }
    })
  },
  help: "Change current document.",
  options: []
};

builtins.pwd = {
  impl: function(args) {
    console.log(ctx.doc.path);
    prompt();
  },
  help: "Display current document path."
};

builtins.mkdir = {
  impl: function(args) {
    if (args.args.length <= 0) {
      console.log("Usage: mkdir [options] name".red)
      rl.prompt();
      return;
    }

    var request = ctx.client.request("id").path(ctx.doc.uid),
      doc = {
        name: args.args[0],
        type: args.type,
        properties: {}
      };
    doc["entity-type"] = "document";
    if (typeof args.properties !== "undefined") {
      args.properties.split(",").forEach(function(property) {
        var p = property.trim().split("=");
        doc.properties[p[0].trim()] = p[1].trim();
      });
    }

    request.post({
      data: doc,
      done: function(data) {
        prettyPrinter.print(data);
        rl.prompt();
      }
    })
  },
  help: "Create a new Document inside the current doc.",
  options: [{
    short: "t",
    long: "type",
    desc: "Define document's type",
    default: "Folder"
  } , {
    short: "p",
    long: "properties",
    desc: "Set basic metadata. Format: -p dc:title=Title,dc:description=Description."
  }]
};

builtins.rm = {
  impl: function(args) {
    if (!(args.args[0] || args.id)) {
      console.log("Please, don't try to remove yourself.".red);
      prompt();
      return;
    }

    var request = resolveRequest(args.args[0], args.id);

    rl.question("Remove " + (args.id || args.args[0]) + "? ", function(input) {
      if (input.indexOf("y") == 0) {
        request.delete({
          done: function(data) {
            prompt();
          }
        });
      } else {
        prompt();
      }
    });
  },
  help: "Delete a specific document",
  options: [{
    short: "i",
    long: "id",
    desc: "Display content of a specific document using his uid."
  }]
};

builtins.cat = {
  impl: function(args) {
    var request = resolveRequest(args.args[0], args.id);
    if (args.schema) {
      args.schema.split(",").forEach(function(schema) {
        request.schema(schema.trim());
      });
    }

    request.get({
      done: function(data) {
        prettyPrinter.print(data);
        rl.prompt();
      }
    })
  },
  help: "Display information about current document, or specific document.",
  options: [{
    short: "i",
    long: "id",
    desc: "Display content of a specific document using his uid."
  },{
    short: "s",
    long: "schema",
    desc: "Specify which schemas you want to fetch. Could be a list of value"
  }]
};

builtins.audit = {
  impl: function(args) {
    var request = resolveRequest(args.args[0], args.id).path("@audit");
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

builtins.whoami = {
  impl: function() {
    console.log(ctx.user);
    rl.prompt();
  },
  help: "Display effective username",
};

builtins.usershow = {
  impl: function(args) {
    if (args.args.length <= 0) {
      console.log("Usage: usershow username".red)
      rl.prompt();
      return;
    }
    var request = ctx.client.request("user").path(args.args[0]).get({
      done: function(data) {
        prettyPrinter.print(data);
        rl.prompt();
      }
    })
  },
  help: "Display user information. Usage: usershow username",
};

builtins.usersearch = {
  impl: function(args) {
    var request = ctx.client.request("user").path("search");

    var query = "*";
    if (args.args.length > 0) {
      query = args.args[0];
    }
    request.query({ "q": query }).get({
      done: function(data) {
        console.log(JSON.stringify(data, null, 2));
        prettyPrinter.print(data);
        rl.prompt();
      }
    })
  },
  help: "Search users. Default to search all users. Usage: usersearch [query]",
};

builtins.useradd = {
  impl: function(args) {
    if (args.args.length <= 1) {
      console.log("Usage: useradd username password [-p properties]".red)
      rl.prompt();
      return;
    }

    var user = {
      id: args.args[0],
      properties: {
        username: args.args[0],
        password: args.args[1]
      }
    }

    if (args.properties) {
      args.properties.split(",").forEach(function(property) {
        var p = property.trim().split("=");
        user.properties[p[0].trim()] = p[1].trim();
      });
    }

    if (args.groups) {
      var groups = [];
      args.groups.split(",").forEach(function(group) {
        groups.push(group);
      })
      user.properties.groups = groups;
    }

    ctx.client.request("user").post({
      data: user,
      done: function(data) {
        prettyPrinter.print(data);
        rl.prompt();
      }
    })
  },
  help: "Add user. Usage: useradd username password [-p properties]",
  options: [{
    short: "g",
    long: "groups",
    desc: "Set user groups. Format: -g members,group1."
  }, {
    short: "p",
    long: "properties",
    desc: "Set basic metadata. Format: -p firstName=John,lastName=Doe."
  }]
};
