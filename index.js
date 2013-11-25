


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
	args.input = [args.files.template, args.files.bootstrap]

	if (prepare_options(args)) return
	
	var input = fs.readFileSync(args.files.template, 'utf8')

	var scripts = []
	var output = input
	.replace(/\s+</g, '<')
	.replace(/<!--.*?-->/g, '')
	.replace(/<(script) .*?src="(.*?)".*?><\/\1>/g, function(_, tag, file){
		scripts.push(file)
		return '\n'
	})
	.replace(/\n+/, function(){
		var bs = fs.readFileSync(args.files.bootstrap, 'utf8')
		.replace("this,[]", "this," + JSON.stringify(scripts) )

		return '<script>'+bs+'</'+'script>'
	})

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

		var c = conf.buildman[file]

		var args = {
			output: file
		}
		switch (file.split(".").pop()) {
		case "js":
			args.input = c
			callmin(args);
			break;
		case "html":
			args.files = c
			min_html(args);
			break;
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


