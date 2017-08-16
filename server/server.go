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
package main

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"flag"
	"fmt"
	"html/template"
	"io/ioutil"
	"log"
	"mime"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var (
	httpAddr = flag.String("http", ":44333", "Listen address")
	preload  = flag.Bool("preload", false, "Add <link rel='preload'> to HTML for all JS dependencies")
	push     = flag.Bool("push", false, "Use HTTP/2 push to push dependencies with the JS entry point")
	http1    = flag.Bool("http1", false, "Serve over HTTP/1.1 instead of HTTP/2")
)

var cache = map[string][]byte{}
var pushFiles = map[string][]string{}
var synthesizedTemplate *template.Template

func main() {
	flag.Parse()

	// Load all served content into memory.
	err := cacheEverything()
	if err != nil {
		fmt.Println("error:", err)
		return
	}

	http.HandleFunc("/", onRequest)
	http.HandleFunc("/synthesized/", handleSynthesized)
	http.HandleFunc("/synthesized/a.js", handleJs)

	if *http1 {
		fmt.Printf("Server running at http://localhost%v\n", *httpAddr)
		log.Fatal(http.ListenAndServe(*httpAddr, nil))
	} else {
		fmt.Printf("Server running at https://localhost%v\n", *httpAddr)
		log.Fatal(http.ListenAndServeTLS(*httpAddr, "cert.pem", "key.pem", nil))
	}
}

func cacheEverything() error {
	jsonBytes, err := ioutil.ReadFile(path.Join("dist", "filelist.json"))
	if err != nil {
		return err
	}

	var filelist map[string]interface{}
	err = json.Unmarshal(jsonBytes, &filelist)
	if err != nil {
		return err
	}
	for project, v := range filelist {
		jsfiles := v.([]interface{})
		unbundledHtml := path.Join(project, "unbundled.html")
		unbundledJs := path.Join(project, "unbundled", "app.js")
		unbundledHtmlContent, err := ioutil.ReadFile(path.Join("dist", unbundledHtml))

		if *preload {
			links := ""
			for i := range jsfiles {
				relative := path.Join(project, "unbundled", jsfiles[len(jsfiles)-1-i].(string))
				links += "  <link rel='preload' href='/" + relative + "' as='script' crossorigin='use-credentials'>\n"
			}
			unbundledHtmlContent = []byte(strings.Replace(string(unbundledHtmlContent), "</head>", links+"</head>", 1))
		}

		cache[unbundledHtml], err = encodeContent(unbundledHtmlContent)
		if err != nil {
			return err
		}

		for i := range jsfiles {
			file := jsfiles[len(jsfiles)-1-i] // Iterate in reverse order
			relative := path.Join(project, "unbundled", file.(string))
			cache[relative], err = readFileAndEncode(path.Join("dist", relative))
			if err != nil {
				return err
			}
			if relative != unbundledJs {
				pushFiles[unbundledJs] = append(pushFiles[unbundledJs], relative)
			}
		}

		for _, c := range []string{"bundled-unoptimized", "bundled-optimized"} {
			html := path.Join(project, c+".html")
			js := path.Join(project, c, "app.js")
			cache[html], err = readFileAndEncode(path.Join("dist", html))
			if err != nil {
				return err
			}
			cache[js], err = readFileAndEncode(path.Join("dist", js))
			if err != nil {
				return err
			}
		}
	}
	cache["index.html"], err = readFileAndEncode(path.Join("dist", "index.html"))
	cache["display-results.js"], err = readFileAndEncode(path.Join("dist", "display-results.js"))
	if err != nil {
		return err
	}

	synthesizedTemplate = template.Must(template.ParseFiles("server/template/synthesized.html"))
	return nil
}

func readFileAndEncode(path string) ([]byte, error) {
	content, err := ioutil.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return encodeContent(content)
}

func encodeContent(content []byte) ([]byte, error) {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	_, err := gz.Write(content)
	gz.Close()
	return buf.Bytes(), err
}

