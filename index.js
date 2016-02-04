


/*
 * @version  0.2.34
 * @date     2016-02-04
 * @license  MIT License
 */



var gm, undef, fileHashes
, path = require("path")
, fs = require("fs")
, BUILD_ROOT = path.resolve("b")
, CONF_FILE = path.resolve("package.json")
, exec = require("child_process").exec
, spawn = require("child_process").spawn
, conf = require( CONF_FILE ) || {}
, files = conf.buildman || {}
, updatedReadmes = {}
, opened = {}
, translate = {
	// http://nodejs.org/api/documentation.html
	stability: "0 - Deprecated,1 - Experimental,2 - Unstable,3 - Stable,4 - API Frozen,5 - Locked".split(","),
	// https://spdx.org/licenses/
	license: require(path.resolve(__dirname, "all-licenses.json")),
	date: new Date().toISOString().split("T")[0]
}



function notChanged(args, next) {
	var newest = fs.statSync(CONF_FILE).mtime

	args.input.forEach(function(name, i, arr) {
		name = name.split("?")[0]
		if (!fs.existsSync(path.resolve(name))) {
			name = arr[i] = require.resolve(name)
		}
		var stat = fs.statSync(path.resolve(name))
		if (newest < +stat.mtime) newest = stat.mtime
	})

	if (fs.existsSync(path.resolve(args.output)) && newest < fs.statSync(path.resolve(args.output)).mtime) {
		next && next()
		return true
	}

	console.log("# Build " + args.output)
}


function minJs(args, next) {
	if (notChanged(args, next)) return

	var subDirFileRe = /\//
	, querystring = require("querystring")
	, banner = args.banner ? args.banner + "\n" : ""
	, fileString = args.input.map(function(name) {
		if (!subDirFileRe.test(name)) {
			updateReadme(name)
		}
		return readFile(name)
	}).join("\n")
	, output = opened[args.output] = fs.createWriteStream(path.resolve(args.output.split("?")[0]))

	if (args.sourceMap === true) {
		args.sourceMap = args.output.replace(/\?|$/, ".map$&")
	}

	function outputDone() {
		console.log("# compile DONE " + args.output)
		if (args.sourceMap) {
			output.write("//# sourceMappingURL=" + args.sourceMap + "\n")
		}
		output.end(function() {
			opened[args.output] = null
			if (next) next()
		})
	}

	if (args.toggle) fileString = fileString.replace(new RegExp("\\/\\/(?=\\*\\*\\s+(?:" + args.toggle + "))", "g"), "/*")

	if (args.devel) {
		if (typeof args.devel != "string") args.devel = args.output.replace(".js", "-src.js")
		writeFile(args.devel, banner + fileString)
	}

	output.write(banner)

	function compileLocal() {
		console.log("# compileLocal START " + args.output)
		var closure = spawn("closure",
			args.sourceMap ?
			["--create_source_map", args.sourceMap, "--source_map_format", "V3"] :
			[]
		)
		closure.on("close", outputDone)

		closure.stdout.pipe(output, { end: false })
		closure.stderr.pipe(process.stderr)
		closure.stdin.end(fileString)
	}

	function compileOnline() {
		console.log("# compileOnline START " + args.output)
		args.sourceMap = false // Online compiler does not support sourceMap
		var postData = querystring.stringify(
			{ "output_format": "json"
			//, "compilation_level" : "ADVANCED_OPTIMIZATIONS"
			, "output_info": ["compiled_code", "warnings", "errors", "statistics"]
			, "js_code" : fileString
			})
		, postOptions =
			{ host: "closure-compiler.appspot.com"
			, path: "/compile"
			, method: "POST"
			, headers:
				{ "Content-Type": "application/x-www-form-urlencoded"
				, "Content-Length": postData.length
				}
			}
		, postReq = require("http").request(postOptions, function(res) {
			var text = ""
			res.setEncoding("utf8");
			res.on("data", function (chunk) {
				text += chunk
			});
			res.on("end", function(){
				console.log("# compileOnline DONE " + args.output)
				try {
					var json = JSON.parse(text)
					output.write(json.compiledCode + "\n")
				} catch (e) {
					console.error("ERROR:", text)
					throw "Invalid response"
				}
				outputDone()
			})
		})

		postReq.end(postData);
	}

	programExists("closure", function(err) {
		if (err) return compileOnline()

		compileLocal()
	})
}


