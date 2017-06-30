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

### Running the built in HTTP server

First add `cert.pem` and `key.pem` files for TLS. If you don't have these, you
can use [simplehttp2server](https://github.com/GoogleChrome/simplehttp2server)
to generate them for you. Place them at the root of the clone.

Then:

```sh
gulp serve
```

HTTP server command line options:
- `--http1`: serve over HTTP/1.1 instead of HTTP/2
- `--push`: use HTTP/2 push when serving
- `--preload`: inject `<link rel="preload">` tags for JS dependencies when serving

E.g., to serve over HTTP/1.1 with preload enabled:

```sh
gulp serve --http1 --preload
```
