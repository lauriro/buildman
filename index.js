
var undef, fileHashes
, spawn = require("child_process").spawn
, path = require("path")
, util = require("util")
, events = require("events")
, fs = require("fs")
, CONF_FILE = path.resolve("package.json")
, conf = require( CONF_FILE ) || {}
, hasOwn = Object.prototype.hasOwnProperty
, files = {}
, adapters = File.adapters = {
	css: { split: cssSplit, sep: "\n" },
	html: { split: htmlSplit },
	js: { min: jsMin, sep: "" }
}
, translate = {
	// http://nodejs.org/api/documentation.html
	stability: "0 - Deprecated,1 - Experimental,2 - Unstable,3 - Stable,4 - API Frozen,5 - Locked".split(","),
	date: new Date().toISOString().split("T")[0]
}

function File(_name, _opts) {
	var file = this
	, name = path.resolve(_name.split("?")[0])

	if (files[name]) {
		return files[name]
	}
	if (!(file instanceof File)) {
		return new File(name, _opts)
	}

	events.call(file)

	var opts = file.opts = _opts || {}
	, ext = file.ext = name.split(".").pop()

	files[name] = file
	file._depends = []
	file.write = file.write.bind(file)

	if (!("root" in opts)) {
		opts.root = name.replace(/[^\/]*$/, "")
	}
	file.name = opts.name = name//.slice(opts.root.length)

	if (typeof opts.input == "string") {
		opts.input = [opts.input]
	}

	if (opts.sourceMap === true) {
		opts.sourceMap = name.replace(/\?|$/, ".map$&").slice(opts.root.length)
	}
	if (opts.toggle) {
		if (!opts.replace) {
			opts.replace = []
		}
		opts.replace.push([
			new RegExp("\\/\\/(?=\\*\\*\\s+(?:" + opts.toggle + "))", "g"),
			"/*"
		])
	}

	file.reset()

	setImmediate(file.wait())
	readFileHashes(opts, file.wait())

	file.build()

	return file
}

File.prototype = {
	wait: hold,
	syncMethods: ["on", "toString"],
	depends: function(child) {
		var file = this
		child.on("change", file.write)
		return file
	},
	reset: function() {
		var file = this

		file._depends.forEach(function() {
			child.off("change", file.write)
		})
		file._depends.length = 0
		file.content = []
		return file
	},
	build: function() {
		var file = this
		, opts = file.opts
		, resume = file.wait()
		, adapter = adapters[file.ext] || {}

		if (opts.input) {
			file.content = opts.input.map(function(fileName, i, arr) {
				if (!fs.existsSync(path.resolve(fileName))) {
					fileName = arr[i] = require.resolve(fileName)
				}
				var child = File(fileName, {
					noMin: opts.noMin,
					replace: opts.replace,
					root: opts.root
				}).then(resume.wait())
				file.depends(child)
				return child
			})
			file.write()
		} else {
			var source = readFile(file.name)

			if (opts.replace) {
				opts.replace.forEach(function(arr) {
					source = source.replace(arr[0], arr[1])
				})
			}

			file.content = adapter.split ? adapter.split(source, opts) : [ source ]
			file.content.forEach(function(junk, i, arr) {
				if (adapter.min && !opts.noMin && typeof junk == "string") {
					resume.wait()

					adapter.min(junk, function(err, res) {
						arr[i] = res
						resume()
					})
				} else if (junk instanceof File) {
					file.depends(junk)
					junk.then(resume.wait())
				}
			})
		}

		setImmediate(resume)
	},
	write: function(by) {
		var file = this
		if (!file.opts.mem) {
			writeFile(file.name, file.toString())
		}
	},
	then: function(next, scope) {
		if (typeof next == "function") {
			next.call(scope || this)
		}
		return this
	},
	toString: function() {
		var file = this
		, opts = file.opts
		, adapter = adapters[file.ext] || {}
		, str = file.content.filter(Boolean).join(adapter.sep || "")

		return (
			(opts.banner ? opts.banner + "\n" : "") +
			str.trim() +
			(opts.sourceMap ? "\n//# sourceMappingURL=" + opts.sourceMap + "\n" : "")
		)
	}
}

util.inherits(File, events)


function wait(fn) {
	var pending = 1
	function resume() {
		if (!--pending && fn) fn.call(this)
	}
	resume.wait = function() {
		pending++
		return resume
	}
	return resume
}

