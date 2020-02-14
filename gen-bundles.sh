gen-bundle -baseURL https://googlechromelabs.github.io/samples-module-loading-comparison/ \
		   -dir dist \
		   -primaryURL https://googlechromelabs.github.io/samples-module-loading-comparison/bundle-index.html \
		   -o samples-module-loading-comparison.wbn

gen-bundle -baseURL http://localhost:8080/ \
		   -dir dist \
		   -primaryURL http://localhost:8080/three/unbundled.html \
		   -o dist/three-app.wbn

gen-bundle -baseURL https://moment.js/ \
		   -dir dist/moment/unbundled/ \
		   -primaryURL https://moment.js/app.js \
		   -o dist/moment/momentjs.wbn

gen-bundle -baseURL https://three.js/ \
		   -dir dist/three/unbundled/ \
		   -primaryURL https://three.js/app.js \
		   -o dist/three/threejs.wbn
