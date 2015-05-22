/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at http://mozilla.org/MPL/2.0/.

This file is a phantomjs script that runs flashbang in a headless
mode. The file does the following things

    + Collect all flash files in the provided directory
    + For each file, check happens if txt file exists with same name
    + Runs flashbang using Controller.js on all the files
    + Writes results to txt file

 Author: Bharadwaj Machiraju
 Blog: blog.tunnelshade.in
 Twitter: @tunnelshade_
*/

/* Imports */
var webPage = require('webpage'),
  system = require('system'),
  fs = require('fs'),
  flashFiles = [],
  index = 0;
/* End Imports */

/* Fillers */

if (!String.prototype.endsWith) {
  String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
  };
}

if (!String.prototype.startsWith) {
  String.prototype.startsWith = function(searchString, position) {
    position = position || 0;
    return this.lastIndexOf(searchString, position) === position;
  };
}
/* End Fillers */

/* Helper functions */
function usage() {
  console.log("Usage flashriot.js <directory> <flashbang-root-url> <files-root-url>");
  phantom.exit();
}

function readFile(fileUrl, callback) {
  console.log("Fetching " + fileUrl);
  new BinaryFileReader(fileUrl).readAll(null, function(buffer, error) {
    if (!buffer) {
      throw "Unable to open the file " + fileUrl + ": " + error;
    }
    callback(buffer);
  });
}

function prepareFrame(url, fileName, fileBuffer, movieParams) {
  var frame = webPage.create();
  var absFilePath = (flashFiles[index].startsWith('/') ? flashFiles[index] : fs.absolute(flashFiles[index]));
  frame.viewportSize = { width: 1366, height: 768};
  frame.onConsoleMessage = function(msg) {
    // msg = ((typeof msg === 'string') ? msg : JSON.stringify(msg));
    console.log('CONSOLE: ' + JSON.stringify(msg));
  };
  frame.open(url, function(status) {
    if(status === 'success') {
      // TODO: Fix this when https://github.com/ariya/phantomjs/issues/12506 gets fixed
      // frame.uploadFile('input[id=files]', absFilePath);
      frame.evaluate(function(fileName, fileBuffer, movieParams) {
        if(flashbangController) {
          flashbangController.loadFile(fileName, fileBuffer, movieParams);
        }
      }, fileName, fileBuffer, movieParams);
    } else {
      console.log("Status: " + status);
    }
  });
  return(frame);
}

function removeFrame(frame) {
  frame.close();
}

function pollForFrameFinish(uniqueId, pollCount) {
  var frame = controller.iframes[uniqueId];
  var done = frame.evaluate(function() {
    return (flashbangController.state === 3);
  });
  if (!done && pollCount < 30) {
    pollCount++;
    setTimeout(function() {
      pollForFrameFinish(uniqueId);
    }, 2000);
  } else {
    var flashVars = frame.evaluate(function() {
      return flashbangController.flashVars;
    });
    var sinkCalls = frame.evaluate(function() {
      return flashbangController.sinkCalls;
    });
    console.log("Done, now proceeding to clean up");
    controller._collectResults(flashVars, sinkCalls, uniqueId);
  }
}

function writeResults() {
  var stream = fs.open(flashFiles[index].replace('.swf', '.txt'), 'w');
  var str = '';
  if (Object.keys(controller.vars).length > 0) {
    stream.write("========================\n");
    stream.write("Detected Flash variables\n");
    stream.write("========================\n");
    for (var flashVar in controller.vars) {
      str = flashVar;
      if (controller.vars[flashVar]["type"] != null) {
        str = str + ':' + controller.vars[flashVar]["type"];
      }
      str += '\n';
      stream.write(str);
    }
    stream.write("========================\n");
  }
  if (controller.vulns.length > 0) {
    stream.write("===================\n");
    stream.write("Detected Sink calls\n");
    stream.write("===================\n");
    for (var i = 0; i < controller.vulns.length; i++) {
      var vuln = controller.vulns[i];
      stream.write("---------------\n");
      stream.write("Flash variables\n");
      stream.write("---------------\n");
      stream.write(JSON.stringify(vuln["flashVars"]) + "\n");
      stream.write("----\n");
      stream.write("Sink\n");
      stream.write("----\n");
      stream.write(vuln["sink"] + "\n");
      stream.write("---------\n");
      stream.write("Sink Data\n");
      stream.write("---------\n");
      stream.write(vuln["sinkData"] + "\n");
      stream.write("------------------\n");
      stream.write("Replaced Sink Data\n");
      stream.write("------------------\n");
      stream.write(vuln["replacedSinkData"] + "\n");
      stream.write("-------------------\n");
      stream.write("Vulnerable variable\n");
      stream.write("-------------------\n");
      stream.write(vuln["vulnVar"] + "\n");
    }
    stream.write("===================\n");
  }
  stream.close();
}