var randomizedPrefixRegexp = regexp.MustCompile(`^/(r/\d+/)?`)

func onRequest(w http.ResponseWriter, r *http.Request) {
	upath := r.URL.Path
	if upath[len(upath)-1] == '/' {
		upath += "index.html"
	}
	upath = randomizedPrefixRegexp.ReplaceAllLiteralString(upath, "")

	content, ok := cache[upath]
	if !ok {
		http.Error(w, "404 page not found", http.StatusNotFound)
		return
	}

	pushIfPossible(w, r, upath)

	ctype := mime.TypeByExtension(path.Ext(upath))
	if ctype != "" {
		w.Header().Set("Content-type", ctype)
	}
	w.Header().Set("Content-Encoding", "gzip")
	w.Write(content)
}

func pushIfPossible(w http.ResponseWriter, r *http.Request, path string) {
	if !*push {
		return
	}
	pushes, ok := pushFiles[path]
	if !ok {
		return
	}
	pusher, ok := w.(http.Pusher)
	if !ok {
		return
	}
	options := &http.PushOptions{
		Header: http.Header{
			"Accept-Encoding": r.Header["Accept-Encoding"],
		},
	}
	for _, file := range pushes {
		if err := pusher.Push("/"+file, options); err != nil {
			fmt.Printf("Failed to push %s: %v\n", file, err)
		}
	}
}

func handleSynthesized(w http.ResponseWriter, r *http.Request) {
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// TODO: Support -preload and -push in synthesized tests

	scriptUrl := "a.js"

	if len(query["depth"]) > 0 {
		scriptUrl += "?depth=" + query["depth"][0]
	} else {
		scriptUrl += "?depth=5"
	}

	if len(query["branch"]) > 0 {
		scriptUrl += "&branch=" + query["branch"][0]
	}

	if len(query["cacheable"]) > 0 {
		scriptUrl += "&cacheable"
	}

	if len(query["delay"]) > 0 {
		scriptUrl += "&delay=" + query["delay"][0]
	}

	w.Header().Set("Content-Type", "text/html")

	synthesizedTemplate.Execute(w, map[string]string{"ScriptUrl":scriptUrl})
}

// Query parameters:
//   cacheable (optional)       - add Cache-Control: max-age=86400
//   delay=n (optional)         - sleep n milliseconds in response handler
func handleJs(w http.ResponseWriter, r *http.Request) {
	const header = `
// Bogus script
(function() {
  function notActuallyCalled(arg) {
    return 'This string not actually used: ' + arg;
  }
`
	const footer = `
})();
`
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/javascript")
	if len(query["cacheable"]) > 0 {
		w.Header().Set("Cache-Control", "max-age=86400")
	}

	if len(query["depth"]) > 0 {
		depth, err := strconv.Atoi(query["depth"][0])
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		if depth > 0 {
			query.Set("depth", strconv.Itoa(depth-1))

			branch := 2
			if len(query["branch"]) > 0 {
				branch, err = strconv.Atoi(query["branch"][0])
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
				}
			}

			params := query.Encode()
			if branch == 1 {
				fmt.Fprintf(w, "import {} from './a.js?%v';\n", params)
			} else {
				for i := 0; i < branch; i++ {
					fmt.Fprintf(w, "import {} from './a.js?%v&n=%d';\n", params, i)
				}
			}
		}
	}

	fmt.Fprint(w, header)

	for i := 0; i < 10; i++ {
		// just 100 bytes
		fmt.Fprintf(w, `
    function fib%d(n) {
      if (n < 2)
        return 1;
      return fib%d(n-2) + fib%d(n-1);
    }
`, i, i, i)
	}
	fmt.Fprint(w, footer)

	if len(query["delay"]) > 0 {
		delay, err := strconv.Atoi(query["delay"][0])
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		time.Sleep(time.Duration(delay) * time.Millisecond)
	}
}
