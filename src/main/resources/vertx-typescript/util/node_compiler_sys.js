(function() {
  var fs = require("fs");
  var path = require("path");
  
  process.stdin.resume();
  
  function doWriteSync(fd, data) {
    while (true) {
      try {
        fs.writeSync(fd, data);
        break;
      } catch (e) {
        if (e.code === 'EINTR' || e.code === 'EAGAIN') {
          // resource not available. try again.
          continue;
        } else {
          throw e;
        }
      }
    }
  }
  
  function doReadSync(fd, buffer, offset, length) {
    while (true) {
      try {
        return fs.readSync(fd, buffer, offset, length);
      } catch (e) {
        if (e.code === 'EINTR' || e.code === 'EAGAIN') {
          // resource not available. try again.
          continue;
        } else {
          throw e;
        }
      }
    }
  }
  
  // override host to use the lib.core.d.ts instead of lib.d.ts. The latter
  // contains too many definitions that we don't need. In fact WebSocket
  // conflicts with Vert.x WebSocket.
  var oldCreateCompilerHost = ts.createCompilerHost;
  ts.createCompilerHost = function(options) {
    var host = oldCreateCompilerHost(options);
    host.getDefaultLibFileName = function(options) {
      return "typescript/lib/" + (options.target === 2 ? "lib.core.es6.d.ts" : "lib.core.d.ts");
    };
    host.getCurrentDirectory = function() {
      return "";
    };
    host.fileExists = function(path) {
      // send tag and filename to parent process
      doWriteSync(process.stdout.fd, "VERTX_TYPESCRIPT_FILEEXISTS" + path + "\n");
      var buf = new Buffer(1);
      var res = doReadSync(process.stdin.fd, buf, 0, 1);
      if (res != 1) {
        throw new Error("Could not read boolean from input stream");
      }
      return !!parseInt(buf.toString());
    };
    return host;
  };
  
  ts.sys.readFile = function(fileName, encoding) {
    // send tag and filename to parent process
    doWriteSync(process.stdout.fd, "VERTX_TYPESCRIPT_READFILE" + fileName + "\n");
    
    // read number of bytes to read from stdin
    var res;
    var buf = new Buffer(1);
    var size = "";
    do {
      res = doReadSync(process.stdin.fd, buf, 0, 1);
      if (res != 1) {
        throw new Error("Could not read size from input stream");
      }
      var c = buf.toString();
      if (c == " ") {
        break;
      }
      size += c;
    } while(true);
    
    if (size < 0) {
      // file not found
      return undefined;
    }

    // read file contents from stdin
    size = parseInt(size);
    buf = new Buffer(size);
    var read = 0;
    while (read < size) {
      res = doReadSync(process.stdin.fd, buf, read, size - read);
      read += res;
    }

    return buf.toString();
  };

  ts.sys.writeFile = function(fileName, data, writeByteOrderMark) {
    doWriteSync(process.stdout.fd, data);
  };

  ts.sys.getExecutingFilePath = function() {
    // virtual path to typescript compiler (i.e. where tsc.js is in the classpath)
    return path.join("typescript/lib/", path.basename(__filename));
  };
})();
