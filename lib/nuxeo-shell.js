var readline = require("readline"),
  print = require("node-print"),
  commander = require("commander"),
  spawn = require('child_process').spawn,
  tmp = require('tmp'),
  fs = require('fs'),
  nuxeo = require("./nuxeo"),
  pjson = require("../package.json"),
  qs = require("querystring");

tmp.setGracefulCleanup();

var ctx = {
  client: undefined,
  user: undefined,
  path: undefined,
  doc: undefined,
  rootDocument: undefined
};

function splitArgs(line) {
  var args = [], i = -1, sc = " ", cur = "";
  while (++i < line.length) {
    var c = line[i];

    if (c === sc) {
      if (cur !== "") {
        if (sc === '"' || sc === "'") {
          sc = " ";
        }
        args.push(cur.trim());
        cur = "";
      }
    } else {
      if (sc === " " && cur === "" && (c === '"' || c === "'")) {
        sc = c;
      }
      else if (c === "\\") {
        i++;
        cur += c + line[i];
      } else {
        cur += c;
      }
    }
  }

  if (cur !== "") {
    args.push(cur);
  }
  return args;
}

var prompt = (function() {
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
})()

function resolveRequest(path, id) {
  var request;
  if (typeof id !== "undefined" && id) {
    request = ctx.client.request("id").path(id);
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

function joinOptions(opt) {
  var hp = [];
  if (opt.short) {
    hp.push("-" + opt.short)
  };
  if (opt.long) {
    hp.push("--" + opt.long)
  };
  return hp.join(", ");
}

function executeLine(cmd, args, line) {
  var bi = builtins[cmd], parser = new commander.Command();
  parser.unknownOption = function() { } // Override method to prevent process.exit

  if (typeof bi.options !== "undefined") {
    bi.options.forEach(function(opt) {
      var arg = opt.flag ? "" : " " + (opt.require ? "<arg>" : "[arg]");
      parser.option(joinOptions(opt) + arg, opt.desc, opt.default);
    });
  }

  bi.impl(parser.parse(["node"].concat(args)), line);
}

function fillOperationsCommands(operations) {
  operations.forEach(function(op) {
    // build options
    var options = [];
    op.params.forEach(function(p) {
      options.push({
        long: p.name,
        desc: p.description,
        require: p.required,
        name: p.name,
      })
    });

    var impl = (function(id) {
      return function(args) {
        console.log("Operation: " + id);
        console.log(args);
        var params = {};
        // TODOs:
        // - Commander rename option in camel case in object key
        // - Check required parameter
        // - Handle limited choice value
        builtins[id].options.forEach(function(opt) {
          if (typeof args[opt.name] !== "undefined") {
            params[opt.name] = args[opt.name];
          }
        });
        console.log(params);
        prompt();
        return;

        var operation = ctx.client.operation(id);
        operation.execute({
          input: undefined,
          data: {
            params: params
          },
          done: function(result) {
            prettyPrinter.print(data);
            prompt();
          }
        });
      }
    }(op.id));

    builtins[op.id] = {
      impl: impl,
      help: op.description,
      options: options
    }
  });
}

var builtins = {},
  completer = function(line, callback) {
    var cmds = splitArgs(line),
      cmd = cmds.shift(),
      lastCmd = cmds[cmds.length - 1];

    // Command aka first argument completed ?
    if (cmds.length > 0) {
      var b = builtins[cmd];
      if (lastCmd.indexOf("-") == 0) {
        // Display help on arguments options.
        var options = b.options || [],
          option = lastCmd.replace(/^-*/, ""),
          isLong = lastCmd.indexOf("--") == 0,
          hits = options.filter(function(o) {
            if (isLong) {
              return (o.long || "").indexOf(option) == 0;
            } else {
              return (o.short || "").indexOf(option) == 0;
            }
          });

        if (hits.length == 1 && isLong) {
          rl.write(hits[0].long.substring(option.length, hits[0].long.length) + " ");
        } else {
          // Simulate completer display.
          if (hits.length > 0) {
            console.log("");
          }
          hits.forEach(function(h) {
            console.log(joinOptions(h).yellow + ": " + h.desc || "");
          });
          if (hits.length > 0) {
            console.log("");
          }
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
        hits.length > 0 || line.length > 0 ? hits : b, line
      ]);
    }
  };

var prettyPrinter = (function(pp) {
  pp.documents = function(data) {
    data.entries.forEach(function(doc) {
      var name = doc.path.substring(doc.path.lastIndexOf("/") + 1);
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
    var entityType = data["entity-type"];
    if (entityType) {
      if (this[entityType]) {
        this[entityType](data);
      } else {
        if (typeof data === "object") {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(data);
        }
      }
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
    prompt();
    return;
  }

  rl.pause();
  var args = splitArgs(line),
    cmd = args[0];

  if (typeof builtins[cmd] === "object") {
    executeLine(cmd, args, line);
  } else {
    console.log(pjson.name + ": command not found: " + cmd);
    prompt();
  }
});

console.log(pjson.name.red + " version: " + pjson.version)
prompt();

builtins.help = {
  impl: function(args) {
    var _args = typeof args === "object" ? args.args : args;

    if (_args.length == 0) {
      console.log("Usage: help <cmd> [<cmd> ...]");
      prompt();
    } else if (_args instanceof Array) {
      _args.forEach(function(arg) {
        builtins.help.impl(arg);
      });
      prompt();
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
builtins.exit = builtins["q"] = builtins[":q"] = {
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
        prompt();
        return;
      }

      fillOperationsCommands(ctx.client.operations);

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
    var request = ctx.client.request("id/" + ctx.doc.uid + "/@children");
    request.get(function(error, data, response) {
      if (error) {
        console.log(error);
        prompt();
        return;
      }

      prettyPrinter.print(data);
      prompt();
    });
  },
  help: "List current document children.",
  options: []
};

builtins.cd = {
  impl: function(args) {
    var path = args.args[0];
    if (!path) {
      prompt();
      return;
    }

    path = path[0] === "/" ? path : ctx.path + "/" + path;
    var request = ctx.client.request("path").path(path);
    request.get(function(error, data, response) {
      if (error) {
        console.log(error);
        prompt();
        return;
      }

      if (data["entity-type"] === "document") {
        ctx.path = data.path;
        ctx.doc = data;
        if (data.path === "/") {
          ctx.rootDocument = data
        }
        var t = data.path.green + " > ".yellow;
        prompt(data.path.green + " > ".yellow, t.length - 20);
      } else {
        console.log("Unknown entity-type: " + data["entity-type"]);
        prompt();
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
      prompt();
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
      data: doc
    }, function(error, data, response) {
      if (error) {
        console.log(error);
        prompt();
        return;
      }

      prettyPrinter.print(data);
      prompt();
    })
  },
  help: "Create a new Document inside the current doc.",
  options: [{
    short: "t",
    long: "type",
    desc: "Define document's type",
    default: "Folder"
  }, {
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
    if (args.id) {
      if (ctx.rootDocument && args.id === ctx.rootDocument.uid) {
        console.log("Please, don't try to remove the root document.".red);
        prompt();
        return;
      }
    } else {
      if (args.args[0] === "/") {
        console.log("Please, don't try to remove the root document.".red);
        prompt();
        return;
      }
    }

    var request = resolveRequest(args.args[0], args.id);

    rl.question("Remove " + (args.id || args.args[0]) + "? ", function(input) {
      if (input.indexOf("y") == 0) {
        request.delete(function(error, data, response) {
          if (error) {
            console.log(error);
            prompt();
            return;
          }

          prompt();
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

    request.get(function(error, data, response) {
      if (error) {
        console.log(error);
        prompt();
        return;
      }

      prettyPrinter.print(data);
      prompt();
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
    request.get(function(error, data, response) {
      if (error) {
        console.log(error);
        prompt();
        return;
      }

      prettyPrinter.print(data);
      prompt();
    })
  },
  help: "Display the audit logs for a document. Usage: audit [-i docId] [document]",
  options: [{
    short: "i",
    long: "id",
    desc: "The document id. If specified, override the 'document' argument."
  }]
};

builtins.id = builtins.whoami = {
  impl: function() {
    console.log(ctx.user);
    prompt();
  },
  help: "Display effective username",
};

builtins.select = {
  impl: function(args, line) {
    var req = ctx.client.request();
    req.path("@search?" + qs.stringify({query: line})).get(function(error, docs) {
      if (error) {
        console.log(error.red)
      } else {
        prettyPrinter.print(docs);
      }
      prompt();
    });
  },
  help: "Query a list of documents using NXQL."
};

builtins.find = {
  impl: function(args) {
    if (args.args.length === 0) {
      console.log("Usage: find [fulltext search] [document]".red)
      prompt();
      return;
    }

    var fullText = args.args[0],
      path = ctx.path;
    if (typeof args.args[1] !== "undefined") {
      path = args.args[1];
    }
    var request = resolveRequest(path, args.id).path("@search?" + qs.stringify({fullText: fullText}));
    request.get(function(error, docs) {
      if (error) {
        console.log(error.red);
      } else {
        prettyPrinter.print(docs);
      }
      prompt();
    })
  },
  help: "Find a child document using a fulltext query. Usage: find [fulltext search] [document]",
  options: [{
    short: "i",
    long: "id",
    desc: "The document id. If specified, override the 'document' argument."
  }]
};

// user commands

builtins.users = builtins.usersearch = {
  impl: function(args) {
    var request = ctx.client.request("user").path("search");

    var query = "*";
    if (args.args.length > 0) {
      query = args.args[0];
    }
    request.query({ "q": query }).get(function(error, data, response) {
      if (error) {
        console.log(error);
        prompt();
        return;
      }

      if (!args.verbose) {
        var users = []
        data.entries.forEach(function(user) {
          users.push(user.id);
        });
        console.log(users.join(", "));
      } else {
        prettyPrinter.print(data);
      }
      prompt();
    })
  },
  help: "List users. Default to list all users. Usage: users [-v] [query]",
  options: [{
    short: "v",
    long: "verbose",
    desc: "Display a verbose listing of users.",
    flag: true
  }]
};

builtins.usershow = {
  impl: function(args) {
    if (args.args.length <= 0) {
      console.log("Usage: usershow username".red)
      prompt();
      return;
    }
    var request = ctx.client.request("user").path(args.args[0]).get(function(error, data, response) {
      if (error) {
        console.log(error);
        prompt();
        return;
      }

      prettyPrinter.print(data);
      prompt();
    })
  },
  help: "Display user information. Usage: usershow username",
};

builtins.useradd = {
  impl: function(args) {
    if (args.args.length <= 1) {
      console.log("Usage: useradd username password [-p properties]".red)
      prompt();
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
      data: user
    }, function(error, data, response) {
      if (error) {
        console.log(error);
        prompt();
        return;
      }

      prettyPrinter.print(data);
      prompt();
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

builtins.usermod = {
  impl: function(args) {
    if (args.args.length <= 0) {
      console.log("Usage: usermod username [-p properties] [-g groups]".red)
      prompt();
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

    ctx.client.request("user").path(user.id).put({
      data: user
    }, function(error, data, response) {
      if (error) {
        console.log(error);
        prompt();
        return;
      }

      prettyPrinter.print(data);
      prompt();
    })
  },
  help: "Modify user. Usage: usermod username [-p properties] [-g groups]",
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

builtins.userdel = {
  impl: function(args) {
    if (args.args.length <= 0) {
      console.log("Usage: userdel username".red)
      prompt();
      return;
    }

    var username = args.args[0];
    rl.question("Remove " + username + "? ", function(input) {
      if (input.indexOf("y") == 0) {
        ctx.client.request("user").path(username).delete(function(error, data, response) {
          if (error) {
            console.log(error);
            prompt();
            return;
          }

          console.log(data);
          prompt();
        })
      } else {
        prompt();
      }
    });
  },
  help: "Delete user. Usage: userdel username"
};

// group commands

builtins.groups = builtins.groupsearch = {
  impl: function(args) {
    var request = ctx.client.request("group").path("search");

    var query = "*";
    if (args.args.length > 0) {
      query = args.args[0];
    }
    request.query({ "q": query }).get(function(error, data, response) {
      if (error) {
        console.log(error);
        prompt();
        return;
      }

      if (args.v) {
        var groups = []
        data.entries.forEach(function(group) {
          groups.push(group.id);
        });
        console.log(users.join(", "));
      } else {
        prettyPrinter.print(data);
      }
      prompt();
    })
  },
  help: "List groups. Default to list all groups. Usage: groups [query]",
  options: [{
    short: "v",
    long: "verbose",
    desc: "Display a verbose listing of users.",
    flag: true
  }]
};

builtins.groupshow = {
  impl: function(args) {
    if (args.args.length <= 0) {
      console.log("Usage: groupshow groupname".red)
      prompt();
      return;
    }
    var request = ctx.client.request("group").path(args.args[0]).get(function(error, data, response) {
      if (error) {
        console.log(error);
        prompt();
        return;
      }

      prettyPrinter.print(data);
      prompt();
    })
  },
  help: "Display group information. Usage: groupshow groupname",
};

builtins.groupadd = {
  impl: function(args) {
    if (args.args.length <= 0) {
      console.log("Usage: groupadd groupname [-p properties]".red)
      prompt();
      return;
    }

    var group = {
      id: args.args[0],
      properties: {
        groupname: args.args[0]
      }
    }

    if (args.properties) {
      args.properties.split(",").forEach(function(property) {
        var p = property.trim().split("=");
        user.properties[p[0].trim()] = p[1].trim();
      });
    }

    ctx.client.request("group").post({
      data: group
    }, function(error, data, response) {
      if (error) {
        console.log(error);
        prompt();
        return;
      }

      prettyPrinter.print(data);
      prompt();
    })
  },
  help: "Add group. Usage: groupadd groupname password [-p properties]",
  options: [{
    short: "p",
    long: "properties",
    desc: "Set basic metadata. Format: -p groupname=Administrators,description=\"Group with admin rights\""
  }]
};

builtins.groupmod = {
  impl: function(args) {
    if (args.args.length <= 0) {
      console.log("Usage: group groupname [-p properties]".red)
      prompt();
      return;
    }

    var group = {
      id: args.args[0],
      properties: {
        groupname: args.args[0]
      }
    }

    if (args.properties) {
      args.properties.split(",").forEach(function(property) {
        var p = property.trim().split("=");
        group.properties[p[0].trim()] = p[1].trim();
      });
    }

    ctx.client.request("group").path(group.id).put({
      data: group
    }, function(error, data, response) {
      if (error) {
        console.log(error);
        prompt();
        return;
      }

      prettyPrinter.print(data);
      prompt();
    })
  },
  help: "Modify group. Usage: groupmod groupname [-p properties]",
  options: [{
    short: "p",
    long: "properties",
    desc: "Set basic metadata. Format: -p grouplabel=Administrators,description=\"Group with admin rights\"."
  }]
};

builtins.groupdel = {
  impl: function(args) {
    if (args.args.length <= 0) {
      console.log("Usage: groupdel groupname".red)
      prompt();
      return;
    }

    var groupname = args.args[0];
    rl.question("Remove " + groupname + "? ", function(input) {
      if (input.indexOf("y") == 0) {
        ctx.client.request("group").path(groupname).delete(function(error, data, response) {
          if (error) {
            console.log(error);
            prompt();
            return;
          }

          console.log(data);
          prompt();
        })
      } else {
        prompt();
      }
    });
  },
  help: "Delete group. Usage: groupdel groupname"
};

builtins.edit = {
  impl: function(args) {
    function _edit(path) {
      var editor = process.env.EDITOR || 'vi';
      var child = spawn(editor, [path], {
          stdio: 'inherit'
      });

      child.on('close', function (code, signal) {
        if (code == 0) {
          rl.question("Upload file? ", function(input) {
            if (input.indexOf("y") == 0) {
              var doc = fs.readFileSync(path, { encoding: "utf8" });
              var request = resolveRequest(args.args[0], args.id);
              request.put({
                data: doc
              }, function(error, data, response) {
                if (error) {
                  rl.question("Wanna try again? ", function(input) {
                    if (input.indexOf("y") == 0) {
                      rl.pause();
                      _edit(path);
                    } else {
                      prompt();
                    }
                  });
                  return;
                }

                prompt();
              });
            } else {
              prompt();
            }
          });
        } else {
          prompt();
        }
      });
    }

    var request = resolveRequest(args.args[0], args.id);
    if (args.schema) {
      args.schema.split(",").forEach(function(schema) {
        request.schema(schema.trim());
      });
    }

    request.get(function(error, data, response) {
      tmp.file(function _tempFileCreated(error, path, fd) {
        if (error) {
          console.log(error);
          prompt();
          return;
        }

        fs.writeFileSync(path, JSON.stringify(data, null, 2), { encoding: "utf8" });
        _edit(path);
      });
    });
  },
  help: "Edit the JSON representation of a document. Usage: edit [document] [-i docId] [-s dublincore,common]",
  options: [{
    short: "i",
    long: "id",
    desc: "Edit a specific document using his uid."
  },{
    short: "s",
    long: "schema",
    desc: "Specify which schemas you want to fetch. Format: -s dublincore,common."
  }]
};
