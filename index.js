


/**
 * @version  0.2.20
 * @date     2014-11-26
 * @license  MIT License
 */



var gm, undef
, path = require("path")
, fs = require("fs")
, BUILD_ROOT = path.resolve("b")
, CONF_FILE = path.resolve("package.json")
, exec = require("child_process").exec
, spawn = require("child_process").spawn
, conf = require( CONF_FILE ) || {}
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
	// Build on conf changes
	var newest = fs.statSync(CONF_FILE).mtime

	if (typeof args.input == "string") args.input = [args.input]

	args.input.forEach(function(name, i, arr){
		if (!fs.existsSync(path.resolve(name))) {
			// console.log("file " + name + " not found, try to resolve")
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
	, fileString = args.input.map(function(name){
		if (!subDirFileRe.test(name)) {
			updateReadme(name)
		}
		return readFile(name)
	}).join("\n")
	, output = opened[args.output] = fs.createWriteStream(path.resolve(args.output))

	function outputDone() {
		console.log("# compile DONE " + args.output)
		if (args.sourceMap) {
			output.write("//# sourceMappingURL="+args.sourceMap+"\n")
		}
		output.end(function() {
			opened[args.output] = null
			if (next) next()
		})
	}

	if (args.toggle) fileString = fileString.replace(new RegExp("\\/\\/(?=\\*\\*\\s+(?:"+args.toggle + "))", "g"), "/*")

	if (args.devel) {
		writeFile(typeof args.devel == "string" ?
			args.devel :
			args.output.replace(".js", "-src.js")
		, banner + fileString)
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
	return fs.readFileSync(path.resolve(fileName), "utf8")
}

function writeFile(fileName, content) {
	fs.writeFileSync(path.resolve(fileName), content, "utf8")
}

function minHtml(args, next) {
	args.input = [ args.template ]
	if (args.bootstrap) args.input.push(args.bootstrap)


	var squash
	, squashFiles = []
	, root = args.template.replace(/[^\/]+$/, "")
	, scripts = []
	, deferScripts = []
	, inlineRe = /\sinline\s/i
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
		if (exclude.indexOf(file) == -1) {
			file = replace[file] || file
			if (inlineRe.test(_) || inline.indexOf(file) != -1) {
				var bs = readFile(root + file)
				return "\f<script>" + bs.trim() + "</script>"
			}
			if (/\ssquash\s/i.test(_)) {
				if (!squash) {
					var out = squashFiles.length.toString(32) + ".js"
					squash = { input:[], file: out, output: root + out }
					squashFiles.push(squash)
				}
				args.input.push(root + file)
				squash.input.push(root + file)
				file = squash.file
			} else {
				squash = null
			}
			var arr = /\bdefer\b/i.test(_) ? deferScripts : scripts
			if (arr.indexOf(file) == -1) arr.push(file)
		}
		return "\f"
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
		.replace(/<link[^>]+href="([^>]*?)".*?>/g, function(_, file){
			if (replace[file]) {
				_ = _.replace(file, replace[file])
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
			.replace("this,[]", "this," + JSON.stringify(scripts) +
				(deferScripts.length ? ", function(){xhr.load(" + JSON.stringify(deferScripts) + ")}" : "") )

			return "<script>\n" + bs + "</script>"
		})
		.replace(/\f+/g, "")
		//This breakes code when haml followed by javascript
		//.replace(/[\s;]*<\/script>\s*<script>/g, ";")

		if (args.manifest) {
			console.log("# Update manifest: " + args.manifest)
			var manifestFile = readFile(root + args.manifest).replace(/#.+$/m, "# " + new Date().toISOString())
			writeFile(root + args.manifest, manifestFile)
			output = output.replace(/<html\b/, '$& manifest="' + args.manifest + '"')
		}

		writeFile(args.output, output)
		if (next) next()
	}
}

function normalizePath(p) {
	for (;p != (p = p.replace(/[^/]*[^.]\/\.\.\/|\.\/|\/(?=\/)/, "")););
	return p
}

function cssImport(str, path, root) {
	if (path)
		str = str.replace(/url\(['"]?(?!data:)/g, "$&"+path)

	return str.replace(/@import\s+url\((['"]?)(?!data:)(.+?)\1\);*/g, function(_, quote, fileName) {
		var file = readFile(root + fileName)

		return cssImport(file, fileName.replace(/[^\/]*$/, ""), root)
	})
}

function minCss(args, next) {

	if (notChanged(args, next)) return

	var root = args.output.replace(/[^\/]*$/, "")

	var out = cssImport("@import url('" + args.input.map(function(name){
		return name.slice(root.length)
	}).join("');@import url('") + "');", "", root);

	out = out
	.replace(/[\r\n]+/g, "\n")
	.replace(/\/\*[^@!][\s\S]*?\*\//g, "")

	//TODO:sprite
	//out = out.replace(/url\((['"]?)(.+?)\1\)[; \t]*\/\*!\s*data-uri\s*\*\//g, function(_, quote, fileName) {
	out = out.replace(/(.*)\/\*!\s*([\w-]+)\s*([\w-.]*)\s*\*\//g, function(_, line, cmd, param) {
		switch (cmd) {
		case "data-uri":
			line = line.replace(/url\((['"]?)(.+?)\1\)/g, function(_, quote, fileName) {
				var str = fs.readFileSync(path.resolve(root + fileName), "base64")
				return 'url("data:image/' + fileName.split(".").pop() + ";base64,"+str+'")'
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
				return 'url("' + param+"."+fileName.split(".").pop()+'")'
					+ pos
						.replace(/px 0px/, "px -"+1+"px")
						.replace(/\btop\b/, "-"+1+"px")
// 				    -e "s/)/) 0px -${pos}px/"
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
		return 'url("' + normalizePath(file) + '"'
	})
	.replace(/url\("([\w\/_.-]*)"\)/g, "url($1)")
	.replace(/([ :,])0\.([0-9]+)/g, "$1.$2")

	//TODO:fonts
	//http://stackoverflow.com/questions/17664717/most-efficient-webfont-configuration-with-html5-appcache

	writeFile(args.output, out)
	next && next()
}

function updateReadme(file) {
	if (!file || !fs.existsSync(path.resolve(file)) || updatedReadmes[file]) return
	updatedReadmes[file] = true
	console.log("# Update readme: " + file)
	var data = readFile(file)
	, out = data.replace(/(@(version|date|author|license|stability)\s+).*/g, function(all, match, tag) {
		tag = translate[tag] ? translate[tag][conf[tag]] || translate[tag] : conf[tag]
		return tag ? match + tag : all
	})

	if (data != out) writeFile(file, out)
}

var map = {
	"--all": buildAll,
	"--bundle": buildBundle
}


function buildBundle() {
	// $ git rev-list --count HEAD
	// 68
	// $ git rev-list --count --first-parent HEAD

	if (fs.existsSync(BUILD_ROOT)) {

	} else {
		fs.mkdirSync(BUILD_ROOT)
	}
	// get list of hashs
	exec("git log --format=%H -6", function (err, out, stderr) {
		console.log(out.split(/\s+/))
	})
}

function buildAll() {
	var bm = conf.buildman || {}
	var min = Object.keys(bm)

	min.forEach(function(output) {
		if (map[file]) return

		var file = bm[output]
		if (typeof file == "string") file = [file]
		if (Array.isArray(file)) file = { input: file }

		file.output = output

		switch (output.split(".").pop()) {
		case "js":
			minJs(file);
			break;
		case "html":
			minHtml(file);
			break;
		case "css":
			minCss(file);
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

if (module.parent) {
	// Used as module

	exports.minJs = minJs
	exports.minHtml = minHtml
	exports.minCss = minCss
} else {
	// executed as standalone

	for (var i = 2, val; val = process.argv[i++]; ) {
		;( map[val] || invalidTarget )(val)
	};
}




function programExists(name, next) {
	exec("command -v " + name, next)
}


