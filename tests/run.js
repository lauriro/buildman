
var buildman = require("../")
, fs = require('fs')
, testfile = "tests/min.js"

require("testman").
describe("buildman").
	it( "should minimize js" ).
		run(function(){
			console.log("# run 1")
			buildman.callmin({
				input: ["dummy"],
				output: testfile,
				next: this.wait()
			})
		}).
		run(function(){
			console.log("# run 2")
		}).
		equal(
			function(){
				console.log("# run 3")
				return ""+fs.readFileSync(testfile)
			}, 
			function(){
				return ""+fs.readFileSync("tests/example-min.js")
			}
		).
		run(function(){
			console.log("# run 4")
		}).
	it( "should minimize html", {skip: "not completed"} ).
		run(function(){
			buildman.min_html({
				input: "tests/test.html",
				output: "tests/test-min.html",
				next: this.wait()
			})
		}).
		equal(
			function(){
				console.log("# run 3")
				return ""+fs.readFileSync("tests/test.html")
			}, 
			function(){
				return ""+fs.readFileSync("tests/test-min.html")
			}
		).
done()
