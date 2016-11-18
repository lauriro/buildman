
var File = require("../").File
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
			File("tests/test-min.js", {
				input: ["dummy", "tests/toggle.js"],
				toggle: "abc|123",
				banner: "/*!banner*/",
				sourceMap: true
			})
			.then(this.wait())
		}).
		ok(
			function(){
				console.log("# run 3")
				return ""+fs.readFileSync("tests/test-ok.js")
				== ""+fs.readFileSync("tests/test-min.js")
			}
		).
		/*
		_ok(
			function(){
				return ""+fs.readFileSync("tests/test-min.js.map")
				== ""+fs.readFileSync("tests/test-min.js.map.ok")
			}
		).
		*/
	it( "should minimize html" ).
		run(function(){
			rm("tests/test-min.html")
			File("tests/test-min.html", {
				input: "tests/test.html",
				manifest: "x.appcache",
				_replace: {
					"app.css": "min.css"
				},
				inline: [
					"inline.css",
					"inline2.js"
				]
			})
			.then(this.wait())
		}).
		ok(
			function(){
				return ""+fs.readFileSync("tests/test-ok.html")
				== ""+fs.readFileSync("tests/test-min.html")
			}
		).
	it( "should minimize css", {_skip: "Not completed"} ).
		run(function(){
			rm("tests/css/css-min.css")
			File("tests/css/css-min.css", {
				input: ["tests/css/css-src.css"],
				banner: "/*!banner*/"
			})
			.then(this.wait())
		}).
		ok(
			function(){
				return ("" + fs.readFileSync("tests/css/css-ok.css")) ===
				("" + fs.readFileSync("tests/css/css-min.css"))
			}
		).

done()


