/**
 *
 *  Module loading benchmark sample.
 *  Copyright 2017 Google Inc. All rights reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License
 *
 */

const path = require('path');
const fs = require('fs');
const url = require('url');

const gulp = require('gulp');
const babel = require('gulp-babel');
const rollup = require('rollup');
const rollupEach = require('gulp-rollup-each');
const nodeResolve = require('rollup-plugin-node-resolve');
const rename = require('gulp-rename');

const resolveFrom = require('resolve-from');
const merge = require('merge-stream');

const webpackStream = require('webpack-stream');
const webpack = require('webpack');

const spdy = require('spdy');
const zlib = require('zlib');

const del = require('del');

const projects = ['moment', 'three'];
let files = {};
const pushFiles = {};
const cache = {};

let preload = false;
let http1 = false;
let push = false;

// Rollup plugin for listing all the module files.
function _listModules(project) {
  return {
    ongenerate(args, rendered) {
      files[project] = [];
      args.bundle.modules.forEach(module => {
        const rel = path.relative(path.join(__dirname, 'src', project), module.id);
        files[project].push(rel);
      });
    }
  };
}

// Babel plugin for rewriting imports to browser-loadable relative paths.
function _rewriteImports(project) {
  return function(babel) {
    const t = babel.types;
    const buildRoot = path.join(__dirname, 'src', project);

    return {
      visitor: {
        ImportDeclaration: function(nodePath, state) {
          const fileRoot = path.dirname(state.file.opts.filename);

          const moduleArg = nodePath.node.source;
          if (moduleArg && moduleArg.type === 'StringLiteral') {
            const source = nodePath.node.source.value;

            let relative = null;
            if (source.startsWith('./') || source.startsWith('../')) {
              relative = path.relative(fileRoot, resolveFrom(fileRoot, source));
            } else {
              relative = path.relative(fileRoot, resolveFrom(buildRoot, source));
            }

            // Special handling for the GLSL files in three.js.
            if (relative.endsWith('.glsl')) {
              relative = relative.replace('.glsl', '.js');
            }

            if (relative.startsWith('../')) {
              nodePath.node.source = t.stringLiteral(relative);
            } else {
              nodePath.node.source = t.stringLiteral('./' + relative);
            }
          }
        },
      }
    };
  }
}

