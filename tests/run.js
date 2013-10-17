
var buildman = require("../")
, fs = require('fs')
, testfile = "tests/test-min.js"

require("testman").
describe("buildman").
	it( "should minimize js" ).
		run(function(){
			console.log("# run 1")
			buildman.callmin(["dummy"], testfile, this.wait() )
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
				return ""+fs.readFileSync("tests/target-min.js")
			}
		).
		run(function(){
			console.log("# run 4")
		}).
done()
