
var buildman = require("../")
, fs = require('fs')

require("testman").
describe("buildman").
	it( "should minimize js" ).
		run(function(){
			console.log("# run 1")
			fs.unlink("tests/test-min.js")
			buildman.min_js({
				input: ["dummy"],
				output: "tests/test-min.js"
			}, this.wait() )
		}).
		run(function(){
			console.log("# run 2")
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
		run(function(){
			console.log("# run 4")
		}).
	it( "should minimize html" ).
		run(function(){
			fs.unlink("tests/test-min.html")
			buildman.min_html({
				files: {
					template: "tests/test.html",
					bootstrap: "tests/test-min.js"
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
done()
