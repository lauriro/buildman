


/*
* @version  0.2.10
* @date     2014-07-01
* @license  MIT License
*/



var gm, undef
, BUILD_ROOT = "public/b"
, CONF_FILE  = process.env.PWD + "/package.json"
, fs = require("fs")
, exec = require("child_process").exec
, conf = require( CONF_FILE ) || {}
, updatedReadmes = {}
, translate = {
	// http://nodejs.org/api/documentation.html
	stability: "0 - Deprecated,1 - Experimental,2 - Unstable,3 - Stable,4 - API Frozen,5 - Locked".split(","),
	// https://spdx.org/licenses/
	license: require("./all-licenses.json"),
	date: new Date().toISOString().split("T")[0]
}



function notChanged(args, next) {
	// Build on conf changes
	var newest = fs.statSync(CONF_FILE).mtime

	if (typeof args.input == "string") args.input = [args.input]

	args.input.forEach(function(name, i, arr){
		if (!fs.existsSync(name)) {
			// console.log("file " + name + " not found, try to resolve")
			name = arr[i] = require.resolve(name)
		}
		var stat = fs.statSync(name)
		if (newest < +stat.mtime) newest = stat.mtime
	})

	if (fs.existsSync(args.output) && newest < fs.statSync(args.output).mtime) {
		next && next()
		return true
	}

	console.log("# Build " + args.output)
}

function Nop(){}

function minJs(args, next) {
	if (notChanged(args, next)) return

	var http = require("http")
	, subDirFileRe = /\//
	, querystring = require("querystring")
	, banner = args.banner ? args.banner + "\n" : ""
	, fileString = args.input.map(function(name){
		if (!subDirFileRe.test(name)) {
			updateReadme(name)
		}
		return fs.readFileSync(name, "utf8")
	}).join("\n")

	if (args.toggle) fileString = fileString.replace(new RegExp("\\/\\/\\*\\* (?="+args.toggle + ")", "g"), "/*** ")

	if (args.devel) {
		fs.writeFileSync(args.output.replace(".js", "-src.js"), banner + fileString);
	}


	// Build the post string from an object
	var postData = querystring.stringify({
		//"compilation_level" : "ADVANCED_OPTIMIZATIONS",
		"output_format": "json",
		"output_info": ["compiled_code", "warnings", "errors", "statistics"],
		"js_code" : fileString
	});


	// An object of options to indicate where to post to
	var postOptions = {
		host: "closure-compiler.appspot.com",
		path: "/compile",
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			"Content-Length": postData.length
		}
	};


	// Set up the request
	var postReq = http.request(postOptions, function(res) {
		var text = ""
		res.setEncoding("utf8");
		res.on("data", function (chunk) {
			text += chunk
		});
		res.on("end", function(){
			try {
				var json = JSON.parse(text)
				fs.writeFile(args.output, banner + json.compiledCode, next||Nop);
				if (!json.compiledCode) console.log(json)
			} catch (e) {
				console.error(text)
				throw "Invalid response"
			}
		})
	});

	// post the data
	postReq.write(postData);
	postReq.end();

}

