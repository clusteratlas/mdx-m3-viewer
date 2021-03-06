// Download an url to a file with the given name.
// The name doesn't seem to work in Firefox (only tested in Firefox and Chrome on Windows).
function downloadUrl(url, name) {
    let a = document.createElement("a");

    a.href = url;
    a.download = name;

    a.dispatchEvent(new MouseEvent("click"));
}

// Return a function that works in the same exact way as Math.random(), but with a seed.
// See http://indiegamr.com/generate-repeatable-random-numbers-in-js/
function seededRandom(seed) {
    return function () {
        seed = (seed * 9301 + 49297) % 233280;

        return seed / 233280;
    };    
}

// Normalize file paths to lowercase, and all slashes being forward.
function normalizePath(path) {
    return path.toLocaleLowerCase().replace(/\\/g, "/");
}

// Given an array of Image objects, constructs a texture atlas.
// The dimensions of each tile are the dimensions of the first Image object (that is, all images are assumed to have the same size!).
// The resulting texture atlas is always square, and power of two.
var createTextureAtlas = (function () {
    let canvas = document.createElement("canvas"),
        ctx = canvas.getContext("2d");

    return function (src) {
        let width = src[0].width,
            height = src[0].height,
            texturesPerRow = Math.powerOfTwo(Math.sqrt(src.length)),
            pixelsPerRow = texturesPerRow * width;

        canvas.width = canvas.height = width;

        for (let i = 0, l = src.length; i < l; i++) {
            ctx.putImageData(src[i], (i % texturesPerRow) * height, Math.floor(i / texturesPerRow) * height);
        }

        return { texture: ctx.getImageData(0, 0, canvas.width, canvas.height), columns: texturesPerRow, rows: texturesPerRow };
    }
}());

function TagToUint(tag) {
    return (tag.charCodeAt(0) << 24) + (tag.charCodeAt(1) << 16) + (tag.charCodeAt(2) << 8) + tag.charCodeAt(3);
}

function UintToTag(uint) {
    return String.fromCharCode((uint >> 24) & 0xff, (uint >> 16) & 0xff, (uint >> 8) & 0xff, uint & 0xff);
}

function mix(dst, ...args) {
    for (let arg of args) {
        // Reflect not supported on Babel for now
        //const keys = Reflect.ownKeys(arg);
        const keys = Object.getOwnPropertyNames(arg).concat(Object.getOwnPropertySymbols(arg))

        for (let i = 0, l = keys.length; i < l; i++) {
            const key = keys[i];
            
            //if (!Reflect.has(dst, key)) {
            if (!(key in dst)) {
                //Reflect.defineProperty(dst, key, Reflect.getOwnPropertyDescriptor(arg, key))
                Object.defineProperty(dst, key, Object.getOwnPropertyDescriptor(arg, key))
            }
        }
}

    return dst;
}

/**
 * Encodes two 0-255 numbers into one.
 *
 * @param {number} x The first number.
 * @param {number} y The second number.
 * @returns {number} The encoded number.
 */
function encodeFloat2(x, y) {
    return x + y * 256;
}

/**
 * Decodes a previously encoded number into the two original numbers.
 *
 * @param {number} f The input.
 * @returns {array} The two decoded numbers.
 */
function decodeFloat2(f) {
    var v = new Float32Array(2);

    v[1] = Math.floor(f / 256);
    v[0] = Math.floor(f - v[1] * 256);

    return v;
}

/**
 * Encodes three 0-255 numbers into one.
 *
 * @param {number} x The first number.
 * @param {number} y The second number.
 * @param {number} z The third number.
 * @returns {number} The encoded number.
 */
function encodeFloat3(x, y, z) {
    return x + y * 256 + z * 65536;
}

/**
 * Decodes a previously encoded number into the three original numbers.
 *
 * @param {number} f The input.
 * @returns {array} The three decoded numbers.
 */
function decodeFloat3(f) {
    var v = new Float32Array(3);

    v[2] = Math.floor(f / 65536);
    v[1] = Math.floor((f - v[2] * 65536) / 256);
    v[0] = Math.floor(f - v[2] * 65536 - v[1] * 256);

    return v;
}

if (!window.requestAnimationFrame ) {
    window.requestAnimationFrame = (function() {
        return window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame || function (callback) { window.setTimeout(callback, 1000 / 60); };
    }());
}

function get(path, binary, onprogress) {
    let xhr = new XMLHttpRequest();

    return new Promise(function (resolve, reject) {
        xhr.addEventListener("load", function () {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr);
            } else {
                reject(xhr);
            }
        });

        xhr.addEventListener("error", function () {
            reject(xhr);
        });

        if (onprogress) {
            xhr.addEventListener("progress", onprogress);
        }

        xhr.open("GET", path, true);

        if (binary) {
            xhr.responseType = "arraybuffer";
        }

        xhr.send();
    });;
}

/**
 * A very simple string hashing algorithm.
 *
 * @param {string} s A string to hash.
 * @returns {number} The hash.
 */
function hashFromString(s) {
    var hash = 0;

    for (var i = 0, l = s.length; i < l; i++) {
        hash = hash * 31 + s.charCodeAt(i);
        hash = hash & hash;
    }

    return hash;
}

/**
 * A very simple array-of-numbers hashing algorithm.
 *
 * @param {number[]} a An array fo numbers to hash.
 * @returns {number} The hash.
 */
function hashFromArray(a) {
    var hash = 0;

    for (var i = 0, l = a.length; i < l; i++) {
        var n = a[i];

        // Zeroes should affect the hash too!
        if (n === 0) {
            n = 1;
        }

        hash = hash * 31 + n;
        hash = hash & hash;
    }

    return hash;
}

/**
 * A deep Object copy.
 *
 * @param {object} object The object to copy.
 * @returns {object} The copied object.
 */
Object.copy = function (object) {
    var keys = Object.keys(object),
        newObj = (object instanceof Array) ? [] : {};

    for (var i = 0, l = keys.length; i < l; i++) {
        var key = keys[i];

        if (typeof key === "object") {
            newObj[key] = Object.copy(object[key]);
        } else {
            newObj[key] = object[key];
        }
    }

    return newObj;
};

/**
 * Shallow array equality test.
 *
 * @param {array} a The first array.
 * @param {array} b The second array.
 * @returns {boolean}.
 */
Array.areEqual = function (a, b) {
    if (a === b) {
        return true;
    }

    if (a.length !== b.length) {
        return false;
    }

    for (var i = 0, l = a.length; i < l; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }

    return true;
};

/**
 * Returns an array that only contains unique values found in the source array.
 * In other words, all duplicated values are deleted.
 *
 * @returns {array}.
 */
Array.prototype.unique = function () {
    return this.reverse().filter(function (e, i, arr) {
        return arr.indexOf(e, i + 1) === -1;
    }).reverse();
};

/**
 * Returns a reversed copy of the source array.
 *
 * @returns {array}.
 */
String.prototype.reverse = function () {
    return [...this].reverse().join("");
};

Map.prototype.findKey = function (value) {
    for (let entry of this.entries()) {
        if (value === entry[1]) {
            return entry[0];
        }
    }
};

Map.prototype.deleteValue = function (value) {
    let key = this.findKey(value);

    if (key) {
        this.delete(key);

        return true;
    }

    return false;
};

Array.prototype.delete = function (value) {
    let key = this.indexOf(value);

    if (key !== -1) {
        this.splice(key, 1);

        return true;
    }

    return false;
};
