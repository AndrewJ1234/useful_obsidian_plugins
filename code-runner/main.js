/*
 * Vault Code Runner v2 — Obsidian Plugin
 * 
 * FIXES: Works in Live Preview / Edit mode (not just reading view)
 * NEW: Adds run/exec commands, inline REPL panel, run from active note
 * 
 * THREE ways to run code:
 *   1. Use ```run-js or ```run-py or ```run-html fences — get a Run button in BOTH edit & reading mode
 *   2. Put cursor inside any ```js / ```python fence and press Ctrl+Enter
 *   3. Open the REPL panel (Ctrl+Shift+`) and type code interactively
 */

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function")
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

var plugin_exports = {};
__export(plugin_exports, { default: () => VaultCodeRunnerPlugin });
module.exports = __toCommonJS(plugin_exports);

var obsidian = require("obsidian");

// ═══════════════════════════════════════════════
//  MINI PYTHON INTERPRETER
// ═══════════════════════════════════════════════
class MiniPython {
  constructor(existingEnv) {
    this.env = existingEnv ? { ...existingEnv } : {};
    this.output = [];
    this.modules = {
      math: {
        pi: Math.PI, e: Math.E, sqrt: Math.sqrt, floor: Math.floor, ceil: Math.ceil,
        abs: Math.abs, pow: Math.pow, log: Math.log, log2: Math.log2, log10: Math.log10,
        sin: Math.sin, cos: Math.cos, tan: Math.tan,
        factorial: (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; },
      },
      random: {
        random: Math.random,
        randint: (a, b) => Math.floor(Math.random() * (b - a + 1)) + a,
        choice: (arr) => arr[Math.floor(Math.random() * arr.length)],
        shuffle: (arr) => { let a = [...arr]; for (let i = a.length - 1; i > 0; i--) { let j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
      },
      datetime: {
        date: { today: () => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), toString: () => d.toISOString().split("T")[0] }; } },
        datetime: { now: () => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds(), toString: () => d.toISOString() }; } }
      }
    };
  }

  pythonRepr(val) {
    if (val === null || val === undefined) return "None";
    if (val === true) return "True";
    if (val === false) return "False";
    if (typeof val === "string") return "'" + val + "'";
    if (Array.isArray(val)) return "[" + val.map(v => this.pythonRepr(v)).join(", ") + "]";
    if (typeof val === "object" && val.toString && val.toString !== Object.prototype.toString) return val.toString();
    if (typeof val === "object") {
      const entries = Object.entries(val).map(([k, v]) => this.pythonRepr(k) + ": " + this.pythonRepr(v));
      return "{" + entries.join(", ") + "}";
    }
    return String(val);
  }

  pythonStr(val) {
    if (val === null || val === undefined) return "None";
    if (val === true) return "True";
    if (val === false) return "False";
    if (typeof val === "string") return val;
    return this.pythonRepr(val);
  }

  evalExpr(expr) {
    expr = expr.trim();
    if (expr === "") return undefined;
    if (expr === "None") return null;
    if (expr === "True") return true;
    if (expr === "False") return false;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return parseFloat(expr);

    if (/^f(['"`])/.test(expr)) {
      var q = expr[1];
      var inner = expr.slice(2, expr.lastIndexOf(q));
      var self = this;
      return inner.replace(/\{([^}]+)\}/g, function(_, e) { return self.pythonStr(self.evalExpr(e)); });
    }
    if ((expr.startsWith("'") && expr.endsWith("'")) || (expr.startsWith('"') && expr.endsWith('"')))
      return expr.slice(1, -1);
    if ((expr.startsWith("'''") && expr.endsWith("'''")) || (expr.startsWith('"""') && expr.endsWith('"""')))
      return expr.slice(3, -3);

    if (expr.startsWith("[") && expr.endsWith("]")) {
      var inner = expr.slice(1, -1).trim();
      if (inner === "") return [];
      var compMatch = inner.match(/^(.+)\s+for\s+(\w+)\s+in\s+(.+?)(?:\s+if\s+(.+))?$/);
      if (compMatch) {
        var itemExpr = compMatch[1], varName = compMatch[2], iterExpr = compMatch[3], condExpr = compMatch[4];
        var iterable = this.evalExpr(iterExpr);
        var result = [];
        var oldVal = this.env[varName];
        for (var ii = 0; ii < iterable.length; ii++) {
          this.env[varName] = iterable[ii];
          if (condExpr) { if (this.evalExpr(condExpr)) result.push(this.evalExpr(itemExpr)); }
          else result.push(this.evalExpr(itemExpr));
        }
        if (oldVal !== undefined) this.env[varName] = oldVal; else delete this.env[varName];
        return result;
      }
      return this.splitArgs(inner).map(function(a) { return this.evalExpr(a); }.bind(this));
    }

    if (expr.startsWith("{") && expr.endsWith("}")) {
      var inner = expr.slice(1, -1).trim();
      if (inner === "") return {};
      var obj = {};
      var pairs = this.splitArgs(inner);
      for (var pi = 0; pi < pairs.length; pi++) {
        var ci = pairs[pi].indexOf(":");
        if (ci !== -1) { obj[this.evalExpr(pairs[pi].slice(0, ci))] = this.evalExpr(pairs[pi].slice(ci + 1)); }
      }
      return obj;
    }

    if (expr.startsWith("(") && expr.endsWith(")") && expr.includes(",")) {
      return this.splitArgs(expr.slice(1, -1).trim()).map(function(a) { return this.evalExpr(a); }.bind(this));
    }

    // Builtins
    var builtinNames = ["range", "len", "type", "str", "int", "float", "bool", "list", "sorted", "reversed", "abs", "round", "min", "max", "sum", "enumerate", "zip", "print", "input", "isinstance"];
    for (var bi = 0; bi < builtinNames.length; bi++) {
      var bname = builtinNames[bi];
      var re = new RegExp("^" + bname + "\\((.*)\\)$");
      var m = expr.match(re);
      if (m) {
        var args = m[1].trim() === "" ? [] : this.splitArgs(m[1]).map(function(a) { return this.evalExpr(a); }.bind(this));
        return this._callBuiltin(bname, args);
      }
    }

    // User function call
    var funcCallMatch = expr.match(/^(\w+)\(([^)]*)\)$/);
    if (funcCallMatch && this.env[funcCallMatch[1]] && typeof this.env[funcCallMatch[1]] === "function") {
      var fargs = funcCallMatch[2].trim() === "" ? [] : this.splitArgs(funcCallMatch[2]).map(function(a) { return this.evalExpr(a); }.bind(this));
      return this.env[funcCallMatch[1]].apply(null, fargs);
    }

    // Method calls
    var methodMatch = expr.match(/^(.+?)\.(\w+)\(([^)]*)\)$/);
    if (methodMatch) {
      var obj = this.evalExpr(methodMatch[1]);
      var method = methodMatch[2];
      var margs = methodMatch[3].trim() === "" ? [] : this.splitArgs(methodMatch[3]).map(function(a) { return this.evalExpr(a); }.bind(this));
      var r = this._callMethod(obj, method, margs);
      if (r !== "__NO_METHOD__") return r;
    }

    // Property
    var propMatch = expr.match(/^(.+?)\.(\w+)$/);
    if (propMatch) {
      var obj = this.evalExpr(propMatch[1]);
      if (obj && typeof obj === "object" && propMatch[2] in obj) return obj[propMatch[2]];
    }

    // Index/slice
    var idxMatch = expr.match(/^(.+?)\[(.+)\]$/);
    if (idxMatch) {
      var obj = this.evalExpr(idxMatch[1]);
      var idx = idxMatch[2];
      if (idx.includes(":")) {
        var parts = idx.split(":").map(function(p) { return p.trim() === "" ? undefined : this.evalExpr(p); }.bind(this));
        var start = parts[0] !== undefined ? (parts[0] < 0 ? obj.length + parts[0] : parts[0]) : 0;
        var end = parts[1] !== undefined ? (parts[1] < 0 ? obj.length + parts[1] : parts[1]) : obj.length;
        return (typeof obj === "string") ? obj.slice(start, end) : obj.slice(start, end);
      }
      var key = this.evalExpr(idx);
      if (Array.isArray(obj) || typeof obj === "string") return obj[key < 0 ? obj.length + key : key];
      if (typeof obj === "object") return obj[key];
    }

    // Boolean ops
    var andIdx = expr.lastIndexOf(" and ");
    if (andIdx !== -1) return this.evalExpr(expr.slice(0, andIdx)) && this.evalExpr(expr.slice(andIdx + 5));
    var orIdx = expr.lastIndexOf(" or ");
    if (orIdx !== -1) return this.evalExpr(expr.slice(0, orIdx)) || this.evalExpr(expr.slice(orIdx + 4));
    if (expr.startsWith("not ")) return !this.evalExpr(expr.slice(4));

    // in
    var inMatch = expr.match(/^(.+?)\s+in\s+(.+)$/);
    if (inMatch) {
      var val = this.evalExpr(inMatch[1]); var container = this.evalExpr(inMatch[2]);
      if (Array.isArray(container)) return container.includes(val);
      if (typeof container === "string") return container.includes(val);
      if (typeof container === "object") return val in container;
    }

    // Comparisons
    var cmpOps = [["==", function(a,b){return a===b}], ["!=", function(a,b){return a!==b}], [">=", function(a,b){return a>=b}], ["<=", function(a,b){return a<=b}], [">", function(a,b){return a>b}], ["<", function(a,b){return a<b}]];
    for (var ci = 0; ci < cmpOps.length; ci++) {
      var parts = this.splitBinary(expr, cmpOps[ci][0]);
      if (parts) return cmpOps[ci][1](this.evalExpr(parts[0]), this.evalExpr(parts[1]));
    }

    // + -
    for (var oi = 0; oi < 2; oi++) {
      var op = ["+", "-"][oi];
      var idx = this.findBinaryOp(expr, op);
      if (idx !== -1) {
        var left = this.evalExpr(expr.slice(0, idx));
        var right = this.evalExpr(expr.slice(idx + 1));
        if (op === "+") {
          if (typeof left === "string" || typeof right === "string") return this.pythonStr(left) + this.pythonStr(right);
          if (Array.isArray(left) && Array.isArray(right)) return left.concat(right);
          return left + right;
        }
        return left - right;
      }
    }

    // ** // * / %
    var mathOps = [
      ["**", function(a,b){return Math.pow(a,b)}],
      ["//", function(a,b){return Math.floor(a/b)}],
      ["*", function(a,b){if(typeof a==="string")return a.repeat(b);if(typeof b==="string")return b.repeat(a);if(Array.isArray(a)){var r=[];for(var i=0;i<b;i++)r=r.concat(a);return r;}return a*b}],
      ["/", function(a,b){return a/b}],
      ["%", function(a,b){return a%b}]
    ];
    for (var mi = 0; mi < mathOps.length; mi++) {
      var idx = this.findBinaryOp(expr, mathOps[mi][0]);
      if (idx !== -1) return mathOps[mi][1](this.evalExpr(expr.slice(0, idx)), this.evalExpr(expr.slice(idx + mathOps[mi][0].length)));
    }

    if (expr.startsWith("-")) return -this.evalExpr(expr.slice(1));
    if (expr.startsWith("(") && expr.endsWith(")")) return this.evalExpr(expr.slice(1, -1));
    if (this.env[expr] !== undefined) return this.env[expr];
    throw new Error("NameError: name '" + expr + "' is not defined");
  }

  _callBuiltin(name, args) {
    switch (name) {
      case "range":
        if (args.length === 1) return Array.from({length:args[0]}, function(_,i){return i});
        if (args.length === 2) return Array.from({length:args[1]-args[0]}, function(_,i){return i+args[0]});
        if (args.length === 3) { var r=[]; for(var i=args[0]; args[2]>0?i<args[1]:i>args[1]; i+=args[2]) r.push(i); return r; }
        return [];
      case "len": var v=args[0]; if(typeof v==="string"||Array.isArray(v))return v.length; if(typeof v==="object")return Object.keys(v).length; return 0;
      case "type":
        v=args[0]; if(v===null)return"<class 'NoneType'>"; if(typeof v==="boolean")return"<class 'bool'>"; if(typeof v==="number")return Number.isInteger(v)?"<class 'int'>":"<class 'float'>"; if(typeof v==="string")return"<class 'str'>"; if(Array.isArray(v))return"<class 'list'>"; return"<class 'dict'>";
      case "str": return this.pythonStr(args[0]);
      case "int": return parseInt(args[0])||0;
      case "float": return parseFloat(args[0])||0.0;
      case "bool": return !!args[0];
      case "list": return Array.isArray(args[0])?[].concat(args[0]):typeof args[0]==="string"?args[0].split(""):Object.entries(args[0]);
      case "sorted": var a=[].concat(args[0]); a.sort(function(x,y){return x<y?-1:x>y?1:0}); return a;
      case "reversed": return [].concat(args[0]).reverse();
      case "abs": return Math.abs(args[0]);
      case "round": return args.length>1?parseFloat(args[0].toFixed(args[1])):Math.round(args[0]);
      case "min": return args.length===1&&Array.isArray(args[0])?Math.min.apply(null,args[0]):Math.min.apply(null,args);
      case "max": return args.length===1&&Array.isArray(args[0])?Math.max.apply(null,args[0]):Math.max.apply(null,args);
      case "sum": return args[0].reduce(function(a,b){return a+b},0);
      case "enumerate": return args[0].map(function(v,i){return [i,v]});
      case "zip": return args[0].map(function(_,i){return args.map(function(a){return a[i]})});
      case "print": this.output.push(args.map(function(a){return this.pythonStr(a)}.bind(this)).join(" ")); return null;
      case "input": return args[0]||"";
      case "isinstance": return true;
      default: return undefined;
    }
  }

  _callMethod(obj, method, args) {
    if (typeof obj === "string") {
      var sm = {upper:function(){return obj.toUpperCase()},lower:function(){return obj.toLowerCase()},strip:function(){return obj.trim()},split:function(s){return s?obj.split(s):obj.split(/\s+/)},join:function(a){return a.join(obj)},replace:function(a,b){return obj.replaceAll(a,b)},startswith:function(s){return obj.startsWith(s)},endswith:function(s){return obj.endsWith(s)},find:function(s){return obj.indexOf(s)},count:function(s){return obj.split(s).length-1},title:function(){return obj.replace(/\b\w/g,function(c){return c.toUpperCase()})},capitalize:function(){return obj.charAt(0).toUpperCase()+obj.slice(1)},format:function(){var r=obj;for(var i=0;i<args.length;i++){r=r.replace("{"+i+"}",this.pythonStr(args[i])).replace("{}",this.pythonStr(args[i]))}return r}.bind(this)};
      if (sm[method]) return sm[method].apply(null, args);
    }
    if (Array.isArray(obj)) {
      var lm = {append:function(v){obj.push(v);return null},extend:function(v){for(var i=0;i<v.length;i++)obj.push(v[i]);return null},insert:function(i,v){obj.splice(i,0,v);return null},remove:function(v){var i=obj.indexOf(v);if(i!==-1)obj.splice(i,1);return null},pop:function(i){return i!==undefined?obj.splice(i,1)[0]:obj.pop()},index:function(v){return obj.indexOf(v)},count:function(v){return obj.filter(function(x){return x===v}).length},sort:function(){obj.sort(function(a,b){return a<b?-1:a>b?1:0});return null},reverse:function(){obj.reverse();return null},copy:function(){return [].concat(obj)},clear:function(){obj.length=0;return null}};
      if (lm[method]) return lm[method].apply(null, args);
    }
    if (typeof obj === "object" && obj !== null) {
      var dm = {keys:function(){return Object.keys(obj)},values:function(){return Object.values(obj)},items:function(){return Object.entries(obj)},get:function(k,d){return obj[k]!==undefined?obj[k]:(d!==undefined?d:null)},update:function(o){Object.assign(obj,o);return null},pop:function(k,d){var v=obj[k];delete obj[k];return v!==undefined?v:d}};
      if (dm[method]) return dm[method].apply(null, args);
      if (typeof obj[method] === "function") return obj[method].apply(obj, args);
      if (obj[method] !== undefined) return obj[method];
    }
    return "__NO_METHOD__";
  }

  findBinaryOp(expr, op) {
    var depth = 0;
    for (var i = expr.length - 1; i >= 0; i--) {
      var c = expr[i];
      if (c === ")" || c === "]" || c === "}") depth++;
      else if (c === "(" || c === "[" || c === "{") depth--;
      if (depth === 0 && expr.slice(i, i + op.length) === op && i > 0) {
        if (op === "*" && expr[i - 1] === "*") continue;
        if (op === "/" && expr[i - 1] === "/") continue;
        return i;
      }
    }
    return -1;
  }

  splitBinary(expr, op) { var i = expr.indexOf(op); return i === -1 ? null : [expr.slice(0, i), expr.slice(i + op.length)]; }

  splitArgs(str) {
    var args = []; var current = ""; var depth = 0; var inStr = false; var strChar = "";
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      if (inStr) { current += c; if (c === strChar) inStr = false; continue; }
      if (c === "'" || c === '"') { inStr = true; strChar = c; current += c; continue; }
      if (c === "(" || c === "[" || c === "{") depth++;
      if (c === ")" || c === "]" || c === "}") depth--;
      if (c === "," && depth === 0) { args.push(current.trim()); current = ""; } else current += c;
    }
    if (current.trim()) args.push(current.trim());
    return args;
  }

  getIndentLevel(line) { var m = line.match(/^(\s*)/); return m ? m[1].length : 0; }

  getBlock(lines, startIdx, baseIndent) {
    var block = [];
    for (var i = startIdx; i < lines.length; i++) {
      var line = lines[i];
      if (line.trim() === "") { block.push(line); continue; }
      if (this.getIndentLevel(line) > baseIndent) block.push(line); else break;
    }
    return block;
  }

  execLines(lines) {
    var i = 0; var lastVal = undefined;
    while (i < lines.length) {
      var raw = lines[i]; var line = raw.trim(); i++;
      if (line === "" || line.startsWith("#")) continue;

      if (line.startsWith("import ")) { var mod = line.slice(7).trim(); if (this.modules[mod]) this.env[mod] = this.modules[mod]; continue; }
      if (line.startsWith("from ")) {
        var m = line.match(/^from\s+(\w+)\s+import\s+(.+)$/);
        if (m && this.modules[m[1]]) { var mod = this.modules[m[1]]; var names = m[2].split(","); for (var ni = 0; ni < names.length; ni++) { var n = names[ni].trim(); if (n === "*") Object.assign(this.env, mod); else if (mod[n] !== undefined) this.env[n] = mod[n]; } }
        continue;
      }

      if (line.startsWith("def ")) {
        var m = line.match(/^def\s+(\w+)\(([^)]*)\)\s*:/);
        if (m) {
          var fname = m[1]; var params = m[2].split(",").map(function(p){return p.trim()}).filter(Boolean);
          var baseIndent = this.getIndentLevel(raw); var body = this.getBlock(lines, i, baseIndent); i += body.length;
          (function(env, params, body, self) {
            env[fname] = function() {
              var args = arguments;
              var savedEnv = Object.assign({}, self.env);
              params.forEach(function(p, idx) { self.env[p] = args[idx]; });
              var retVal = undefined;
              try { self.execLines(body); } catch (e) {
                if (e.message && e.message.indexOf("__RETURN__:") === 0) retVal = JSON.parse(e.message.slice(11)); else throw e;
              }
              for (var pi = 0; pi < params.length; pi++) { if (savedEnv[params[pi]] !== undefined) self.env[params[pi]] = savedEnv[params[pi]]; else delete self.env[params[pi]]; }
              return retVal;
            };
          })(this.env, params, body, this);
        }
        continue;
      }

      if (line.startsWith("return")) { var val = line.slice(6).trim(); throw new Error("__RETURN__:" + JSON.stringify(val ? this.evalExpr(val) : null)); }

      if (line.startsWith("if ") && line.endsWith(":")) {
        var cond = line.slice(3, -1).trim(); var baseIndent = this.getIndentLevel(raw);
        var ifBody = this.getBlock(lines, i, baseIndent); i += ifBody.length;
        var branches = [{ cond: cond, body: ifBody }]; var elseBody = null;
        while (i < lines.length) {
          var nl = lines[i].trim();
          if (nl.startsWith("elif ") && nl.endsWith(":")) { i++; var b = this.getBlock(lines, i, baseIndent); i += b.length; branches.push({ cond: nl.slice(5, -1).trim(), body: b }); }
          else if (nl === "else:") { i++; elseBody = this.getBlock(lines, i, baseIndent); i += elseBody.length; break; }
          else break;
        }
        var ran = false;
        for (var bi = 0; bi < branches.length; bi++) { if (this.evalExpr(branches[bi].cond)) { this.execLines(branches[bi].body); ran = true; break; } }
        if (!ran && elseBody) this.execLines(elseBody);
        continue;
      }

      if (line.startsWith("for ") && line.endsWith(":")) {
        var m = line.match(/^for\s+(\w+)\s+in\s+(.+):$/);
        if (m) {
          var varName = m[1]; var iterable = this.evalExpr(m[2]);
          var baseIndent = this.getIndentLevel(raw); var body = this.getBlock(lines, i, baseIndent); i += body.length;
          for (var fi = 0; fi < iterable.length; fi++) {
            this.env[varName] = iterable[fi];
            try { this.execLines(body); } catch (e) { if (e.message === "__BREAK__") break; if (e.message === "__CONTINUE__") continue; throw e; }
          }
        }
        continue;
      }

      if (line.startsWith("while ") && line.endsWith(":")) {
        var cond = line.slice(6, -1).trim(); var baseIndent = this.getIndentLevel(raw);
        var body = this.getBlock(lines, i, baseIndent); i += body.length;
        var guard = 0;
        while (this.evalExpr(cond) && guard < 10000) { guard++; try { this.execLines(body); } catch (e) { if (e.message === "__BREAK__") break; if (e.message === "__CONTINUE__") continue; throw e; } }
        continue;
      }

      if (line === "break") throw new Error("__BREAK__");
      if (line === "continue") throw new Error("__CONTINUE__");

      var augMatch = line.match(/^(\w+)\s*(\+=|-=|\*=|\/=|\/\/=|%=|\*\*=)\s*(.+)$/);
      if (augMatch) {
        var n = augMatch[1], op = augMatch[2], ve = augMatch[3];
        var v = this.evalExpr(ve);
        var ops = {"+=":function(a,b){return a+b},"-=":function(a,b){return a-b},"*=":function(a,b){return a*b},"/=":function(a,b){return a/b},"//=":function(a,b){return Math.floor(a/b)},"%=":function(a,b){return a%b},"**=":function(a,b){return Math.pow(a,b)}};
        this.env[n] = ops[op](this.env[n], v); continue;
      }

      var reserved = ["if","for","while","def","class","import","from","return","else","elif","not","and","or","in","True","False","None"];
      var assignMatch = line.match(/^(\w+)\s*=\s*(.+)$/);
      if (assignMatch && reserved.indexOf(assignMatch[1]) === -1) {
        this.env[assignMatch[1]] = this.evalExpr(assignMatch[2]); continue;
      }

      var multiAssign = line.match(/^([\w,\s]+)\s*=\s*(.+)$/);
      if (multiAssign) {
        var names = multiAssign[1].split(",").map(function(s){return s.trim()});
        if (names.length > 1) { var val = this.evalExpr(multiAssign[2]); if (Array.isArray(val)) names.forEach(function(n, idx) { this.env[n] = val[idx]; }.bind(this)); continue; }
      }

      try { lastVal = this.evalExpr(line); } catch (e) {
        if (e.message && (e.message.indexOf("__RETURN__:") === 0 || e.message === "__BREAK__" || e.message === "__CONTINUE__")) throw e;
        throw e;
      }
    }
    return lastVal;
  }

  run(code) {
    this.output = [];
    var lines = code.split("\n");
    try {
      var lastVal = this.execLines(lines);
      var lastLine = null;
      for (var i = lines.length - 1; i >= 0; i--) { if (lines[i].trim() && !lines[i].trim().startsWith("#")) { lastLine = lines[i].trim(); break; } }
      if (lastLine && lastLine.indexOf("print(") !== 0 && lastLine.indexOf("=") === -1 && lastLine.indexOf("for ") !== 0 && lastLine.indexOf("if ") !== 0 && lastLine.indexOf("while ") !== 0 && lastLine.indexOf("def ") !== 0 && lastLine.indexOf("import ") !== 0 && lastLine.indexOf("from ") !== 0 && lastVal !== undefined && lastVal !== null) {
        this.output.push(this.pythonRepr(lastVal));
      }
    } catch (e) {
      if (!(e.message && e.message.indexOf("__RETURN__:") === 0))
        this.output.push(e.message || String(e));
    }
    return { output: this.output.join("\n"), variables: Object.assign({}, this.env) };
  }
}


