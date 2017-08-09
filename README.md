# Browser module loading tests

This sample takes moment.js and three.js, and prepares them for loading in the
browser with ECMAScript modules.

## Development

### Cloning this repository

Standard stuff :) Hit the "Clone or download" button in the project's GitHub
landing page and go from there.

### Installing dependencies

NPM packages need to be installed on the root and both `src/` subdirectories.

```sh
npm i
cd src/moment
npm i
cd ../..
cd src/three
npm i
cd ../..
```

Gulp needs to be available globally. You can install it by doing:

```sh
npm i -g gulp
```

### Building and developing

```sh
gulp build
```

### Running the HTTP server

First add `cert.pem` and `key.pem` files for TLS. If you don't have these, you
can use [simplehttp2server](https://github.com/GoogleChrome/simplehttp2server)
to generate them for you. Place them at the root of the clone.

Then:

```sh
go run server/server.go
```

Or, if you don't have `go` command, you can use the built in HTTP server instead:

```sh
gulp serve
```

HTTP server command line options:
- `--http1`: serve over HTTP/1.1 instead of HTTP/2
- `--push`: use HTTP/2 push when serving
- `--preload`: inject `<link rel="preload">` tags for JS dependencies when serving

E.g., to serve over HTTP/1.1 with preload enabled:

```sh
go run server/server.go --http1 --preload
```

### Bundled / unbundled tests

The bundled / unbundled test cases are served at the following URLs:

* moment.js
  * bundled, optimized:   https://localhost:44333/moment/bundled-optimized.html
  * bundled, unoptimized: https://localhost:44333/moment/bundled-unoptimized.html
  * unbundled:            https://localhost:44333/moment/unbundled.html
* three.js
  * bundled, optimized:   https://localhost:44333/three/bundled-optimized.html
  * bundled, unoptimized: https://localhost:44333/three/bundled-unoptimized.html
  * unbundled:            https://localhost:44333/three/unbundled.html

### Synthesized module tree tests

In addition to the real-world library test cases, this HTTP server provides
a benchmark for artificial module tree shapes. This is served at
https://localhost:44333/synthesized/ and it accepts the following query
parameters:

- `depth` (default: 5):   height of the module dependency tree
- `branch` (default: 2):  number of child modules non-leaf modules have
- `delay=n` (optional):   sleep n milliseconds in response handler
- `cacheable` (optional): make JavaScript resources cacheable

E.g., this loads a module whose dependency tree is a perfect binary tree of
depth 10 (2047 modules in total):
https://localhost:44333/synthesized/?depth=10&branch=2

Note: Currently, --push and --preload options are not supported in synthesized
tests.
