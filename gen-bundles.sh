# All-in-one WebBundle bundling all files under dist/.
gen-bundle -baseURL https://googlechromelabs.github.io/samples-module-loading-comparison/ \
	   -dir dist \
	   -primaryURL https://googlechromelabs.github.io/samples-module-loading-comparison/bundle-index.html \
	   -o samples-module-loading-comparison.wbn

# Moment.js subresource WebBundle
gen-bundle -baseURL https://moment.js/ \
	   -dir dist/moment/unbundled/ \
	   -primaryURL https://moment.js/app.js \
	   -o dist/moment/momentjs.wbn

# Three.js subresource WebBundle
gen-bundle -baseURL https://three.js/ \
	   -dir dist/three/unbundled/ \
	   -primaryURL https://three.js/app.js \
	   -o dist/three/threejs.wbn