// ═══════════════════════════════════════════════
//  JAVASCRIPT SANDBOX
// ═══════════════════════════════════════════════
function runJavaScript(code, sharedVars) {
  var logs = [];
  var fakeConsole = {
    log: function() { var args = [].slice.call(arguments); logs.push(args.map(function(a){return typeof a==="object"?JSON.stringify(a,null,2):String(a)}).join(" ")); },
    warn: function() { logs.push("[warn] " + [].slice.call(arguments).map(String).join(" ")); },
    error: function() { logs.push("[error] " + [].slice.call(arguments).map(String).join(" ")); },
    info: function() { logs.push([].slice.call(arguments).map(String).join(" ")); },
    table: function(d) { logs.push(JSON.stringify(d, null, 2)); },
    clear: function(){}, time: function(){}, timeEnd: function(){},
  };
  var sandbox = { console: fakeConsole, Math: Math, Date: Date, JSON: JSON, parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN, isFinite: isFinite, Array: Array, Object: Object, String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Map: Map, Set: Set, Promise: Promise, setTimeout: function(fn,ms){return setTimeout(fn,Math.min(ms,5000))}, __vars__: {} };

  var preamble = "";
  if (sharedVars) {
    var keys = Object.keys(sharedVars);
    for (var i = 0; i < keys.length; i++) {
      try { preamble += "let " + keys[i] + " = " + JSON.stringify(sharedVars[keys[i]]) + ";\n"; } catch (e) {}
    }
  }

  var varNames = extractVarNames(code);
  var varCapture = varNames.map(function(n){return "try{if(typeof "+n+"!=='undefined')__lv['"+n+"']="+n+"}catch(e){}"}).join(";");
  var wrapped = '"use strict";\n' + preamble + code + '\n;(function(){try{var __lv={};' + varCapture + '; __vars__=__lv;}catch(e){}})();';
  var argNames = Object.keys(sandbox); var argValues = [];
  for (var i = 0; i < argNames.length; i++) argValues.push(sandbox[argNames[i]]);
  try {
    (new Function(argNames.join(","), wrapped)).apply(null, argValues);
    return { output: logs.join("\n"), variables: sandbox.__vars__, error: null };
  } catch (e) {
    return { output: logs.join("\n"), variables: {}, error: e.message };
  }
}

