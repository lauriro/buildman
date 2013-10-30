


var 
	BUILD_ROOT = "public/b"
	CONF_FILE = process.env.PWD + '/package.json'

var fs = require('fs')
, exec = require('child_process').exec
, conf = require( CONF_FILE ) || {}



function prepare_options(args) {

	if (typeof args.input == 'string') args.input = [args.input]
	
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
		args.next && args.next()
		return true
	}
	
	console.log("# Build " + args.output)
}



function callmin(args) {
	if (prepare_options(args)) return

	var http = require('http')
	, querystring = require('querystring')
	, fileString = args.input.map(function(name){
		return fs.readFileSync(name, 'utf8')
	}).join('\n')

	if (args.input.length > 1) {
		fs.writeFileSync(args.output.replace('.js', '-src.js'), fileString);
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
			var compiledCode = JSON.parse(text).compiledCode;
			fs.writeFileSync(args.output, compiledCode);

			args.next && args.next()
		})
	});

	// post the data
	post_req.write(post_data);
	post_req.end();

}

function min_html(args) {
	if (prepare_options(args)) return
	
	var minify = require("html-minifier").minify;
	
	var input = args.input.map(function(name){
		return fs.readFileSync(name, 'utf8')
	}).join('\n')

	var output = minify(input, { 
		removeComments: true,
		collapseWhitespace: true});
	fs.writeFileSync(args.output, output);

	args.next && args.next()
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

	min.forEach(function(file){
		if (map[file]) return

		var args = {
			input: conf.buildman[file],
			output: file
		}
		switch (file.split(".").pop()) {
		case "js":		callmin(args);		break;
		case "html":	min_html(args);		break;
		default:
			console.error("Unknown type "+file)
		}
	})

}


function invalidTarget(name) {
	console.error("ERROR: invalid target " + name)
}

if (module.parent) {
	// Used as module

	exports.callmin = callmin
	exports.min_html = min_html
} else {
	// executed as standalone
	
	for (var i = 2, val; val = process.argv[i++]; ) {
		;( map[val] || invalidTarget )(val)
	};
}