function readFile(fileName) {
	return fs.readFileSync(path.resolve(fileName.split("?")[0]), "utf8")
}

function writeFile(fileName, content) {
	fs.writeFileSync(path.resolve(fileName.split("?")[0]), content, "utf8")
}

function minHtml(args, next) {
	readFileHashes(_minHtml, args, next)
}

function _minHtml(args, next) {
	args.input = [ args.template ]
	if (args.bootstrap) args.input.push(args.bootstrap)

	var squash, match
	, squashFiles = []
	, root = args.template.replace(/[^\/]+$/, "")
	, rawFiles = []
	, scripts = []
	, asIsRe = /\sas-is\s/i
	, deferScripts = []
	, inlineRe = /\sinline\s/i
	, excludeRe = /\sexclude\s/i
	, exclude = args.exclude || []
	, inline = args.inline || []
	, replace = args.replace || {}

	var output = readFile(args.template)
	.replace(/[\r\n]+/g, "\n")
	.replace(/\n\s*\n/g, "\n")
	.replace(/\t/g, " ")
	.replace(/\s+</g, "<")
	.replace(/<!--[\s\S]*?-->/g, "")
	.replace(/<(script)[^>]+src="([^>]*?)"[^>]*><\/\1>/g, function(_, tag, file) {
		if (asIsRe.test(_)) return _.replace(asIsRe, " ")
		if (exclude.indexOf(file) == -1 && !excludeRe.test(_)) {
			var dataIf = /\sdata-if="([^"]+)"/.exec(_)
			file = replace[file] || file
			if (inlineRe.test(_) || inline.indexOf(file) != -1) {
				var bs = readFile(root + file).trim()
				if (dataIf) bs = "if(" + dataIf[1] + "){" + bs + "}"
				return "\f<script>" + bs + "</script>"
			}
			if (match = /\ssquash(?:="([^"]+)"|\b)/i.exec(_)) {
				if (!squash || match[1] && match[1] != squash.output) {
					var out = match[1] || squashFiles.length.toString(32) + ".js"
					squash = { input:[], file: out, output: root + out, toggle: args.toggle }
					squashFiles.push(squash)
				}
				args.input.push(root + file)
				squash.input.push(root + file)
				file = squash.file
			} else {
				squash = null
			}
			rawFiles.push(file)
			var arr = /\b(async|defer)\b/i.test(_) ? deferScripts : scripts
			file = '"' + normalizePath(file, root) + '"'
			if (dataIf) file = "(" + dataIf[1] + ")&&" + file
			if (arr.indexOf(file) == -1) arr.push(file)
		}
		return "\f"
	})
	.replace(/\b(href|src)="(?!data:)(.+?)"/gi, function(_, tag, file) {
		return tag + '="' + normalizePath(file, root) + '"'
	})

	if (notChanged(args, next)) return

	var pending = squashFiles.length
	if (opened[args.bootstrap]) {
		pending++
		opened[args.bootstrap].on("finish", fileDone)
	}

	function fileDone() {
		if (--pending == 0) writeOutput()
	}

	if (pending) {
		squashFiles.forEach(function(obj) {
			minJs(obj, fileDone)
		})
	} else {
		writeOutput()
	}

	function writeOutput() {
		output = output
		// <link rel="stylesheet" type="text/css" href="app.css">
		//.replace(/<link>/)
		.replace(/<link[^>]+href="([^>]*?)".*?>/g, function(_, file) {
			if (exclude.indexOf(file) > -1 || excludeRe.test(_)) return ""
			if (replace[file]) {
				_ = _.replace(file, normalizePath(replace[file], root))
				file = replace[file]
			}
			if (inlineRe.test(_) || inline.indexOf(file) != -1) {
				return "<style>" + readFile(root + file).trim() + "</style>"
			}
			return _
		})
		.replace(/\f+/, function(){
			if (!args.bootstrap) return ""

			var bs = readFile(args.bootstrap)
			.replace("this,[]", "this,[" + scripts + "]" +
				(deferScripts.length ? ", function(){xhr.load([" + deferScripts + "])}" : "") )

			return "<script>\n" + bs + "</script>"
		})
		.replace(/\f+/g, "")
		//This breakes code when haml followed by javascript
		//.replace(/[\s;]*<\/script>\s*<script>/g, ";")

		if (args.manifest) {
			console.log("# Update manifest: " + args.manifest)
			var escapeRe = /[.*+?^=!:${}()|\[\]\/\\]/g
			, replacedFiles = []
			, buildedFiles = Object.keys(files)
			, manifestFile = readFile(root + args.manifest)
				.replace(/#.+$/m, "# " + new Date().toISOString())

			buildedFiles.forEach(function(file) {
				var replace = files[file].replace
				if (replace) for (var key in replace) {
					replacedFiles.push(replace[key])
				}
			})

			replacedFiles
			.concat(buildedFiles, rawFiles)
			.filter(function(file, pos, arr) {
				return file.indexOf("{hash}") != -1 && arr.lastIndexOf(file) == pos
			})
			.forEach(function(file) {
				var reStr = "^"
				+ file.replace("{hash}", "\f").replace(escapeRe, "\\$&").replace(/\f/g, "[0-9a-f]*")
				+ "$"
				, re = new RegExp(reStr, "m")
				manifestFile = manifestFile.replace(re, normalizePath(file, root))
			})

			writeFile(root + args.manifest, manifestFile)
			output = output.replace(/<html\b/, '$& manifest="' + args.manifest + '"')
		}

		writeFile(args.output, output)
		if (next) next()
	}
}

