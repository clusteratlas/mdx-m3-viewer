const UnitTester = (function () {
    let mathRandom = Math.random;

    // Replace Math.random with a custom seeded random generator.
    // This allows to run the viewer in a deterministic environment for tests.
    // For example, particles have some randomized data, which can make tests mismatch.
    function replaceMathRandom() {
        Math.random = seededRandom(6);
    }

    // Reset Math.random to the original function
    function resetMathRandom() {
        Math.random = mathRandom;
    }

    let tests = new Map();

    // Run the tests and compare the results against the (hopefully) correct images located on the server.
    // The given callback gets called after each comparison, with the result data.
    function run(viewer, callback) {
        start(viewer, function loop(entry, iterator) {
            if (!entry.done) {
                viewer.toBlob((blob) => {
                    let url = URL.createObjectURL(blob),
                        name = entry.value[0],
                        compare = "tests/compare/" + name + ".png";

                    resemble(url).compareTo(compare).ignoreOutput().scaleToSameSize().onComplete(function (data) {
                        callback({ value: [name, { data, a: url, b: compare }], done: entry.done });

                        next(viewer, loop, iterator);
                    });
                });
            } else {
                callback(entry);
            }
        });
    }

    // Download all of the test results as PNG images.
    // Behavior depends on the browser - on Chrome (at least on Windows), the images will be downloaded automatically to the default download location, each having the name of the test.
    // E.g. "mdx-load" -> "mdx-load.png".
    function downloadTestResults(viewer) {
        start(viewer, function loop(entry, iterator) {
            if (!entry.done) {
                viewer.toBlob((blob) => {
                    downloadUrl(URL.createObjectURL(blob), entry.value[0]);

                    next(viewer, loop, iterator);
                });
            }
        });
    }

    // Add a new test
    function addTest(name, test) {
        tests.set(name, test);
    }

    // Start running tests
    function start(viewer, callback) {
        next(viewer, callback, tests.entries());
    }

    // Run the next test
    function next(viewer, callback, iterator) {
        let entry = iterator.next();

        if (entry.done) {
            callback(entry, iterator);
        } else {
            // Clear the viewer
            viewer.clear(true);

            // Replace Math.random with a custom seeded random function
            replaceMathRandom();

            // Run the test code
            entry.value[1](viewer);

            viewer.whenAllLoaded(() => {
                // Update the viewer once to make all of the changes appear
                viewer.updateAndRender();

                // Put back Math.random in its place
                resetMathRandom();

                callback(entry, iterator);
            });
        }
    }

    // ModelViewer.load, but waits for each resource to load, until the next one starts loading.
    // Can be used to run a simple JS test over a big list of sources, without hogging browser resources.
    function loadSync(viewer, sources, pathSolver, callback) {
        loadResourceSync(viewer, callback, pathSolver, sources, 0, sources.length, new Date());
    }

    function loadResourceSync(viewer, callback, pathSolver, sources, currentIndex, finalIndex, startTime) {
        let time = new Date() - startTime;

        if (currentIndex < finalIndex) {
            let target = viewer.load(sources[currentIndex], pathSolver);

            target.whenLoaded((resource) => {
                callback({ value: { sources, currentIndex, target, time }, done: false });

                loadResourceSync(viewer, callback, pathSolver, sources, currentIndex + 1, finalIndex, startTime);
            });
        } else {
            callback({ value: { time }, done: true });
        }
    }

    function generateAxes(viewer, width, length) {
        let data = {
            geometry: createUnitCube(),
            material: { renderMode: 0, twoSided: true }
        };

        // Shared axis model
        let axis = viewer.load(data, geoSolver);

        // X RED
        let x = axis.addInstance().setColor([255, 0, 0]).scale([length, width, width]).move([length, 0, 0]);
        x.noCulling = true; // No proper culling yet :(

        // Y GREEN
        let y = axis.addInstance().setColor([0, 255, 0]).scale([width, length, width]).move([0, length, 0]);
        y.noCulling = true; // No proper culling yet :(

        // Z BLUE
        let z = axis.addInstance().setColor([0, 0, 255]).scale([width, width, length]).move([0, 0, length]);
        z.noCulling = true; // No proper culling yet :(

        let node = new NotifiedNode();
        
        x.setParent(node);
        y.setParent(node);
        z.setParent(node);
        
        //node.dontInheritScaling = true;

        return node;
    }

    return {
        addTest,
        run,
        downloadTestResults,
        loadSync,
        generateAxes
    };
}());