function extractVarNames(code) {
  var names = [];
  var patterns = [/(?:let|const|var)\s+([\w$]+)/g, /function\s+([\w$]+)/g];
  for (var pi = 0; pi < patterns.length; pi++) {
    var m;
    while ((m = patterns[pi].exec(code)) !== null) { if (names.indexOf(m[1]) === -1) names.push(m[1]); }
  }
  return names;
}


// ═══════════════════════════════════════════════
//  SHARED CODE ENGINE
// ═══════════════════════════════════════════════
class CodeEngine {
  constructor() { this.sharedJS = {}; this.sharedPY = {}; this.executionCount = 0; }

  execute(code, lang) {
    this.executionCount++;
    var start = performance.now();
    var result;
    try {
      if (lang === "python" || lang === "py") {
        var py = new MiniPython(this.sharedPY);
        result = py.run(code);
        Object.assign(this.sharedPY, result.variables);
      } else if (lang === "html") {
        result = { output: null, variables: {}, html: code, error: null };
      } else {
        var jsCode = code;
        if (lang === "ts" || lang === "typescript") {
          jsCode = code.replace(/:\s*\w+(\[\])?\s*(=|,|\)|\n|;)/g, " $2").replace(/:\s*\w+(\[\])?\s*$/gm, "").replace(/<\w+>/g, "").replace(/\bas\s+\w+/g, "");
        }
        result = runJavaScript(jsCode, this.sharedJS);
        Object.assign(this.sharedJS, result.variables);
      }
    } catch (e) {
      result = { output: "", variables: {}, error: e.message };
    }
    var elapsed = (performance.now() - start).toFixed(1);
    result.elapsed = elapsed;
    result.cellNumber = this.executionCount;
    return result;
  }

  reset() { this.sharedJS = {}; this.sharedPY = {}; this.executionCount = 0; }
}


