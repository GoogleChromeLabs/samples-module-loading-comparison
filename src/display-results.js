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

window.onload = function() {
    let results = { onload: Math.round(performance.now()) };
    let timings = performance.getEntriesByType('resource').filter(
        rt => rt.name.indexOf('.js') >= 0);
    results.nmodule = timings.length;
    results.firstFetchStart = Math.round(Math.min.apply(null, timings.map(rt => rt.fetchStart)));
    results.lastResponseEnd = Math.round(Math.max.apply(null, timings.map(rt => rt.responseEnd)));

    const items = [['nmodule', 'Number of modules', ''],
                   ['onload', 'Time to onload', ' ms'],
                   ['firstFetchStart', "First module's fetchStart", ' ms'],
                   ['lastResponseEnd', "Last module's responseEnd", ' ms']];
    let table = '<table>';
    for (let [name, title, unit] of items)
        table += `<tr><td>${title}:</td><td style="text-align:right">${results[name]}${unit}</td></tr>`;
    table += '</table>';
    document.getElementById('benchmark-results').innerHTML = table;
}