function hold(ignore) {
	var k
	, obj = this
	, hooks = []
	, hooked = []
	, _resume = wait(resume)
	ignore = ignore || obj.syncMethods || []

	for (k in obj) if (typeof obj[k] == "function" && ignore.indexOf(k) == -1) !function(k) {
		hooked.push(k, hasOwn.call(obj, k) && obj[k])
		obj[k] = function() {
			hooks.push(k, arguments)
			return obj
		}
	}(k)

	/**
	 * `wait` is already in hooked array,
	 * so override hooked method
	 * that will be cleared on resume.
	 */
	obj.wait = _resume.wait

	return _resume

	function resume() {
		for (var v, scope = obj, i = hooked.length; i--; i--) {
			if (hooked[i]) obj[hooked[i-1]] = hooked[i]
			else delete obj[hooked[i-1]]
		}
		// i == -1 from previous loop
		for (; v = hooks[++i]; ) {
			scope = scope[v].apply(scope, hooks[++i]) || scope
		}
		hooks = hooked = null
	}
}

function htmlSplit(str, opts) {
	var pos, file, ext, file2, match, match2, out, squash, tmp
	, squashed = []
	, lastIndex = 0
	, re = /<link[^>]+href="([^>]*?)".*?>|<(script)[^>]+src="([^>]*?)"[^>]*><\/\2>/ig
	, buildRe   = /\sbuild=(("|')(.+?)\2|[^\s]+)/i
	, inlineRe = /\sinline\b(?:=["']?([^"']+))?/i
	, excludeRe = /\sexclude\b/i
	, squashRe = /\s+squash\b(?:=["']?(.+?)["'])?/i
	, load = []

	str = str
	.replace(/<!((?:--)+)[^]*?\1>/g, "")
	.replace(/data-(?=manifest=)/, "")

	for (out = [ str ]; match = re.exec(str); ) {
		file = opts.root + (match[1] || match[3])
		ext = match[2] ? "js" : "css"
		pos = out.length
		out.splice(-1, 1,
			str.slice(lastIndex, match.index), "",
			str.slice(lastIndex = re.lastIndex)
		)

		if (match2 = buildRe.exec(match[0])) {
			File(file, { noMin: 1, input: (match2[3] || match2[1]).split(",") })
		}

		if (excludeRe.test(match[0])) {
			continue
		}

		if (match2 = squashRe.exec(match[0])) {
			file2 = (
				match2[1] ? opts.root + match2[1] :
				squash && squash.ext == ext ? squash.name :
				opts.root + squashed.length.toString(32) + "." + ext
			)
			if (!squash || squash.name !== file2) {
				squash = File(file2, { input: [] })
				squashed.push(squash.wait())
			}
			squash.opts.input.push(file.replace(/\?.*/, ""))
			if (squash.opts.input.length > 1) {
				continue
			}
			file = file2
		}
		var dataIf = /\sdata-if="([^"?]+)/.exec(match[0])
		if (inlineRe.test(match[0])) {
			out.splice(-2, 1,
				match[2] ? "<script>" : "<style>",
				File(file, {
					replace: [
						["/*!{loadFiles}*/", load]
					]
				}),
				match[2] ? "</script>" : "</style>"
			)
		} else if (match[2] || dataIf) {
			load.push(
				(dataIf ? "(" + dataIf[1] + ")&&'" : "'") +
				file.slice(opts.root.length) + "'"
			)
		} else {
			tmp = match[0]
			if (match2) {
				tmp = tmp
				.replace(squashRe, "")
				.replace(match[1] || match[3], file.slice(opts.root.length))
			}
			out[pos] = tmp
		}
	}
	squashed.forEach(function(fn) { fn() })
	return out.filter(Boolean).map(htmlMin, opts)
}

function htmlMin(str) {
	var opts = this
	return typeof str !== "string" ? str : str
	.replace(/[\r\n]+/g, "\n")
	.replace(/\n\s*\n/g, "\n")
	.replace(/\t/g, " ")
	.replace(/\s+(?=<|\/?>|$)/g, "")
	.replace(/\b(href|src)="(?!data:)(.+?)"/gi, function(_, tag, file) {
		return tag + '="' + normalizePath(file, opts.root) + '"'
	})
}

function cssSplit(str, opts) {
	var match, out
	, lastIndex = 0
	, re = /@import\s+url\((['"]?)(?!data:)(.+?)\1\);*/ig

	if (opts.root !== opts.name.replace(/[^\/]*$/, "")) {
		str = str.replace(/url\((['"]?)(?!data:)(.+?)\1\)/ig, function(_, q, name) {
			name = path.resolve(opts.name.replace(/[^\/]*$/, name))
			name = name.replace(/{hash}/g, fileHashes[name.split("?")[0]] || "")
			return 'url("' + path.relative(opts.root, name) + '")'
		})
	}

	for (out = [ str ]; match = re.exec(str); ) {
		out.splice(-1, 1,
			str.slice(lastIndex, match.index),
			File(path.resolve(opts.root, match[2]), opts),
			str.slice(lastIndex = re.lastIndex)
		)
	}
	return out.filter(Boolean).map(cssMin, opts)
}

function cssMin(str) {
	var opts = this
	return typeof str !== "string" ? str : str
	.replace(/\/\*(?!!)[^]*?\*\//g, "")
	.replace(/[\r\n]+/g, "\n")

	.replace(/(.*)\/\*!\s*([\w-]+)\s*([\w-.]*)\s*\*\//g, function(_, line, cmd, param) {
		switch (cmd) {
		case "data-uri":
			line = line.replace(/url\((['"]?)(.+?)\1\)/g, function(_, quote, fileName) {
				var str = fs.readFileSync(path.resolve(opts.root + fileName), "base64")
				return 'url("data:image/' + fileName.split(".").pop() + ";base64," + str + '")'
			})
			break;
		}
		return line
	})

	// Remove optional spaces and put each rule to separated line
	.replace(/(["'])((?:\\?.)*?)\1|[^"']+/g, function(_, q, str) {
		if (q) return q == "'" && str.indexOf('"') == -1 ? '"' + str + '"' : _
		return _.replace(/[\t\n]/g, " ")
		.replace(/ *([,;{}]) */g, "$1")
		.replace(/^ +|;(?=})/g, "")
		.replace(/: +/g, ":")
		.replace(/ and\(/g, " and (")
		.replace(/}(?!})/g, "}\n")
	})

	// Use CSS shorthands
	.replace(/([^0-9])-?0(px|em|%|in|cm|mm|pc|pt|ex)/g, "$10")
	.replace(/:0 0( 0 0)?(;|})/g, ":0$2")
	.replace(/url\("([\w\/_.-]*)"\)/g, "url($1)")
	.replace(/([ :,])0\.([0-9]+)/g, "$1.$2")
}


function jsMin(str, next) {
	var res = ""
	, closure = spawn("closure-compiler")

	closure.on("close", function() {
		next(null, res)
	})

	closure.stdout.on("data", function(chunk) {
		res += chunk
	})
	closure.stdin.end(str)
}

function programExists(name, next) {
	exec("command -v " + name, next)
}

function readFileHashes(opts, next) {
	if (fileHashes) return next()
	fileHashes = {}
	// $ git ls-tree -r --abbrev=1 HEAD
	// 100644 blob 1f537	public/robots.txt
	// 100644 blob 0230	public/templates/devices.haml
	// $ git cat-file -p 1f537
	var data = ""
	, git = spawn("git", ["ls-files", "-sz", "--abbrev=1"])
	, cwd = process.cwd() + "/"

	git.stdout.on("data", function (_data) {
		data += _data
	})
	git.stderr.pipe(process.stderr)

	git.on("close", function (code) {
		data.split("\0").reduceRight(function(map, line, index) {
			if (line) {
				index = line.indexOf("\t")
				map[cwd + line.slice(1 + index)] = line.split(" ")[1]
			}
			return map
		}, fileHashes)
		next()
	})
}

function execute() {
	var input, output, arg
	, args = process.argv
	, i = 2

	for (; arg = args[i++]; ) {
		switch (arg) {
		case "-i":
			if (!input) input = []
			input.push(args[i++])
			break;
		case "-o":
			output = args[i++]
			break;
		case "-r":
			updateReadme(args[i++])
			break;
		}
		if (input && output) {
			File(output, { input: input })
			input = output = ""
		}
	}
}

if (module.parent) {
	// Used as module
	exports.File = File
	exports.updateReadme = updateReadme
} else {
	// executed as standalone
	execute()
	if (conf.readmeFilename) {
		updateReadme(conf.readmeFilename)
	}
}

function normalizePath(p, root) {
	for (; p != (p = p.replace(/[^/]*[^.]\/\.\.\/|(^|[^.])\.\/|(.)\/(?=\/)/, "$1$2")); );
	p = p.replace(/{hash}/g, fileHashes[root + p.split("?")[0]] || "")
	return p
}

function readFile(fileName) {
	return fs.readFileSync(path.resolve(fileName.split("?")[0]), "utf8")
}

function writeFile(fileName, content) {
	fs.writeFileSync(path.resolve(fileName.split("?")[0]), content, "utf8")
}

function updateReadme(file) {
	var data = readFile(file)
	, out = data.replace(/(@(version|date|author|stability)\s+).*/g, function(all, match, tag) {
		tag = translate[tag] ? translate[tag][conf[tag]] || translate[tag] : conf[tag]
		return tag ? match + tag : all
	})

	if (data != out) {
		console.log("# Update readme: " + file)
		writeFile(file, out)
	}
}

