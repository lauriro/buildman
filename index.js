


/*
* @version  0.1.5
* @date     2014-01-24
* @license  MIT License
*/



var undef
, BUILD_ROOT = "public/b"
, CONF_FILE  = process.env.PWD + '/package.json'

var fs = require('fs')
, exec = require('child_process').exec
, conf = require( CONF_FILE ) || {}



function prepare_options(args, next) {

	
	// Build on conf changes
	var newest = fs.statSync(CONF_FILE).mtime


	args.input.forEach(function(name, i, arr){
		if (!fs.existsSync(name)) {
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



function min_js(args, next) {
	if (prepare_options(args, next)) return

	var http = require('http')
	, subDirFileRe = /\//
	, querystring = require('querystring')
	, banner = args.banner ? args.banner + "\n" : ""
	, fileString = args.input.map(function(name){
		if (!subDirFileRe.test(name)) {
			update_readme(name)
		}
		return fs.readFileSync(name, 'utf8')
	}).join('\n')

	if (args.input.length > 1) {
		fs.writeFileSync(args.output.replace('.js', '-src.js'), banner + fileString);
	}


	// Build the post string from an object
	var post_data = querystring.stringify({
		//'compilation_level' : 'ADVANCED_OPTIMIZATIONS',
		'output_format': 'json',
		'output_info': ['compiled_code', 'warnings', 'errors', 'statistics'],
		'js_code' : fileString
	});


	// An object of options to indicate where to post to
	var post_options = {
		host: 'closure-compiler.appspot.com',
		path: '/compile',
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Content-Length': post_data.length
		}
	};


	// Set up the request
	var post_req = http.request(post_options, function(res) {
		var text = ""
		res.setEncoding('utf8');
		res.on('data', function (chunk) {
			text += chunk
		});
		res.on('end', function(){
			try {
				var json = JSON.parse(text)
				fs.writeFile(args.output, banner + json.compiledCode, next);
				if (!json.compiledCode) console.log(json)
			} catch (e) {
				console.error(text)
				throw "Invalid response"
			}
		})
	});

	// post the data
	post_req.write(post_data);
	post_req.end();

}

function min_html(args, next) {
	args.input = [args.template, args.bootstrap]

	if (prepare_options(args, next)) return
	
	var files = fs.readFileSync(args.template, 'utf8')

	var scripts = []
	var defer_scripts = []
	var deferRe = /\bdefer\b/i
	var exclude = args.exclude || []
	var replace = args.replace || {}
	var output = files
	.replace(/\n\s*\n/g, '\n')
	.replace(/\t/g, '  ')
	.replace(/\s+</g, '<')
	.replace(/<!--.*?-->/g, '')
	// <link rel="stylesheet" type="text/css" href="app.css">
	//.replace(/<link>/)
	.replace(/<link[^>]+href="([^>]*?)"[^>]*>/g, function(_, file){
		if (replace[file]) {
			return _.replace(file, replace[file])
		}
		return _
	})
	.replace(/<(script)[^>]+src="([^>]*?)"[^>]*><\/\1>/g, function(_, tag, file){
		if (exclude.indexOf(file) == -1) {
			file = replace[file] || file
			var arr = deferRe.test(_) ? defer_scripts : scripts
			if (arr.indexOf(file) == -1) arr.push(file)
		}
		return '\f'
	})
	.replace(/\f+/, function(){
		var bs = fs.readFileSync(args.bootstrap, 'utf8')
		.replace("this,[]", "this," + JSON.stringify(scripts) +
			(defer_scripts.length ? ', function(){xhr.load(' + JSON.stringify(defer_scripts) + ')}' : "") )

		return '<script>\n'+bs+'</'+'script>'
	})

	fs.writeFile(args.output, output, next);

}

var translate = {
	// http://nodejs.org/api/documentation.html
	stability: "0 - Deprecated,1 - Experimental,2 - Unstable,3 - Stable,4 - API Frozen,5 - Locked".split(","),
	// https://spdx.org/licenses/
	license: require("./all-licenses.json"),
	date: new Date().toISOString().split("T")[0]
}



function update_readme(file) {
	console.log("# Update readme: " + file)
	var data = fs.readFileSync(file, 'utf8')
	, out = data.replace(/(@(version|date|author|license|stability)\s+).*/g, function(all, match, tag) {
		tag = translate[tag] ? translate[tag][conf[tag]] || translate[tag] : conf[tag]
		return tag ? match + tag : all
	})

	if (data != out) fs.writeFileSync(file, out, 'utf8')
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
	exec('git log --format=%H -6', function (err, out, stderr) {
		console.log(out.split(/\s+/))
	})

}

function buildAll() {
	var min = Object.keys(conf.buildman || {})

	update_readme(conf.readmeFilename)

	min.forEach(function(output) {
		if (map[file]) return

		var file = conf.buildman[output]
		if (typeof file == "string") file = [file]
		if (Array.isArray(file)) file = { input: file }

		file.output = output

		switch (output.split(".").pop()) {
		case "js":
			min_js(file);
			break;
		case "html":
			min_html(file);
			break;
		default:
			console.error("Unknown type "+output)
		}
	})

}


function invalidTarget(name) {
	console.error("ERROR: invalid target " + name)
}

if (module.parent) {
	// Used as module

	exports.min_js = min_js
	exports.min_html = min_html
} else {
	// executed as standalone

	for (var i = 2, val; val = process.argv[i++]; ) {
		;( map[val] || invalidTarget )(val)
	};
}