// ═══════════════════════════════════════════════
//  RENDER OUTPUT INTO DOM
// ═══════════════════════════════════════════════
function renderOutput(container, result) {
  container.innerHTML = "";
  container.style.display = "block";

  var status = document.createElement("div");
  status.className = "vcr-status-line";
  status.innerHTML = '<span class="vcr-cell-num">[' + result.cellNumber + ']</span> <span class="vcr-elapsed">' + result.elapsed + 'ms</span>';
  container.appendChild(status);

  if (result.html) {
    var iframe = document.createElement("iframe");
    iframe.className = "vcr-html-frame";
    iframe.sandbox = "allow-scripts";
    iframe.srcdoc = result.html;
    container.appendChild(iframe);
    return;
  }

  if (result.error) {
    var el = document.createElement("div");
    el.className = "vcr-output-line vcr-error";
    el.textContent = result.error;
    container.appendChild(el);
  }

  if (result.output) {
    var lines = result.output.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var cls = lines[i].indexOf("[warn]") === 0 ? "vcr-warning" : lines[i].indexOf("[error]") === 0 ? "vcr-error" : "vcr-stdout";
      var el = document.createElement("div");
      el.className = "vcr-output-line " + cls;
      el.textContent = lines[i];
      container.appendChild(el);
    }
  }

  if (!result.output && !result.error && !result.html) {
    var el = document.createElement("div");
    el.className = "vcr-output-line vcr-success";
    el.textContent = "\u2713 Executed (no output)";
    container.appendChild(el);
  }

  // Variable inspector
  var vars = result.variables;
  if (vars && Object.keys(vars).length > 0) {
    var inspector = document.createElement("div");
    inspector.className = "vcr-inspector-inline";
    var header = document.createElement("div");
    header.className = "vcr-insp-header";
    header.textContent = "\u25E7 Variables";
    var toggle = document.createElement("span");
    toggle.className = "vcr-insp-toggle";
    toggle.textContent = "\u25BE";
    header.appendChild(toggle);
    inspector.appendChild(header);

    var table = document.createElement("table");
    table.className = "vcr-var-table";
    var thead = document.createElement("tr");
    thead.innerHTML = "<th>Name</th><th>Type</th><th>Value</th>";
    table.appendChild(thead);

    var varKeys = Object.keys(vars);
    for (var vi = 0; vi < varKeys.length; vi++) {
      var vname = varKeys[vi];
      var vval = vars[vname];
      if (vname.indexOf("__") === 0 || typeof vval === "function") continue;
      var tr = document.createElement("tr");
      tr.innerHTML = '<td class="vcr-var-name">' + escHtml(vname) + '</td><td class="vcr-var-type">' + escHtml(getTypeName(vval)) + '</td><td class="vcr-var-value">' + escHtml(formatValue(vval)) + '</td>';
      table.appendChild(tr);
    }
    inspector.appendChild(table);
    container.appendChild(inspector);

    var collapsed = false;
    header.addEventListener("click", function() { collapsed = !collapsed; table.style.display = collapsed ? "none" : ""; toggle.textContent = collapsed ? "\u25B8" : "\u25BE"; });
  }
}