function updateStatus(state) {
  if(state === 2) {
    writeResults();
    // Increment index only after writing results
    index++;
    if (index === flashFiles.length) {
      phantom.exit();
    } else {
      fuzzFile(flashFiles[index]);
    }
  }
}

function fuzzFile(filePath) {
  var fileName = filePath.substring(filePath.lastIndexOf('/')+1);
  var fileUrl = FILES_ROOT_URL + fileName;
  console.log("Going to fuzz " + filePath);
  controller = new Controller();
  controller.complexDetection = true;
  controller.timeOut = 16000;
  console.log("Using url: " + fileUrl);
  controller.loadFile(fileUrl, null);
}

/* End Helper functions */

if (system.args.length < 4) {  // Bail out if enough args are not provided
  usage();
} else {
  var directoryPath = system.args[1];  // Directory where flash files reside
  var FILES_ROOT_URL = system.args[2];
  var FLASHBANG_ROOT = system.args[3];  // Flashbang location
  var FLASHBANG_ROOT_URL = system.args[4];  // Flashbang url
  var PAYLOADS = JSON.parse(fs.read(FLASHBANG_ROOT + 'src/payloads.json'));
  var fileList = fs.list(directoryPath);
  var SHUMWAY_ROOT = FLASHBANG_ROOT_URL + 'shumway/';
  var INSPECTOR_ROOT = SHUMWAY_ROOT + "examples/inspector/";
  var INSPECTOR = INSPECTOR_ROOT + "inspector.html";
  var CONTROLLER = FLASHBANG_ROOT + 'src/js/classes/Controller.js';
  var BINARY_FILE_READER = FLASHBANG_ROOT + '/shumway/examples/inspector/js/classes/BinaryFileReader.js';
  var updateFlashVarTable = null;
  var updateSinkCallTable = null;

  for (var func in PAYLOADS) {
    for (var i = 0; i < PAYLOADS[func].length; i++) {
      PAYLOADS[func][i]["regex"] = new RegExp(PAYLOADS[func][i]["regex"]);
    }
  }

  if(!fs.isDirectory(directoryPath))
    usage();
  for(var i = 0; i < fileList.length; i++) {
    var file = directoryPath + fileList[i];
    if(fs.isFile(file) && file.endsWith(".swf")) {
      var resultsFile = file.replace(".swf", ".txt");
      if (!fs.isFile(resultsFile))
        flashFiles.push(file);
    }
  }
  if(flashFiles.length === 0)
    usage();
}

if(phantom.injectJs(CONTROLLER) && phantom.injectJs(BINARY_FILE_READER)) {
  Controller.prototype._prepareFrame = function(url, uniqueId) { // Just launches the shumway inspector page with proper parameters
    setTimeout(function() {
      pollForFrameFinish(uniqueId, 0);
    }, 2000);
    return prepareFrame(url, this.fileName, this.fileBuffer, this.movieParams[uniqueId]);
  }
  Controller.prototype._removeFrame = function(uniqueId) { // Just launches the shumway inspector page with proper parameters
    removeFrame(this.iframes[uniqueId]);
  }
  index = 0;
  fuzzFile(flashFiles[index]);
}
