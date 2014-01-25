
var buildman = require("../")
, fs = require('fs')

function rm(fileName) {
	if (fs.existsSync(fileName))
		fs.unlinkSync(fileName)
}


require("testman").
describe("buildman").
	it( "should minimize js" ).
		run(function(){
			rm("tests/test-min.js")
			buildman.min_js({
				input: ["dummy"],
				banner: "/*!banner*/",
				output: "tests/test-min.js"
			}, this.wait() )
		}).
		equal(
			function(){
				console.log("# run 3")
				return ""+fs.readFileSync("tests/test-ok.js")
			}, 
			function(){
				return ""+fs.readFileSync("tests/test-min.js")
			}
		).
	it( "should minimize html" ).
		run(function(){
			rm("tests/test-min.html")
			buildman.min_html({
				template: "tests/test.html",
				bootstrap: "tests/test-min.js",
				replace: {
					"app.css": "min.css"
				},
				output: "tests/test-min.html"	
			}, this.wait())
		}).
		equal(
			function(){
				return ""+fs.readFileSync("tests/test-ok.html")
			}, 
			function(){
				return ""+fs.readFileSync("tests/test-min.html")
			}
		).
	it( "should minimize css", {skip: "Not completed"} ).
		run(function(){
			rm("tests/css/css-min.css")
			buildman.min_css({
				input: ["tests/css/css-src.css"],
				banner: "/*!banner*/",
				output: "tests/css/css-min.css"
			}, this.wait() )
		}).
		equal(
			function(){
				return ""+fs.readFileSync("tests/css/css-ok.css")
			}, 
			function(){
				return ""+fs.readFileSync("tests/css/css-min.css")
			}
		).

done()