function getTypeName(v) {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "number") return Number.isInteger(v) ? "int" : "float";
  if (typeof v === "string") return "str";
  if (Array.isArray(v)) return "list[" + v.length + "]";
  if (typeof v === "object") return "dict{" + Object.keys(v).length + "}";
  return typeof v;
}
function formatValue(v) {
  if (v === null || v === undefined) return "None";
  if (typeof v === "string") return v.length > 80 ? '"' + v.slice(0, 77) + '..."' : '"' + v + '"';
  if (typeof v === "object") { var s = JSON.stringify(v); return s.length > 100 ? s.slice(0, 97) + "..." : s; }
  return String(v);
}
function escHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }


// ═══════════════════════════════════════════════
//  REPL VIEW (standalone panel)
// ═══════════════════════════════════════════════
var VIEW_TYPE_REPL = "vault-code-repl";

class CodeReplView extends obsidian.ItemView {
  constructor(leaf, engine) {
    super(leaf);
    this.engine = engine;
    this.lang = "js";
  }

  getViewType() { return VIEW_TYPE_REPL; }
  getDisplayText() { return "Code REPL"; }
  getIcon() { return "play-circle"; }

  async onOpen() {
    var container = this.containerEl.children[1];
    container.empty();
    container.addClass("vcr-repl");

    var topBar = container.createDiv({ cls: "vcr-repl-topbar" });
    var langSelect = topBar.createEl("select", { cls: "vcr-lang-select" });
    var langs = [["js", "\u2B21 JavaScript"], ["python", "\u25C6 Python"], ["html", "\u25C8 HTML"]];
    for (var i = 0; i < langs.length; i++) {
      var opt = langSelect.createEl("option", { value: langs[i][0], text: langs[i][1] });
      if (langs[i][0] === this.lang) opt.selected = true;
    }
    var self = this;
    langSelect.addEventListener("change", function() { self.lang = langSelect.value; });

    var resetBtn = topBar.createEl("button", { cls: "vcr-repl-btn", text: "\u27F2 Reset" });
    resetBtn.addEventListener("click", function() { self.engine.reset(); new obsidian.Notice("Context reset"); });

    this.outputEl = container.createDiv({ cls: "vcr-repl-output" });

    var inputWrap = container.createDiv({ cls: "vcr-repl-input-wrap" });
    this.inputEl = inputWrap.createEl("textarea", { cls: "vcr-repl-input", attr: { placeholder: "Type code here... (Shift+Enter to run)", spellcheck: "false", rows: "4" } });
    var runBtn = inputWrap.createEl("button", { cls: "vcr-repl-run", text: "\u25B6 Run" });
    runBtn.addEventListener("click", function() { self.runCode(); });
    this.inputEl.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); self.runCode(); }
    });
  }

  runCode() {
    var code = this.inputEl.value.trim();
    if (!code) return;

    var echo = this.outputEl.createDiv({ cls: "vcr-repl-echo" });
    var firstLine = code.split("\n")[0];
    echo.textContent = "In [" + (this.engine.executionCount + 1) + "]: " + firstLine + (code.indexOf("\n") !== -1 ? " ..." : "");

    var resultContainer = this.outputEl.createDiv({ cls: "vcr-repl-result" });
    var result = this.engine.execute(code, this.lang);
    renderOutput(resultContainer, result);

    this.outputEl.scrollTop = this.outputEl.scrollHeight;
    this.inputEl.value = "";
    this.inputEl.focus();
  }

  async onClose() {}
}


