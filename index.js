
process.chdir( process.env.PWD )

//console.log(process)
var exec = require('child_process').exec
var spawn = require("child_process").spawn
, fs = require('fs')
, conf = require( process.env.PWD + '/package.json').buildman || {}



function callmin(file, min_file) {
	var http = require('http'),
	querystring = require('querystring');




	// Build the post string from an object
	var post_data = querystring.stringify({
		//'compilation_level' : 'ADVANCED_OPTIMIZATIONS',
		'output_format': 'json',
		'output_info': ['compiled_code', 'warnings', 'errors', 'statistics'],
		'js_code' : fs.readFileSync(file, 'utf8')
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
			fs.writeFileSync(min_file, compiledCode);
		})
	});

	// post the data
	post_req.write(post_data);
	post_req.end();

}

function buildAll() {
	console.log('Build all!', conf)
	var min = Object.keys(conf || {})

	min.forEach(function(file){
		console.log("build " + file)
		callmin(conf[file], file)
	})

}

var map = {
	"--all": buildAll
}

function invalidTarget(name) {
	console.error("ERROR: invalid target " + name)
}

for (var i = 2, val; val = process.argv[i++]; ) {
	;( map[val] || invalidTarget )(val)
};