function minHtml(args, next) {
	args.input = [args.template]
	args.bootstrap && args.input.push(args.bootstrap)


	var files = fs.readFileSync(args.template, "utf8")
	var root = args.template.replace(/[^\/]+$/, "")

	var scripts = []
	var deferScripts = []
	var deferRe = /\bdefer\b/i
	var squash, squashFiles = []
	var squashRe = /\ssquash\s/i
	var inlineRe = /\sinline\s/i
	var exclude = args.exclude || []
	var inline = args.inline || []
	var replace = args.replace || {}

	var output = files
	.replace(/\n\s*\n/g, "\n")
	.replace(/\t/g, "  ")
	.replace(/\s+</g, "<")
	.replace(/<!--[\s\S]*?-->/g, "")
	.replace(/<(script)[^>]+src="([^>]*?)"[^>]*><\/\1>/g, function(_, tag, file) {
		if (exclude.indexOf(file) == -1) {
			file = replace[file] || file
			if (inlineRe.test(_) || inline.indexOf(file) != -1) {
				var bs = fs.readFileSync(root + file, "utf8")
				return "\f<script>" + bs.trim() + "</script>"
			}
			if (squashRe.test(_)) {
				if (!squash) {
					var out = squashFiles.length.toString(32) + ".js"
					squash = { input:[], file: out, output: root + out }
					squashFiles.push(squash)
				}
				squash.input.push(root + file)
				file = squash.file
			} else {
				squash = null
			}
			var arr = deferRe.test(_) ? deferScripts : scripts
			if (arr.indexOf(file) == -1) arr.push(file)
		}
		return "\f"
	})

	squashFiles.forEach(function(obj){
		minJs(obj)
	})

	if (notChanged(args, next)) return

	output = output
	// <link rel="stylesheet" type="text/css" href="app.css">
	//.replace(/<link>/)
	.replace(/<link[^>]+href="([^>]*?)".*?>/g, function(_, file){
		if (replace[file]) {
			_ = _.replace(file, replace[file])
			file = replace[file]
		}
		if (inlineRe.test(_) || inline.indexOf(file) != -1) {
			//console.log("# read file " + root + file)
			var bs = fs.readFileSync(root + file, "utf8")
			//console.log("# got " + bs)
			return "<style>" + bs.trim() + "</style>"
		}
		return _
	})
	.replace(/\f+/, function(){
		if (!args.bootstrap) return ""
		var bs = fs.readFileSync(args.bootstrap, "utf8")
		.replace("this,[]", "this," + JSON.stringify(scripts) +
			(deferScripts.length ? ", function(){xhr.load(" + JSON.stringify(deferScripts) + ")}" : "") )

		return "<script>\n" + bs + "</script>"
	})
	.replace(/\f+/g, "")
	//This breakes code when haml followed by javascript
	//.replace(/[\s;]*<\/script>\s*<script>/g, ";")

	if (args.manifest) {
		console.log("# Update manifest: " + args.manifest)
		output = output.replace(/<html\b/, '$& manifest="' + args.manifest + '"')
		var manifestFile = fs.readFileSync(root + args.manifest, "utf8")
		fs.writeFileSync(root + args.manifest, manifestFile.replace(/#.+$/m, "# " + new Date().toISOString()));
	}

	fs.writeFile(args.output, output, next);
}

function normalizePath(path) {
	for (;path != (path = path.replace(/[^/]*[^.]\/\.\.\/|\.\//, "")););
	return path
}

function cssImport(str, path, root) {
	if (path)
		str = str.replace(/url\(['"]?/g, "$&"+path)

	return str.replace(/@import\s+url\((['"]?)(.+?)\1\);*/g, function(_, quote, fileName) {
		var file = fs.readFileSync(root + fileName, "utf8")

		return cssImport(file, fileName.replace(/[^\/]*$/, ""), root)
	})
}

function minCss(args, next) {

	if (notChanged(args, next)) return

	var root = args.output.replace(/[^\/]*$/, "")

	var out = cssImport("@import url('" + args.input.map(function(name){
		return name.slice(root.length)
	}).join("');@import url('") + "');", "", root);

	out = out.replace(/\/\*[^@!][\s\S]*?\*\//g, "")

	//TODO:sprite
	//out = out.replace(/url\((['"]?)(.+?)\1\)[; \t]*\/\*!\s*data-uri\s*\*\//g, function(_, quote, fileName) {
	out = out.replace(/(.*)\/\*!\s*([\w-]+)\s*([\w-.]*)\s*\*\//g, function(_, line, cmd, param) {
		switch (cmd) {
		case "data-uri":
			line = line.replace(/url\((['"]?)(.+?)\1\)/g, function(_, quote, fileName) {
				var str = fs.readFileSync(root + fileName, "base64")
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


	out = out.replace(/'/g, '"')
	.replace(/[\t\n]/g, " ")

	// Remove optional spaces and put each rule to separated line
	out = out.replace(/ *([,;{}]) */g, "$1")
	.replace(/^ */g, "")
	.replace(/: +/g, ":")
	.replace(/ and\(/g, " and (")
	.replace(/;*}/g, "}\n")

	// Use CSS shorthands
	out = out
	.replace(/([^0-9])-?0(px|em|%|in|cm|mm|pc|pt|ex)/g, "$10")
	.replace(/:0 0( 0 0)?(;|})/g, ":0$2")
	.replace(/url\("(.+?)"/g, function(_, file) {
		return 'url("' + normalizePath(file) + '"'
	})
	.replace(/url\("([\w\/_.-]*)"\)/g, "url($1)")
	.replace(/([ :,])0\.([0-9]+)/g, "$1.$2")

	//TODO:fonts
	//http://stackoverflow.com/questions/17664717/most-efficient-webfont-configuration-with-html5-appcache

	fs.writeFileSync(args.output, out);
	next && next()
}

function updateReadme(file) {
	if (!file || !fs.existsSync(file) || updatedReadmes[file]) return
	updatedReadmes[file] = true
	console.log("# Update readme: " + file)
	var data = fs.readFileSync(file, "utf8")
	, out = data.replace(/(@(version|date|author|license|stability)\s+).*/g, function(all, match, tag) {
		tag = translate[tag] ? translate[tag][conf[tag]] || translate[tag] : conf[tag]
		return tag ? match + tag : all
	})

	if (data != out) fs.writeFileSync(file, out, "utf8")
}

var map = {
	"--all": buildAll,
	"--bundle": buildBundle
}


function buildBundle() {

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