// ═══════════════════════════════════════════════
//  MAIN PLUGIN CLASS
// ═══════════════════════════════════════════════
class VaultCodeRunnerPlugin extends obsidian.Plugin {
  async onload() {
    this.engine = new CodeEngine();

    // ─── 1. registerMarkdownCodeBlockProcessor for run-* fences ───
    // These work in BOTH Live Preview (edit mode) and Reading View
    var fences = [
      ["run-js", "js"], ["run-javascript", "js"],
      ["run-ts", "ts"], ["run-typescript", "ts"],
      ["run-py", "python"], ["run-python", "python"],
      ["run-html", "html"],
    ];
    var self = this;
    for (var fi = 0; fi < fences.length; fi++) {
      (function(fence, lang) {
        self.registerMarkdownCodeBlockProcessor(fence, function(source, el, ctx) {
          self.renderRunnableBlock(source, lang, el);
        });
      })(fences[fi][0], fences[fi][1]);
    }

    // ─── 2. Post processor for regular fences (reading view) ───
    this.registerMarkdownPostProcessor(function(el, ctx) {
      var codeBlocks = el.querySelectorAll("pre > code");
      for (var i = 0; i < codeBlocks.length; i++) {
        var codeEl = codeBlocks[i];
        var pre = codeEl.parentElement;
        if (!pre || pre.classList.contains("vcr-processed")) continue;
        var lang = null;
        for (var j = 0; j < codeEl.classList.length; j++) {
          if (codeEl.classList[j].indexOf("language-") === 0) { lang = codeEl.classList[j].replace("language-", ""); break; }
        }
        if (!lang || ["js","javascript","ts","typescript","python","py","html"].indexOf(lang) === -1) continue;
        pre.classList.add("vcr-processed");
        var code = codeEl.textContent || "";
        self._wrapPreWithRunButton(pre, code, lang);
      }
    });

    // ─── 3. Ctrl+Enter: run block at cursor ───
    this.addCommand({
      id: "run-code-at-cursor",
      name: "Run code block at cursor (Ctrl+Enter)",
      hotkeys: [{ modifiers: ["Ctrl"], key: "Enter" }],
      editorCallback: function(editor, view) {
        var cursor = editor.getCursor();
        var allText = editor.getValue();
        var lines = allText.split("\n");
        var blockStart = -1, blockEnd = -1, lang = null;
        for (var i = cursor.line; i >= 0; i--) {
          var m = lines[i].match(/^```(\w[\w-]*)/);
          if (m) { blockStart = i; lang = m[1]; break; }
          if (lines[i].trim() === "```" && i < cursor.line) break;
        }
        if (blockStart === -1) { new obsidian.Notice("Cursor is not inside a code block"); return; }
        for (var i = blockStart + 1; i < lines.length; i++) {
          if (lines[i].trim() === "```") { blockEnd = i; break; }
        }
        if (blockEnd === -1) { new obsidian.Notice("Code block not closed"); return; }
        if (cursor.line <= blockStart || cursor.line >= blockEnd) { new obsidian.Notice("Cursor is not inside a code block"); return; }

        var code = lines.slice(blockStart + 1, blockEnd).join("\n");
        var normLang = lang.replace("run-", "");
        if (["js","javascript","ts","typescript","python","py","html"].indexOf(normLang) === -1) {
          new obsidian.Notice("Unsupported language: " + lang); return;
        }

        var result = self.engine.execute(code, normLang);
        if (result.error) new obsidian.Notice("\u274C " + result.error, 8000);
        else if (result.output) new obsidian.Notice("[" + result.cellNumber + "] " + result.output.slice(0, 500), 8000);
        else new obsidian.Notice("\u2713 [" + result.cellNumber + "] Executed (" + result.elapsed + "ms)", 4000);
      },
    });

    // ─── 4. Ctrl+Shift+Enter: run all blocks ───
    this.addCommand({
      id: "run-all-blocks",
      name: "Run all code blocks in current note",
      hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "Enter" }],
      editorCallback: function(editor) {
        var text = editor.getValue();
        var blocks = self.extractCodeBlocks(text);
        if (blocks.length === 0) { new obsidian.Notice("No runnable code blocks found"); return; }
        var summary = [];
        for (var i = 0; i < blocks.length; i++) {
          var result = self.engine.execute(blocks[i].code, blocks[i].lang);
          summary.push("[" + result.cellNumber + "] " + blocks[i].lang + ": " + (result.error ? "\u274C " + result.error : result.output ? result.output.split("\n")[0] : "\u2713"));
        }
        new obsidian.Notice(summary.join("\n"), 10000);
      },
    });