// Transform three.js GLSL files into JS.
// From three.js rollup.config.js.
function _glsl() {
	return {
		transform(code, id) {
			if (/\.glsl$/.test(id) === false) return;
			var transformedCode = 'export default ' + JSON.stringify(
				code
					.replace( /[ \t]*\/\/.*\n/g, '' ) // remove //
					.replace( /[ \t]*\/\*[\s\S]*?\*\//g, '' ) // remove /* */
					.replace( /\n{2,}/g, '\n' ) // # \n+ to \n
			) + ';';
			return {
				code: transformedCode,
				map: { mappings: '' }
			};
		}
	};
}

// Delete all generated files.
gulp.task('clean', () => del(['dist', 'temp']));

// Obtain list of dependency JS files.
gulp.task('scan', () => {
  return Promise.all(projects.map(project => {
    return rollup.rollup({
      entry: path.join('src', project, 'app.js'),
      plugins: [
        nodeResolve(),
        _glsl(),
        _listModules(project)
      ],
    }).then(bundle => bundle.generate({ format: 'es' }));
  }));
});

// Rename GLSL files, transform them, and move them together with the other JS.
// Special handling for the GLSL files in three.js.
gulp.task('glsl', ['scan'], () => {
  const tasks = projects.map(project => {
    const glslFiles = files[project]
        .filter(f => /\.glsl$/.test(f))
        .map(f => path.join(__dirname, 'src', project, f));

    return gulp.src(glslFiles, {base: path.join(__dirname, 'src', project)})
      .pipe(rollupEach({
        plugins: [_glsl()]
      }, {
        format: 'es'
      }))
      .pipe(rename(path => path.extname = '.js'))
      .pipe(gulp.dest(path.join('temp', project, 'unbundled')));
  });
  return merge(...tasks);
});

// Create unbundled build.
gulp.task('unbundled', ['glsl', 'html'], () => {
  const tasks = projects.map(project => {
    const jsFiles = files[project]
        .filter(f => /\.js$/.test(f))
        .map(f => path.join(__dirname, 'src', project, f));

    return gulp.src(jsFiles, {base: path.join(__dirname, 'src', project)})
      .pipe(babel({
        babelrc: false,
        plugins: [_rewriteImports(project)]
      }))
      .pipe(gulp.dest(path.join('temp', project, 'unbundled')));
  });
  return merge(...tasks);
});

// Create optimized bundled build.
gulp.task('bundled-optimized', ['unbundled'], () => {
  return Promise.all(projects.map(project => {
    return rollup.rollup({
      entry: path.join('temp', project, 'unbundled', 'app.js'),
      treeshake: true,
    })
      .then(bundle => {
        bundle.write({
          format: 'iife',
          moduleName: 'app',
          dest: path.join('temp', project, 'bundled-optimized', 'app.js'),
        });
      });
  }));
});

// Create unoptimized bundled build.
gulp.task('bundled-unoptimized', ['unbundled'], () => {
  const tasks = projects.map(project => {
    return gulp.src(path.join('temp', project, 'unbundled', 'app.js'),
        {base: path.join('temp', project, 'unbundled')})
      .pipe(webpackStream({
        output: {
          filename: 'app.js'
        },
        plugins: [
          new webpack.LoaderOptionsPlugin({
            minimize: false,
            debug: false
          })
        ]
      }, webpack))
      .pipe(gulp.dest(path.join('temp', project, 'bundled-unoptimized')));
  });
  return merge(...tasks);
});

// Minify all three builds.
gulp.task('minify', ['unbundled', 'bundled-unoptimized', 'bundled-optimized'], () => {
  const tasks = projects.map(project => {
    return gulp.src(`temp/${project}/**/*.js`, {base: path.join('temp', project)})
      .pipe(babel({
        babelrc: false,
        presets: ['babili'],
      }))
      .pipe(gulp.dest(path.join('dist', project)));
  });
  return merge(...tasks);
});

// Copy HTML to all three builds.
gulp.task('html', ['clean'], () => {
  return gulp.src('src/**/*.html').pipe(gulp.dest('dist'));
});

// Meta build task for creating all builds.
// Also generates JSON file with full list of served JS files.
gulp.task('build', ['html', 'minify'], () => {
  const jsFiles = {};
  projects.forEach(project => {
    jsFiles[project] = [];
    files[project].forEach(file => {
      // This is a bit hacky, but we need it to work with the three.js custom build.
      if (/\.glsl$/.test(file)) {
        jsFiles[project].push(file.replace(/\.glsl$/, '.js'));
      } else {
        jsFiles[project].push(file);
      }
    });
  });
  fs.writeFileSync(path.join(__dirname, 'dist', 'filelist.json'), JSON.stringify(jsFiles));
});

// Auxiliary method for loading all served content into memory.
function _cacheEverything() {
  const filelist = JSON.parse(fs.readFileSync(path.join(__dirname, 'dist', 'filelist.json')));

  console.log('HTTP server: loading files into memory...');
  projects.forEach(project => {
    const jsFiles = filelist[project];
    const unbundledHtml = path.join(project, 'unbundled.html');
    const unbundledJs = path.join(project, 'unbundled', 'app.js');

    let unbundledHtmlContent = fs.readFileSync(path.join(__dirname, 'dist', unbundledHtml));
    if (preload) {
      let unbundledHtmlString = unbundledHtmlContent.toString();
      let links = '';
      jsFiles.slice(0).reverse().forEach(file => {
        const relative = path.join(project, 'unbundled', file);
        links += `  <link rel="preload" href="/${relative}" as="script" crossorigin="use-credentials">\n`;
      });
      unbundledHtmlString = unbundledHtmlString.replace('</head>', `${links}</head>`);
      unbundledHtmlContent = Buffer.from(unbundledHtmlString);
    }
    cache[unbundledHtml] = zlib.gzipSync(unbundledHtmlContent);
    pushFiles[unbundledJs] = [];
    jsFiles.forEach(file => {
      const relative = path.join(project, 'unbundled', file);
      cache[relative] = zlib.gzipSync(fs.readFileSync(path.join(__dirname, 'dist', relative)));
      if (relative !== unbundledJs) {
        pushFiles[unbundledJs].push(relative);
      }
    });

    ['bundled-unoptimized', 'bundled-optimized'].forEach(c => {
      const html = path.join(project, `${c}.html`);
      const js = path.join(project, c, 'app.js');
      cache[html] = zlib.gzipSync(fs.readFileSync(path.join(__dirname, 'dist', html)));
      cache[js] = zlib.gzipSync(fs.readFileSync(path.join(__dirname, 'dist', js)));
    });
  });
  console.log('HTTP server: done loading.');
}

// Auxiliary method for handling an HTTP request.
function _onRequest(request, response) {
  const url = request.url.startsWith('/') ? request.url.substr(1) : request.url;
  console.log(`HTTP server: request for ${request.url}`);
  if (cache[url]) {
    if (push && pushFiles[url] && response.push) {
      // Reverse order so that main dependency comes first.
      pushFiles[url].slice(0).reverse().forEach(file => {
        console.log(`HTTP server: pushing /${file}`);
        const pushed = response.push(`/${file}`, {
          status: 200,
          method: 'GET',
          request: {
            accept: '*/*'
          },
          response: {
            'content-type': 'application/javascript',
            'content-encoding': 'gzip',
            'vary': 'Accept-Encoding'
          }
        });
        pushed.on('error', err => console.log('HTTP server: push error ', err));
        pushed.end(cache[file]);
      });
    }
    response.writeHead(200, {
      'content-type': url.endsWith('.js') ? 'application/javascript' : 'text/html',
      'content-encoding' : 'gzip',
      'vary': 'Accept-Encoding'
    });
    response.end(cache[url]);
  } else {
    response.writeHead(404);
    response.end();
  }
}

// Build task for serving generated builds over HTTP. Should be called after a
// successful build.
// Takes the following optional command line parameters:
// * --http1: Serve over HTTP/1.1 instead of HTTP/2.
// * --push: Use HTTP/2 push to push dependencies with the JS entry point.
// * --preload: Add <link rel="preload"> to HTML for all JS dependencies.
gulp.task('serve', () => {
  const opts = {
    key: fs.readFileSync(path.join(__dirname, 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert.pem')),
  };

  if (process.argv.find(item => item === '--http1')) {
    http1 = true;
  }
  if (process.argv.find(item => item === '--preload')) {
    preload = true;
  }
  if (process.argv.find(item => item === '--push')) {
    push = true;
  }

  if (http1) {
    console.log('HTTP server: running in HTTP 1 mode.');
    opts['spdy'] = { protocols: ['http/1.1', 'http/1.0'] };
  } else {
    console.log('HTTP server: running in HTTP 2 mode.');
    opts['spdy'] = { protocols: ['h2', 'http/1.1', 'http/1.0'] };
  }

  if (push && !http1) {
    console.log('HTTP server: using HTTP 2 push.');
  } else if (push && http1) {
    console.log('HTTP server: no push support on HTTP 1.');
  }

  if (preload) {
    console.log('HTTP server: using <link rel="preload">.');
  }

  _cacheEverything();

  server = spdy.createServer(opts, _onRequest);
  console.log('HTTP server: listening...')
  server.listen(44333);
});