function readFileHashes(next, args, _next) {
	if (fileHashes) return next(args, _next)
	fileHashes = {}
	// $ git ls-tree -r --abbrev=1 HEAD
	// 100644 blob 1f537	public/robots.txt
	// 100644 blob 0230	public/templates/devices.haml
	// $ git cat-file -p 1f537
	var data = ""
	, git = spawn("git", ["ls-files", "-sz", "--abbrev=1"])

	git.stdout.on("data", function (_data) {
		data += _data
	})
	git.stderr.pipe(process.stderr)

	git.on("close", function (code) {
		data.split("\0").reduceRight(function(map, line, index) {
			if (line) {
				index = line.indexOf("\t")
				map[line.slice(1 + index)] = line.split(" ")[1]
			}
			return map
		}, fileHashes)
		next(args, _next)
	})
}

function normalizePath(p, root) {
	for (;p != (p = p.replace(/[^/]*[^.]\/\.\.\/|(^|[^.])\.\/|(.)\/(?=\/)/, "$1$2")););
	p = p.replace(/{hash}/g, fileHashes[root + p.split("?")[0]] || "")
	return p
}

function cssImport(args, str, _path) {
	if (_path) {
		str = str.replace(/url\(['"]?(?!data:)/g, "$&" + _path)
	}

	return str
	.replace(/\/\*[^!][\s\S]*?\*\//g, "")
	.replace(/@import\s+url\((['"]?)(?!data:)(.+?)\1\);*/g, function(_, quote, fileName) {
		var file = readFile(args.root + fileName)
		args.input.push(args.root + fileName)
		return cssImport(args, file, fileName.replace(/[^\/]*$/, ""))
	})
}

function minCss(args, next) {
	readFileHashes(_minCss, args, next)
}

function _minCss(args, next) {
	if (!("root" in args)) args.root = args.output.replace(/[^\/]*$/, "")

	var out = cssImport(args, "@import url('" + args.input.map(function(name) {
		return name.slice(args.root.length)
	}).join("');@import url('") + "');", "")

	if (notChanged(args, next)) return

	out = out.replace(/[\r\n]+/g, "\n")

	//TODO:sprite
	//out = out.replace(/url\((['"]?)(.+?)\1\)[; \t]*\/\*!\s*data-uri\s*\*\//g, function(_, quote, fileName) {
	out = out.replace(/(.*)\/\*!\s*([\w-]+)\s*([\w-.]*)\s*\*\//g, function(_, line, cmd, param) {
		switch (cmd) {
		case "data-uri":
			line = line.replace(/url\((['"]?)(.+?)\1\)/g, function(_, quote, fileName) {
				var str = fs.readFileSync(path.resolve(args.root + fileName), "base64")
				return 'url("data:image/' + fileName.split(".").pop() + ";base64," + str + '")'
			})
			break;
		case "sprite":
			if (!gm) try {
				gm = require("gm")
			} catch (e) {
				console.log("# Please install optional module gm for sprites")
				process.exit(1)
			}

			line = line.replace(/url\((['"]?)(.+?)\1\)([^)]*)/g, function(_, quote, fileName, pos) {
				return 'url("' + param + "." + fileName.split(".").pop() + '")'
					+ pos
						.replace(/px 0px/, "px -" + 1 + "px")
						.replace(/\btop\b/, "-" + 1 + "px")
						// -e "s/)/) 0px -${pos}px/"
			})
			break;
		}
		return line
	})


	// Remove optional spaces and put each rule to separated line
	out = out.replace(/(["'])((?:\\?.)*?)\1|[^"']+/g, function(_, q, str) {
		if (q) return q == "'" && str.indexOf('"') == -1 ? '"' + str + '"' : _
		return _.replace(/[\t\n]/g, " ")
		.replace(/ *([,;{}]) */g, "$1")
		.replace(/^ +|;(?=})/g, "")
		.replace(/: +/g, ":")
		.replace(/ and\(/g, " and (")
		.replace(/}(?!})/g, "}\n")
	})

	// Use CSS shorthands
	out = out
	.replace(/([^0-9])-?0(px|em|%|in|cm|mm|pc|pt|ex)/g, "$10")
	.replace(/:0 0( 0 0)?(;|})/g, ":0$2")
	.replace(/url\("(?!data:)(.+?)"/g, function(_, file) {
		return 'url("' + normalizePath(file, args.root) + '"'
	})
	.replace(/url\("([\w\/_.-]*)"\)/g, "url($1)")
	.replace(/([ :,])0\.([0-9]+)/g, "$1.$2")

	//TODO:fonts
	//http://stackoverflow.com/questions/17664717/most-efficient-webfont-configuration-with-html5-appcache

	writeFile(args.output, out)
	if (next) next()
}

function updateReadme(file) {
	if (!file || !fs.existsSync(path.resolve(file)) || updatedReadmes[file]) return
	updatedReadmes[file] = true
	var data = readFile(file)
	, out = data.replace(/(@(version|date|author|license|stability)\s+).*/g, function(all, match, tag) {
		tag = translate[tag] ? translate[tag][conf[tag]] || translate[tag] : conf[tag]
		return tag ? match + tag : all
	})

	if (data != out) {
		console.log("# Update readme: " + file)
		writeFile(file, out)
	}
}

var map = {
	"--all": buildAll
}


function buildAll() {
	readFileHashes(_buildAll)
}

function _buildAll() {
	Object.keys(files).forEach(function(output) {
		if (map[file]) return

		var file = files[output]
		if (file.constructor !== Object) file = { input: file }
		if (!Array.isArray(file.input)) file.input = [file.input]

		file.output = output

		switch (output.split(".").pop()) {
		case "js":
			minJs(file)
			break;
		case "html":
			minHtml(file)
			break;
		case "css":
			minCss(file)
			break;
		default:
			console.error("Unknown type "+output)
		}
	})

	updateReadme(conf.readmeFilename)
	updateReadme(conf.main)
}


function invalidTarget(name) {
	console.error("ERROR: invalid target " + name)
}

function execute() {
	for (var i = 2, val; val = process.argv[i++]; ) {
		;( map[val] || invalidTarget )(val)
	}
}

if (module.parent) {
	// Used as module

	exports.minJs = minJs
	exports.minHtml = minHtml
	exports.minCss = minCss
	exports.execute = execute
} else {
	// executed as standalone
	execute()
}




function programExists(name, next) {
	exec("command -v " + name, next)
}