    // ─── 5. REPL panel ───
    this.registerView(VIEW_TYPE_REPL, function(leaf) { return new CodeReplView(leaf, self.engine); });
    this.addCommand({ id: "toggle-code-repl", name: "Toggle Code REPL panel", hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "`" }], callback: function() { self.toggleRepl(); } });

    // ─── 6. Reset ───
    this.addCommand({ id: "reset-code-context", name: "Reset shared code context", callback: function() { self.engine.reset(); new obsidian.Notice("Code context reset"); } });

    // Ribbon
    this.addRibbonIcon("play-circle", "Toggle Code REPL", function() { self.toggleRepl(); });
  }

  onunload() {}

  renderRunnableBlock(source, lang, el) {
    var wrapper = el.createDiv({ cls: "vcr-cell" });
    var header = wrapper.createDiv({ cls: "vcr-header" });
    var icons = { js: "\u2B21", ts: "\u25C7", python: "\u25C6", html: "\u25C8" };
    var labels = { js: "JavaScript", ts: "TypeScript", python: "Python", html: "HTML" };
    header.createSpan({ cls: "vcr-lang-badge", text: (icons[lang] || "\u25CF") + " " + (labels[lang] || lang) });
    var controls = header.createDiv({ cls: "vcr-controls" });
    var runBtn = controls.createEl("button", { cls: "vcr-run-btn", text: "\u25B6 Run" });

    var pre = wrapper.createEl("pre", { cls: "vcr-code-pre" });
    var codeEl = pre.createEl("code");
    codeEl.textContent = source;

    var outputArea = wrapper.createDiv({ cls: "vcr-output" });
    outputArea.style.display = "none";

    var self = this;
    runBtn.addEventListener("click", function(e) {
      e.preventDefault(); e.stopPropagation();
      var result = self.engine.execute(source, lang);
      renderOutput(outputArea, result);
    });
  }

  _wrapPreWithRunButton(pre, code, lang) {
    var wrapper = document.createElement("div");
    wrapper.className = "vcr-cell";
    pre.parentNode.insertBefore(wrapper, pre);

    var header = document.createElement("div");
    header.className = "vcr-header";
    var icons = { js: "\u2B21", javascript: "\u2B21", ts: "\u25C7", typescript: "\u25C7", python: "\u25C6", py: "\u25C6", html: "\u25C8" };
    var labels = { js: "JavaScript", javascript: "JavaScript", ts: "TypeScript", typescript: "TypeScript", python: "Python", py: "Python", html: "HTML" };
    var badge = document.createElement("span");
    badge.className = "vcr-lang-badge";
    badge.textContent = (icons[lang] || "\u25CF") + " " + (labels[lang] || lang);
    header.appendChild(badge);

    var controls = document.createElement("div");
    controls.className = "vcr-controls";
    var runBtn = document.createElement("button");
    runBtn.className = "vcr-run-btn";
    runBtn.textContent = "\u25B6 Run";
    controls.appendChild(runBtn);
    header.appendChild(controls);

    wrapper.appendChild(header);
    wrapper.appendChild(pre);

    var outputArea = document.createElement("div");
    outputArea.className = "vcr-output";
    outputArea.style.display = "none";
    wrapper.appendChild(outputArea);

    var self = this;
    runBtn.addEventListener("click", function(e) {
      e.preventDefault(); e.stopPropagation();
      var result = self.engine.execute(code, lang);
      renderOutput(outputArea, result);
    });
  }

  extractCodeBlocks(text) {
    var blocks = [];
    var regex = /```([\w-]+)\n([\s\S]*?)```/g;
    var m;
    while ((m = regex.exec(text)) !== null) {
      var lang = m[1].replace("run-", "");
      if (["js","javascript","ts","typescript","python","py","html"].indexOf(lang) !== -1) {
        blocks.push({ lang: lang, code: m[2] });
      }
    }
    return blocks;
  }

  async toggleRepl() {
    var leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REPL);
    if (leaves.length > 0) { for (var i = 0; i < leaves.length; i++) leaves[i].detach(); }
    else {
      var leaf = this.app.workspace.getLeaf("split", "horizontal");
      await leaf.setViewState({ type: VIEW_TYPE_REPL, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }
}
