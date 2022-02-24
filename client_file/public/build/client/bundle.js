"use strict";
/**
 * @license almond 0.3.3 Copyright jQuery Foundation and other contributors.
 * Released under MIT license, http://github.com/requirejs/almond/LICENSE
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*global setTimeout: false */
var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers, defined = {}, waiting = {}, config = {}, defining = {}, hasOwn = Object.prototype.hasOwnProperty, aps = [].slice, jsSuffixRegExp = /\.js$/;
    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }
    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex, foundI, foundStarMap, starI, i, j, part, normalizedBaseParts, baseParts = baseName && baseName.split("/"), map = config.map, starMap = (map && map['*']) || {};
        //Adjust any relative paths.
        if (name) {
            name = name.split('/');
            lastIndex = name.length - 1;
            // If wanting node ID compatibility, strip .js from end
            // of IDs. Have to do this here, and not in nameToUrl
            // because node allows either .js or non .js to map
            // to same file.
            if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
            }
            // Starts with a '.' so need the baseName
            if (name[0].charAt(0) === '.' && baseParts) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that 'directory' and not name of the baseName's
                //module. For instance, baseName of 'one/two/three', maps to
                //'one/two/three.js', but we want the directory, 'one/two' for
                //this normalization.
                normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                name = normalizedBaseParts.concat(name);
            }
            //start trimDots
            for (i = 0; i < name.length; i++) {
                part = name[i];
                if (part === '.') {
                    name.splice(i, 1);
                    i -= 1;
                }
                else if (part === '..') {
                    // If at the start, or previous value is still ..,
                    // keep them so that when converted to a path it may
                    // still work when converted to a path, even though
                    // as an ID it is less than ideal. In larger point
                    // releases, may be better to just kick out an error.
                    if (i === 0 || (i === 1 && name[2] === '..') || name[i - 1] === '..') {
                        continue;
                    }
                    else if (i > 0) {
                        name.splice(i - 1, 2);
                        i -= 2;
                    }
                }
            }
            //end trimDots
            name = name.join('/');
        }
        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');
            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");
                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];
                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }
                if (foundMap) {
                    break;
                }
                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }
            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }
            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }
        return name;
    }
    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            var args = aps.call(arguments, 0);
            //If first arg is not require('string'), and there is only
            //one arg, it is the array form without a callback. Insert
            //a null so that the following concat is correct.
            if (typeof args[0] !== 'string' && args.length === 1) {
                args.push(null);
            }
            return req.apply(undef, args.concat([relName, forceSync]));
        };
    }
    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }
    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }
    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }
        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }
    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix, index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }
    //Creates a parts array for a relName where first part is plugin ID,
    //second part is resource ID. Assumes relName has already been normalized.
    function makeRelParts(relName) {
        return relName ? splitPrefix(relName) : [];
    }
    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relParts) {
        var plugin, parts = splitPrefix(name), prefix = parts[0], relResourceName = relParts[1];
        name = parts[1];
        if (prefix) {
            prefix = normalize(prefix, relResourceName);
            plugin = callDep(prefix);
        }
        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relResourceName));
            }
            else {
                name = normalize(name, relResourceName);
            }
        }
        else {
            name = normalize(name, relResourceName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }
        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name,
            n: name,
            pr: prefix,
            p: plugin
        };
    };
    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }
    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            }
            else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };
    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i, relParts, args = [], callbackType = typeof callback, usingExports;
        //Use name if no relName
        relName = relName || name;
        relParts = makeRelParts(relName);
        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relParts);
                depName = map.f;
                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                }
                else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                }
                else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                }
                else if (hasProp(defined, depName) ||
                    hasProp(waiting, depName) ||
                    hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                }
                else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                }
                else {
                    throw new Error(name + ' missing ' + depName);
                }
            }
            ret = callback ? callback.apply(defined[name], args) : undefined;
            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                    cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                }
                else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        }
        else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };
    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, makeRelParts(callback)).f);
        }
        else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }
            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            }
            else {
                deps = undef;
            }
        }
        //Support require(['a'])
        callback = callback || function () { };
        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }
        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        }
        else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }
        return req;
    };
    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };
    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;
    define = function (name, deps, callback) {
        if (typeof name !== 'string') {
            throw new Error('See almond README: incorrect module build, no module name');
        }
        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }
        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };
    define.amd = {
        jQuery: true
    };
}());
/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014-2016 Patrick Gansterer <paroga@paroga.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
(function (global, undefined) {
    "use strict";
    var POW_2_24 = 5.960464477539063e-8, POW_2_32 = 4294967296, POW_2_53 = 9007199254740992;
    function encode(value) {
        var data = new ArrayBuffer(256);
        var dataView = new DataView(data);
        var lastLength;
        var offset = 0;
        function prepareWrite(length) {
            var newByteLength = data.byteLength;
            var requiredLength = offset + length;
            while (newByteLength < requiredLength)
                newByteLength <<= 1;
            if (newByteLength !== data.byteLength) {
                var oldDataView = dataView;
                data = new ArrayBuffer(newByteLength);
                dataView = new DataView(data);
                var uint32count = (offset + 3) >> 2;
                for (var i = 0; i < uint32count; ++i)
                    dataView.setUint32(i << 2, oldDataView.getUint32(i << 2));
            }
            lastLength = length;
            return dataView;
        }
        function commitWrite() {
            offset += lastLength;
        }
        function writeFloat64(value) {
            commitWrite(prepareWrite(8).setFloat64(offset, value));
        }
        function writeUint8(value) {
            commitWrite(prepareWrite(1).setUint8(offset, value));
        }
        function writeUint8Array(value) {
            var dataView = prepareWrite(value.length);
            for (var i = 0; i < value.length; ++i)
                dataView.setUint8(offset + i, value[i]);
            commitWrite();
        }
        function writeUint16(value) {
            commitWrite(prepareWrite(2).setUint16(offset, value));
        }
        function writeUint32(value) {
            commitWrite(prepareWrite(4).setUint32(offset, value));
        }
        function writeUint64(value) {
            var low = value % POW_2_32;
            var high = (value - low) / POW_2_32;
            var dataView = prepareWrite(8);
            dataView.setUint32(offset, high);
            dataView.setUint32(offset + 4, low);
            commitWrite();
        }
        function writeTypeAndLength(type, length) {
            if (length < 24) {
                writeUint8(type << 5 | length);
            }
            else if (length < 0x100) {
                writeUint8(type << 5 | 24);
                writeUint8(length);
            }
            else if (length < 0x10000) {
                writeUint8(type << 5 | 25);
                writeUint16(length);
            }
            else if (length < 0x100000000) {
                writeUint8(type << 5 | 26);
                writeUint32(length);
            }
            else {
                writeUint8(type << 5 | 27);
                writeUint64(length);
            }
        }
        function encodeItem(value) {
            var i;
            if (value === false)
                return writeUint8(0xf4);
            if (value === true)
                return writeUint8(0xf5);
            if (value === null)
                return writeUint8(0xf6);
            if (value === undefined)
                return writeUint8(0xf7);
            switch (typeof value) {
                case "number":
                    if (Math.floor(value) === value) {
                        if (0 <= value && value <= POW_2_53)
                            return writeTypeAndLength(0, value);
                        if (-POW_2_53 <= value && value < 0)
                            return writeTypeAndLength(1, -(value + 1));
                    }
                    writeUint8(0xfb);
                    return writeFloat64(value);
                case "string":
                    var utf8data = [];
                    for (i = 0; i < value.length; ++i) {
                        var charCode = value.charCodeAt(i);
                        if (charCode < 0x80) {
                            utf8data.push(charCode);
                        }
                        else if (charCode < 0x800) {
                            utf8data.push(0xc0 | charCode >> 6);
                            utf8data.push(0x80 | charCode & 0x3f);
                        }
                        else if (charCode < 0xd800) {
                            utf8data.push(0xe0 | charCode >> 12);
                            utf8data.push(0x80 | (charCode >> 6) & 0x3f);
                            utf8data.push(0x80 | charCode & 0x3f);
                        }
                        else {
                            charCode = (charCode & 0x3ff) << 10;
                            charCode |= value.charCodeAt(++i) & 0x3ff;
                            charCode += 0x10000;
                            utf8data.push(0xf0 | charCode >> 18);
                            utf8data.push(0x80 | (charCode >> 12) & 0x3f);
                            utf8data.push(0x80 | (charCode >> 6) & 0x3f);
                            utf8data.push(0x80 | charCode & 0x3f);
                        }
                    }
                    writeTypeAndLength(3, utf8data.length);
                    return writeUint8Array(utf8data);
                default:
                    var length;
                    if (Array.isArray(value)) {
                        length = value.length;
                        writeTypeAndLength(4, length);
                        for (i = 0; i < length; ++i)
                            encodeItem(value[i]);
                    }
                    else if (value instanceof Uint8Array) {
                        writeTypeAndLength(2, value.length);
                        writeUint8Array(value);
                    }
                    else {
                        var keys = Object.keys(value);
                        length = keys.length;
                        writeTypeAndLength(5, length);
                        for (i = 0; i < length; ++i) {
                            var key = keys[i];
                            encodeItem(key);
                            encodeItem(value[key]);
                        }
                    }
            }
        }
        encodeItem(value);
        if ("slice" in data)
            return data.slice(0, offset);
        var ret = new ArrayBuffer(offset);
        var retView = new DataView(ret);
        for (var i = 0; i < offset; ++i)
            retView.setUint8(i, dataView.getUint8(i));
        return ret;
    }
    function decode(data, tagger, simpleValue) {
        var dataView = new DataView(data);
        var offset = 0;
        if (typeof tagger !== "function")
            tagger = function (value) { return value; };
        if (typeof simpleValue !== "function")
            simpleValue = function () { return undefined; };
        function commitRead(length, value) {
            offset += length;
            return value;
        }
        function readArrayBuffer(length) {
            return commitRead(length, new Uint8Array(data, offset, length));
        }
        function readFloat16() {
            var tempArrayBuffer = new ArrayBuffer(4);
            var tempDataView = new DataView(tempArrayBuffer);
            var value = readUint16();
            var sign = value & 0x8000;
            var exponent = value & 0x7c00;
            var fraction = value & 0x03ff;
            if (exponent === 0x7c00)
                exponent = 0xff << 10;
            else if (exponent !== 0)
                exponent += (127 - 15) << 10;
            else if (fraction !== 0)
                return (sign ? -1 : 1) * fraction * POW_2_24;
            tempDataView.setUint32(0, sign << 16 | exponent << 13 | fraction << 13);
            return tempDataView.getFloat32(0);
        }
        function readFloat32() {
            return commitRead(4, dataView.getFloat32(offset));
        }
        function readFloat64() {
            return commitRead(8, dataView.getFloat64(offset));
        }
        function readUint8() {
            return commitRead(1, dataView.getUint8(offset));
        }
        function readUint16() {
            return commitRead(2, dataView.getUint16(offset));
        }
        function readUint32() {
            return commitRead(4, dataView.getUint32(offset));
        }
        function readUint64() {
            return readUint32() * POW_2_32 + readUint32();
        }
        function readBreak() {
            if (dataView.getUint8(offset) !== 0xff)
                return false;
            offset += 1;
            return true;
        }
        function readLength(additionalInformation) {
            if (additionalInformation < 24)
                return additionalInformation;
            if (additionalInformation === 24)
                return readUint8();
            if (additionalInformation === 25)
                return readUint16();
            if (additionalInformation === 26)
                return readUint32();
            if (additionalInformation === 27)
                return readUint64();
            if (additionalInformation === 31)
                return -1;
            throw "Invalid length encoding";
        }
        function readIndefiniteStringLength(majorType) {
            var initialByte = readUint8();
            if (initialByte === 0xff)
                return -1;
            var length = readLength(initialByte & 0x1f);
            if (length < 0 || (initialByte >> 5) !== majorType)
                throw "Invalid indefinite length element";
            return length;
        }
        function appendUtf16Data(utf16data, length) {
            for (var i = 0; i < length; ++i) {
                var value = readUint8();
                if (value & 0x80) {
                    if (value < 0xe0) {
                        value = (value & 0x1f) << 6
                            | (readUint8() & 0x3f);
                        length -= 1;
                    }
                    else if (value < 0xf0) {
                        value = (value & 0x0f) << 12
                            | (readUint8() & 0x3f) << 6
                            | (readUint8() & 0x3f);
                        length -= 2;
                    }
                    else {
                        value = (value & 0x0f) << 18
                            | (readUint8() & 0x3f) << 12
                            | (readUint8() & 0x3f) << 6
                            | (readUint8() & 0x3f);
                        length -= 3;
                    }
                }
                if (value < 0x10000) {
                    utf16data.push(value);
                }
                else {
                    value -= 0x10000;
                    utf16data.push(0xd800 | (value >> 10));
                    utf16data.push(0xdc00 | (value & 0x3ff));
                }
            }
        }
        function decodeItem() {
            var initialByte = readUint8();
            var majorType = initialByte >> 5;
            var additionalInformation = initialByte & 0x1f;
            var i;
            var length;
            if (majorType === 7) {
                switch (additionalInformation) {
                    case 25:
                        return readFloat16();
                    case 26:
                        return readFloat32();
                    case 27:
                        return readFloat64();
                }
            }
            length = readLength(additionalInformation);
            if (length < 0 && (majorType < 2 || 6 < majorType))
                throw "Invalid length";
            switch (majorType) {
                case 0:
                    return length;
                case 1:
                    return -1 - length;
                case 2:
                    if (length < 0) {
                        var elements = [];
                        var fullArrayLength = 0;
                        while ((length = readIndefiniteStringLength(majorType)) >= 0) {
                            fullArrayLength += length;
                            elements.push(readArrayBuffer(length));
                        }
                        var fullArray = new Uint8Array(fullArrayLength);
                        var fullArrayOffset = 0;
                        for (i = 0; i < elements.length; ++i) {
                            fullArray.set(elements[i], fullArrayOffset);
                            fullArrayOffset += elements[i].length;
                        }
                        return fullArray;
                    }
                    return readArrayBuffer(length);
                case 3:
                    var utf16data = [];
                    if (length < 0) {
                        while ((length = readIndefiniteStringLength(majorType)) >= 0)
                            appendUtf16Data(utf16data, length);
                    }
                    else
                        appendUtf16Data(utf16data, length);
                    return String.fromCharCode.apply(null, utf16data);
                case 4:
                    var retArray;
                    if (length < 0) {
                        retArray = [];
                        while (!readBreak())
                            retArray.push(decodeItem());
                    }
                    else {
                        retArray = new Array(length);
                        for (i = 0; i < length; ++i)
                            retArray[i] = decodeItem();
                    }
                    return retArray;
                case 5:
                    var retObject = {};
                    for (i = 0; i < length || length < 0 && !readBreak(); ++i) {
                        var key = decodeItem();
                        retObject[key] = decodeItem();
                    }
                    return retObject;
                case 6:
                    return tagger(decodeItem(), length);
                case 7:
                    switch (length) {
                        case 20:
                            return false;
                        case 21:
                            return true;
                        case 22:
                            return null;
                        case 23:
                            return undefined;
                        default:
                            return simpleValue(length);
                    }
            }
        }
        var ret = decodeItem();
        if (offset !== data.byteLength)
            throw "Remaining bytes";
        return ret;
    }
    var obj = { encode: encode, decode: decode };
    if (typeof define === "function" && define.amd)
        define("cbor/cbor", obj);
    else if (typeof module !== "undefined" && module.exports)
        module.exports = obj;
    else if (!global.CBOR)
        global.CBOR = obj;
})(this);
/*
 Copyright (c) 2013 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright
 notice, this list of conditions and the following disclaimer in
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
(function (obj) {
    "use strict";
    var ERR_BAD_FORMAT = "File format is not recognized.";
    var ERR_CRC = "CRC failed.";
    var ERR_ENCRYPTED = "File contains encrypted entry.";
    var ERR_ZIP64 = "File is using Zip64 (4gb+ file size).";
    var ERR_READ = "Error while reading zip file.";
    var ERR_WRITE = "Error while writing zip file.";
    var ERR_WRITE_DATA = "Error while writing file data.";
    var ERR_READ_DATA = "Error while reading file data.";
    var ERR_DUPLICATED_NAME = "File already exists.";
    var CHUNK_SIZE = 512 * 1024;
    var TEXT_PLAIN = "text/plain";
    var appendABViewSupported;
    try {
        appendABViewSupported = new Blob([new DataView(new ArrayBuffer(0))]).size === 0;
    }
    catch (e) {
    }
    function Crc32() {
        this.crc = -1;
    }
    Crc32.prototype.append = function append(data) {
        var crc = this.crc | 0, table = this.table;
        for (var offset = 0, len = data.length | 0; offset < len; offset++)
            crc = (crc >>> 8) ^ table[(crc ^ data[offset]) & 0xFF];
        this.crc = crc;
    };
    Crc32.prototype.get = function get() {
        return ~this.crc;
    };
    Crc32.prototype.table = (function () {
        var i, j, t, table = []; // Uint32Array is actually slower than []
        for (i = 0; i < 256; i++) {
            t = i;
            for (j = 0; j < 8; j++)
                if (t & 1)
                    t = (t >>> 1) ^ 0xEDB88320;
                else
                    t = t >>> 1;
            table[i] = t;
        }
        return table;
    })();
    // "no-op" codec
    function NOOP() { }
    NOOP.prototype.append = function append(bytes, onprogress) {
        return bytes;
    };
    NOOP.prototype.flush = function flush() { };
    function blobSlice(blob, index, length) {
        if (index < 0 || length < 0 || index + length > blob.size)
            throw new RangeError('offset:' + index + ', length:' + length + ', size:' + blob.size);
        if (blob.slice)
            return blob.slice(index, index + length);
        else if (blob.webkitSlice)
            return blob.webkitSlice(index, index + length);
        else if (blob.mozSlice)
            return blob.mozSlice(index, index + length);
        else if (blob.msSlice)
            return blob.msSlice(index, index + length);
    }
    function getDataHelper(byteLength, bytes) {
        var dataBuffer, dataArray;
        dataBuffer = new ArrayBuffer(byteLength);
        dataArray = new Uint8Array(dataBuffer);
        if (bytes)
            dataArray.set(bytes, 0);
        return {
            buffer: dataBuffer,
            array: dataArray,
            view: new DataView(dataBuffer)
        };
    }
    // Readers
    function Reader() {
    }
    function TextReader(text) {
        var that = this, blobReader;
        function init(callback, onerror) {
            var blob = new Blob([text], {
                type: TEXT_PLAIN
            });
            blobReader = new BlobReader(blob);
            blobReader.init(function () {
                that.size = blobReader.size;
                callback();
            }, onerror);
        }
        function readUint8Array(index, length, callback, onerror) {
            blobReader.readUint8Array(index, length, callback, onerror);
        }
        that.size = 0;
        that.init = init;
        that.readUint8Array = readUint8Array;
    }
    TextReader.prototype = new Reader();
    TextReader.prototype.constructor = TextReader;
    function Data64URIReader(dataURI) {
        var that = this, dataStart;
        function init(callback) {
            var dataEnd = dataURI.length;
            while (dataURI.charAt(dataEnd - 1) == "=")
                dataEnd--;
            dataStart = dataURI.indexOf(",") + 1;
            that.size = Math.floor((dataEnd - dataStart) * 0.75);
            callback();
        }
        function readUint8Array(index, length, callback) {
            var i, data = getDataHelper(length);
            var start = Math.floor(index / 3) * 4;
            var end = Math.ceil((index + length) / 3) * 4;
            var bytes = obj.atob(dataURI.substring(start + dataStart, end + dataStart));
            var delta = index - Math.floor(start / 4) * 3;
            for (i = delta; i < delta + length; i++)
                data.array[i - delta] = bytes.charCodeAt(i);
            callback(data.array);
        }
        that.size = 0;
        that.init = init;
        that.readUint8Array = readUint8Array;
    }
    Data64URIReader.prototype = new Reader();
    Data64URIReader.prototype.constructor = Data64URIReader;
    function BlobReader(blob) {
        var that = this;
        function init(callback) {
            that.size = blob.size;
            callback();
        }
        function readUint8Array(index, length, callback, onerror) {
            var reader = new FileReader();
            reader.onload = function (e) {
                callback(new Uint8Array(e.target.result));
            };
            reader.onerror = onerror;
            try {
                reader.readAsArrayBuffer(blobSlice(blob, index, length));
            }
            catch (e) {
                onerror(e);
            }
        }
        that.size = 0;
        that.init = init;
        that.readUint8Array = readUint8Array;
    }
    BlobReader.prototype = new Reader();
    BlobReader.prototype.constructor = BlobReader;
    // Writers
    function Writer() {
    }
    Writer.prototype.getData = function (callback) {
        callback(this.data);
    };
    function TextWriter(encoding) {
        var that = this, blob;
        function init(callback) {
            blob = new Blob([], {
                type: TEXT_PLAIN
            });
            callback();
        }
        function writeUint8Array(array, callback) {
            blob = new Blob([blob, appendABViewSupported ? array : array.buffer], {
                type: TEXT_PLAIN
            });
            callback();
        }
        function getData(callback, onerror) {
            var reader = new FileReader();
            reader.onload = function (e) {
                callback(e.target.result);
            };
            reader.onerror = onerror;
            reader.readAsText(blob, encoding);
        }
        that.init = init;
        that.writeUint8Array = writeUint8Array;
        that.getData = getData;
    }
    TextWriter.prototype = new Writer();
    TextWriter.prototype.constructor = TextWriter;
    function Data64URIWriter(contentType) {
        var that = this, data = "", pending = "";
        function init(callback) {
            data += "data:" + (contentType || "") + ";base64,";
            callback();
        }
        function writeUint8Array(array, callback) {
            var i, delta = pending.length, dataString = pending;
            pending = "";
            for (i = 0; i < (Math.floor((delta + array.length) / 3) * 3) - delta; i++)
                dataString += String.fromCharCode(array[i]);
            for (; i < array.length; i++)
                pending += String.fromCharCode(array[i]);
            if (dataString.length > 2)
                data += obj.btoa(dataString);
            else
                pending = dataString;
            callback();
        }
        function getData(callback) {
            callback(data + obj.btoa(pending));
        }
        that.init = init;
        that.writeUint8Array = writeUint8Array;
        that.getData = getData;
    }
    Data64URIWriter.prototype = new Writer();
    Data64URIWriter.prototype.constructor = Data64URIWriter;
    function BlobWriter(contentType) {
        var blob, that = this;
        function init(callback) {
            blob = new Blob([], {
                type: contentType
            });
            callback();
        }
        function writeUint8Array(array, callback) {
            blob = new Blob([blob, appendABViewSupported ? array : array.buffer], {
                type: contentType
            });
            callback();
        }
        function getData(callback) {
            callback(blob);
        }
        that.init = init;
        that.writeUint8Array = writeUint8Array;
        that.getData = getData;
    }
    BlobWriter.prototype = new Writer();
    BlobWriter.prototype.constructor = BlobWriter;
    /**
     * inflate/deflate core functions
     * @param worker {Worker} web worker for the task.
     * @param initialMessage {Object} initial message to be sent to the worker. should contain
     *   sn(serial number for distinguishing multiple tasks sent to the worker), and codecClass.
     *   This function may add more properties before sending.
     */
    function launchWorkerProcess(worker, initialMessage, reader, writer, offset, size, onprogress, onend, onreaderror, onwriteerror) {
        var chunkIndex = 0, index, outputSize, sn = initialMessage.sn, crc;
        function onflush() {
            worker.removeEventListener('message', onmessage, false);
            onend(outputSize, crc);
        }
        function onmessage(event) {
            var message = event.data, data = message.data, err = message.error;
            if (err) {
                err.toString = function () { return 'Error: ' + this.message; };
                onreaderror(err);
                return;
            }
            if (message.sn !== sn)
                return;
            if (typeof message.codecTime === 'number')
                worker.codecTime += message.codecTime; // should be before onflush()
            if (typeof message.crcTime === 'number')
                worker.crcTime += message.crcTime;
            switch (message.type) {
                case 'append':
                    if (data) {
                        outputSize += data.length;
                        writer.writeUint8Array(data, function () {
                            step();
                        }, onwriteerror);
                    }
                    else
                        step();
                    break;
                case 'flush':
                    crc = message.crc;
                    if (data) {
                        outputSize += data.length;
                        writer.writeUint8Array(data, function () {
                            onflush();
                        }, onwriteerror);
                    }
                    else
                        onflush();
                    break;
                case 'progress':
                    if (onprogress)
                        onprogress(index + message.loaded, size);
                    break;
                case 'importScripts': //no need to handle here
                case 'newTask':
                case 'echo':
                    break;
                default:
                    console.warn('zip.js:launchWorkerProcess: unknown message: ', message);
            }
        }
        function step() {
            index = chunkIndex * CHUNK_SIZE;
            // use `<=` instead of `<`, because `size` may be 0.
            if (index <= size) {
                reader.readUint8Array(offset + index, Math.min(CHUNK_SIZE, size - index), function (array) {
                    if (onprogress)
                        onprogress(index, size);
                    var msg = index === 0 ? initialMessage : { sn: sn };
                    msg.type = 'append';
                    msg.data = array;
                    // posting a message with transferables will fail on IE10
                    try {
                        worker.postMessage(msg, [array.buffer]);
                    }
                    catch (ex) {
                        worker.postMessage(msg); // retry without transferables
                    }
                    chunkIndex++;
                }, onreaderror);
            }
            else {
                worker.postMessage({
                    sn: sn,
                    type: 'flush'
                });
            }
        }
        outputSize = 0;
        worker.addEventListener('message', onmessage, false);
        step();
    }
    function launchProcess(process, reader, writer, offset, size, crcType, onprogress, onend, onreaderror, onwriteerror) {
        var chunkIndex = 0, index, outputSize = 0, crcInput = crcType === 'input', crcOutput = crcType === 'output', crc = new Crc32();
        function step() {
            var outputData;
            index = chunkIndex * CHUNK_SIZE;
            if (index < size)
                reader.readUint8Array(offset + index, Math.min(CHUNK_SIZE, size - index), function (inputData) {
                    var outputData;
                    try {
                        outputData = process.append(inputData, function (loaded) {
                            if (onprogress)
                                onprogress(index + loaded, size);
                        });
                    }
                    catch (e) {
                        onreaderror(e);
                        return;
                    }
                    if (outputData) {
                        outputSize += outputData.length;
                        writer.writeUint8Array(outputData, function () {
                            chunkIndex++;
                            setTimeout(step, 1);
                        }, onwriteerror);
                        if (crcOutput)
                            crc.append(outputData);
                    }
                    else {
                        chunkIndex++;
                        setTimeout(step, 1);
                    }
                    if (crcInput)
                        crc.append(inputData);
                    if (onprogress)
                        onprogress(index, size);
                }, onreaderror);
            else {
                try {
                    outputData = process.flush();
                }
                catch (e) {
                    onreaderror(e);
                    return;
                }
                if (outputData) {
                    if (crcOutput)
                        crc.append(outputData);
                    outputSize += outputData.length;
                    writer.writeUint8Array(outputData, function () {
                        onend(outputSize, crc.get());
                    }, onwriteerror);
                }
                else
                    onend(outputSize, crc.get());
            }
        }
        step();
    }
    function inflate(worker, sn, reader, writer, offset, size, computeCrc32, onend, onprogress, onreaderror, onwriteerror) {
        var crcType = computeCrc32 ? 'output' : 'none';
        if (obj.zip.useWebWorkers) {
            var initialMessage = {
                sn: sn,
                codecClass: 'Inflater',
                crcType: crcType,
            };
            launchWorkerProcess(worker, initialMessage, reader, writer, offset, size, onprogress, onend, onreaderror, onwriteerror);
        }
        else
            launchProcess(new obj.zip.Inflater(), reader, writer, offset, size, crcType, onprogress, onend, onreaderror, onwriteerror);
    }
    function deflate(worker, sn, reader, writer, level, onend, onprogress, onreaderror, onwriteerror) {
        var crcType = 'input';
        if (obj.zip.useWebWorkers) {
            var initialMessage = {
                sn: sn,
                options: { level: level },
                codecClass: 'Deflater',
                crcType: crcType,
            };
            launchWorkerProcess(worker, initialMessage, reader, writer, 0, reader.size, onprogress, onend, onreaderror, onwriteerror);
        }
        else
            launchProcess(new obj.zip.Deflater(), reader, writer, 0, reader.size, crcType, onprogress, onend, onreaderror, onwriteerror);
    }
    function copy(worker, sn, reader, writer, offset, size, computeCrc32, onend, onprogress, onreaderror, onwriteerror) {
        var crcType = 'input';
        if (obj.zip.useWebWorkers && computeCrc32) {
            var initialMessage = {
                sn: sn,
                codecClass: 'NOOP',
                crcType: crcType,
            };
            launchWorkerProcess(worker, initialMessage, reader, writer, offset, size, onprogress, onend, onreaderror, onwriteerror);
        }
        else
            launchProcess(new NOOP(), reader, writer, offset, size, crcType, onprogress, onend, onreaderror, onwriteerror);
    }
    // ZipReader
    function decodeASCII(str) {
        var i, out = "", charCode, extendedASCII = ['\u00C7', '\u00FC', '\u00E9', '\u00E2', '\u00E4', '\u00E0', '\u00E5', '\u00E7', '\u00EA', '\u00EB',
            '\u00E8', '\u00EF', '\u00EE', '\u00EC', '\u00C4', '\u00C5', '\u00C9', '\u00E6', '\u00C6', '\u00F4', '\u00F6', '\u00F2', '\u00FB', '\u00F9',
            '\u00FF', '\u00D6', '\u00DC', '\u00F8', '\u00A3', '\u00D8', '\u00D7', '\u0192', '\u00E1', '\u00ED', '\u00F3', '\u00FA', '\u00F1', '\u00D1',
            '\u00AA', '\u00BA', '\u00BF', '\u00AE', '\u00AC', '\u00BD', '\u00BC', '\u00A1', '\u00AB', '\u00BB', '_', '_', '_', '\u00A6', '\u00A6',
            '\u00C1', '\u00C2', '\u00C0', '\u00A9', '\u00A6', '\u00A6', '+', '+', '\u00A2', '\u00A5', '+', '+', '-', '-', '+', '-', '+', '\u00E3',
            '\u00C3', '+', '+', '-', '-', '\u00A6', '-', '+', '\u00A4', '\u00F0', '\u00D0', '\u00CA', '\u00CB', '\u00C8', 'i', '\u00CD', '\u00CE',
            '\u00CF', '+', '+', '_', '_', '\u00A6', '\u00CC', '_', '\u00D3', '\u00DF', '\u00D4', '\u00D2', '\u00F5', '\u00D5', '\u00B5', '\u00FE',
            '\u00DE', '\u00DA', '\u00DB', '\u00D9', '\u00FD', '\u00DD', '\u00AF', '\u00B4', '\u00AD', '\u00B1', '_', '\u00BE', '\u00B6', '\u00A7',
            '\u00F7', '\u00B8', '\u00B0', '\u00A8', '\u00B7', '\u00B9', '\u00B3', '\u00B2', '_', ' '];
        for (i = 0; i < str.length; i++) {
            charCode = str.charCodeAt(i) & 0xFF;
            if (charCode > 127)
                out += extendedASCII[charCode - 128];
            else
                out += String.fromCharCode(charCode);
        }
        return out;
    }
    function decodeUTF8(string) {
        return decodeURIComponent(escape(string));
    }
    function getString(bytes) {
        var i, str = "";
        for (i = 0; i < bytes.length; i++)
            str += String.fromCharCode(bytes[i]);
        return str;
    }
    function getDate(timeRaw) {
        var date = (timeRaw & 0xffff0000) >> 16, time = timeRaw & 0x0000ffff;
        try {
            return new Date(1980 + ((date & 0xFE00) >> 9), ((date & 0x01E0) >> 5) - 1, date & 0x001F, (time & 0xF800) >> 11, (time & 0x07E0) >> 5, (time & 0x001F) * 2, 0);
        }
        catch (e) {
        }
    }
    function readCommonHeader(entry, data, index, centralDirectory, onerror) {
        entry.version = data.view.getUint16(index, true);
        entry.bitFlag = data.view.getUint16(index + 2, true);
        entry.compressionMethod = data.view.getUint16(index + 4, true);
        entry.lastModDateRaw = data.view.getUint32(index + 6, true);
        entry.lastModDate = getDate(entry.lastModDateRaw);
        if ((entry.bitFlag & 0x01) === 0x01) {
            onerror(ERR_ENCRYPTED);
            return;
        }
        if (centralDirectory || (entry.bitFlag & 0x0008) != 0x0008) {
            entry.crc32 = data.view.getUint32(index + 10, true);
            entry.compressedSize = data.view.getUint32(index + 14, true);
            entry.uncompressedSize = data.view.getUint32(index + 18, true);
        }
        if (entry.compressedSize === 0xFFFFFFFF || entry.uncompressedSize === 0xFFFFFFFF) {
            onerror(ERR_ZIP64);
            return;
        }
        entry.filenameLength = data.view.getUint16(index + 22, true);
        entry.extraFieldLength = data.view.getUint16(index + 24, true);
    }
    function createZipReader(reader, callback, onerror) {
        var inflateSN = 0;
        function Entry() {
        }
        Entry.prototype.getData = function (writer, onend, onprogress, checkCrc32) {
            var that = this;
            function testCrc32(crc32) {
                var dataCrc32 = getDataHelper(4);
                dataCrc32.view.setUint32(0, crc32);
                return that.crc32 == dataCrc32.view.getUint32(0);
            }
            function getWriterData(uncompressedSize, crc32) {
                if (checkCrc32 && !testCrc32(crc32))
                    onerror(ERR_CRC);
                else
                    writer.getData(function (data) {
                        onend(data);
                    });
            }
            function onreaderror(err) {
                onerror(err || ERR_READ_DATA);
            }
            function onwriteerror(err) {
                onerror(err || ERR_WRITE_DATA);
            }
            reader.readUint8Array(that.offset, 30, function (bytes) {
                var data = getDataHelper(bytes.length, bytes), dataOffset;
                if (data.view.getUint32(0) != 0x504b0304) {
                    onerror(ERR_BAD_FORMAT);
                    return;
                }
                readCommonHeader(that, data, 4, false, onerror);
                dataOffset = that.offset + 30 + that.filenameLength + that.extraFieldLength;
                writer.init(function () {
                    if (that.compressionMethod === 0)
                        copy(that._worker, inflateSN++, reader, writer, dataOffset, that.compressedSize, checkCrc32, getWriterData, onprogress, onreaderror, onwriteerror);
                    else
                        inflate(that._worker, inflateSN++, reader, writer, dataOffset, that.compressedSize, checkCrc32, getWriterData, onprogress, onreaderror, onwriteerror);
                }, onwriteerror);
            }, onreaderror);
        };
        function seekEOCDR(eocdrCallback) {
            // "End of central directory record" is the last part of a zip archive, and is at least 22 bytes long.
            // Zip file comment is the last part of EOCDR and has max length of 64KB,
            // so we only have to search the last 64K + 22 bytes of a archive for EOCDR signature (0x06054b50).
            var EOCDR_MIN = 22;
            if (reader.size < EOCDR_MIN) {
                onerror(ERR_BAD_FORMAT);
                return;
            }
            var ZIP_COMMENT_MAX = 256 * 256, EOCDR_MAX = EOCDR_MIN + ZIP_COMMENT_MAX;
            // In most cases, the EOCDR is EOCDR_MIN bytes long
            doSeek(EOCDR_MIN, function () {
                // If not found, try within EOCDR_MAX bytes
                doSeek(Math.min(EOCDR_MAX, reader.size), function () {
                    onerror(ERR_BAD_FORMAT);
                });
            });
            // seek last length bytes of file for EOCDR
            function doSeek(length, eocdrNotFoundCallback) {
                reader.readUint8Array(reader.size - length, length, function (bytes) {
                    for (var i = bytes.length - EOCDR_MIN; i >= 0; i--) {
                        if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
                            eocdrCallback(new DataView(bytes.buffer, i, EOCDR_MIN));
                            return;
                        }
                    }
                    eocdrNotFoundCallback();
                }, function () {
                    onerror(ERR_READ);
                });
            }
        }
        var zipReader = {
            getEntries: function (callback) {
                var worker = this._worker;
                // look for End of central directory record
                seekEOCDR(function (dataView) {
                    var datalength, fileslength;
                    datalength = dataView.getUint32(16, true);
                    fileslength = dataView.getUint16(8, true);
                    if (datalength < 0 || datalength >= reader.size) {
                        onerror(ERR_BAD_FORMAT);
                        return;
                    }
                    reader.readUint8Array(datalength, reader.size - datalength, function (bytes) {
                        var i, index = 0, entries = [], entry, filename, comment, data = getDataHelper(bytes.length, bytes);
                        for (i = 0; i < fileslength; i++) {
                            entry = new Entry();
                            entry._worker = worker;
                            if (data.view.getUint32(index) != 0x504b0102) {
                                onerror(ERR_BAD_FORMAT);
                                return;
                            }
                            readCommonHeader(entry, data, index + 6, true, onerror);
                            entry.commentLength = data.view.getUint16(index + 32, true);
                            entry.directory = ((data.view.getUint8(index + 38) & 0x10) == 0x10);
                            entry.offset = data.view.getUint32(index + 42, true);
                            filename = getString(data.array.subarray(index + 46, index + 46 + entry.filenameLength));
                            entry.filename = ((entry.bitFlag & 0x0800) === 0x0800) ? decodeUTF8(filename) : decodeASCII(filename);
                            if (!entry.directory && entry.filename.charAt(entry.filename.length - 1) == "/")
                                entry.directory = true;
                            comment = getString(data.array.subarray(index + 46 + entry.filenameLength + entry.extraFieldLength, index + 46
                                + entry.filenameLength + entry.extraFieldLength + entry.commentLength));
                            entry.comment = ((entry.bitFlag & 0x0800) === 0x0800) ? decodeUTF8(comment) : decodeASCII(comment);
                            entries.push(entry);
                            index += 46 + entry.filenameLength + entry.extraFieldLength + entry.commentLength;
                        }
                        callback(entries);
                    }, function () {
                        onerror(ERR_READ);
                    });
                });
            },
            close: function (callback) {
                if (this._worker) {
                    this._worker.terminate();
                    this._worker = null;
                }
                if (callback)
                    callback();
            },
            _worker: null
        };
        if (!obj.zip.useWebWorkers)
            callback(zipReader);
        else {
            createWorker('inflater', function (worker) {
                zipReader._worker = worker;
                callback(zipReader);
            }, function (err) {
                onerror(err);
            });
        }
    }
    // ZipWriter
    function encodeUTF8(string) {
        return unescape(encodeURIComponent(string));
    }
    function getBytes(str) {
        var i, array = [];
        for (i = 0; i < str.length; i++)
            array.push(str.charCodeAt(i));
        return array;
    }
    function createZipWriter(writer, callback, onerror, dontDeflate) {
        var files = {}, filenames = [], datalength = 0;
        var deflateSN = 0;
        function onwriteerror(err) {
            onerror(err || ERR_WRITE);
        }
        function onreaderror(err) {
            onerror(err || ERR_READ_DATA);
        }
        var zipWriter = {
            add: function (name, reader, onend, onprogress, options) {
                var header, filename, date;
                var worker = this._worker;
                function writeHeader(callback) {
                    var data;
                    date = options.lastModDate || new Date();
                    header = getDataHelper(26);
                    files[name] = {
                        headerArray: header.array,
                        directory: options.directory,
                        filename: filename,
                        offset: datalength,
                        comment: getBytes(encodeUTF8(options.comment || ""))
                    };
                    header.view.setUint32(0, 0x14000808);
                    if (options.version)
                        header.view.setUint8(0, options.version);
                    if (!dontDeflate && options.level !== 0 && !options.directory)
                        header.view.setUint16(4, 0x0800);
                    header.view.setUint16(6, (((date.getHours() << 6) | date.getMinutes()) << 5) | date.getSeconds() / 2, true);
                    header.view.setUint16(8, ((((date.getFullYear() - 1980) << 4) | (date.getMonth() + 1)) << 5) | date.getDate(), true);
                    header.view.setUint16(22, filename.length, true);
                    data = getDataHelper(30 + filename.length);
                    data.view.setUint32(0, 0x504b0304);
                    data.array.set(header.array, 4);
                    data.array.set(filename, 30);
                    datalength += data.array.length;
                    writer.writeUint8Array(data.array, callback, onwriteerror);
                }
                function writeFooter(compressedLength, crc32) {
                    var footer = getDataHelper(16);
                    datalength += compressedLength || 0;
                    footer.view.setUint32(0, 0x504b0708);
                    if (typeof crc32 != "undefined") {
                        header.view.setUint32(10, crc32, true);
                        footer.view.setUint32(4, crc32, true);
                    }
                    if (reader) {
                        footer.view.setUint32(8, compressedLength, true);
                        header.view.setUint32(14, compressedLength, true);
                        footer.view.setUint32(12, reader.size, true);
                        header.view.setUint32(18, reader.size, true);
                    }
                    writer.writeUint8Array(footer.array, function () {
                        datalength += 16;
                        onend();
                    }, onwriteerror);
                }
                function writeFile() {
                    options = options || {};
                    name = name.trim();
                    if (options.directory && name.charAt(name.length - 1) != "/")
                        name += "/";
                    if (files.hasOwnProperty(name)) {
                        onerror(ERR_DUPLICATED_NAME);
                        return;
                    }
                    filename = getBytes(encodeUTF8(name));
                    filenames.push(name);
                    writeHeader(function () {
                        if (reader)
                            if (dontDeflate || options.level === 0)
                                copy(worker, deflateSN++, reader, writer, 0, reader.size, true, writeFooter, onprogress, onreaderror, onwriteerror);
                            else
                                deflate(worker, deflateSN++, reader, writer, options.level, writeFooter, onprogress, onreaderror, onwriteerror);
                        else
                            writeFooter();
                    }, onwriteerror);
                }
                if (reader)
                    reader.init(writeFile, onreaderror);
                else
                    writeFile();
            },
            close: function (callback) {
                if (this._worker) {
                    this._worker.terminate();
                    this._worker = null;
                }
                var data, length = 0, index = 0, indexFilename, file;
                for (indexFilename = 0; indexFilename < filenames.length; indexFilename++) {
                    file = files[filenames[indexFilename]];
                    length += 46 + file.filename.length + file.comment.length;
                }
                data = getDataHelper(length + 22);
                for (indexFilename = 0; indexFilename < filenames.length; indexFilename++) {
                    file = files[filenames[indexFilename]];
                    data.view.setUint32(index, 0x504b0102);
                    data.view.setUint16(index + 4, 0x1400);
                    data.array.set(file.headerArray, index + 6);
                    data.view.setUint16(index + 32, file.comment.length, true);
                    if (file.directory)
                        data.view.setUint8(index + 38, 0x10);
                    data.view.setUint32(index + 42, file.offset, true);
                    data.array.set(file.filename, index + 46);
                    data.array.set(file.comment, index + 46 + file.filename.length);
                    index += 46 + file.filename.length + file.comment.length;
                }
                data.view.setUint32(index, 0x504b0506);
                data.view.setUint16(index + 8, filenames.length, true);
                data.view.setUint16(index + 10, filenames.length, true);
                data.view.setUint32(index + 12, length, true);
                data.view.setUint32(index + 16, datalength, true);
                writer.writeUint8Array(data.array, function () {
                    writer.getData(callback);
                }, onwriteerror);
            },
            _worker: null
        };
        if (!obj.zip.useWebWorkers)
            callback(zipWriter);
        else {
            createWorker('deflater', function (worker) {
                zipWriter._worker = worker;
                callback(zipWriter);
            }, function (err) {
                onerror(err);
            });
        }
    }
    function resolveURLs(urls) {
        var a = document.createElement('a');
        return urls.map(function (url) {
            a.href = url;
            return a.href;
        });
    }
    var DEFAULT_WORKER_SCRIPTS = {
        deflater: ['assets/z-worker.js', 'deflate.js'],
        inflater: ['assets/z-worker.js', 'inflate.js']
    };
    function createWorker(type, callback, onerror) {
        if (obj.zip.workerScripts !== null && obj.zip.workerScriptsPath !== null) {
            onerror(new Error('Either zip.workerScripts or zip.workerScriptsPath may be set, not both.'));
            return;
        }
        var scripts;
        if (obj.zip.workerScripts) {
            scripts = obj.zip.workerScripts[type];
            if (!Array.isArray(scripts)) {
                onerror(new Error('zip.workerScripts.' + type + ' is not an array!'));
                return;
            }
            scripts = resolveURLs(scripts);
        }
        else {
            scripts = DEFAULT_WORKER_SCRIPTS[type].slice(0);
            scripts[0] = (obj.zip.workerScriptsPath || '') + scripts[0];
        }
        var worker = new Worker(scripts[0]);
        // record total consumed time by inflater/deflater/crc32 in this worker
        worker.codecTime = worker.crcTime = 0;
        worker.postMessage({ type: 'importScripts', scripts: scripts.slice(1) });
        worker.addEventListener('message', onmessage);
        function onmessage(ev) {
            var msg = ev.data;
            if (msg.error) {
                worker.terminate(); // should before onerror(), because onerror() may throw.
                onerror(msg.error);
                return;
            }
            if (msg.type === 'importScripts') {
                worker.removeEventListener('message', onmessage);
                worker.removeEventListener('error', errorHandler);
                callback(worker);
            }
        }
        // catch entry script loading error and other unhandled errors
        worker.addEventListener('error', errorHandler);
        function errorHandler(err) {
            worker.terminate();
            onerror(err);
        }
    }
    function onerror_default(error) {
        console.error(error);
    }
    obj.zip = {
        Reader: Reader,
        Writer: Writer,
        BlobReader: BlobReader,
        Data64URIReader: Data64URIReader,
        TextReader: TextReader,
        BlobWriter: BlobWriter,
        Data64URIWriter: Data64URIWriter,
        TextWriter: TextWriter,
        createReader: function (reader, callback, onerror) {
            onerror = onerror || onerror_default;
            reader.init(function () {
                createZipReader(reader, callback, onerror);
            }, onerror);
        },
        createWriter: function (writer, callback, onerror, dontDeflate) {
            onerror = onerror || onerror_default;
            dontDeflate = !!dontDeflate;
            writer.init(function () {
                createZipWriter(writer, callback, onerror, dontDeflate);
            }, onerror);
        },
        useWebWorkers: true,
        /**
         * Directory containing the default worker scripts (z-worker.js, deflate.js, and inflate.js), relative to current base url.
         * E.g.: zip.workerScripts = './';
         */
        workerScriptsPath: null,
        /**
         * Advanced option to control which scripts are loaded in the Web worker. If this option is specified, then workerScriptsPath must not be set.
         * workerScripts.deflater/workerScripts.inflater should be arrays of urls to scripts for deflater/inflater, respectively.
         * Scripts in the array are executed in order, and the first one should be z-worker.js, which is used to start the worker.
         * All urls are relative to current base url.
         * E.g.:
         * zip.workerScripts = {
         *   deflater: ['z-worker.js', 'deflate.js'],
         *   inflater: ['z-worker.js', 'inflate.js']
         * };
         */
        workerScripts: null,
    };
})(this);
/*! jQuery v3.3.1 | (c) JS Foundation and other contributors | jquery.org/license */
!function (e, t) {
    "use strict";
    "object" == typeof module && "object" == typeof module.exports ? module.exports = e.document ? t(e, !0) : function (e) { if (!e.document)
        throw new Error("jQuery requires a window with a document"); return t(e); } : t(e);
}("undefined" != typeof window ? window : this, function (e, t) {
    "use strict";
    var n = [], r = e.document, i = Object.getPrototypeOf, o = n.slice, a = n.concat, s = n.push, u = n.indexOf, l = {}, c = l.toString, f = l.hasOwnProperty, p = f.toString, d = p.call(Object), h = {}, g = function e(t) { return "function" == typeof t && "number" != typeof t.nodeType; }, y = function e(t) { return null != t && t === t.window; }, v = { type: !0, src: !0, noModule: !0 };
    function m(e, t, n) { var i, o = (t = t || r).createElement("script"); if (o.text = e, n)
        for (i in v)
            n[i] && (o[i] = n[i]); t.head.appendChild(o).parentNode.removeChild(o); }
    function x(e) { return null == e ? e + "" : "object" == typeof e || "function" == typeof e ? l[c.call(e)] || "object" : typeof e; }
    var b = "3.3.1", w = function (e, t) { return new w.fn.init(e, t); }, T = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;
    w.fn = w.prototype = { jquery: "3.3.1", constructor: w, length: 0, toArray: function () { return o.call(this); }, get: function (e) { return null == e ? o.call(this) : e < 0 ? this[e + this.length] : this[e]; }, pushStack: function (e) { var t = w.merge(this.constructor(), e); return t.prevObject = this, t; }, each: function (e) { return w.each(this, e); }, map: function (e) { return this.pushStack(w.map(this, function (t, n) { return e.call(t, n, t); })); }, slice: function () { return this.pushStack(o.apply(this, arguments)); }, first: function () { return this.eq(0); }, last: function () { return this.eq(-1); }, eq: function (e) { var t = this.length, n = +e + (e < 0 ? t : 0); return this.pushStack(n >= 0 && n < t ? [this[n]] : []); }, end: function () { return this.prevObject || this.constructor(); }, push: s, sort: n.sort, splice: n.splice }, w.extend = w.fn.extend = function () { var e, t, n, r, i, o, a = arguments[0] || {}, s = 1, u = arguments.length, l = !1; for ("boolean" == typeof a && (l = a, a = arguments[s] || {}, s++), "object" == typeof a || g(a) || (a = {}), s === u && (a = this, s--); s < u; s++)
        if (null != (e = arguments[s]))
            for (t in e)
                n = a[t], a !== (r = e[t]) && (l && r && (w.isPlainObject(r) || (i = Array.isArray(r))) ? (i ? (i = !1, o = n && Array.isArray(n) ? n : []) : o = n && w.isPlainObject(n) ? n : {}, a[t] = w.extend(l, o, r)) : void 0 !== r && (a[t] = r)); return a; }, w.extend({ expando: "jQuery" + ("3.3.1" + Math.random()).replace(/\D/g, ""), isReady: !0, error: function (e) { throw new Error(e); }, noop: function () { }, isPlainObject: function (e) { var t, n; return !(!e || "[object Object]" !== c.call(e)) && (!(t = i(e)) || "function" == typeof (n = f.call(t, "constructor") && t.constructor) && p.call(n) === d); }, isEmptyObject: function (e) { var t; for (t in e)
            return !1; return !0; }, globalEval: function (e) { m(e); }, each: function (e, t) { var n, r = 0; if (C(e)) {
            for (n = e.length; r < n; r++)
                if (!1 === t.call(e[r], r, e[r]))
                    break;
        }
        else
            for (r in e)
                if (!1 === t.call(e[r], r, e[r]))
                    break; return e; }, trim: function (e) { return null == e ? "" : (e + "").replace(T, ""); }, makeArray: function (e, t) { var n = t || []; return null != e && (C(Object(e)) ? w.merge(n, "string" == typeof e ? [e] : e) : s.call(n, e)), n; }, inArray: function (e, t, n) { return null == t ? -1 : u.call(t, e, n); }, merge: function (e, t) { for (var n = +t.length, r = 0, i = e.length; r < n; r++)
            e[i++] = t[r]; return e.length = i, e; }, grep: function (e, t, n) { for (var r, i = [], o = 0, a = e.length, s = !n; o < a; o++)
            (r = !t(e[o], o)) !== s && i.push(e[o]); return i; }, map: function (e, t, n) { var r, i, o = 0, s = []; if (C(e))
            for (r = e.length; o < r; o++)
                null != (i = t(e[o], o, n)) && s.push(i);
        else
            for (o in e)
                null != (i = t(e[o], o, n)) && s.push(i); return a.apply([], s); }, guid: 1, support: h }), "function" == typeof Symbol && (w.fn[Symbol.iterator] = n[Symbol.iterator]), w.each("Boolean Number String Function Array Date RegExp Object Error Symbol".split(" "), function (e, t) { l["[object " + t + "]"] = t.toLowerCase(); });
    function C(e) { var t = !!e && "length" in e && e.length, n = x(e); return !g(e) && !y(e) && ("array" === n || 0 === t || "number" == typeof t && t > 0 && t - 1 in e); }
    var E = function (e) { var t, n, r, i, o, a, s, u, l, c, f, p, d, h, g, y, v, m, x, b = "sizzle" + 1 * new Date, w = e.document, T = 0, C = 0, E = ae(), k = ae(), S = ae(), D = function (e, t) { return e === t && (f = !0), 0; }, N = {}.hasOwnProperty, A = [], j = A.pop, q = A.push, L = A.push, H = A.slice, O = function (e, t) { for (var n = 0, r = e.length; n < r; n++)
        if (e[n] === t)
            return n; return -1; }, P = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped", M = "[\\x20\\t\\r\\n\\f]", R = "(?:\\\\.|[\\w-]|[^\0-\\xa0])+", I = "\\[" + M + "*(" + R + ")(?:" + M + "*([*^$|!~]?=)" + M + "*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + R + "))|)" + M + "*\\]", W = ":(" + R + ")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|" + I + ")*)|.*)\\)|)", $ = new RegExp(M + "+", "g"), B = new RegExp("^" + M + "+|((?:^|[^\\\\])(?:\\\\.)*)" + M + "+$", "g"), F = new RegExp("^" + M + "*," + M + "*"), _ = new RegExp("^" + M + "*([>+~]|" + M + ")" + M + "*"), z = new RegExp("=" + M + "*([^\\]'\"]*?)" + M + "*\\]", "g"), X = new RegExp(W), U = new RegExp("^" + R + "$"), V = { ID: new RegExp("^#(" + R + ")"), CLASS: new RegExp("^\\.(" + R + ")"), TAG: new RegExp("^(" + R + "|[*])"), ATTR: new RegExp("^" + I), PSEUDO: new RegExp("^" + W), CHILD: new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + M + "*(even|odd|(([+-]|)(\\d*)n|)" + M + "*(?:([+-]|)" + M + "*(\\d+)|))" + M + "*\\)|)", "i"), bool: new RegExp("^(?:" + P + ")$", "i"), needsContext: new RegExp("^" + M + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" + M + "*((?:-\\d)?\\d*)" + M + "*\\)|)(?=[^-]|$)", "i") }, G = /^(?:input|select|textarea|button)$/i, Y = /^h\d$/i, Q = /^[^{]+\{\s*\[native \w/, J = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/, K = /[+~]/, Z = new RegExp("\\\\([\\da-f]{1,6}" + M + "?|(" + M + ")|.)", "ig"), ee = function (e, t, n) { var r = "0x" + t - 65536; return r !== r || n ? t : r < 0 ? String.fromCharCode(r + 65536) : String.fromCharCode(r >> 10 | 55296, 1023 & r | 56320); }, te = /([\0-\x1f\x7f]|^-?\d)|^-$|[^\0-\x1f\x7f-\uFFFF\w-]/g, ne = function (e, t) { return t ? "\0" === e ? "\ufffd" : e.slice(0, -1) + "\\" + e.charCodeAt(e.length - 1).toString(16) + " " : "\\" + e; }, re = function () { p(); }, ie = me(function (e) { return !0 === e.disabled && ("form" in e || "label" in e); }, { dir: "parentNode", next: "legend" }); try {
        L.apply(A = H.call(w.childNodes), w.childNodes), A[w.childNodes.length].nodeType;
    }
    catch (e) {
        L = { apply: A.length ? function (e, t) { q.apply(e, H.call(t)); } : function (e, t) { var n = e.length, r = 0; while (e[n++] = t[r++])
                ; e.length = n - 1; } };
    } function oe(e, t, r, i) { var o, s, l, c, f, h, v, m = t && t.ownerDocument, T = t ? t.nodeType : 9; if (r = r || [], "string" != typeof e || !e || 1 !== T && 9 !== T && 11 !== T)
        return r; if (!i && ((t ? t.ownerDocument || t : w) !== d && p(t), t = t || d, g)) {
        if (11 !== T && (f = J.exec(e)))
            if (o = f[1]) {
                if (9 === T) {
                    if (!(l = t.getElementById(o)))
                        return r;
                    if (l.id === o)
                        return r.push(l), r;
                }
                else if (m && (l = m.getElementById(o)) && x(t, l) && l.id === o)
                    return r.push(l), r;
            }
            else {
                if (f[2])
                    return L.apply(r, t.getElementsByTagName(e)), r;
                if ((o = f[3]) && n.getElementsByClassName && t.getElementsByClassName)
                    return L.apply(r, t.getElementsByClassName(o)), r;
            }
        if (n.qsa && !S[e + " "] && (!y || !y.test(e))) {
            if (1 !== T)
                m = t, v = e;
            else if ("object" !== t.nodeName.toLowerCase()) {
                (c = t.getAttribute("id")) ? c = c.replace(te, ne) : t.setAttribute("id", c = b), s = (h = a(e)).length;
                while (s--)
                    h[s] = "#" + c + " " + ve(h[s]);
                v = h.join(","), m = K.test(e) && ge(t.parentNode) || t;
            }
            if (v)
                try {
                    return L.apply(r, m.querySelectorAll(v)), r;
                }
                catch (e) { }
                finally {
                    c === b && t.removeAttribute("id");
                }
        }
    } return u(e.replace(B, "$1"), t, r, i); } function ae() { var e = []; function t(n, i) { return e.push(n + " ") > r.cacheLength && delete t[e.shift()], t[n + " "] = i; } return t; } function se(e) { return e[b] = !0, e; } function ue(e) { var t = d.createElement("fieldset"); try {
        return !!e(t);
    }
    catch (e) {
        return !1;
    }
    finally {
        t.parentNode && t.parentNode.removeChild(t), t = null;
    } } function le(e, t) { var n = e.split("|"), i = n.length; while (i--)
        r.attrHandle[n[i]] = t; } function ce(e, t) { var n = t && e, r = n && 1 === e.nodeType && 1 === t.nodeType && e.sourceIndex - t.sourceIndex; if (r)
        return r; if (n)
        while (n = n.nextSibling)
            if (n === t)
                return -1; return e ? 1 : -1; } function fe(e) { return function (t) { return "input" === t.nodeName.toLowerCase() && t.type === e; }; } function pe(e) { return function (t) { var n = t.nodeName.toLowerCase(); return ("input" === n || "button" === n) && t.type === e; }; } function de(e) { return function (t) { return "form" in t ? t.parentNode && !1 === t.disabled ? "label" in t ? "label" in t.parentNode ? t.parentNode.disabled === e : t.disabled === e : t.isDisabled === e || t.isDisabled !== !e && ie(t) === e : t.disabled === e : "label" in t && t.disabled === e; }; } function he(e) { return se(function (t) { return t = +t, se(function (n, r) { var i, o = e([], n.length, t), a = o.length; while (a--)
        n[i = o[a]] && (n[i] = !(r[i] = n[i])); }); }); } function ge(e) { return e && "undefined" != typeof e.getElementsByTagName && e; } n = oe.support = {}, o = oe.isXML = function (e) { var t = e && (e.ownerDocument || e).documentElement; return !!t && "HTML" !== t.nodeName; }, p = oe.setDocument = function (e) { var t, i, a = e ? e.ownerDocument || e : w; return a !== d && 9 === a.nodeType && a.documentElement ? (d = a, h = d.documentElement, g = !o(d), w !== d && (i = d.defaultView) && i.top !== i && (i.addEventListener ? i.addEventListener("unload", re, !1) : i.attachEvent && i.attachEvent("onunload", re)), n.attributes = ue(function (e) { return e.className = "i", !e.getAttribute("className"); }), n.getElementsByTagName = ue(function (e) { return e.appendChild(d.createComment("")), !e.getElementsByTagName("*").length; }), n.getElementsByClassName = Q.test(d.getElementsByClassName), n.getById = ue(function (e) { return h.appendChild(e).id = b, !d.getElementsByName || !d.getElementsByName(b).length; }), n.getById ? (r.filter.ID = function (e) { var t = e.replace(Z, ee); return function (e) { return e.getAttribute("id") === t; }; }, r.find.ID = function (e, t) { if ("undefined" != typeof t.getElementById && g) {
        var n = t.getElementById(e);
        return n ? [n] : [];
    } }) : (r.filter.ID = function (e) { var t = e.replace(Z, ee); return function (e) { var n = "undefined" != typeof e.getAttributeNode && e.getAttributeNode("id"); return n && n.value === t; }; }, r.find.ID = function (e, t) { if ("undefined" != typeof t.getElementById && g) {
        var n, r, i, o = t.getElementById(e);
        if (o) {
            if ((n = o.getAttributeNode("id")) && n.value === e)
                return [o];
            i = t.getElementsByName(e), r = 0;
            while (o = i[r++])
                if ((n = o.getAttributeNode("id")) && n.value === e)
                    return [o];
        }
        return [];
    } }), r.find.TAG = n.getElementsByTagName ? function (e, t) { return "undefined" != typeof t.getElementsByTagName ? t.getElementsByTagName(e) : n.qsa ? t.querySelectorAll(e) : void 0; } : function (e, t) { var n, r = [], i = 0, o = t.getElementsByTagName(e); if ("*" === e) {
        while (n = o[i++])
            1 === n.nodeType && r.push(n);
        return r;
    } return o; }, r.find.CLASS = n.getElementsByClassName && function (e, t) { if ("undefined" != typeof t.getElementsByClassName && g)
        return t.getElementsByClassName(e); }, v = [], y = [], (n.qsa = Q.test(d.querySelectorAll)) && (ue(function (e) { h.appendChild(e).innerHTML = "<a id='" + b + "'></a><select id='" + b + "-\r\\' msallowcapture=''><option selected=''></option></select>", e.querySelectorAll("[msallowcapture^='']").length && y.push("[*^$]=" + M + "*(?:''|\"\")"), e.querySelectorAll("[selected]").length || y.push("\\[" + M + "*(?:value|" + P + ")"), e.querySelectorAll("[id~=" + b + "-]").length || y.push("~="), e.querySelectorAll(":checked").length || y.push(":checked"), e.querySelectorAll("a#" + b + "+*").length || y.push(".#.+[+~]"); }), ue(function (e) { e.innerHTML = "<a href='' disabled='disabled'></a><select disabled='disabled'><option/></select>"; var t = d.createElement("input"); t.setAttribute("type", "hidden"), e.appendChild(t).setAttribute("name", "D"), e.querySelectorAll("[name=d]").length && y.push("name" + M + "*[*^$|!~]?="), 2 !== e.querySelectorAll(":enabled").length && y.push(":enabled", ":disabled"), h.appendChild(e).disabled = !0, 2 !== e.querySelectorAll(":disabled").length && y.push(":enabled", ":disabled"), e.querySelectorAll("*,:x"), y.push(",.*:"); })), (n.matchesSelector = Q.test(m = h.matches || h.webkitMatchesSelector || h.mozMatchesSelector || h.oMatchesSelector || h.msMatchesSelector)) && ue(function (e) { n.disconnectedMatch = m.call(e, "*"), m.call(e, "[s!='']:x"), v.push("!=", W); }), y = y.length && new RegExp(y.join("|")), v = v.length && new RegExp(v.join("|")), t = Q.test(h.compareDocumentPosition), x = t || Q.test(h.contains) ? function (e, t) { var n = 9 === e.nodeType ? e.documentElement : e, r = t && t.parentNode; return e === r || !(!r || 1 !== r.nodeType || !(n.contains ? n.contains(r) : e.compareDocumentPosition && 16 & e.compareDocumentPosition(r))); } : function (e, t) { if (t)
        while (t = t.parentNode)
            if (t === e)
                return !0; return !1; }, D = t ? function (e, t) { if (e === t)
        return f = !0, 0; var r = !e.compareDocumentPosition - !t.compareDocumentPosition; return r || (1 & (r = (e.ownerDocument || e) === (t.ownerDocument || t) ? e.compareDocumentPosition(t) : 1) || !n.sortDetached && t.compareDocumentPosition(e) === r ? e === d || e.ownerDocument === w && x(w, e) ? -1 : t === d || t.ownerDocument === w && x(w, t) ? 1 : c ? O(c, e) - O(c, t) : 0 : 4 & r ? -1 : 1); } : function (e, t) { if (e === t)
        return f = !0, 0; var n, r = 0, i = e.parentNode, o = t.parentNode, a = [e], s = [t]; if (!i || !o)
        return e === d ? -1 : t === d ? 1 : i ? -1 : o ? 1 : c ? O(c, e) - O(c, t) : 0; if (i === o)
        return ce(e, t); n = e; while (n = n.parentNode)
        a.unshift(n); n = t; while (n = n.parentNode)
        s.unshift(n); while (a[r] === s[r])
        r++; return r ? ce(a[r], s[r]) : a[r] === w ? -1 : s[r] === w ? 1 : 0; }, d) : d; }, oe.matches = function (e, t) { return oe(e, null, null, t); }, oe.matchesSelector = function (e, t) { if ((e.ownerDocument || e) !== d && p(e), t = t.replace(z, "='$1']"), n.matchesSelector && g && !S[t + " "] && (!v || !v.test(t)) && (!y || !y.test(t)))
        try {
            var r = m.call(e, t);
            if (r || n.disconnectedMatch || e.document && 11 !== e.document.nodeType)
                return r;
        }
        catch (e) { } return oe(t, d, null, [e]).length > 0; }, oe.contains = function (e, t) { return (e.ownerDocument || e) !== d && p(e), x(e, t); }, oe.attr = function (e, t) { (e.ownerDocument || e) !== d && p(e); var i = r.attrHandle[t.toLowerCase()], o = i && N.call(r.attrHandle, t.toLowerCase()) ? i(e, t, !g) : void 0; return void 0 !== o ? o : n.attributes || !g ? e.getAttribute(t) : (o = e.getAttributeNode(t)) && o.specified ? o.value : null; }, oe.escape = function (e) { return (e + "").replace(te, ne); }, oe.error = function (e) { throw new Error("Syntax error, unrecognized expression: " + e); }, oe.uniqueSort = function (e) { var t, r = [], i = 0, o = 0; if (f = !n.detectDuplicates, c = !n.sortStable && e.slice(0), e.sort(D), f) {
        while (t = e[o++])
            t === e[o] && (i = r.push(o));
        while (i--)
            e.splice(r[i], 1);
    } return c = null, e; }, i = oe.getText = function (e) { var t, n = "", r = 0, o = e.nodeType; if (o) {
        if (1 === o || 9 === o || 11 === o) {
            if ("string" == typeof e.textContent)
                return e.textContent;
            for (e = e.firstChild; e; e = e.nextSibling)
                n += i(e);
        }
        else if (3 === o || 4 === o)
            return e.nodeValue;
    }
    else
        while (t = e[r++])
            n += i(t); return n; }, (r = oe.selectors = { cacheLength: 50, createPseudo: se, match: V, attrHandle: {}, find: {}, relative: { ">": { dir: "parentNode", first: !0 }, " ": { dir: "parentNode" }, "+": { dir: "previousSibling", first: !0 }, "~": { dir: "previousSibling" } }, preFilter: { ATTR: function (e) { return e[1] = e[1].replace(Z, ee), e[3] = (e[3] || e[4] || e[5] || "").replace(Z, ee), "~=" === e[2] && (e[3] = " " + e[3] + " "), e.slice(0, 4); }, CHILD: function (e) { return e[1] = e[1].toLowerCase(), "nth" === e[1].slice(0, 3) ? (e[3] || oe.error(e[0]), e[4] = +(e[4] ? e[5] + (e[6] || 1) : 2 * ("even" === e[3] || "odd" === e[3])), e[5] = +(e[7] + e[8] || "odd" === e[3])) : e[3] && oe.error(e[0]), e; }, PSEUDO: function (e) { var t, n = !e[6] && e[2]; return V.CHILD.test(e[0]) ? null : (e[3] ? e[2] = e[4] || e[5] || "" : n && X.test(n) && (t = a(n, !0)) && (t = n.indexOf(")", n.length - t) - n.length) && (e[0] = e[0].slice(0, t), e[2] = n.slice(0, t)), e.slice(0, 3)); } }, filter: { TAG: function (e) { var t = e.replace(Z, ee).toLowerCase(); return "*" === e ? function () { return !0; } : function (e) { return e.nodeName && e.nodeName.toLowerCase() === t; }; }, CLASS: function (e) { var t = E[e + " "]; return t || (t = new RegExp("(^|" + M + ")" + e + "(" + M + "|$)")) && E(e, function (e) { return t.test("string" == typeof e.className && e.className || "undefined" != typeof e.getAttribute && e.getAttribute("class") || ""); }); }, ATTR: function (e, t, n) { return function (r) { var i = oe.attr(r, e); return null == i ? "!=" === t : !t || (i += "", "=" === t ? i === n : "!=" === t ? i !== n : "^=" === t ? n && 0 === i.indexOf(n) : "*=" === t ? n && i.indexOf(n) > -1 : "$=" === t ? n && i.slice(-n.length) === n : "~=" === t ? (" " + i.replace($, " ") + " ").indexOf(n) > -1 : "|=" === t && (i === n || i.slice(0, n.length + 1) === n + "-")); }; }, CHILD: function (e, t, n, r, i) { var o = "nth" !== e.slice(0, 3), a = "last" !== e.slice(-4), s = "of-type" === t; return 1 === r && 0 === i ? function (e) { return !!e.parentNode; } : function (t, n, u) { var l, c, f, p, d, h, g = o !== a ? "nextSibling" : "previousSibling", y = t.parentNode, v = s && t.nodeName.toLowerCase(), m = !u && !s, x = !1; if (y) {
                if (o) {
                    while (g) {
                        p = t;
                        while (p = p[g])
                            if (s ? p.nodeName.toLowerCase() === v : 1 === p.nodeType)
                                return !1;
                        h = g = "only" === e && !h && "nextSibling";
                    }
                    return !0;
                }
                if (h = [a ? y.firstChild : y.lastChild], a && m) {
                    x = (d = (l = (c = (f = (p = y)[b] || (p[b] = {}))[p.uniqueID] || (f[p.uniqueID] = {}))[e] || [])[0] === T && l[1]) && l[2], p = d && y.childNodes[d];
                    while (p = ++d && p && p[g] || (x = d = 0) || h.pop())
                        if (1 === p.nodeType && ++x && p === t) {
                            c[e] = [T, d, x];
                            break;
                        }
                }
                else if (m && (x = d = (l = (c = (f = (p = t)[b] || (p[b] = {}))[p.uniqueID] || (f[p.uniqueID] = {}))[e] || [])[0] === T && l[1]), !1 === x)
                    while (p = ++d && p && p[g] || (x = d = 0) || h.pop())
                        if ((s ? p.nodeName.toLowerCase() === v : 1 === p.nodeType) && ++x && (m && ((c = (f = p[b] || (p[b] = {}))[p.uniqueID] || (f[p.uniqueID] = {}))[e] = [T, x]), p === t))
                            break;
                return (x -= i) === r || x % r == 0 && x / r >= 0;
            } }; }, PSEUDO: function (e, t) { var n, i = r.pseudos[e] || r.setFilters[e.toLowerCase()] || oe.error("unsupported pseudo: " + e); return i[b] ? i(t) : i.length > 1 ? (n = [e, e, "", t], r.setFilters.hasOwnProperty(e.toLowerCase()) ? se(function (e, n) { var r, o = i(e, t), a = o.length; while (a--)
                e[r = O(e, o[a])] = !(n[r] = o[a]); }) : function (e) { return i(e, 0, n); }) : i; } }, pseudos: { not: se(function (e) { var t = [], n = [], r = s(e.replace(B, "$1")); return r[b] ? se(function (e, t, n, i) { var o, a = r(e, null, i, []), s = e.length; while (s--)
                (o = a[s]) && (e[s] = !(t[s] = o)); }) : function (e, i, o) { return t[0] = e, r(t, null, o, n), t[0] = null, !n.pop(); }; }), has: se(function (e) { return function (t) { return oe(e, t).length > 0; }; }), contains: se(function (e) { return e = e.replace(Z, ee), function (t) { return (t.textContent || t.innerText || i(t)).indexOf(e) > -1; }; }), lang: se(function (e) { return U.test(e || "") || oe.error("unsupported lang: " + e), e = e.replace(Z, ee).toLowerCase(), function (t) { var n; do {
                if (n = g ? t.lang : t.getAttribute("xml:lang") || t.getAttribute("lang"))
                    return (n = n.toLowerCase()) === e || 0 === n.indexOf(e + "-");
            } while ((t = t.parentNode) && 1 === t.nodeType); return !1; }; }), target: function (t) { var n = e.location && e.location.hash; return n && n.slice(1) === t.id; }, root: function (e) { return e === h; }, focus: function (e) { return e === d.activeElement && (!d.hasFocus || d.hasFocus()) && !!(e.type || e.href || ~e.tabIndex); }, enabled: de(!1), disabled: de(!0), checked: function (e) { var t = e.nodeName.toLowerCase(); return "input" === t && !!e.checked || "option" === t && !!e.selected; }, selected: function (e) { return e.parentNode && e.parentNode.selectedIndex, !0 === e.selected; }, empty: function (e) { for (e = e.firstChild; e; e = e.nextSibling)
                if (e.nodeType < 6)
                    return !1; return !0; }, parent: function (e) { return !r.pseudos.empty(e); }, header: function (e) { return Y.test(e.nodeName); }, input: function (e) { return G.test(e.nodeName); }, button: function (e) { var t = e.nodeName.toLowerCase(); return "input" === t && "button" === e.type || "button" === t; }, text: function (e) { var t; return "input" === e.nodeName.toLowerCase() && "text" === e.type && (null == (t = e.getAttribute("type")) || "text" === t.toLowerCase()); }, first: he(function () { return [0]; }), last: he(function (e, t) { return [t - 1]; }), eq: he(function (e, t, n) { return [n < 0 ? n + t : n]; }), even: he(function (e, t) { for (var n = 0; n < t; n += 2)
                e.push(n); return e; }), odd: he(function (e, t) { for (var n = 1; n < t; n += 2)
                e.push(n); return e; }), lt: he(function (e, t, n) { for (var r = n < 0 ? n + t : n; --r >= 0;)
                e.push(r); return e; }), gt: he(function (e, t, n) { for (var r = n < 0 ? n + t : n; ++r < t;)
                e.push(r); return e; }) } }).pseudos.nth = r.pseudos.eq; for (t in { radio: !0, checkbox: !0, file: !0, password: !0, image: !0 })
        r.pseudos[t] = fe(t); for (t in { submit: !0, reset: !0 })
        r.pseudos[t] = pe(t); function ye() { } ye.prototype = r.filters = r.pseudos, r.setFilters = new ye, a = oe.tokenize = function (e, t) { var n, i, o, a, s, u, l, c = k[e + " "]; if (c)
        return t ? 0 : c.slice(0); s = e, u = [], l = r.preFilter; while (s) {
        n && !(i = F.exec(s)) || (i && (s = s.slice(i[0].length) || s), u.push(o = [])), n = !1, (i = _.exec(s)) && (n = i.shift(), o.push({ value: n, type: i[0].replace(B, " ") }), s = s.slice(n.length));
        for (a in r.filter)
            !(i = V[a].exec(s)) || l[a] && !(i = l[a](i)) || (n = i.shift(), o.push({ value: n, type: a, matches: i }), s = s.slice(n.length));
        if (!n)
            break;
    } return t ? s.length : s ? oe.error(e) : k(e, u).slice(0); }; function ve(e) { for (var t = 0, n = e.length, r = ""; t < n; t++)
        r += e[t].value; return r; } function me(e, t, n) { var r = t.dir, i = t.next, o = i || r, a = n && "parentNode" === o, s = C++; return t.first ? function (t, n, i) { while (t = t[r])
        if (1 === t.nodeType || a)
            return e(t, n, i); return !1; } : function (t, n, u) { var l, c, f, p = [T, s]; if (u) {
        while (t = t[r])
            if ((1 === t.nodeType || a) && e(t, n, u))
                return !0;
    }
    else
        while (t = t[r])
            if (1 === t.nodeType || a)
                if (f = t[b] || (t[b] = {}), c = f[t.uniqueID] || (f[t.uniqueID] = {}), i && i === t.nodeName.toLowerCase())
                    t = t[r] || t;
                else {
                    if ((l = c[o]) && l[0] === T && l[1] === s)
                        return p[2] = l[2];
                    if (c[o] = p, p[2] = e(t, n, u))
                        return !0;
                } return !1; }; } function xe(e) { return e.length > 1 ? function (t, n, r) { var i = e.length; while (i--)
        if (!e[i](t, n, r))
            return !1; return !0; } : e[0]; } function be(e, t, n) { for (var r = 0, i = t.length; r < i; r++)
        oe(e, t[r], n); return n; } function we(e, t, n, r, i) { for (var o, a = [], s = 0, u = e.length, l = null != t; s < u; s++)
        (o = e[s]) && (n && !n(o, r, i) || (a.push(o), l && t.push(s))); return a; } function Te(e, t, n, r, i, o) { return r && !r[b] && (r = Te(r)), i && !i[b] && (i = Te(i, o)), se(function (o, a, s, u) { var l, c, f, p = [], d = [], h = a.length, g = o || be(t || "*", s.nodeType ? [s] : s, []), y = !e || !o && t ? g : we(g, p, e, s, u), v = n ? i || (o ? e : h || r) ? [] : a : y; if (n && n(y, v, s, u), r) {
        l = we(v, d), r(l, [], s, u), c = l.length;
        while (c--)
            (f = l[c]) && (v[d[c]] = !(y[d[c]] = f));
    } if (o) {
        if (i || e) {
            if (i) {
                l = [], c = v.length;
                while (c--)
                    (f = v[c]) && l.push(y[c] = f);
                i(null, v = [], l, u);
            }
            c = v.length;
            while (c--)
                (f = v[c]) && (l = i ? O(o, f) : p[c]) > -1 && (o[l] = !(a[l] = f));
        }
    }
    else
        v = we(v === a ? v.splice(h, v.length) : v), i ? i(null, a, v, u) : L.apply(a, v); }); } function Ce(e) { for (var t, n, i, o = e.length, a = r.relative[e[0].type], s = a || r.relative[" "], u = a ? 1 : 0, c = me(function (e) { return e === t; }, s, !0), f = me(function (e) { return O(t, e) > -1; }, s, !0), p = [function (e, n, r) { var i = !a && (r || n !== l) || ((t = n).nodeType ? c(e, n, r) : f(e, n, r)); return t = null, i; }]; u < o; u++)
        if (n = r.relative[e[u].type])
            p = [me(xe(p), n)];
        else {
            if ((n = r.filter[e[u].type].apply(null, e[u].matches))[b]) {
                for (i = ++u; i < o; i++)
                    if (r.relative[e[i].type])
                        break;
                return Te(u > 1 && xe(p), u > 1 && ve(e.slice(0, u - 1).concat({ value: " " === e[u - 2].type ? "*" : "" })).replace(B, "$1"), n, u < i && Ce(e.slice(u, i)), i < o && Ce(e = e.slice(i)), i < o && ve(e));
            }
            p.push(n);
        } return xe(p); } function Ee(e, t) { var n = t.length > 0, i = e.length > 0, o = function (o, a, s, u, c) { var f, h, y, v = 0, m = "0", x = o && [], b = [], w = l, C = o || i && r.find.TAG("*", c), E = T += null == w ? 1 : Math.random() || .1, k = C.length; for (c && (l = a === d || a || c); m !== k && null != (f = C[m]); m++) {
        if (i && f) {
            h = 0, a || f.ownerDocument === d || (p(f), s = !g);
            while (y = e[h++])
                if (y(f, a || d, s)) {
                    u.push(f);
                    break;
                }
            c && (T = E);
        }
        n && ((f = !y && f) && v--, o && x.push(f));
    } if (v += m, n && m !== v) {
        h = 0;
        while (y = t[h++])
            y(x, b, a, s);
        if (o) {
            if (v > 0)
                while (m--)
                    x[m] || b[m] || (b[m] = j.call(u));
            b = we(b);
        }
        L.apply(u, b), c && !o && b.length > 0 && v + t.length > 1 && oe.uniqueSort(u);
    } return c && (T = E, l = w), x; }; return n ? se(o) : o; } return s = oe.compile = function (e, t) { var n, r = [], i = [], o = S[e + " "]; if (!o) {
        t || (t = a(e)), n = t.length;
        while (n--)
            (o = Ce(t[n]))[b] ? r.push(o) : i.push(o);
        (o = S(e, Ee(i, r))).selector = e;
    } return o; }, u = oe.select = function (e, t, n, i) { var o, u, l, c, f, p = "function" == typeof e && e, d = !i && a(e = p.selector || e); if (n = n || [], 1 === d.length) {
        if ((u = d[0] = d[0].slice(0)).length > 2 && "ID" === (l = u[0]).type && 9 === t.nodeType && g && r.relative[u[1].type]) {
            if (!(t = (r.find.ID(l.matches[0].replace(Z, ee), t) || [])[0]))
                return n;
            p && (t = t.parentNode), e = e.slice(u.shift().value.length);
        }
        o = V.needsContext.test(e) ? 0 : u.length;
        while (o--) {
            if (l = u[o], r.relative[c = l.type])
                break;
            if ((f = r.find[c]) && (i = f(l.matches[0].replace(Z, ee), K.test(u[0].type) && ge(t.parentNode) || t))) {
                if (u.splice(o, 1), !(e = i.length && ve(u)))
                    return L.apply(n, i), n;
                break;
            }
        }
    } return (p || s(e, d))(i, t, !g, n, !t || K.test(e) && ge(t.parentNode) || t), n; }, n.sortStable = b.split("").sort(D).join("") === b, n.detectDuplicates = !!f, p(), n.sortDetached = ue(function (e) { return 1 & e.compareDocumentPosition(d.createElement("fieldset")); }), ue(function (e) { return e.innerHTML = "<a href='#'></a>", "#" === e.firstChild.getAttribute("href"); }) || le("type|href|height|width", function (e, t, n) { if (!n)
        return e.getAttribute(t, "type" === t.toLowerCase() ? 1 : 2); }), n.attributes && ue(function (e) { return e.innerHTML = "<input/>", e.firstChild.setAttribute("value", ""), "" === e.firstChild.getAttribute("value"); }) || le("value", function (e, t, n) { if (!n && "input" === e.nodeName.toLowerCase())
        return e.defaultValue; }), ue(function (e) { return null == e.getAttribute("disabled"); }) || le(P, function (e, t, n) { var r; if (!n)
        return !0 === e[t] ? t.toLowerCase() : (r = e.getAttributeNode(t)) && r.specified ? r.value : null; }), oe; }(e);
    w.find = E, w.expr = E.selectors, w.expr[":"] = w.expr.pseudos, w.uniqueSort = w.unique = E.uniqueSort, w.text = E.getText, w.isXMLDoc = E.isXML, w.contains = E.contains, w.escapeSelector = E.escape;
    var k = function (e, t, n) { var r = [], i = void 0 !== n; while ((e = e[t]) && 9 !== e.nodeType)
        if (1 === e.nodeType) {
            if (i && w(e).is(n))
                break;
            r.push(e);
        } return r; }, S = function (e, t) { for (var n = []; e; e = e.nextSibling)
        1 === e.nodeType && e !== t && n.push(e); return n; }, D = w.expr.match.needsContext;
    function N(e, t) { return e.nodeName && e.nodeName.toLowerCase() === t.toLowerCase(); }
    var A = /^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i;
    function j(e, t, n) { return g(t) ? w.grep(e, function (e, r) { return !!t.call(e, r, e) !== n; }) : t.nodeType ? w.grep(e, function (e) { return e === t !== n; }) : "string" != typeof t ? w.grep(e, function (e) { return u.call(t, e) > -1 !== n; }) : w.filter(t, e, n); }
    w.filter = function (e, t, n) { var r = t[0]; return n && (e = ":not(" + e + ")"), 1 === t.length && 1 === r.nodeType ? w.find.matchesSelector(r, e) ? [r] : [] : w.find.matches(e, w.grep(t, function (e) { return 1 === e.nodeType; })); }, w.fn.extend({ find: function (e) { var t, n, r = this.length, i = this; if ("string" != typeof e)
            return this.pushStack(w(e).filter(function () { for (t = 0; t < r; t++)
                if (w.contains(i[t], this))
                    return !0; })); for (n = this.pushStack([]), t = 0; t < r; t++)
            w.find(e, i[t], n); return r > 1 ? w.uniqueSort(n) : n; }, filter: function (e) { return this.pushStack(j(this, e || [], !1)); }, not: function (e) { return this.pushStack(j(this, e || [], !0)); }, is: function (e) { return !!j(this, "string" == typeof e && D.test(e) ? w(e) : e || [], !1).length; } });
    var q, L = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/;
    (w.fn.init = function (e, t, n) { var i, o; if (!e)
        return this; if (n = n || q, "string" == typeof e) {
        if (!(i = "<" === e[0] && ">" === e[e.length - 1] && e.length >= 3 ? [null, e, null] : L.exec(e)) || !i[1] && t)
            return !t || t.jquery ? (t || n).find(e) : this.constructor(t).find(e);
        if (i[1]) {
            if (t = t instanceof w ? t[0] : t, w.merge(this, w.parseHTML(i[1], t && t.nodeType ? t.ownerDocument || t : r, !0)), A.test(i[1]) && w.isPlainObject(t))
                for (i in t)
                    g(this[i]) ? this[i](t[i]) : this.attr(i, t[i]);
            return this;
        }
        return (o = r.getElementById(i[2])) && (this[0] = o, this.length = 1), this;
    } return e.nodeType ? (this[0] = e, this.length = 1, this) : g(e) ? void 0 !== n.ready ? n.ready(e) : e(w) : w.makeArray(e, this); }).prototype = w.fn, q = w(r);
    var H = /^(?:parents|prev(?:Until|All))/, O = { children: !0, contents: !0, next: !0, prev: !0 };
    w.fn.extend({ has: function (e) { var t = w(e, this), n = t.length; return this.filter(function () { for (var e = 0; e < n; e++)
            if (w.contains(this, t[e]))
                return !0; }); }, closest: function (e, t) { var n, r = 0, i = this.length, o = [], a = "string" != typeof e && w(e); if (!D.test(e))
            for (; r < i; r++)
                for (n = this[r]; n && n !== t; n = n.parentNode)
                    if (n.nodeType < 11 && (a ? a.index(n) > -1 : 1 === n.nodeType && w.find.matchesSelector(n, e))) {
                        o.push(n);
                        break;
                    } return this.pushStack(o.length > 1 ? w.uniqueSort(o) : o); }, index: function (e) { return e ? "string" == typeof e ? u.call(w(e), this[0]) : u.call(this, e.jquery ? e[0] : e) : this[0] && this[0].parentNode ? this.first().prevAll().length : -1; }, add: function (e, t) { return this.pushStack(w.uniqueSort(w.merge(this.get(), w(e, t)))); }, addBack: function (e) { return this.add(null == e ? this.prevObject : this.prevObject.filter(e)); } });
    function P(e, t) { while ((e = e[t]) && 1 !== e.nodeType)
        ; return e; }
    w.each({ parent: function (e) { var t = e.parentNode; return t && 11 !== t.nodeType ? t : null; }, parents: function (e) { return k(e, "parentNode"); }, parentsUntil: function (e, t, n) { return k(e, "parentNode", n); }, next: function (e) { return P(e, "nextSibling"); }, prev: function (e) { return P(e, "previousSibling"); }, nextAll: function (e) { return k(e, "nextSibling"); }, prevAll: function (e) { return k(e, "previousSibling"); }, nextUntil: function (e, t, n) { return k(e, "nextSibling", n); }, prevUntil: function (e, t, n) { return k(e, "previousSibling", n); }, siblings: function (e) { return S((e.parentNode || {}).firstChild, e); }, children: function (e) { return S(e.firstChild); }, contents: function (e) { return N(e, "iframe") ? e.contentDocument : (N(e, "template") && (e = e.content || e), w.merge([], e.childNodes)); } }, function (e, t) { w.fn[e] = function (n, r) { var i = w.map(this, t, n); return "Until" !== e.slice(-5) && (r = n), r && "string" == typeof r && (i = w.filter(r, i)), this.length > 1 && (O[e] || w.uniqueSort(i), H.test(e) && i.reverse()), this.pushStack(i); }; });
    var M = /[^\x20\t\r\n\f]+/g;
    function R(e) { var t = {}; return w.each(e.match(M) || [], function (e, n) { t[n] = !0; }), t; }
    w.Callbacks = function (e) { e = "string" == typeof e ? R(e) : w.extend({}, e); var t, n, r, i, o = [], a = [], s = -1, u = function () { for (i = i || e.once, r = t = !0; a.length; s = -1) {
        n = a.shift();
        while (++s < o.length)
            !1 === o[s].apply(n[0], n[1]) && e.stopOnFalse && (s = o.length, n = !1);
    } e.memory || (n = !1), t = !1, i && (o = n ? [] : ""); }, l = { add: function () { return o && (n && !t && (s = o.length - 1, a.push(n)), function t(n) { w.each(n, function (n, r) { g(r) ? e.unique && l.has(r) || o.push(r) : r && r.length && "string" !== x(r) && t(r); }); }(arguments), n && !t && u()), this; }, remove: function () { return w.each(arguments, function (e, t) { var n; while ((n = w.inArray(t, o, n)) > -1)
            o.splice(n, 1), n <= s && s--; }), this; }, has: function (e) { return e ? w.inArray(e, o) > -1 : o.length > 0; }, empty: function () { return o && (o = []), this; }, disable: function () { return i = a = [], o = n = "", this; }, disabled: function () { return !o; }, lock: function () { return i = a = [], n || t || (o = n = ""), this; }, locked: function () { return !!i; }, fireWith: function (e, n) { return i || (n = [e, (n = n || []).slice ? n.slice() : n], a.push(n), t || u()), this; }, fire: function () { return l.fireWith(this, arguments), this; }, fired: function () { return !!r; } }; return l; };
    function I(e) { return e; }
    function W(e) { throw e; }
    function $(e, t, n, r) { var i; try {
        e && g(i = e.promise) ? i.call(e).done(t).fail(n) : e && g(i = e.then) ? i.call(e, t, n) : t.apply(void 0, [e].slice(r));
    }
    catch (e) {
        n.apply(void 0, [e]);
    } }
    w.extend({ Deferred: function (t) { var n = [["notify", "progress", w.Callbacks("memory"), w.Callbacks("memory"), 2], ["resolve", "done", w.Callbacks("once memory"), w.Callbacks("once memory"), 0, "resolved"], ["reject", "fail", w.Callbacks("once memory"), w.Callbacks("once memory"), 1, "rejected"]], r = "pending", i = { state: function () { return r; }, always: function () { return o.done(arguments).fail(arguments), this; }, "catch": function (e) { return i.then(null, e); }, pipe: function () { var e = arguments; return w.Deferred(function (t) { w.each(n, function (n, r) { var i = g(e[r[4]]) && e[r[4]]; o[r[1]](function () { var e = i && i.apply(this, arguments); e && g(e.promise) ? e.promise().progress(t.notify).done(t.resolve).fail(t.reject) : t[r[0] + "With"](this, i ? [e] : arguments); }); }), e = null; }).promise(); }, then: function (t, r, i) { var o = 0; function a(t, n, r, i) { return function () { var s = this, u = arguments, l = function () { var e, l; if (!(t < o)) {
                if ((e = r.apply(s, u)) === n.promise())
                    throw new TypeError("Thenable self-resolution");
                l = e && ("object" == typeof e || "function" == typeof e) && e.then, g(l) ? i ? l.call(e, a(o, n, I, i), a(o, n, W, i)) : (o++, l.call(e, a(o, n, I, i), a(o, n, W, i), a(o, n, I, n.notifyWith))) : (r !== I && (s = void 0, u = [e]), (i || n.resolveWith)(s, u));
            } }, c = i ? l : function () { try {
                l();
            }
            catch (e) {
                w.Deferred.exceptionHook && w.Deferred.exceptionHook(e, c.stackTrace), t + 1 >= o && (r !== W && (s = void 0, u = [e]), n.rejectWith(s, u));
            } }; t ? c() : (w.Deferred.getStackHook && (c.stackTrace = w.Deferred.getStackHook()), e.setTimeout(c)); }; } return w.Deferred(function (e) { n[0][3].add(a(0, e, g(i) ? i : I, e.notifyWith)), n[1][3].add(a(0, e, g(t) ? t : I)), n[2][3].add(a(0, e, g(r) ? r : W)); }).promise(); }, promise: function (e) { return null != e ? w.extend(e, i) : i; } }, o = {}; return w.each(n, function (e, t) { var a = t[2], s = t[5]; i[t[1]] = a.add, s && a.add(function () { r = s; }, n[3 - e][2].disable, n[3 - e][3].disable, n[0][2].lock, n[0][3].lock), a.add(t[3].fire), o[t[0]] = function () { return o[t[0] + "With"](this === o ? void 0 : this, arguments), this; }, o[t[0] + "With"] = a.fireWith; }), i.promise(o), t && t.call(o, o), o; }, when: function (e) { var t = arguments.length, n = t, r = Array(n), i = o.call(arguments), a = w.Deferred(), s = function (e) { return function (n) { r[e] = this, i[e] = arguments.length > 1 ? o.call(arguments) : n, --t || a.resolveWith(r, i); }; }; if (t <= 1 && ($(e, a.done(s(n)).resolve, a.reject, !t), "pending" === a.state() || g(i[n] && i[n].then)))
            return a.then(); while (n--)
            $(i[n], s(n), a.reject); return a.promise(); } });
    var B = /^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;
    w.Deferred.exceptionHook = function (t, n) { e.console && e.console.warn && t && B.test(t.name) && e.console.warn("jQuery.Deferred exception: " + t.message, t.stack, n); }, w.readyException = function (t) { e.setTimeout(function () { throw t; }); };
    var F = w.Deferred();
    w.fn.ready = function (e) { return F.then(e)["catch"](function (e) { w.readyException(e); }), this; }, w.extend({ isReady: !1, readyWait: 1, ready: function (e) { (!0 === e ? --w.readyWait : w.isReady) || (w.isReady = !0, !0 !== e && --w.readyWait > 0 || F.resolveWith(r, [w])); } }), w.ready.then = F.then;
    function _() { r.removeEventListener("DOMContentLoaded", _), e.removeEventListener("load", _), w.ready(); }
    "complete" === r.readyState || "loading" !== r.readyState && !r.documentElement.doScroll ? e.setTimeout(w.ready) : (r.addEventListener("DOMContentLoaded", _), e.addEventListener("load", _));
    var z = function (e, t, n, r, i, o, a) { var s = 0, u = e.length, l = null == n; if ("object" === x(n)) {
        i = !0;
        for (s in n)
            z(e, t, s, n[s], !0, o, a);
    }
    else if (void 0 !== r && (i = !0, g(r) || (a = !0), l && (a ? (t.call(e, r), t = null) : (l = t, t = function (e, t, n) { return l.call(w(e), n); })), t))
        for (; s < u; s++)
            t(e[s], n, a ? r : r.call(e[s], s, t(e[s], n))); return i ? e : l ? t.call(e) : u ? t(e[0], n) : o; }, X = /^-ms-/, U = /-([a-z])/g;
    function V(e, t) { return t.toUpperCase(); }
    function G(e) { return e.replace(X, "ms-").replace(U, V); }
    var Y = function (e) { return 1 === e.nodeType || 9 === e.nodeType || !+e.nodeType; };
    function Q() { this.expando = w.expando + Q.uid++; }
    Q.uid = 1, Q.prototype = { cache: function (e) { var t = e[this.expando]; return t || (t = {}, Y(e) && (e.nodeType ? e[this.expando] = t : Object.defineProperty(e, this.expando, { value: t, configurable: !0 }))), t; }, set: function (e, t, n) { var r, i = this.cache(e); if ("string" == typeof t)
            i[G(t)] = n;
        else
            for (r in t)
                i[G(r)] = t[r]; return i; }, get: function (e, t) { return void 0 === t ? this.cache(e) : e[this.expando] && e[this.expando][G(t)]; }, access: function (e, t, n) { return void 0 === t || t && "string" == typeof t && void 0 === n ? this.get(e, t) : (this.set(e, t, n), void 0 !== n ? n : t); }, remove: function (e, t) { var n, r = e[this.expando]; if (void 0 !== r) {
            if (void 0 !== t) {
                n = (t = Array.isArray(t) ? t.map(G) : (t = G(t)) in r ? [t] : t.match(M) || []).length;
                while (n--)
                    delete r[t[n]];
            }
            (void 0 === t || w.isEmptyObject(r)) && (e.nodeType ? e[this.expando] = void 0 : delete e[this.expando]);
        } }, hasData: function (e) { var t = e[this.expando]; return void 0 !== t && !w.isEmptyObject(t); } };
    var J = new Q, K = new Q, Z = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/, ee = /[A-Z]/g;
    function te(e) { return "true" === e || "false" !== e && ("null" === e ? null : e === +e + "" ? +e : Z.test(e) ? JSON.parse(e) : e); }
    function ne(e, t, n) { var r; if (void 0 === n && 1 === e.nodeType)
        if (r = "data-" + t.replace(ee, "-$&").toLowerCase(), "string" == typeof (n = e.getAttribute(r))) {
            try {
                n = te(n);
            }
            catch (e) { }
            K.set(e, t, n);
        }
        else
            n = void 0; return n; }
    w.extend({ hasData: function (e) { return K.hasData(e) || J.hasData(e); }, data: function (e, t, n) { return K.access(e, t, n); }, removeData: function (e, t) { K.remove(e, t); }, _data: function (e, t, n) { return J.access(e, t, n); }, _removeData: function (e, t) { J.remove(e, t); } }), w.fn.extend({ data: function (e, t) { var n, r, i, o = this[0], a = o && o.attributes; if (void 0 === e) {
            if (this.length && (i = K.get(o), 1 === o.nodeType && !J.get(o, "hasDataAttrs"))) {
                n = a.length;
                while (n--)
                    a[n] && 0 === (r = a[n].name).indexOf("data-") && (r = G(r.slice(5)), ne(o, r, i[r]));
                J.set(o, "hasDataAttrs", !0);
            }
            return i;
        } return "object" == typeof e ? this.each(function () { K.set(this, e); }) : z(this, function (t) { var n; if (o && void 0 === t) {
            if (void 0 !== (n = K.get(o, e)))
                return n;
            if (void 0 !== (n = ne(o, e)))
                return n;
        }
        else
            this.each(function () { K.set(this, e, t); }); }, null, t, arguments.length > 1, null, !0); }, removeData: function (e) { return this.each(function () { K.remove(this, e); }); } }), w.extend({ queue: function (e, t, n) { var r; if (e)
            return t = (t || "fx") + "queue", r = J.get(e, t), n && (!r || Array.isArray(n) ? r = J.access(e, t, w.makeArray(n)) : r.push(n)), r || []; }, dequeue: function (e, t) { t = t || "fx"; var n = w.queue(e, t), r = n.length, i = n.shift(), o = w._queueHooks(e, t), a = function () { w.dequeue(e, t); }; "inprogress" === i && (i = n.shift(), r--), i && ("fx" === t && n.unshift("inprogress"), delete o.stop, i.call(e, a, o)), !r && o && o.empty.fire(); }, _queueHooks: function (e, t) { var n = t + "queueHooks"; return J.get(e, n) || J.access(e, n, { empty: w.Callbacks("once memory").add(function () { J.remove(e, [t + "queue", n]); }) }); } }), w.fn.extend({ queue: function (e, t) { var n = 2; return "string" != typeof e && (t = e, e = "fx", n--), arguments.length < n ? w.queue(this[0], e) : void 0 === t ? this : this.each(function () { var n = w.queue(this, e, t); w._queueHooks(this, e), "fx" === e && "inprogress" !== n[0] && w.dequeue(this, e); }); }, dequeue: function (e) { return this.each(function () { w.dequeue(this, e); }); }, clearQueue: function (e) { return this.queue(e || "fx", []); }, promise: function (e, t) { var n, r = 1, i = w.Deferred(), o = this, a = this.length, s = function () { --r || i.resolveWith(o, [o]); }; "string" != typeof e && (t = e, e = void 0), e = e || "fx"; while (a--)
            (n = J.get(o[a], e + "queueHooks")) && n.empty && (r++, n.empty.add(s)); return s(), i.promise(t); } });
    var re = /[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source, ie = new RegExp("^(?:([+-])=|)(" + re + ")([a-z%]*)$", "i"), oe = ["Top", "Right", "Bottom", "Left"], ae = function (e, t) { return "none" === (e = t || e).style.display || "" === e.style.display && w.contains(e.ownerDocument, e) && "none" === w.css(e, "display"); }, se = function (e, t, n, r) { var i, o, a = {}; for (o in t)
        a[o] = e.style[o], e.style[o] = t[o]; i = n.apply(e, r || []); for (o in t)
        e.style[o] = a[o]; return i; };
    function ue(e, t, n, r) { var i, o, a = 20, s = r ? function () { return r.cur(); } : function () { return w.css(e, t, ""); }, u = s(), l = n && n[3] || (w.cssNumber[t] ? "" : "px"), c = (w.cssNumber[t] || "px" !== l && +u) && ie.exec(w.css(e, t)); if (c && c[3] !== l) {
        u /= 2, l = l || c[3], c = +u || 1;
        while (a--)
            w.style(e, t, c + l), (1 - o) * (1 - (o = s() / u || .5)) <= 0 && (a = 0), c /= o;
        c *= 2, w.style(e, t, c + l), n = n || [];
    } return n && (c = +c || +u || 0, i = n[1] ? c + (n[1] + 1) * n[2] : +n[2], r && (r.unit = l, r.start = c, r.end = i)), i; }
    var le = {};
    function ce(e) { var t, n = e.ownerDocument, r = e.nodeName, i = le[r]; return i || (t = n.body.appendChild(n.createElement(r)), i = w.css(t, "display"), t.parentNode.removeChild(t), "none" === i && (i = "block"), le[r] = i, i); }
    function fe(e, t) { for (var n, r, i = [], o = 0, a = e.length; o < a; o++)
        (r = e[o]).style && (n = r.style.display, t ? ("none" === n && (i[o] = J.get(r, "display") || null, i[o] || (r.style.display = "")), "" === r.style.display && ae(r) && (i[o] = ce(r))) : "none" !== n && (i[o] = "none", J.set(r, "display", n))); for (o = 0; o < a; o++)
        null != i[o] && (e[o].style.display = i[o]); return e; }
    w.fn.extend({ show: function () { return fe(this, !0); }, hide: function () { return fe(this); }, toggle: function (e) { return "boolean" == typeof e ? e ? this.show() : this.hide() : this.each(function () { ae(this) ? w(this).show() : w(this).hide(); }); } });
    var pe = /^(?:checkbox|radio)$/i, de = /<([a-z][^\/\0>\x20\t\r\n\f]+)/i, he = /^$|^module$|\/(?:java|ecma)script/i, ge = { option: [1, "<select multiple='multiple'>", "</select>"], thead: [1, "<table>", "</table>"], col: [2, "<table><colgroup>", "</colgroup></table>"], tr: [2, "<table><tbody>", "</tbody></table>"], td: [3, "<table><tbody><tr>", "</tr></tbody></table>"], _default: [0, "", ""] };
    ge.optgroup = ge.option, ge.tbody = ge.tfoot = ge.colgroup = ge.caption = ge.thead, ge.th = ge.td;
    function ye(e, t) { var n; return n = "undefined" != typeof e.getElementsByTagName ? e.getElementsByTagName(t || "*") : "undefined" != typeof e.querySelectorAll ? e.querySelectorAll(t || "*") : [], void 0 === t || t && N(e, t) ? w.merge([e], n) : n; }
    function ve(e, t) { for (var n = 0, r = e.length; n < r; n++)
        J.set(e[n], "globalEval", !t || J.get(t[n], "globalEval")); }
    var me = /<|&#?\w+;/;
    function xe(e, t, n, r, i) { for (var o, a, s, u, l, c, f = t.createDocumentFragment(), p = [], d = 0, h = e.length; d < h; d++)
        if ((o = e[d]) || 0 === o)
            if ("object" === x(o))
                w.merge(p, o.nodeType ? [o] : o);
            else if (me.test(o)) {
                a = a || f.appendChild(t.createElement("div")), s = (de.exec(o) || ["", ""])[1].toLowerCase(), u = ge[s] || ge._default, a.innerHTML = u[1] + w.htmlPrefilter(o) + u[2], c = u[0];
                while (c--)
                    a = a.lastChild;
                w.merge(p, a.childNodes), (a = f.firstChild).textContent = "";
            }
            else
                p.push(t.createTextNode(o)); f.textContent = "", d = 0; while (o = p[d++])
        if (r && w.inArray(o, r) > -1)
            i && i.push(o);
        else if (l = w.contains(o.ownerDocument, o), a = ye(f.appendChild(o), "script"), l && ve(a), n) {
            c = 0;
            while (o = a[c++])
                he.test(o.type || "") && n.push(o);
        } return f; }
    !function () { var e = r.createDocumentFragment().appendChild(r.createElement("div")), t = r.createElement("input"); t.setAttribute("type", "radio"), t.setAttribute("checked", "checked"), t.setAttribute("name", "t"), e.appendChild(t), h.checkClone = e.cloneNode(!0).cloneNode(!0).lastChild.checked, e.innerHTML = "<textarea>x</textarea>", h.noCloneChecked = !!e.cloneNode(!0).lastChild.defaultValue; }();
    var be = r.documentElement, we = /^key/, Te = /^(?:mouse|pointer|contextmenu|drag|drop)|click/, Ce = /^([^.]*)(?:\.(.+)|)/;
    function Ee() { return !0; }
    function ke() { return !1; }
    function Se() { try {
        return r.activeElement;
    }
    catch (e) { } }
    function De(e, t, n, r, i, o) { var a, s; if ("object" == typeof t) {
        "string" != typeof n && (r = r || n, n = void 0);
        for (s in t)
            De(e, s, n, r, t[s], o);
        return e;
    } if (null == r && null == i ? (i = n, r = n = void 0) : null == i && ("string" == typeof n ? (i = r, r = void 0) : (i = r, r = n, n = void 0)), !1 === i)
        i = ke;
    else if (!i)
        return e; return 1 === o && (a = i, (i = function (e) { return w().off(e), a.apply(this, arguments); }).guid = a.guid || (a.guid = w.guid++)), e.each(function () { w.event.add(this, t, i, r, n); }); }
    w.event = { global: {}, add: function (e, t, n, r, i) { var o, a, s, u, l, c, f, p, d, h, g, y = J.get(e); if (y) {
            n.handler && (n = (o = n).handler, i = o.selector), i && w.find.matchesSelector(be, i), n.guid || (n.guid = w.guid++), (u = y.events) || (u = y.events = {}), (a = y.handle) || (a = y.handle = function (t) { return "undefined" != typeof w && w.event.triggered !== t.type ? w.event.dispatch.apply(e, arguments) : void 0; }), l = (t = (t || "").match(M) || [""]).length;
            while (l--)
                d = g = (s = Ce.exec(t[l]) || [])[1], h = (s[2] || "").split(".").sort(), d && (f = w.event.special[d] || {}, d = (i ? f.delegateType : f.bindType) || d, f = w.event.special[d] || {}, c = w.extend({ type: d, origType: g, data: r, handler: n, guid: n.guid, selector: i, needsContext: i && w.expr.match.needsContext.test(i), namespace: h.join(".") }, o), (p = u[d]) || ((p = u[d] = []).delegateCount = 0, f.setup && !1 !== f.setup.call(e, r, h, a) || e.addEventListener && e.addEventListener(d, a)), f.add && (f.add.call(e, c), c.handler.guid || (c.handler.guid = n.guid)), i ? p.splice(p.delegateCount++, 0, c) : p.push(c), w.event.global[d] = !0);
        } }, remove: function (e, t, n, r, i) { var o, a, s, u, l, c, f, p, d, h, g, y = J.hasData(e) && J.get(e); if (y && (u = y.events)) {
            l = (t = (t || "").match(M) || [""]).length;
            while (l--)
                if (s = Ce.exec(t[l]) || [], d = g = s[1], h = (s[2] || "").split(".").sort(), d) {
                    f = w.event.special[d] || {}, p = u[d = (r ? f.delegateType : f.bindType) || d] || [], s = s[2] && new RegExp("(^|\\.)" + h.join("\\.(?:.*\\.|)") + "(\\.|$)"), a = o = p.length;
                    while (o--)
                        c = p[o], !i && g !== c.origType || n && n.guid !== c.guid || s && !s.test(c.namespace) || r && r !== c.selector && ("**" !== r || !c.selector) || (p.splice(o, 1), c.selector && p.delegateCount--, f.remove && f.remove.call(e, c));
                    a && !p.length && (f.teardown && !1 !== f.teardown.call(e, h, y.handle) || w.removeEvent(e, d, y.handle), delete u[d]);
                }
                else
                    for (d in u)
                        w.event.remove(e, d + t[l], n, r, !0);
            w.isEmptyObject(u) && J.remove(e, "handle events");
        } }, dispatch: function (e) { var t = w.event.fix(e), n, r, i, o, a, s, u = new Array(arguments.length), l = (J.get(this, "events") || {})[t.type] || [], c = w.event.special[t.type] || {}; for (u[0] = t, n = 1; n < arguments.length; n++)
            u[n] = arguments[n]; if (t.delegateTarget = this, !c.preDispatch || !1 !== c.preDispatch.call(this, t)) {
            s = w.event.handlers.call(this, t, l), n = 0;
            while ((o = s[n++]) && !t.isPropagationStopped()) {
                t.currentTarget = o.elem, r = 0;
                while ((a = o.handlers[r++]) && !t.isImmediatePropagationStopped())
                    t.rnamespace && !t.rnamespace.test(a.namespace) || (t.handleObj = a, t.data = a.data, void 0 !== (i = ((w.event.special[a.origType] || {}).handle || a.handler).apply(o.elem, u)) && !1 === (t.result = i) && (t.preventDefault(), t.stopPropagation()));
            }
            return c.postDispatch && c.postDispatch.call(this, t), t.result;
        } }, handlers: function (e, t) { var n, r, i, o, a, s = [], u = t.delegateCount, l = e.target; if (u && l.nodeType && !("click" === e.type && e.button >= 1))
            for (; l !== this; l = l.parentNode || this)
                if (1 === l.nodeType && ("click" !== e.type || !0 !== l.disabled)) {
                    for (o = [], a = {}, n = 0; n < u; n++)
                        void 0 === a[i = (r = t[n]).selector + " "] && (a[i] = r.needsContext ? w(i, this).index(l) > -1 : w.find(i, this, null, [l]).length), a[i] && o.push(r);
                    o.length && s.push({ elem: l, handlers: o });
                } return l = this, u < t.length && s.push({ elem: l, handlers: t.slice(u) }), s; }, addProp: function (e, t) { Object.defineProperty(w.Event.prototype, e, { enumerable: !0, configurable: !0, get: g(t) ? function () { if (this.originalEvent)
                return t(this.originalEvent); } : function () { if (this.originalEvent)
                return this.originalEvent[e]; }, set: function (t) { Object.defineProperty(this, e, { enumerable: !0, configurable: !0, writable: !0, value: t }); } }); }, fix: function (e) { return e[w.expando] ? e : new w.Event(e); }, special: { load: { noBubble: !0 }, focus: { trigger: function () { if (this !== Se() && this.focus)
                    return this.focus(), !1; }, delegateType: "focusin" }, blur: { trigger: function () { if (this === Se() && this.blur)
                    return this.blur(), !1; }, delegateType: "focusout" }, click: { trigger: function () { if ("checkbox" === this.type && this.click && N(this, "input"))
                    return this.click(), !1; }, _default: function (e) { return N(e.target, "a"); } }, beforeunload: { postDispatch: function (e) { void 0 !== e.result && e.originalEvent && (e.originalEvent.returnValue = e.result); } } } }, w.removeEvent = function (e, t, n) { e.removeEventListener && e.removeEventListener(t, n); }, w.Event = function (e, t) { if (!(this instanceof w.Event))
        return new w.Event(e, t); e && e.type ? (this.originalEvent = e, this.type = e.type, this.isDefaultPrevented = e.defaultPrevented || void 0 === e.defaultPrevented && !1 === e.returnValue ? Ee : ke, this.target = e.target && 3 === e.target.nodeType ? e.target.parentNode : e.target, this.currentTarget = e.currentTarget, this.relatedTarget = e.relatedTarget) : this.type = e, t && w.extend(this, t), this.timeStamp = e && e.timeStamp || Date.now(), this[w.expando] = !0; }, w.Event.prototype = { constructor: w.Event, isDefaultPrevented: ke, isPropagationStopped: ke, isImmediatePropagationStopped: ke, isSimulated: !1, preventDefault: function () { var e = this.originalEvent; this.isDefaultPrevented = Ee, e && !this.isSimulated && e.preventDefault(); }, stopPropagation: function () { var e = this.originalEvent; this.isPropagationStopped = Ee, e && !this.isSimulated && e.stopPropagation(); }, stopImmediatePropagation: function () { var e = this.originalEvent; this.isImmediatePropagationStopped = Ee, e && !this.isSimulated && e.stopImmediatePropagation(), this.stopPropagation(); } }, w.each({ altKey: !0, bubbles: !0, cancelable: !0, changedTouches: !0, ctrlKey: !0, detail: !0, eventPhase: !0, metaKey: !0, pageX: !0, pageY: !0, shiftKey: !0, view: !0, "char": !0, charCode: !0, key: !0, keyCode: !0, button: !0, buttons: !0, clientX: !0, clientY: !0, offsetX: !0, offsetY: !0, pointerId: !0, pointerType: !0, screenX: !0, screenY: !0, targetTouches: !0, toElement: !0, touches: !0, which: function (e) { var t = e.button; return null == e.which && we.test(e.type) ? null != e.charCode ? e.charCode : e.keyCode : !e.which && void 0 !== t && Te.test(e.type) ? 1 & t ? 1 : 2 & t ? 3 : 4 & t ? 2 : 0 : e.which; } }, w.event.addProp), w.each({ mouseenter: "mouseover", mouseleave: "mouseout", pointerenter: "pointerover", pointerleave: "pointerout" }, function (e, t) { w.event.special[e] = { delegateType: t, bindType: t, handle: function (e) { var n, r = this, i = e.relatedTarget, o = e.handleObj; return i && (i === r || w.contains(r, i)) || (e.type = o.origType, n = o.handler.apply(this, arguments), e.type = t), n; } }; }), w.fn.extend({ on: function (e, t, n, r) { return De(this, e, t, n, r); }, one: function (e, t, n, r) { return De(this, e, t, n, r, 1); }, off: function (e, t, n) { var r, i; if (e && e.preventDefault && e.handleObj)
            return r = e.handleObj, w(e.delegateTarget).off(r.namespace ? r.origType + "." + r.namespace : r.origType, r.selector, r.handler), this; if ("object" == typeof e) {
            for (i in e)
                this.off(i, t, e[i]);
            return this;
        } return !1 !== t && "function" != typeof t || (n = t, t = void 0), !1 === n && (n = ke), this.each(function () { w.event.remove(this, e, n, t); }); } });
    var Ne = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([a-z][^\/\0>\x20\t\r\n\f]*)[^>]*)\/>/gi, Ae = /<script|<style|<link/i, je = /checked\s*(?:[^=]|=\s*.checked.)/i, qe = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g;
    function Le(e, t) { return N(e, "table") && N(11 !== t.nodeType ? t : t.firstChild, "tr") ? w(e).children("tbody")[0] || e : e; }
    function He(e) { return e.type = (null !== e.getAttribute("type")) + "/" + e.type, e; }
    function Oe(e) { return "true/" === (e.type || "").slice(0, 5) ? e.type = e.type.slice(5) : e.removeAttribute("type"), e; }
    function Pe(e, t) { var n, r, i, o, a, s, u, l; if (1 === t.nodeType) {
        if (J.hasData(e) && (o = J.access(e), a = J.set(t, o), l = o.events)) {
            delete a.handle, a.events = {};
            for (i in l)
                for (n = 0, r = l[i].length; n < r; n++)
                    w.event.add(t, i, l[i][n]);
        }
        K.hasData(e) && (s = K.access(e), u = w.extend({}, s), K.set(t, u));
    } }
    function Me(e, t) { var n = t.nodeName.toLowerCase(); "input" === n && pe.test(e.type) ? t.checked = e.checked : "input" !== n && "textarea" !== n || (t.defaultValue = e.defaultValue); }
    function Re(e, t, n, r) { t = a.apply([], t); var i, o, s, u, l, c, f = 0, p = e.length, d = p - 1, y = t[0], v = g(y); if (v || p > 1 && "string" == typeof y && !h.checkClone && je.test(y))
        return e.each(function (i) { var o = e.eq(i); v && (t[0] = y.call(this, i, o.html())), Re(o, t, n, r); }); if (p && (i = xe(t, e[0].ownerDocument, !1, e, r), o = i.firstChild, 1 === i.childNodes.length && (i = o), o || r)) {
        for (u = (s = w.map(ye(i, "script"), He)).length; f < p; f++)
            l = i, f !== d && (l = w.clone(l, !0, !0), u && w.merge(s, ye(l, "script"))), n.call(e[f], l, f);
        if (u)
            for (c = s[s.length - 1].ownerDocument, w.map(s, Oe), f = 0; f < u; f++)
                l = s[f], he.test(l.type || "") && !J.access(l, "globalEval") && w.contains(c, l) && (l.src && "module" !== (l.type || "").toLowerCase() ? w._evalUrl && w._evalUrl(l.src) : m(l.textContent.replace(qe, ""), c, l));
    } return e; }
    function Ie(e, t, n) { for (var r, i = t ? w.filter(t, e) : e, o = 0; null != (r = i[o]); o++)
        n || 1 !== r.nodeType || w.cleanData(ye(r)), r.parentNode && (n && w.contains(r.ownerDocument, r) && ve(ye(r, "script")), r.parentNode.removeChild(r)); return e; }
    w.extend({ htmlPrefilter: function (e) { return e.replace(Ne, "<$1></$2>"); }, clone: function (e, t, n) { var r, i, o, a, s = e.cloneNode(!0), u = w.contains(e.ownerDocument, e); if (!(h.noCloneChecked || 1 !== e.nodeType && 11 !== e.nodeType || w.isXMLDoc(e)))
            for (a = ye(s), r = 0, i = (o = ye(e)).length; r < i; r++)
                Me(o[r], a[r]); if (t)
            if (n)
                for (o = o || ye(e), a = a || ye(s), r = 0, i = o.length; r < i; r++)
                    Pe(o[r], a[r]);
            else
                Pe(e, s); return (a = ye(s, "script")).length > 0 && ve(a, !u && ye(e, "script")), s; }, cleanData: function (e) { for (var t, n, r, i = w.event.special, o = 0; void 0 !== (n = e[o]); o++)
            if (Y(n)) {
                if (t = n[J.expando]) {
                    if (t.events)
                        for (r in t.events)
                            i[r] ? w.event.remove(n, r) : w.removeEvent(n, r, t.handle);
                    n[J.expando] = void 0;
                }
                n[K.expando] && (n[K.expando] = void 0);
            } } }), w.fn.extend({ detach: function (e) { return Ie(this, e, !0); }, remove: function (e) { return Ie(this, e); }, text: function (e) { return z(this, function (e) { return void 0 === e ? w.text(this) : this.empty().each(function () { 1 !== this.nodeType && 11 !== this.nodeType && 9 !== this.nodeType || (this.textContent = e); }); }, null, e, arguments.length); }, append: function () { return Re(this, arguments, function (e) { 1 !== this.nodeType && 11 !== this.nodeType && 9 !== this.nodeType || Le(this, e).appendChild(e); }); }, prepend: function () { return Re(this, arguments, function (e) { if (1 === this.nodeType || 11 === this.nodeType || 9 === this.nodeType) {
            var t = Le(this, e);
            t.insertBefore(e, t.firstChild);
        } }); }, before: function () { return Re(this, arguments, function (e) { this.parentNode && this.parentNode.insertBefore(e, this); }); }, after: function () { return Re(this, arguments, function (e) { this.parentNode && this.parentNode.insertBefore(e, this.nextSibling); }); }, empty: function () { for (var e, t = 0; null != (e = this[t]); t++)
            1 === e.nodeType && (w.cleanData(ye(e, !1)), e.textContent = ""); return this; }, clone: function (e, t) { return e = null != e && e, t = null == t ? e : t, this.map(function () { return w.clone(this, e, t); }); }, html: function (e) { return z(this, function (e) { var t = this[0] || {}, n = 0, r = this.length; if (void 0 === e && 1 === t.nodeType)
            return t.innerHTML; if ("string" == typeof e && !Ae.test(e) && !ge[(de.exec(e) || ["", ""])[1].toLowerCase()]) {
            e = w.htmlPrefilter(e);
            try {
                for (; n < r; n++)
                    1 === (t = this[n] || {}).nodeType && (w.cleanData(ye(t, !1)), t.innerHTML = e);
                t = 0;
            }
            catch (e) { }
        } t && this.empty().append(e); }, null, e, arguments.length); }, replaceWith: function () { var e = []; return Re(this, arguments, function (t) { var n = this.parentNode; w.inArray(this, e) < 0 && (w.cleanData(ye(this)), n && n.replaceChild(t, this)); }, e); } }), w.each({ appendTo: "append", prependTo: "prepend", insertBefore: "before", insertAfter: "after", replaceAll: "replaceWith" }, function (e, t) { w.fn[e] = function (e) { for (var n, r = [], i = w(e), o = i.length - 1, a = 0; a <= o; a++)
        n = a === o ? this : this.clone(!0), w(i[a])[t](n), s.apply(r, n.get()); return this.pushStack(r); }; });
    var We = new RegExp("^(" + re + ")(?!px)[a-z%]+$", "i"), $e = function (t) { var n = t.ownerDocument.defaultView; return n && n.opener || (n = e), n.getComputedStyle(t); }, Be = new RegExp(oe.join("|"), "i");
    !function () { function t() { if (c) {
        l.style.cssText = "position:absolute;left:-11111px;width:60px;margin-top:1px;padding:0;border:0", c.style.cssText = "position:relative;display:block;box-sizing:border-box;overflow:scroll;margin:auto;border:1px;padding:1px;width:60%;top:1%", be.appendChild(l).appendChild(c);
        var t = e.getComputedStyle(c);
        i = "1%" !== t.top, u = 12 === n(t.marginLeft), c.style.right = "60%", s = 36 === n(t.right), o = 36 === n(t.width), c.style.position = "absolute", a = 36 === c.offsetWidth || "absolute", be.removeChild(l), c = null;
    } } function n(e) { return Math.round(parseFloat(e)); } var i, o, a, s, u, l = r.createElement("div"), c = r.createElement("div"); c.style && (c.style.backgroundClip = "content-box", c.cloneNode(!0).style.backgroundClip = "", h.clearCloneStyle = "content-box" === c.style.backgroundClip, w.extend(h, { boxSizingReliable: function () { return t(), o; }, pixelBoxStyles: function () { return t(), s; }, pixelPosition: function () { return t(), i; }, reliableMarginLeft: function () { return t(), u; }, scrollboxSize: function () { return t(), a; } })); }();
    function Fe(e, t, n) { var r, i, o, a, s = e.style; return (n = n || $e(e)) && ("" !== (a = n.getPropertyValue(t) || n[t]) || w.contains(e.ownerDocument, e) || (a = w.style(e, t)), !h.pixelBoxStyles() && We.test(a) && Be.test(t) && (r = s.width, i = s.minWidth, o = s.maxWidth, s.minWidth = s.maxWidth = s.width = a, a = n.width, s.width = r, s.minWidth = i, s.maxWidth = o)), void 0 !== a ? a + "" : a; }
    function _e(e, t) { return { get: function () { if (!e())
            return (this.get = t).apply(this, arguments); delete this.get; } }; }
    var ze = /^(none|table(?!-c[ea]).+)/, Xe = /^--/, Ue = { position: "absolute", visibility: "hidden", display: "block" }, Ve = { letterSpacing: "0", fontWeight: "400" }, Ge = ["Webkit", "Moz", "ms"], Ye = r.createElement("div").style;
    function Qe(e) { if (e in Ye)
        return e; var t = e[0].toUpperCase() + e.slice(1), n = Ge.length; while (n--)
        if ((e = Ge[n] + t) in Ye)
            return e; }
    function Je(e) { var t = w.cssProps[e]; return t || (t = w.cssProps[e] = Qe(e) || e), t; }
    function Ke(e, t, n) { var r = ie.exec(t); return r ? Math.max(0, r[2] - (n || 0)) + (r[3] || "px") : t; }
    function Ze(e, t, n, r, i, o) { var a = "width" === t ? 1 : 0, s = 0, u = 0; if (n === (r ? "border" : "content"))
        return 0; for (; a < 4; a += 2)
        "margin" === n && (u += w.css(e, n + oe[a], !0, i)), r ? ("content" === n && (u -= w.css(e, "padding" + oe[a], !0, i)), "margin" !== n && (u -= w.css(e, "border" + oe[a] + "Width", !0, i))) : (u += w.css(e, "padding" + oe[a], !0, i), "padding" !== n ? u += w.css(e, "border" + oe[a] + "Width", !0, i) : s += w.css(e, "border" + oe[a] + "Width", !0, i)); return !r && o >= 0 && (u += Math.max(0, Math.ceil(e["offset" + t[0].toUpperCase() + t.slice(1)] - o - u - s - .5))), u; }
    function et(e, t, n) { var r = $e(e), i = Fe(e, t, r), o = "border-box" === w.css(e, "boxSizing", !1, r), a = o; if (We.test(i)) {
        if (!n)
            return i;
        i = "auto";
    } return a = a && (h.boxSizingReliable() || i === e.style[t]), ("auto" === i || !parseFloat(i) && "inline" === w.css(e, "display", !1, r)) && (i = e["offset" + t[0].toUpperCase() + t.slice(1)], a = !0), (i = parseFloat(i) || 0) + Ze(e, t, n || (o ? "border" : "content"), a, r, i) + "px"; }
    w.extend({ cssHooks: { opacity: { get: function (e, t) { if (t) {
                    var n = Fe(e, "opacity");
                    return "" === n ? "1" : n;
                } } } }, cssNumber: { animationIterationCount: !0, columnCount: !0, fillOpacity: !0, flexGrow: !0, flexShrink: !0, fontWeight: !0, lineHeight: !0, opacity: !0, order: !0, orphans: !0, widows: !0, zIndex: !0, zoom: !0 }, cssProps: {}, style: function (e, t, n, r) { if (e && 3 !== e.nodeType && 8 !== e.nodeType && e.style) {
            var i, o, a, s = G(t), u = Xe.test(t), l = e.style;
            if (u || (t = Je(s)), a = w.cssHooks[t] || w.cssHooks[s], void 0 === n)
                return a && "get" in a && void 0 !== (i = a.get(e, !1, r)) ? i : l[t];
            "string" == (o = typeof n) && (i = ie.exec(n)) && i[1] && (n = ue(e, t, i), o = "number"), null != n && n === n && ("number" === o && (n += i && i[3] || (w.cssNumber[s] ? "" : "px")), h.clearCloneStyle || "" !== n || 0 !== t.indexOf("background") || (l[t] = "inherit"), a && "set" in a && void 0 === (n = a.set(e, n, r)) || (u ? l.setProperty(t, n) : l[t] = n));
        } }, css: function (e, t, n, r) { var i, o, a, s = G(t); return Xe.test(t) || (t = Je(s)), (a = w.cssHooks[t] || w.cssHooks[s]) && "get" in a && (i = a.get(e, !0, n)), void 0 === i && (i = Fe(e, t, r)), "normal" === i && t in Ve && (i = Ve[t]), "" === n || n ? (o = parseFloat(i), !0 === n || isFinite(o) ? o || 0 : i) : i; } }), w.each(["height", "width"], function (e, t) { w.cssHooks[t] = { get: function (e, n, r) { if (n)
            return !ze.test(w.css(e, "display")) || e.getClientRects().length && e.getBoundingClientRect().width ? et(e, t, r) : se(e, Ue, function () { return et(e, t, r); }); }, set: function (e, n, r) { var i, o = $e(e), a = "border-box" === w.css(e, "boxSizing", !1, o), s = r && Ze(e, t, r, a, o); return a && h.scrollboxSize() === o.position && (s -= Math.ceil(e["offset" + t[0].toUpperCase() + t.slice(1)] - parseFloat(o[t]) - Ze(e, t, "border", !1, o) - .5)), s && (i = ie.exec(n)) && "px" !== (i[3] || "px") && (e.style[t] = n, n = w.css(e, t)), Ke(e, n, s); } }; }), w.cssHooks.marginLeft = _e(h.reliableMarginLeft, function (e, t) { if (t)
        return (parseFloat(Fe(e, "marginLeft")) || e.getBoundingClientRect().left - se(e, { marginLeft: 0 }, function () { return e.getBoundingClientRect().left; })) + "px"; }), w.each({ margin: "", padding: "", border: "Width" }, function (e, t) { w.cssHooks[e + t] = { expand: function (n) { for (var r = 0, i = {}, o = "string" == typeof n ? n.split(" ") : [n]; r < 4; r++)
            i[e + oe[r] + t] = o[r] || o[r - 2] || o[0]; return i; } }, "margin" !== e && (w.cssHooks[e + t].set = Ke); }), w.fn.extend({ css: function (e, t) { return z(this, function (e, t, n) { var r, i, o = {}, a = 0; if (Array.isArray(t)) {
            for (r = $e(e), i = t.length; a < i; a++)
                o[t[a]] = w.css(e, t[a], !1, r);
            return o;
        } return void 0 !== n ? w.style(e, t, n) : w.css(e, t); }, e, t, arguments.length > 1); } });
    function tt(e, t, n, r, i) { return new tt.prototype.init(e, t, n, r, i); }
    w.Tween = tt, tt.prototype = { constructor: tt, init: function (e, t, n, r, i, o) { this.elem = e, this.prop = n, this.easing = i || w.easing._default, this.options = t, this.start = this.now = this.cur(), this.end = r, this.unit = o || (w.cssNumber[n] ? "" : "px"); }, cur: function () { var e = tt.propHooks[this.prop]; return e && e.get ? e.get(this) : tt.propHooks._default.get(this); }, run: function (e) { var t, n = tt.propHooks[this.prop]; return this.options.duration ? this.pos = t = w.easing[this.easing](e, this.options.duration * e, 0, 1, this.options.duration) : this.pos = t = e, this.now = (this.end - this.start) * t + this.start, this.options.step && this.options.step.call(this.elem, this.now, this), n && n.set ? n.set(this) : tt.propHooks._default.set(this), this; } }, tt.prototype.init.prototype = tt.prototype, tt.propHooks = { _default: { get: function (e) { var t; return 1 !== e.elem.nodeType || null != e.elem[e.prop] && null == e.elem.style[e.prop] ? e.elem[e.prop] : (t = w.css(e.elem, e.prop, "")) && "auto" !== t ? t : 0; }, set: function (e) { w.fx.step[e.prop] ? w.fx.step[e.prop](e) : 1 !== e.elem.nodeType || null == e.elem.style[w.cssProps[e.prop]] && !w.cssHooks[e.prop] ? e.elem[e.prop] = e.now : w.style(e.elem, e.prop, e.now + e.unit); } } }, tt.propHooks.scrollTop = tt.propHooks.scrollLeft = { set: function (e) { e.elem.nodeType && e.elem.parentNode && (e.elem[e.prop] = e.now); } }, w.easing = { linear: function (e) { return e; }, swing: function (e) { return .5 - Math.cos(e * Math.PI) / 2; }, _default: "swing" }, w.fx = tt.prototype.init, w.fx.step = {};
    var nt, rt, it = /^(?:toggle|show|hide)$/, ot = /queueHooks$/;
    function at() { rt && (!1 === r.hidden && e.requestAnimationFrame ? e.requestAnimationFrame(at) : e.setTimeout(at, w.fx.interval), w.fx.tick()); }
    function st() { return e.setTimeout(function () { nt = void 0; }), nt = Date.now(); }
    function ut(e, t) { var n, r = 0, i = { height: e }; for (t = t ? 1 : 0; r < 4; r += 2 - t)
        i["margin" + (n = oe[r])] = i["padding" + n] = e; return t && (i.opacity = i.width = e), i; }
    function lt(e, t, n) { for (var r, i = (pt.tweeners[t] || []).concat(pt.tweeners["*"]), o = 0, a = i.length; o < a; o++)
        if (r = i[o].call(n, t, e))
            return r; }
    function ct(e, t, n) { var r, i, o, a, s, u, l, c, f = "width" in t || "height" in t, p = this, d = {}, h = e.style, g = e.nodeType && ae(e), y = J.get(e, "fxshow"); n.queue || (null == (a = w._queueHooks(e, "fx")).unqueued && (a.unqueued = 0, s = a.empty.fire, a.empty.fire = function () { a.unqueued || s(); }), a.unqueued++, p.always(function () { p.always(function () { a.unqueued--, w.queue(e, "fx").length || a.empty.fire(); }); })); for (r in t)
        if (i = t[r], it.test(i)) {
            if (delete t[r], o = o || "toggle" === i, i === (g ? "hide" : "show")) {
                if ("show" !== i || !y || void 0 === y[r])
                    continue;
                g = !0;
            }
            d[r] = y && y[r] || w.style(e, r);
        } if ((u = !w.isEmptyObject(t)) || !w.isEmptyObject(d)) {
        f && 1 === e.nodeType && (n.overflow = [h.overflow, h.overflowX, h.overflowY], null == (l = y && y.display) && (l = J.get(e, "display")), "none" === (c = w.css(e, "display")) && (l ? c = l : (fe([e], !0), l = e.style.display || l, c = w.css(e, "display"), fe([e]))), ("inline" === c || "inline-block" === c && null != l) && "none" === w.css(e, "float") && (u || (p.done(function () { h.display = l; }), null == l && (c = h.display, l = "none" === c ? "" : c)), h.display = "inline-block")), n.overflow && (h.overflow = "hidden", p.always(function () { h.overflow = n.overflow[0], h.overflowX = n.overflow[1], h.overflowY = n.overflow[2]; })), u = !1;
        for (r in d)
            u || (y ? "hidden" in y && (g = y.hidden) : y = J.access(e, "fxshow", { display: l }), o && (y.hidden = !g), g && fe([e], !0), p.done(function () { g || fe([e]), J.remove(e, "fxshow"); for (r in d)
                w.style(e, r, d[r]); })), u = lt(g ? y[r] : 0, r, p), r in y || (y[r] = u.start, g && (u.end = u.start, u.start = 0));
    } }
    function ft(e, t) { var n, r, i, o, a; for (n in e)
        if (r = G(n), i = t[r], o = e[n], Array.isArray(o) && (i = o[1], o = e[n] = o[0]), n !== r && (e[r] = o, delete e[n]), (a = w.cssHooks[r]) && "expand" in a) {
            o = a.expand(o), delete e[r];
            for (n in o)
                n in e || (e[n] = o[n], t[n] = i);
        }
        else
            t[r] = i; }
    function pt(e, t, n) { var r, i, o = 0, a = pt.prefilters.length, s = w.Deferred().always(function () { delete u.elem; }), u = function () { if (i)
        return !1; for (var t = nt || st(), n = Math.max(0, l.startTime + l.duration - t), r = 1 - (n / l.duration || 0), o = 0, a = l.tweens.length; o < a; o++)
        l.tweens[o].run(r); return s.notifyWith(e, [l, r, n]), r < 1 && a ? n : (a || s.notifyWith(e, [l, 1, 0]), s.resolveWith(e, [l]), !1); }, l = s.promise({ elem: e, props: w.extend({}, t), opts: w.extend(!0, { specialEasing: {}, easing: w.easing._default }, n), originalProperties: t, originalOptions: n, startTime: nt || st(), duration: n.duration, tweens: [], createTween: function (t, n) { var r = w.Tween(e, l.opts, t, n, l.opts.specialEasing[t] || l.opts.easing); return l.tweens.push(r), r; }, stop: function (t) { var n = 0, r = t ? l.tweens.length : 0; if (i)
            return this; for (i = !0; n < r; n++)
            l.tweens[n].run(1); return t ? (s.notifyWith(e, [l, 1, 0]), s.resolveWith(e, [l, t])) : s.rejectWith(e, [l, t]), this; } }), c = l.props; for (ft(c, l.opts.specialEasing); o < a; o++)
        if (r = pt.prefilters[o].call(l, e, c, l.opts))
            return g(r.stop) && (w._queueHooks(l.elem, l.opts.queue).stop = r.stop.bind(r)), r; return w.map(c, lt, l), g(l.opts.start) && l.opts.start.call(e, l), l.progress(l.opts.progress).done(l.opts.done, l.opts.complete).fail(l.opts.fail).always(l.opts.always), w.fx.timer(w.extend(u, { elem: e, anim: l, queue: l.opts.queue })), l; }
    w.Animation = w.extend(pt, { tweeners: { "*": [function (e, t) { var n = this.createTween(e, t); return ue(n.elem, e, ie.exec(t), n), n; }] }, tweener: function (e, t) { g(e) ? (t = e, e = ["*"]) : e = e.match(M); for (var n, r = 0, i = e.length; r < i; r++)
            n = e[r], pt.tweeners[n] = pt.tweeners[n] || [], pt.tweeners[n].unshift(t); }, prefilters: [ct], prefilter: function (e, t) { t ? pt.prefilters.unshift(e) : pt.prefilters.push(e); } }), w.speed = function (e, t, n) { var r = e && "object" == typeof e ? w.extend({}, e) : { complete: n || !n && t || g(e) && e, duration: e, easing: n && t || t && !g(t) && t }; return w.fx.off ? r.duration = 0 : "number" != typeof r.duration && (r.duration in w.fx.speeds ? r.duration = w.fx.speeds[r.duration] : r.duration = w.fx.speeds._default), null != r.queue && !0 !== r.queue || (r.queue = "fx"), r.old = r.complete, r.complete = function () { g(r.old) && r.old.call(this), r.queue && w.dequeue(this, r.queue); }, r; }, w.fn.extend({ fadeTo: function (e, t, n, r) { return this.filter(ae).css("opacity", 0).show().end().animate({ opacity: t }, e, n, r); }, animate: function (e, t, n, r) { var i = w.isEmptyObject(e), o = w.speed(t, n, r), a = function () { var t = pt(this, w.extend({}, e), o); (i || J.get(this, "finish")) && t.stop(!0); }; return a.finish = a, i || !1 === o.queue ? this.each(a) : this.queue(o.queue, a); }, stop: function (e, t, n) { var r = function (e) { var t = e.stop; delete e.stop, t(n); }; return "string" != typeof e && (n = t, t = e, e = void 0), t && !1 !== e && this.queue(e || "fx", []), this.each(function () { var t = !0, i = null != e && e + "queueHooks", o = w.timers, a = J.get(this); if (i)
            a[i] && a[i].stop && r(a[i]);
        else
            for (i in a)
                a[i] && a[i].stop && ot.test(i) && r(a[i]); for (i = o.length; i--;)
            o[i].elem !== this || null != e && o[i].queue !== e || (o[i].anim.stop(n), t = !1, o.splice(i, 1)); !t && n || w.dequeue(this, e); }); }, finish: function (e) { return !1 !== e && (e = e || "fx"), this.each(function () { var t, n = J.get(this), r = n[e + "queue"], i = n[e + "queueHooks"], o = w.timers, a = r ? r.length : 0; for (n.finish = !0, w.queue(this, e, []), i && i.stop && i.stop.call(this, !0), t = o.length; t--;)
            o[t].elem === this && o[t].queue === e && (o[t].anim.stop(!0), o.splice(t, 1)); for (t = 0; t < a; t++)
            r[t] && r[t].finish && r[t].finish.call(this); delete n.finish; }); } }), w.each(["toggle", "show", "hide"], function (e, t) { var n = w.fn[t]; w.fn[t] = function (e, r, i) { return null == e || "boolean" == typeof e ? n.apply(this, arguments) : this.animate(ut(t, !0), e, r, i); }; }), w.each({ slideDown: ut("show"), slideUp: ut("hide"), slideToggle: ut("toggle"), fadeIn: { opacity: "show" }, fadeOut: { opacity: "hide" }, fadeToggle: { opacity: "toggle" } }, function (e, t) { w.fn[e] = function (e, n, r) { return this.animate(t, e, n, r); }; }), w.timers = [], w.fx.tick = function () { var e, t = 0, n = w.timers; for (nt = Date.now(); t < n.length; t++)
        (e = n[t])() || n[t] !== e || n.splice(t--, 1); n.length || w.fx.stop(), nt = void 0; }, w.fx.timer = function (e) { w.timers.push(e), w.fx.start(); }, w.fx.interval = 13, w.fx.start = function () { rt || (rt = !0, at()); }, w.fx.stop = function () { rt = null; }, w.fx.speeds = { slow: 600, fast: 200, _default: 400 }, w.fn.delay = function (t, n) { return t = w.fx ? w.fx.speeds[t] || t : t, n = n || "fx", this.queue(n, function (n, r) { var i = e.setTimeout(n, t); r.stop = function () { e.clearTimeout(i); }; }); }, function () { var e = r.createElement("input"), t = r.createElement("select").appendChild(r.createElement("option")); e.type = "checkbox", h.checkOn = "" !== e.value, h.optSelected = t.selected, (e = r.createElement("input")).value = "t", e.type = "radio", h.radioValue = "t" === e.value; }();
    var dt, ht = w.expr.attrHandle;
    w.fn.extend({ attr: function (e, t) { return z(this, w.attr, e, t, arguments.length > 1); }, removeAttr: function (e) { return this.each(function () { w.removeAttr(this, e); }); } }), w.extend({ attr: function (e, t, n) { var r, i, o = e.nodeType; if (3 !== o && 8 !== o && 2 !== o)
            return "undefined" == typeof e.getAttribute ? w.prop(e, t, n) : (1 === o && w.isXMLDoc(e) || (i = w.attrHooks[t.toLowerCase()] || (w.expr.match.bool.test(t) ? dt : void 0)), void 0 !== n ? null === n ? void w.removeAttr(e, t) : i && "set" in i && void 0 !== (r = i.set(e, n, t)) ? r : (e.setAttribute(t, n + ""), n) : i && "get" in i && null !== (r = i.get(e, t)) ? r : null == (r = w.find.attr(e, t)) ? void 0 : r); }, attrHooks: { type: { set: function (e, t) { if (!h.radioValue && "radio" === t && N(e, "input")) {
                    var n = e.value;
                    return e.setAttribute("type", t), n && (e.value = n), t;
                } } } }, removeAttr: function (e, t) { var n, r = 0, i = t && t.match(M); if (i && 1 === e.nodeType)
            while (n = i[r++])
                e.removeAttribute(n); } }), dt = { set: function (e, t, n) { return !1 === t ? w.removeAttr(e, n) : e.setAttribute(n, n), n; } }, w.each(w.expr.match.bool.source.match(/\w+/g), function (e, t) { var n = ht[t] || w.find.attr; ht[t] = function (e, t, r) { var i, o, a = t.toLowerCase(); return r || (o = ht[a], ht[a] = i, i = null != n(e, t, r) ? a : null, ht[a] = o), i; }; });
    var gt = /^(?:input|select|textarea|button)$/i, yt = /^(?:a|area)$/i;
    w.fn.extend({ prop: function (e, t) { return z(this, w.prop, e, t, arguments.length > 1); }, removeProp: function (e) { return this.each(function () { delete this[w.propFix[e] || e]; }); } }), w.extend({ prop: function (e, t, n) { var r, i, o = e.nodeType; if (3 !== o && 8 !== o && 2 !== o)
            return 1 === o && w.isXMLDoc(e) || (t = w.propFix[t] || t, i = w.propHooks[t]), void 0 !== n ? i && "set" in i && void 0 !== (r = i.set(e, n, t)) ? r : e[t] = n : i && "get" in i && null !== (r = i.get(e, t)) ? r : e[t]; }, propHooks: { tabIndex: { get: function (e) { var t = w.find.attr(e, "tabindex"); return t ? parseInt(t, 10) : gt.test(e.nodeName) || yt.test(e.nodeName) && e.href ? 0 : -1; } } }, propFix: { "for": "htmlFor", "class": "className" } }), h.optSelected || (w.propHooks.selected = { get: function (e) { var t = e.parentNode; return t && t.parentNode && t.parentNode.selectedIndex, null; }, set: function (e) { var t = e.parentNode; t && (t.selectedIndex, t.parentNode && t.parentNode.selectedIndex); } }), w.each(["tabIndex", "readOnly", "maxLength", "cellSpacing", "cellPadding", "rowSpan", "colSpan", "useMap", "frameBorder", "contentEditable"], function () { w.propFix[this.toLowerCase()] = this; });
    function vt(e) { return (e.match(M) || []).join(" "); }
    function mt(e) { return e.getAttribute && e.getAttribute("class") || ""; }
    function xt(e) { return Array.isArray(e) ? e : "string" == typeof e ? e.match(M) || [] : []; }
    w.fn.extend({ addClass: function (e) { var t, n, r, i, o, a, s, u = 0; if (g(e))
            return this.each(function (t) { w(this).addClass(e.call(this, t, mt(this))); }); if ((t = xt(e)).length)
            while (n = this[u++])
                if (i = mt(n), r = 1 === n.nodeType && " " + vt(i) + " ") {
                    a = 0;
                    while (o = t[a++])
                        r.indexOf(" " + o + " ") < 0 && (r += o + " ");
                    i !== (s = vt(r)) && n.setAttribute("class", s);
                } return this; }, removeClass: function (e) { var t, n, r, i, o, a, s, u = 0; if (g(e))
            return this.each(function (t) { w(this).removeClass(e.call(this, t, mt(this))); }); if (!arguments.length)
            return this.attr("class", ""); if ((t = xt(e)).length)
            while (n = this[u++])
                if (i = mt(n), r = 1 === n.nodeType && " " + vt(i) + " ") {
                    a = 0;
                    while (o = t[a++])
                        while (r.indexOf(" " + o + " ") > -1)
                            r = r.replace(" " + o + " ", " ");
                    i !== (s = vt(r)) && n.setAttribute("class", s);
                } return this; }, toggleClass: function (e, t) { var n = typeof e, r = "string" === n || Array.isArray(e); return "boolean" == typeof t && r ? t ? this.addClass(e) : this.removeClass(e) : g(e) ? this.each(function (n) { w(this).toggleClass(e.call(this, n, mt(this), t), t); }) : this.each(function () { var t, i, o, a; if (r) {
            i = 0, o = w(this), a = xt(e);
            while (t = a[i++])
                o.hasClass(t) ? o.removeClass(t) : o.addClass(t);
        }
        else
            void 0 !== e && "boolean" !== n || ((t = mt(this)) && J.set(this, "__className__", t), this.setAttribute && this.setAttribute("class", t || !1 === e ? "" : J.get(this, "__className__") || "")); }); }, hasClass: function (e) { var t, n, r = 0; t = " " + e + " "; while (n = this[r++])
            if (1 === n.nodeType && (" " + vt(mt(n)) + " ").indexOf(t) > -1)
                return !0; return !1; } });
    var bt = /\r/g;
    w.fn.extend({ val: function (e) { var t, n, r, i = this[0]; {
            if (arguments.length)
                return r = g(e), this.each(function (n) { var i; 1 === this.nodeType && (null == (i = r ? e.call(this, n, w(this).val()) : e) ? i = "" : "number" == typeof i ? i += "" : Array.isArray(i) && (i = w.map(i, function (e) { return null == e ? "" : e + ""; })), (t = w.valHooks[this.type] || w.valHooks[this.nodeName.toLowerCase()]) && "set" in t && void 0 !== t.set(this, i, "value") || (this.value = i)); });
            if (i)
                return (t = w.valHooks[i.type] || w.valHooks[i.nodeName.toLowerCase()]) && "get" in t && void 0 !== (n = t.get(i, "value")) ? n : "string" == typeof (n = i.value) ? n.replace(bt, "") : null == n ? "" : n;
        } } }), w.extend({ valHooks: { option: { get: function (e) { var t = w.find.attr(e, "value"); return null != t ? t : vt(w.text(e)); } }, select: { get: function (e) { var t, n, r, i = e.options, o = e.selectedIndex, a = "select-one" === e.type, s = a ? null : [], u = a ? o + 1 : i.length; for (r = o < 0 ? u : a ? o : 0; r < u; r++)
                    if (((n = i[r]).selected || r === o) && !n.disabled && (!n.parentNode.disabled || !N(n.parentNode, "optgroup"))) {
                        if (t = w(n).val(), a)
                            return t;
                        s.push(t);
                    } return s; }, set: function (e, t) { var n, r, i = e.options, o = w.makeArray(t), a = i.length; while (a--)
                    ((r = i[a]).selected = w.inArray(w.valHooks.option.get(r), o) > -1) && (n = !0); return n || (e.selectedIndex = -1), o; } } } }), w.each(["radio", "checkbox"], function () { w.valHooks[this] = { set: function (e, t) { if (Array.isArray(t))
            return e.checked = w.inArray(w(e).val(), t) > -1; } }, h.checkOn || (w.valHooks[this].get = function (e) { return null === e.getAttribute("value") ? "on" : e.value; }); }), h.focusin = "onfocusin" in e;
    var wt = /^(?:focusinfocus|focusoutblur)$/, Tt = function (e) { e.stopPropagation(); };
    w.extend(w.event, { trigger: function (t, n, i, o) { var a, s, u, l, c, p, d, h, v = [i || r], m = f.call(t, "type") ? t.type : t, x = f.call(t, "namespace") ? t.namespace.split(".") : []; if (s = h = u = i = i || r, 3 !== i.nodeType && 8 !== i.nodeType && !wt.test(m + w.event.triggered) && (m.indexOf(".") > -1 && (m = (x = m.split(".")).shift(), x.sort()), c = m.indexOf(":") < 0 && "on" + m, t = t[w.expando] ? t : new w.Event(m, "object" == typeof t && t), t.isTrigger = o ? 2 : 3, t.namespace = x.join("."), t.rnamespace = t.namespace ? new RegExp("(^|\\.)" + x.join("\\.(?:.*\\.|)") + "(\\.|$)") : null, t.result = void 0, t.target || (t.target = i), n = null == n ? [t] : w.makeArray(n, [t]), d = w.event.special[m] || {}, o || !d.trigger || !1 !== d.trigger.apply(i, n))) {
            if (!o && !d.noBubble && !y(i)) {
                for (l = d.delegateType || m, wt.test(l + m) || (s = s.parentNode); s; s = s.parentNode)
                    v.push(s), u = s;
                u === (i.ownerDocument || r) && v.push(u.defaultView || u.parentWindow || e);
            }
            a = 0;
            while ((s = v[a++]) && !t.isPropagationStopped())
                h = s, t.type = a > 1 ? l : d.bindType || m, (p = (J.get(s, "events") || {})[t.type] && J.get(s, "handle")) && p.apply(s, n), (p = c && s[c]) && p.apply && Y(s) && (t.result = p.apply(s, n), !1 === t.result && t.preventDefault());
            return t.type = m, o || t.isDefaultPrevented() || d._default && !1 !== d._default.apply(v.pop(), n) || !Y(i) || c && g(i[m]) && !y(i) && ((u = i[c]) && (i[c] = null), w.event.triggered = m, t.isPropagationStopped() && h.addEventListener(m, Tt), i[m](), t.isPropagationStopped() && h.removeEventListener(m, Tt), w.event.triggered = void 0, u && (i[c] = u)), t.result;
        } }, simulate: function (e, t, n) { var r = w.extend(new w.Event, n, { type: e, isSimulated: !0 }); w.event.trigger(r, null, t); } }), w.fn.extend({ trigger: function (e, t) { return this.each(function () { w.event.trigger(e, t, this); }); }, triggerHandler: function (e, t) { var n = this[0]; if (n)
            return w.event.trigger(e, t, n, !0); } }), h.focusin || w.each({ focus: "focusin", blur: "focusout" }, function (e, t) { var n = function (e) { w.event.simulate(t, e.target, w.event.fix(e)); }; w.event.special[t] = { setup: function () { var r = this.ownerDocument || this, i = J.access(r, t); i || r.addEventListener(e, n, !0), J.access(r, t, (i || 0) + 1); }, teardown: function () { var r = this.ownerDocument || this, i = J.access(r, t) - 1; i ? J.access(r, t, i) : (r.removeEventListener(e, n, !0), J.remove(r, t)); } }; });
    var Ct = e.location, Et = Date.now(), kt = /\?/;
    w.parseXML = function (t) { var n; if (!t || "string" != typeof t)
        return null; try {
        n = (new e.DOMParser).parseFromString(t, "text/xml");
    }
    catch (e) {
        n = void 0;
    } return n && !n.getElementsByTagName("parsererror").length || w.error("Invalid XML: " + t), n; };
    var St = /\[\]$/, Dt = /\r?\n/g, Nt = /^(?:submit|button|image|reset|file)$/i, At = /^(?:input|select|textarea|keygen)/i;
    function jt(e, t, n, r) { var i; if (Array.isArray(t))
        w.each(t, function (t, i) { n || St.test(e) ? r(e, i) : jt(e + "[" + ("object" == typeof i && null != i ? t : "") + "]", i, n, r); });
    else if (n || "object" !== x(t))
        r(e, t);
    else
        for (i in t)
            jt(e + "[" + i + "]", t[i], n, r); }
    w.param = function (e, t) { var n, r = [], i = function (e, t) { var n = g(t) ? t() : t; r[r.length] = encodeURIComponent(e) + "=" + encodeURIComponent(null == n ? "" : n); }; if (Array.isArray(e) || e.jquery && !w.isPlainObject(e))
        w.each(e, function () { i(this.name, this.value); });
    else
        for (n in e)
            jt(n, e[n], t, i); return r.join("&"); }, w.fn.extend({ serialize: function () { return w.param(this.serializeArray()); }, serializeArray: function () { return this.map(function () { var e = w.prop(this, "elements"); return e ? w.makeArray(e) : this; }).filter(function () { var e = this.type; return this.name && !w(this).is(":disabled") && At.test(this.nodeName) && !Nt.test(e) && (this.checked || !pe.test(e)); }).map(function (e, t) { var n = w(this).val(); return null == n ? null : Array.isArray(n) ? w.map(n, function (e) { return { name: t.name, value: e.replace(Dt, "\r\n") }; }) : { name: t.name, value: n.replace(Dt, "\r\n") }; }).get(); } });
    var qt = /%20/g, Lt = /#.*$/, Ht = /([?&])_=[^&]*/, Ot = /^(.*?):[ \t]*([^\r\n]*)$/gm, Pt = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/, Mt = /^(?:GET|HEAD)$/, Rt = /^\/\//, It = {}, Wt = {}, $t = "*/".concat("*"), Bt = r.createElement("a");
    Bt.href = Ct.href;
    function Ft(e) { return function (t, n) { "string" != typeof t && (n = t, t = "*"); var r, i = 0, o = t.toLowerCase().match(M) || []; if (g(n))
        while (r = o[i++])
            "+" === r[0] ? (r = r.slice(1) || "*", (e[r] = e[r] || []).unshift(n)) : (e[r] = e[r] || []).push(n); }; }
    function _t(e, t, n, r) { var i = {}, o = e === Wt; function a(s) { var u; return i[s] = !0, w.each(e[s] || [], function (e, s) { var l = s(t, n, r); return "string" != typeof l || o || i[l] ? o ? !(u = l) : void 0 : (t.dataTypes.unshift(l), a(l), !1); }), u; } return a(t.dataTypes[0]) || !i["*"] && a("*"); }
    function zt(e, t) { var n, r, i = w.ajaxSettings.flatOptions || {}; for (n in t)
        void 0 !== t[n] && ((i[n] ? e : r || (r = {}))[n] = t[n]); return r && w.extend(!0, e, r), e; }
    function Xt(e, t, n) { var r, i, o, a, s = e.contents, u = e.dataTypes; while ("*" === u[0])
        u.shift(), void 0 === r && (r = e.mimeType || t.getResponseHeader("Content-Type")); if (r)
        for (i in s)
            if (s[i] && s[i].test(r)) {
                u.unshift(i);
                break;
            } if (u[0] in n)
        o = u[0];
    else {
        for (i in n) {
            if (!u[0] || e.converters[i + " " + u[0]]) {
                o = i;
                break;
            }
            a || (a = i);
        }
        o = o || a;
    } if (o)
        return o !== u[0] && u.unshift(o), n[o]; }
    function Ut(e, t, n, r) { var i, o, a, s, u, l = {}, c = e.dataTypes.slice(); if (c[1])
        for (a in e.converters)
            l[a.toLowerCase()] = e.converters[a]; o = c.shift(); while (o)
        if (e.responseFields[o] && (n[e.responseFields[o]] = t), !u && r && e.dataFilter && (t = e.dataFilter(t, e.dataType)), u = o, o = c.shift())
            if ("*" === o)
                o = u;
            else if ("*" !== u && u !== o) {
                if (!(a = l[u + " " + o] || l["* " + o]))
                    for (i in l)
                        if ((s = i.split(" "))[1] === o && (a = l[u + " " + s[0]] || l["* " + s[0]])) {
                            !0 === a ? a = l[i] : !0 !== l[i] && (o = s[0], c.unshift(s[1]));
                            break;
                        }
                if (!0 !== a)
                    if (a && e["throws"])
                        t = a(t);
                    else
                        try {
                            t = a(t);
                        }
                        catch (e) {
                            return { state: "parsererror", error: a ? e : "No conversion from " + u + " to " + o };
                        }
            } return { state: "success", data: t }; }
    w.extend({ active: 0, lastModified: {}, etag: {}, ajaxSettings: { url: Ct.href, type: "GET", isLocal: Pt.test(Ct.protocol), global: !0, processData: !0, async: !0, contentType: "application/x-www-form-urlencoded; charset=UTF-8", accepts: { "*": $t, text: "text/plain", html: "text/html", xml: "application/xml, text/xml", json: "application/json, text/javascript" }, contents: { xml: /\bxml\b/, html: /\bhtml/, json: /\bjson\b/ }, responseFields: { xml: "responseXML", text: "responseText", json: "responseJSON" }, converters: { "* text": String, "text html": !0, "text json": JSON.parse, "text xml": w.parseXML }, flatOptions: { url: !0, context: !0 } }, ajaxSetup: function (e, t) { return t ? zt(zt(e, w.ajaxSettings), t) : zt(w.ajaxSettings, e); }, ajaxPrefilter: Ft(It), ajaxTransport: Ft(Wt), ajax: function (t, n) { "object" == typeof t && (n = t, t = void 0), n = n || {}; var i, o, a, s, u, l, c, f, p, d, h = w.ajaxSetup({}, n), g = h.context || h, y = h.context && (g.nodeType || g.jquery) ? w(g) : w.event, v = w.Deferred(), m = w.Callbacks("once memory"), x = h.statusCode || {}, b = {}, T = {}, C = "canceled", E = { readyState: 0, getResponseHeader: function (e) { var t; if (c) {
                if (!s) {
                    s = {};
                    while (t = Ot.exec(a))
                        s[t[1].toLowerCase()] = t[2];
                }
                t = s[e.toLowerCase()];
            } return null == t ? null : t; }, getAllResponseHeaders: function () { return c ? a : null; }, setRequestHeader: function (e, t) { return null == c && (e = T[e.toLowerCase()] = T[e.toLowerCase()] || e, b[e] = t), this; }, overrideMimeType: function (e) { return null == c && (h.mimeType = e), this; }, statusCode: function (e) { var t; if (e)
                if (c)
                    E.always(e[E.status]);
                else
                    for (t in e)
                        x[t] = [x[t], e[t]]; return this; }, abort: function (e) { var t = e || C; return i && i.abort(t), k(0, t), this; } }; if (v.promise(E), h.url = ((t || h.url || Ct.href) + "").replace(Rt, Ct.protocol + "//"), h.type = n.method || n.type || h.method || h.type, h.dataTypes = (h.dataType || "*").toLowerCase().match(M) || [""], null == h.crossDomain) {
            l = r.createElement("a");
            try {
                l.href = h.url, l.href = l.href, h.crossDomain = Bt.protocol + "//" + Bt.host != l.protocol + "//" + l.host;
            }
            catch (e) {
                h.crossDomain = !0;
            }
        } if (h.data && h.processData && "string" != typeof h.data && (h.data = w.param(h.data, h.traditional)), _t(It, h, n, E), c)
            return E; (f = w.event && h.global) && 0 == w.active++ && w.event.trigger("ajaxStart"), h.type = h.type.toUpperCase(), h.hasContent = !Mt.test(h.type), o = h.url.replace(Lt, ""), h.hasContent ? h.data && h.processData && 0 === (h.contentType || "").indexOf("application/x-www-form-urlencoded") && (h.data = h.data.replace(qt, "+")) : (d = h.url.slice(o.length), h.data && (h.processData || "string" == typeof h.data) && (o += (kt.test(o) ? "&" : "?") + h.data, delete h.data), !1 === h.cache && (o = o.replace(Ht, "$1"), d = (kt.test(o) ? "&" : "?") + "_=" + Et++ + d), h.url = o + d), h.ifModified && (w.lastModified[o] && E.setRequestHeader("If-Modified-Since", w.lastModified[o]), w.etag[o] && E.setRequestHeader("If-None-Match", w.etag[o])), (h.data && h.hasContent && !1 !== h.contentType || n.contentType) && E.setRequestHeader("Content-Type", h.contentType), E.setRequestHeader("Accept", h.dataTypes[0] && h.accepts[h.dataTypes[0]] ? h.accepts[h.dataTypes[0]] + ("*" !== h.dataTypes[0] ? ", " + $t + "; q=0.01" : "") : h.accepts["*"]); for (p in h.headers)
            E.setRequestHeader(p, h.headers[p]); if (h.beforeSend && (!1 === h.beforeSend.call(g, E, h) || c))
            return E.abort(); if (C = "abort", m.add(h.complete), E.done(h.success), E.fail(h.error), i = _t(Wt, h, n, E)) {
            if (E.readyState = 1, f && y.trigger("ajaxSend", [E, h]), c)
                return E;
            h.async && h.timeout > 0 && (u = e.setTimeout(function () { E.abort("timeout"); }, h.timeout));
            try {
                c = !1, i.send(b, k);
            }
            catch (e) {
                if (c)
                    throw e;
                k(-1, e);
            }
        }
        else
            k(-1, "No Transport"); function k(t, n, r, s) { var l, p, d, b, T, C = n; c || (c = !0, u && e.clearTimeout(u), i = void 0, a = s || "", E.readyState = t > 0 ? 4 : 0, l = t >= 200 && t < 300 || 304 === t, r && (b = Xt(h, E, r)), b = Ut(h, b, E, l), l ? (h.ifModified && ((T = E.getResponseHeader("Last-Modified")) && (w.lastModified[o] = T), (T = E.getResponseHeader("etag")) && (w.etag[o] = T)), 204 === t || "HEAD" === h.type ? C = "nocontent" : 304 === t ? C = "notmodified" : (C = b.state, p = b.data, l = !(d = b.error))) : (d = C, !t && C || (C = "error", t < 0 && (t = 0))), E.status = t, E.statusText = (n || C) + "", l ? v.resolveWith(g, [p, C, E]) : v.rejectWith(g, [E, C, d]), E.statusCode(x), x = void 0, f && y.trigger(l ? "ajaxSuccess" : "ajaxError", [E, h, l ? p : d]), m.fireWith(g, [E, C]), f && (y.trigger("ajaxComplete", [E, h]), --w.active || w.event.trigger("ajaxStop"))); } return E; }, getJSON: function (e, t, n) { return w.get(e, t, n, "json"); }, getScript: function (e, t) { return w.get(e, void 0, t, "script"); } }), w.each(["get", "post"], function (e, t) { w[t] = function (e, n, r, i) { return g(n) && (i = i || r, r = n, n = void 0), w.ajax(w.extend({ url: e, type: t, dataType: i, data: n, success: r }, w.isPlainObject(e) && e)); }; }), w._evalUrl = function (e) { return w.ajax({ url: e, type: "GET", dataType: "script", cache: !0, async: !1, global: !1, "throws": !0 }); }, w.fn.extend({ wrapAll: function (e) { var t; return this[0] && (g(e) && (e = e.call(this[0])), t = w(e, this[0].ownerDocument).eq(0).clone(!0), this[0].parentNode && t.insertBefore(this[0]), t.map(function () { var e = this; while (e.firstElementChild)
            e = e.firstElementChild; return e; }).append(this)), this; }, wrapInner: function (e) { return g(e) ? this.each(function (t) { w(this).wrapInner(e.call(this, t)); }) : this.each(function () { var t = w(this), n = t.contents(); n.length ? n.wrapAll(e) : t.append(e); }); }, wrap: function (e) { var t = g(e); return this.each(function (n) { w(this).wrapAll(t ? e.call(this, n) : e); }); }, unwrap: function (e) { return this.parent(e).not("body").each(function () { w(this).replaceWith(this.childNodes); }), this; } }), w.expr.pseudos.hidden = function (e) { return !w.expr.pseudos.visible(e); }, w.expr.pseudos.visible = function (e) { return !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length); }, w.ajaxSettings.xhr = function () { try {
        return new e.XMLHttpRequest;
    }
    catch (e) { } };
    var Vt = { 0: 200, 1223: 204 }, Gt = w.ajaxSettings.xhr();
    h.cors = !!Gt && "withCredentials" in Gt, h.ajax = Gt = !!Gt, w.ajaxTransport(function (t) { var n, r; if (h.cors || Gt && !t.crossDomain)
        return { send: function (i, o) { var a, s = t.xhr(); if (s.open(t.type, t.url, t.async, t.username, t.password), t.xhrFields)
                for (a in t.xhrFields)
                    s[a] = t.xhrFields[a]; t.mimeType && s.overrideMimeType && s.overrideMimeType(t.mimeType), t.crossDomain || i["X-Requested-With"] || (i["X-Requested-With"] = "XMLHttpRequest"); for (a in i)
                s.setRequestHeader(a, i[a]); n = function (e) { return function () { n && (n = r = s.onload = s.onerror = s.onabort = s.ontimeout = s.onreadystatechange = null, "abort" === e ? s.abort() : "error" === e ? "number" != typeof s.status ? o(0, "error") : o(s.status, s.statusText) : o(Vt[s.status] || s.status, s.statusText, "text" !== (s.responseType || "text") || "string" != typeof s.responseText ? { binary: s.response } : { text: s.responseText }, s.getAllResponseHeaders())); }; }, s.onload = n(), r = s.onerror = s.ontimeout = n("error"), void 0 !== s.onabort ? s.onabort = r : s.onreadystatechange = function () { 4 === s.readyState && e.setTimeout(function () { n && r(); }); }, n = n("abort"); try {
                s.send(t.hasContent && t.data || null);
            }
            catch (e) {
                if (n)
                    throw e;
            } }, abort: function () { n && n(); } }; }), w.ajaxPrefilter(function (e) { e.crossDomain && (e.contents.script = !1); }), w.ajaxSetup({ accepts: { script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript" }, contents: { script: /\b(?:java|ecma)script\b/ }, converters: { "text script": function (e) { return w.globalEval(e), e; } } }), w.ajaxPrefilter("script", function (e) { void 0 === e.cache && (e.cache = !1), e.crossDomain && (e.type = "GET"); }), w.ajaxTransport("script", function (e) { if (e.crossDomain) {
        var t, n;
        return { send: function (i, o) { t = w("<script>").prop({ charset: e.scriptCharset, src: e.url }).on("load error", n = function (e) { t.remove(), n = null, e && o("error" === e.type ? 404 : 200, e.type); }), r.head.appendChild(t[0]); }, abort: function () { n && n(); } };
    } });
    var Yt = [], Qt = /(=)\?(?=&|$)|\?\?/;
    w.ajaxSetup({ jsonp: "callback", jsonpCallback: function () { var e = Yt.pop() || w.expando + "_" + Et++; return this[e] = !0, e; } }), w.ajaxPrefilter("json jsonp", function (t, n, r) { var i, o, a, s = !1 !== t.jsonp && (Qt.test(t.url) ? "url" : "string" == typeof t.data && 0 === (t.contentType || "").indexOf("application/x-www-form-urlencoded") && Qt.test(t.data) && "data"); if (s || "jsonp" === t.dataTypes[0])
        return i = t.jsonpCallback = g(t.jsonpCallback) ? t.jsonpCallback() : t.jsonpCallback, s ? t[s] = t[s].replace(Qt, "$1" + i) : !1 !== t.jsonp && (t.url += (kt.test(t.url) ? "&" : "?") + t.jsonp + "=" + i), t.converters["script json"] = function () { return a || w.error(i + " was not called"), a[0]; }, t.dataTypes[0] = "json", o = e[i], e[i] = function () { a = arguments; }, r.always(function () { void 0 === o ? w(e).removeProp(i) : e[i] = o, t[i] && (t.jsonpCallback = n.jsonpCallback, Yt.push(i)), a && g(o) && o(a[0]), a = o = void 0; }), "script"; }), h.createHTMLDocument = function () { var e = r.implementation.createHTMLDocument("").body; return e.innerHTML = "<form></form><form></form>", 2 === e.childNodes.length; }(), w.parseHTML = function (e, t, n) { if ("string" != typeof e)
        return []; "boolean" == typeof t && (n = t, t = !1); var i, o, a; return t || (h.createHTMLDocument ? ((i = (t = r.implementation.createHTMLDocument("")).createElement("base")).href = r.location.href, t.head.appendChild(i)) : t = r), o = A.exec(e), a = !n && [], o ? [t.createElement(o[1])] : (o = xe([e], t, a), a && a.length && w(a).remove(), w.merge([], o.childNodes)); }, w.fn.load = function (e, t, n) { var r, i, o, a = this, s = e.indexOf(" "); return s > -1 && (r = vt(e.slice(s)), e = e.slice(0, s)), g(t) ? (n = t, t = void 0) : t && "object" == typeof t && (i = "POST"), a.length > 0 && w.ajax({ url: e, type: i || "GET", dataType: "html", data: t }).done(function (e) { o = arguments, a.html(r ? w("<div>").append(w.parseHTML(e)).find(r) : e); }).always(n && function (e, t) { a.each(function () { n.apply(this, o || [e.responseText, t, e]); }); }), this; }, w.each(["ajaxStart", "ajaxStop", "ajaxComplete", "ajaxError", "ajaxSuccess", "ajaxSend"], function (e, t) { w.fn[t] = function (e) { return this.on(t, e); }; }), w.expr.pseudos.animated = function (e) { return w.grep(w.timers, function (t) { return e === t.elem; }).length; }, w.offset = { setOffset: function (e, t, n) { var r, i, o, a, s, u, l, c = w.css(e, "position"), f = w(e), p = {}; "static" === c && (e.style.position = "relative"), s = f.offset(), o = w.css(e, "top"), u = w.css(e, "left"), (l = ("absolute" === c || "fixed" === c) && (o + u).indexOf("auto") > -1) ? (a = (r = f.position()).top, i = r.left) : (a = parseFloat(o) || 0, i = parseFloat(u) || 0), g(t) && (t = t.call(e, n, w.extend({}, s))), null != t.top && (p.top = t.top - s.top + a), null != t.left && (p.left = t.left - s.left + i), "using" in t ? t.using.call(e, p) : f.css(p); } }, w.fn.extend({ offset: function (e) { if (arguments.length)
            return void 0 === e ? this : this.each(function (t) { w.offset.setOffset(this, e, t); }); var t, n, r = this[0]; if (r)
            return r.getClientRects().length ? (t = r.getBoundingClientRect(), n = r.ownerDocument.defaultView, { top: t.top + n.pageYOffset, left: t.left + n.pageXOffset }) : { top: 0, left: 0 }; }, position: function () { if (this[0]) {
            var e, t, n, r = this[0], i = { top: 0, left: 0 };
            if ("fixed" === w.css(r, "position"))
                t = r.getBoundingClientRect();
            else {
                t = this.offset(), n = r.ownerDocument, e = r.offsetParent || n.documentElement;
                while (e && (e === n.body || e === n.documentElement) && "static" === w.css(e, "position"))
                    e = e.parentNode;
                e && e !== r && 1 === e.nodeType && ((i = w(e).offset()).top += w.css(e, "borderTopWidth", !0), i.left += w.css(e, "borderLeftWidth", !0));
            }
            return { top: t.top - i.top - w.css(r, "marginTop", !0), left: t.left - i.left - w.css(r, "marginLeft", !0) };
        } }, offsetParent: function () { return this.map(function () { var e = this.offsetParent; while (e && "static" === w.css(e, "position"))
            e = e.offsetParent; return e || be; }); } }), w.each({ scrollLeft: "pageXOffset", scrollTop: "pageYOffset" }, function (e, t) { var n = "pageYOffset" === t; w.fn[e] = function (r) { return z(this, function (e, r, i) { var o; if (y(e) ? o = e : 9 === e.nodeType && (o = e.defaultView), void 0 === i)
        return o ? o[t] : e[r]; o ? o.scrollTo(n ? o.pageXOffset : i, n ? i : o.pageYOffset) : e[r] = i; }, e, r, arguments.length); }; }), w.each(["top", "left"], function (e, t) { w.cssHooks[t] = _e(h.pixelPosition, function (e, n) { if (n)
        return n = Fe(e, t), We.test(n) ? w(e).position()[t] + "px" : n; }); }), w.each({ Height: "height", Width: "width" }, function (e, t) { w.each({ padding: "inner" + e, content: t, "": "outer" + e }, function (n, r) { w.fn[r] = function (i, o) { var a = arguments.length && (n || "boolean" != typeof i), s = n || (!0 === i || !0 === o ? "margin" : "border"); return z(this, function (t, n, i) { var o; return y(t) ? 0 === r.indexOf("outer") ? t["inner" + e] : t.document.documentElement["client" + e] : 9 === t.nodeType ? (o = t.documentElement, Math.max(t.body["scroll" + e], o["scroll" + e], t.body["offset" + e], o["offset" + e], o["client" + e])) : void 0 === i ? w.css(t, n, s) : w.style(t, n, i, s); }, t, a ? i : void 0, a); }; }); }), w.each("blur focus focusin focusout resize scroll click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup contextmenu".split(" "), function (e, t) { w.fn[t] = function (e, n) { return arguments.length > 0 ? this.on(t, null, e, n) : this.trigger(t); }; }), w.fn.extend({ hover: function (e, t) { return this.mouseenter(e).mouseleave(t || e); } }), w.fn.extend({ bind: function (e, t, n) { return this.on(e, null, t, n); }, unbind: function (e, t) { return this.off(e, null, t); }, delegate: function (e, t, n, r) { return this.on(t, e, n, r); }, undelegate: function (e, t, n) { return 1 === arguments.length ? this.off(e, "**") : this.off(t, e || "**", n); } }), w.proxy = function (e, t) { var n, r, i; if ("string" == typeof t && (n = e[t], t = e, e = n), g(e))
        return r = o.call(arguments, 2), i = function () { return e.apply(t || this, r.concat(o.call(arguments))); }, i.guid = e.guid = e.guid || w.guid++, i; }, w.holdReady = function (e) { e ? w.readyWait++ : w.ready(!0); }, w.isArray = Array.isArray, w.parseJSON = JSON.parse, w.nodeName = N, w.isFunction = g, w.isWindow = y, w.camelCase = G, w.type = x, w.now = Date.now, w.isNumeric = function (e) { var t = w.type(e); return ("number" === t || "string" === t) && !isNaN(e - parseFloat(e)); }, "function" == typeof define && define.amd && define("jquery", [], function () { return w; });
    var Jt = e.jQuery, Kt = e.$;
    return w.noConflict = function (t) { return e.$ === w && (e.$ = Kt), t && e.jQuery === w && (e.jQuery = Jt), w; }, t || (e.jQuery = e.$ = w), w;
});
/*
* Project: Bootstrap Notify = v3.1.5
* Description: Turns standard Bootstrap alerts into "Growl-like" notifications.
* Author: Mouse0270 aka Robert McIntosh
* License: MIT License
* Website: https://github.com/mouse0270/bootstrap-growl
*/
/* global define:false, require: false, jQuery:false */
(function (factory) {
    factory(jQuery);
}(function ($) {
    // Create the defaults once
    var defaults = {
        element: 'body',
        position: null,
        type: "info",
        allow_dismiss: true,
        allow_duplicates: true,
        newest_on_top: false,
        showProgressbar: false,
        placement: {
            from: "top",
            align: "right"
        },
        offset: 20,
        spacing: 10,
        z_index: 1031,
        delay: 5000,
        timer: 1000,
        url_target: '_blank',
        mouse_over: null,
        animate: {
            enter: 'animated fadeInDown',
            exit: 'animated fadeOutUp'
        },
        onShow: null,
        onShown: null,
        onClose: null,
        onClosed: null,
        onClick: null,
        icon_type: 'class',
        template: '<div data-notify="container" class="col-xs-11 col-sm-4 alert alert-{0}" role="alert"><button type="button" aria-hidden="true" class="close" data-notify="dismiss">&times;</button><span data-notify="icon"></span> <span data-notify="title">{1}</span> <span data-notify="message">{2}</span><div class="progress" data-notify="progressbar"><div class="progress-bar progress-bar-{0}" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%;"></div></div><a href="{3}" target="{4}" data-notify="url"></a></div>'
    };
    String.format = function () {
        var args = arguments;
        var str = arguments[0];
        return str.replace(/(\{\{\d\}\}|\{\d\})/g, function (str) {
            if (str.substring(0, 2) === "{{")
                return str;
            var num = parseInt(str.match(/\d/)[0]);
            return args[num + 1];
        });
    };
    function isDuplicateNotification(notification) {
        var isDupe = false;
        $('[data-notify="container"]').each(function (i, el) {
            var $el = $(el);
            var title = $el.find('[data-notify="title"]').html().trim();
            var message = $el.find('[data-notify="message"]').html().trim();
            // The input string might be different than the actual parsed HTML string!
            // (<br> vs <br /> for example)
            // So we have to force-parse this as HTML here!
            var isSameTitle = title === $("<div>" + notification.settings.content.title + "</div>").html().trim();
            var isSameMsg = message === $("<div>" + notification.settings.content.message + "</div>").html().trim();
            var isSameType = $el.hasClass('alert-' + notification.settings.type);
            if (isSameTitle && isSameMsg && isSameType) {
                //we found the dupe. Set the var and stop checking.
                isDupe = true;
            }
            return !isDupe;
        });
        return isDupe;
    }
    function Notify(element, content, options) {
        // Setup Content of Notify
        var contentObj = {
            content: {
                message: typeof content === 'object' ? content.message : content,
                title: content.title ? content.title : '',
                icon: content.icon ? content.icon : '',
                url: content.url ? content.url : '#',
                target: content.target ? content.target : '-'
            }
        };
        options = $.extend(true, {}, contentObj, options);
        this.settings = $.extend(true, {}, defaults, options);
        this._defaults = defaults;
        if (this.settings.content.target === "-") {
            this.settings.content.target = this.settings.url_target;
        }
        this.animations = {
            start: 'webkitAnimationStart oanimationstart MSAnimationStart animationstart',
            end: 'webkitAnimationEnd oanimationend MSAnimationEnd animationend'
        };
        if (typeof this.settings.offset === 'number') {
            this.settings.offset = {
                x: this.settings.offset,
                y: this.settings.offset
            };
        }
        //if duplicate messages are not allowed, then only continue if this new message is not a duplicate of one that it already showing
        if (this.settings.allow_duplicates || (!this.settings.allow_duplicates && !isDuplicateNotification(this))) {
            this.init();
        }
    }
    $.extend(Notify.prototype, {
        init: function () {
            var self = this;
            this.buildNotify();
            if (this.settings.content.icon) {
                this.setIcon();
            }
            if (this.settings.content.url != "#") {
                this.styleURL();
            }
            this.styleDismiss();
            this.placement();
            this.bind();
            this.notify = {
                $ele: this.$ele,
                update: function (command, update) {
                    var commands = {};
                    if (typeof command === "string") {
                        commands[command] = update;
                    }
                    else {
                        commands = command;
                    }
                    for (var cmd in commands) {
                        switch (cmd) {
                            case "type":
                                this.$ele.removeClass('alert-' + self.settings.type);
                                this.$ele.find('[data-notify="progressbar"] > .progress-bar').removeClass('progress-bar-' + self.settings.type);
                                self.settings.type = commands[cmd];
                                this.$ele.addClass('alert-' + commands[cmd]).find('[data-notify="progressbar"] > .progress-bar').addClass('progress-bar-' + commands[cmd]);
                                break;
                            case "icon":
                                var $icon = this.$ele.find('[data-notify="icon"]');
                                if (self.settings.icon_type.toLowerCase() === 'class') {
                                    $icon.removeClass(self.settings.content.icon).addClass(commands[cmd]);
                                }
                                else {
                                    if (!$icon.is('img')) {
                                        $icon.find('img');
                                    }
                                    $icon.attr('src', commands[cmd]);
                                }
                                self.settings.content.icon = commands[command];
                                break;
                            case "progress":
                                var newDelay = self.settings.delay - (self.settings.delay * (commands[cmd] / 100));
                                this.$ele.data('notify-delay', newDelay);
                                this.$ele.find('[data-notify="progressbar"] > div').attr('aria-valuenow', commands[cmd]).css('width', commands[cmd] + '%');
                                break;
                            case "url":
                                this.$ele.find('[data-notify="url"]').attr('href', commands[cmd]);
                                break;
                            case "target":
                                this.$ele.find('[data-notify="url"]').attr('target', commands[cmd]);
                                break;
                            default:
                                this.$ele.find('[data-notify="' + cmd + '"]').html(commands[cmd]);
                        }
                    }
                    var posX = this.$ele.outerHeight() + parseInt(self.settings.spacing) + parseInt(self.settings.offset.y);
                    self.reposition(posX);
                },
                close: function () {
                    self.close();
                }
            };
        },
        buildNotify: function () {
            var content = this.settings.content;
            this.$ele = $(String.format(this.settings.template, this.settings.type, content.title, content.message, content.url, content.target));
            this.$ele.attr('data-notify-position', this.settings.placement.from + '-' + this.settings.placement.align);
            if (!this.settings.allow_dismiss) {
                this.$ele.find('[data-notify="dismiss"]').css('display', 'none');
            }
            if ((this.settings.delay <= 0 && !this.settings.showProgressbar) || !this.settings.showProgressbar) {
                this.$ele.find('[data-notify="progressbar"]').remove();
            }
        },
        setIcon: function () {
            if (this.settings.icon_type.toLowerCase() === 'class') {
                this.$ele.find('[data-notify="icon"]').addClass(this.settings.content.icon);
            }
            else {
                if (this.$ele.find('[data-notify="icon"]').is('img')) {
                    this.$ele.find('[data-notify="icon"]').attr('src', this.settings.content.icon);
                }
                else {
                    this.$ele.find('[data-notify="icon"]').append('<img src="' + this.settings.content.icon + '" alt="Notify Icon" />');
                }
            }
        },
        styleDismiss: function () {
            this.$ele.find('[data-notify="dismiss"]').css({
                position: 'absolute',
                right: '10px',
                top: '5px',
                zIndex: this.settings.z_index + 2
            });
        },
        styleURL: function () {
            this.$ele.find('[data-notify="url"]').css({
                backgroundImage: 'url(data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)',
                height: '100%',
                left: 0,
                position: 'absolute',
                top: 0,
                width: '100%',
                zIndex: this.settings.z_index + 1
            });
        },
        placement: function () {
            var self = this, offsetAmt = this.settings.offset.y, css = {
                display: 'inline-block',
                margin: '0px auto',
                position: this.settings.position ? this.settings.position : (this.settings.element === 'body' ? 'fixed' : 'absolute'),
                transition: 'all .5s ease-in-out',
                zIndex: this.settings.z_index
            }, hasAnimation = false, settings = this.settings;
            $('[data-notify-position="' + this.settings.placement.from + '-' + this.settings.placement.align + '"]:not([data-closing="true"])').each(function () {
                offsetAmt = Math.max(offsetAmt, parseInt($(this).css(settings.placement.from)) + parseInt($(this).outerHeight()) + parseInt(settings.spacing));
            });
            if (this.settings.newest_on_top === true) {
                offsetAmt = this.settings.offset.y;
            }
            css[this.settings.placement.from] = offsetAmt + 'px';
            switch (this.settings.placement.align) {
                case "left":
                case "right":
                    css[this.settings.placement.align] = this.settings.offset.x + 'px';
                    break;
                case "center":
                    css.left = 0;
                    css.right = 0;
                    break;
            }
            this.$ele.css(css).addClass(this.settings.animate.enter);
            $.each(Array('webkit-', 'moz-', 'o-', 'ms-', ''), function (index, prefix) {
                self.$ele[0].style[prefix + 'AnimationIterationCount'] = 1;
            });
            $(this.settings.element).append(this.$ele);
            if (this.settings.newest_on_top === true) {
                offsetAmt = (parseInt(offsetAmt) + parseInt(this.settings.spacing)) + this.$ele.outerHeight();
                this.reposition(offsetAmt);
            }
            if ($.isFunction(self.settings.onShow)) {
                self.settings.onShow.call(this.$ele);
            }
            this.$ele.one(this.animations.start, function () {
                hasAnimation = true;
            }).one(this.animations.end, function () {
                self.$ele.removeClass(self.settings.animate.enter);
                if ($.isFunction(self.settings.onShown)) {
                    self.settings.onShown.call(this);
                }
            });
            setTimeout(function () {
                if (!hasAnimation) {
                    if ($.isFunction(self.settings.onShown)) {
                        self.settings.onShown.call(this);
                    }
                }
            }, 600);
        },
        bind: function () {
            var self = this;
            this.$ele.find('[data-notify="dismiss"]').on('click', function () {
                self.close();
            });
            if ($.isFunction(self.settings.onClick)) {
                this.$ele.on('click', function (event) {
                    if (event.target != self.$ele.find('[data-notify="dismiss"]')[0]) {
                        self.settings.onClick.call(this, event);
                    }
                });
            }
            this.$ele.mouseover(function () {
                $(this).data('data-hover', "true");
            }).mouseout(function () {
                $(this).data('data-hover', "false");
            });
            this.$ele.data('data-hover', "false");
            if (this.settings.delay > 0) {
                self.$ele.data('notify-delay', self.settings.delay);
                var timer = setInterval(function () {
                    var delay = parseInt(self.$ele.data('notify-delay')) - self.settings.timer;
                    if ((self.$ele.data('data-hover') === 'false' && self.settings.mouse_over === "pause") || self.settings.mouse_over != "pause") {
                        var percent = ((self.settings.delay - delay) / self.settings.delay) * 100;
                        self.$ele.data('notify-delay', delay);
                        self.$ele.find('[data-notify="progressbar"] > div').attr('aria-valuenow', percent).css('width', percent + '%');
                    }
                    if (delay <= -(self.settings.timer)) {
                        clearInterval(timer);
                        self.close();
                    }
                }, self.settings.timer);
            }
        },
        close: function () {
            var self = this, posX = parseInt(this.$ele.css(this.settings.placement.from)), hasAnimation = false;
            this.$ele.attr('data-closing', 'true').addClass(this.settings.animate.exit);
            self.reposition(posX);
            if ($.isFunction(self.settings.onClose)) {
                self.settings.onClose.call(this.$ele);
            }
            this.$ele.one(this.animations.start, function () {
                hasAnimation = true;
            }).one(this.animations.end, function () {
                $(this).remove();
                if ($.isFunction(self.settings.onClosed)) {
                    self.settings.onClosed.call(this);
                }
            });
            setTimeout(function () {
                if (!hasAnimation) {
                    self.$ele.remove();
                    if ($.isFunction(self.settings.onClosed)) {
                        self.settings.onClosed.call(this);
                    }
                }
            }, 600);
        },
        reposition: function (posX) {
            var self = this, notifies = '[data-notify-position="' + this.settings.placement.from + '-' + this.settings.placement.align + '"]:not([data-closing="true"])', $elements = this.$ele.nextAll(notifies);
            if (this.settings.newest_on_top === true) {
                $elements = this.$ele.prevAll(notifies);
            }
            $elements.each(function () {
                $(this).css(self.settings.placement.from, posX);
                posX = (parseInt(posX) + parseInt(self.settings.spacing)) + $(this).outerHeight();
            });
        }
    });
    $.notify = function (content, options) {
        var plugin = new Notify(this, content, options);
        return plugin.notify;
    };
    $.notifyDefaults = function (options) {
        defaults = $.extend(true, {}, defaults, options);
        return defaults;
    };
    $.notifyClose = function (selector) {
        if (typeof selector === "undefined" || selector === "all") {
            $('[data-notify]').find('[data-notify="dismiss"]').trigger('click');
        }
        else if (selector === 'success' || selector === 'info' || selector === 'warning' || selector === 'danger') {
            $('.alert-' + selector + '[data-notify]').find('[data-notify="dismiss"]').trigger('click');
        }
        else if (selector) {
            $(selector + '[data-notify]').find('[data-notify="dismiss"]').trigger('click');
        }
        else {
            $('[data-notify-position="' + selector + '"]').find('[data-notify="dismiss"]').trigger('click');
        }
    };
    $.notifyCloseExcept = function (selector) {
        if (selector === 'success' || selector === 'info' || selector === 'warning' || selector === 'danger') {
            $('[data-notify]').not('.alert-' + selector).find('[data-notify="dismiss"]').trigger('click');
        }
        else {
            $('[data-notify]').not(selector).find('[data-notify="dismiss"]').trigger('click');
        }
    };
}));
define("client/settings", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.storeStudioEndpoint = exports.getStudioEndpoint = exports.storeRemoteManagementEndpoint = exports.getRemoteManagementEndpoint = exports.storeIngestionApi = exports.getIngestionApi = exports.storeDeviceId = exports.getDeviceId = exports.storeSampleLength = exports.getSampleLength = exports.storeFrequency = exports.getFrequency = exports.storeKeyword = exports.getKeyword = exports.storeApiKey = exports.getApiKey = void 0;
    const REMOTE_MANAGEMENT_ENDPOINT = 'wss://remote-mgmt.edgeimpulse.com';
    const INGESTION_API = 'https://ingestion.edgeimpulse.com';
    const STUDIO_ENDPOINT = 'https://studio.edgeimpulse.com';
    const LS_API_KEY = 'apiKey';
    const LS_KEYWORD = 'keyword';
    const LS_SAMPLE_LENGTH = 'sampleLength';
    const LS_FREQUENCY = 'frequency';
    const LS_DEVICE_ID_KEY = 'deviceId';
    const LS_INGESTION_API = 'ingestionApi';
    const LS_REMOTE_MANAGEMENT_ENDPOINT = 'remoteMgmtEndpoint';
    const LS_STUDIO_ENDPOINT = 'studioEndpoint';
    const api_key = 'ei_e0050bfeee3ce81e23ec498be73a5caf7ac8aa388c1ddc1fbed936f3a7a15ffd';
    const getRandomString = () => Date.now().toString(36);
    const getApiKey = () => new URLSearchParams(window.location.search).get('apiKey') ||
        localStorage.getItem(LS_API_KEY) ||
        'ei_e0050bfeee3ce81e23ec498be73a5caf7ac8aa388c1ddc1fbed936f3a7a15ffd';
    exports.getApiKey = getApiKey;
    const storeApiKey = (apiKey) => {
        console.log('storeApiKey', apiKey, window.location.search);
        localStorage.setItem(LS_API_KEY, apiKey);
    };
    exports.storeApiKey = storeApiKey;
    const getKeyword = () => new URLSearchParams(window.location.search).get('keyword') ||
        localStorage.getItem(LS_KEYWORD) ||
        '';
    exports.getKeyword = getKeyword;
    const storeKeyword = (keyword) => {
        console.log('storeKeyword', keyword, window.location.search);
        localStorage.setItem(LS_KEYWORD, keyword);
    };
    exports.storeKeyword = storeKeyword;
    const getFrequency = () => Number(new URLSearchParams(window.location.search).get('frequency')) ||
        Number(localStorage.getItem(LS_FREQUENCY)) ||
        NaN;
    exports.getFrequency = getFrequency;
    const storeFrequency = (frequency) => {
        console.log('storeFrequency', frequency, window.location.search);
        localStorage.setItem(LS_FREQUENCY, frequency.toString());
    };
    exports.storeFrequency = storeFrequency;
    const getSampleLength = () => Number(new URLSearchParams(window.location.search).get('sampleLength')) ||
        Number(localStorage.getItem(LS_SAMPLE_LENGTH)) ||
        NaN;
    exports.getSampleLength = getSampleLength;
    const storeSampleLength = (sampleLength) => {
        console.log('storeSampleLength', sampleLength, window.location.search);
        localStorage.setItem(LS_SAMPLE_LENGTH, sampleLength.toString());
    };
    exports.storeSampleLength = storeSampleLength;
    const isMobilePhone = (navigator.maxTouchPoints || 'ontouchstart' in document.documentElement);
    const devicePrefix = isMobilePhone ? 'phone' : 'computer';
    const getDeviceId = () => localStorage.getItem(LS_DEVICE_ID_KEY) || `${devicePrefix}_${getRandomString()}`;
    exports.getDeviceId = getDeviceId;
    const storeDeviceId = (deviceId) => {
        localStorage.setItem(LS_DEVICE_ID_KEY, deviceId);
    };
    exports.storeDeviceId = storeDeviceId;
    const getIngestionApi = () => {
        let ingestionApiParam = new URLSearchParams(window.location.search).get('ingestionApi');
        let envParam = new URLSearchParams(window.location.search).get('env');
        let localStorageParam = localStorage.getItem(LS_INGESTION_API);
        if (ingestionApiParam) {
            return ingestionApiParam;
        }
        else if (envParam) {
            return "http://ingestion." + envParam + ".test.edgeimpulse.com";
        }
        else if (localStorageParam) {
            return localStorageParam;
        }
        else {
            if (window.location.host === 'smartphone.acc2.edgeimpulse.com') {
                return INGESTION_API.replace('edgeimpulse.com', 'acc2.edgeimpulse.com');
            }
            else {
                return INGESTION_API;
            }
        }
    };
    exports.getIngestionApi = getIngestionApi;
    const storeIngestionApi = (ingestionApi) => {
        console.log('storeIngestionApi', ingestionApi);
        localStorage.setItem(LS_INGESTION_API, ingestionApi);
    };
    exports.storeIngestionApi = storeIngestionApi;
    const getRemoteManagementEndpoint = () => {
        let remoteMgmtParam = new URLSearchParams(window.location.search).get('remoteManagement');
        let envParam = new URLSearchParams(window.location.search).get('env');
        let localStorageParam = localStorage.getItem(LS_REMOTE_MANAGEMENT_ENDPOINT);
        if (remoteMgmtParam) {
            return remoteMgmtParam;
        }
        else if (envParam) {
            return "ws://remote-mgmt." + envParam + ".test.edgeimpulse.com";
        }
        else if (localStorageParam) {
            return localStorageParam;
        }
        else {
            if (window.location.host === 'smartphone.acc2.edgeimpulse.com') {
                return REMOTE_MANAGEMENT_ENDPOINT.replace('edgeimpulse.com', 'acc2.edgeimpulse.com');
            }
            else {
                return REMOTE_MANAGEMENT_ENDPOINT;
            }
        }
    };
    exports.getRemoteManagementEndpoint = getRemoteManagementEndpoint;
    const storeRemoteManagementEndpoint = (remoteManagementEndpoint) => {
        console.log('storeRemoteManagementEndpoint', remoteManagementEndpoint);
        localStorage.setItem(LS_REMOTE_MANAGEMENT_ENDPOINT, remoteManagementEndpoint);
    };
    exports.storeRemoteManagementEndpoint = storeRemoteManagementEndpoint;
    const getStudioEndpoint = () => {
        let studioParam = new URLSearchParams(window.location.search).get('studio');
        let envParam = new URLSearchParams(window.location.search).get('env');
        let localStorageParam = localStorage.getItem(LS_STUDIO_ENDPOINT);
        if (studioParam) {
            return studioParam;
        }
        else if (envParam) {
            return "http://studio." + envParam + ".test.edgeimpulse.com";
        }
        else if (localStorageParam && localStorageParam.indexOf('wss://') === -1) {
            return localStorageParam;
        }
        else {
            if (window.location.host === 'smartphone.acc2.edgeimpulse.com') {
                return STUDIO_ENDPOINT.replace('edgeimpulse.com', 'acc2.edgeimpulse.com');
            }
            else {
                return STUDIO_ENDPOINT;
            }
        }
    };
    exports.getStudioEndpoint = getStudioEndpoint;
    const storeStudioEndpoint = (studioEndpoint) => {
        console.log('storeStudioEndpoint', studioEndpoint);
        localStorage.setItem(LS_STUDIO_ENDPOINT, studioEndpoint);
    };
    exports.storeStudioEndpoint = storeStudioEndpoint;
});
define("client/models", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
});
define("client/sensors/isensor", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
});
define("client/sensors/camera", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CameraSensor = void 0;
    const MAX_IMAGE_WIDTH = 640;
    class CameraSensor {
        constructor() {
            /* noop */
        }
        async hasSensor() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
                return false;
            }
            let devices = await navigator.mediaDevices.enumerateDevices();
            return devices.some(device => 'videoinput' === device.kind);
        }
        async checkPermissions(fromClick) {
            if (!this.hasSensor()) {
                throw new Error('Camera not present on this device');
            }
            if (this._stream) {
                return true;
            }
            if (fromClick) {
                this._stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        width: { ideal: 512 },
                        height: { ideal: 512 },
                        facingMode: {
                            ideal: 'environment'
                        }
                    }
                });
                const video = document.querySelector('video');
                if (!video) {
                    throw new Error('Element not found');
                }
                video.srcObject = this._stream;
                return true;
            }
            return false;
        }
        getProperties() {
            return {
                name: 'Camera',
                maxSampleLength: 100,
                frequencies: []
            };
        }
        takeSample(samplingOptions) {
            const video = document.querySelector('video');
            const canvas = document.querySelector('canvas');
            const capture = document.querySelector('#capture-camera');
            const captureButton = document.querySelector('#capture-camera-button');
            if (!video || !canvas || !capture || !captureButton) {
                throw new Error('Element not found');
            }
            if (!this._stream) {
                throw new Error('Video stream not set');
            }
            let streamWidth = this._stream.getVideoTracks()[0].getSettings().width || 256;
            let streamHeight = this._stream.getVideoTracks()[0].getSettings().height || 256;
            let imageWidth = samplingOptions.inputWidth || Math.min(streamWidth, MAX_IMAGE_WIDTH);
            let imageHeight = samplingOptions.inputHeight || (imageWidth / streamWidth) * streamHeight;
            canvas.width = imageWidth;
            canvas.height = imageHeight;
            return new Promise((resolve, reject) => {
                captureButton.onclick = () => {
                    captureButton.classList.add('disabled');
                    this.takeSnapshot(samplingOptions).then(resolve).catch(reject);
                };
            }).then((v) => {
                captureButton.classList.remove('disabled');
                return v;
            }).catch((err) => {
                captureButton.classList.remove('disabled');
                throw err;
            });
        }
        takeSnapshot(samplingOptions) {
            // @todo: this needs to be moved out to proper elements!
            const video = document.querySelector('video');
            const canvas = document.querySelector('canvas');
            if (!video || !canvas) {
                throw new Error('Element not found');
            }
            if (!this._stream) {
                throw new Error('Video stream not set');
            }
            let streamWidth = this._stream.getVideoTracks()[0].getSettings().width || 256;
            let streamHeight = this._stream.getVideoTracks()[0].getSettings().height || 256;
            let imageWidth = samplingOptions.inputWidth || Math.min(streamWidth, MAX_IMAGE_WIDTH);
            let imageHeight = samplingOptions.inputHeight || (imageWidth / streamWidth) * streamHeight;
            canvas.width = imageWidth;
            canvas.height = imageHeight;
            return new Promise((resolve, reject) => {
                const saveFrame = (blob) => {
                    if (!blob) {
                        return reject('Sampling failed');
                    }
                    resolve({
                        values: ['Ref-BINARY-image/jpeg (' + blob.size.toString() + ' bytes) xyz'],
                        intervalMs: 0,
                        sensors: [{
                                name: "image",
                                units: "rgba"
                            }],
                        attachments: [{
                                value: blob,
                                options: {
                                    contentType: 'image/jpeg'
                                }
                            }]
                    });
                };
                const context = canvas.getContext('2d');
                if (!context) {
                    throw new Error("Canvas not supported");
                }
                context.drawImage(video, 0, 0, imageWidth, imageHeight);
                if (samplingOptions.mode === 'raw') {
                    let imageData = context.getImageData(0, 0, imageWidth, imageHeight);
                    let values = [];
                    for (let ix = 0; ix < imageWidth * imageHeight; ix++) {
                        // tslint:disable-next-line: no-bitwise
                        values.push(Number((imageData.data[ix * 4] << 16)
                            // tslint:disable-next-line: no-bitwise
                            | (imageData.data[ix * 4 + 1] << 8)
                            // tslint:disable-next-line: no-bitwise
                            | (imageData.data[ix * 4 + 2])));
                    }
                    resolve({
                        values: values,
                        intervalMs: 0,
                        sensors: [{
                                name: "image",
                                units: "rgba"
                            }]
                    });
                }
                else {
                    canvas.toBlob(saveFrame, 'image/jpeg', 0.95);
                }
            });
        }
    }
    exports.CameraSensor = CameraSensor;
});
define("client/messages", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.sampleFinished = exports.sampleUploading = exports.sampleProcessing = exports.sampleStarted = exports.sampleRequestFailed = exports.sampleRequestReceived = exports.helloMessage = exports.dataMessage = void 0;
    const emptySignature = Array(64)
        .fill("0")
        .join("");
    const dataMessage = (settings, sample) => {
        return {
            protected: {
                ver: "v1",
                alg: "HS256",
                iat: Math.floor(Date.now() / 1000) // epoch time, seconds since 1970
            },
            signature: emptySignature,
            payload: {
                device_name: settings.device.deviceId,
                device_type: settings.device.deviceType,
                interval_ms: sample.intervalMs,
                sensors: sample.sensors,
                values: sample.values
            }
        };
    };
    exports.dataMessage = dataMessage;
    const helloMessage = (settings) => {
        return {
            hello: {
                version: 3,
                apiKey: settings.apiKey,
                deviceId: settings.device.deviceId,
                deviceType: settings.device.deviceType,
                connection: "ip",
                sensors: settings.device.sensors.map(s => {
                    return {
                        name: s.name,
                        maxSampleLengthS: s.maxSampleLength,
                        frequencies: s.frequencies
                    };
                }),
                supportsSnapshotStreaming: false
            }
        };
    };
    exports.helloMessage = helloMessage;
    exports.sampleRequestReceived = {
        sample: true
    };
    const sampleRequestFailed = (error) => {
        return {
            sample: false,
            error
        };
    };
    exports.sampleRequestFailed = sampleRequestFailed;
    exports.sampleStarted = {
        sampleStarted: true
    };
    exports.sampleProcessing = {
        sampleProcessing: true
    };
    exports.sampleUploading = {
        sampleUploading: true
    };
    exports.sampleFinished = {
        sampleFinished: true
    };
});
define("client/utils", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.createSignature = exports.parseMessage = exports.readFile = void 0;
    const readFile = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (reader.result instanceof ArrayBuffer) {
                    resolve(CBOR.decode(reader.result));
                }
                reject("Only support ArrayBuffer");
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    };
    exports.readFile = readFile;
    const parseMessage = async (event) => {
        if (event.data instanceof Blob) {
            return await exports.readFile(event.data);
        }
        else if (typeof event.data === "string") {
            if (event.data === 'pong')
                return null;
            return JSON.parse(event.data);
        }
        return null;
    };
    exports.parseMessage = parseMessage;
    const createSignature = async (hmacKey, data) => {
        // encoder to convert string to Uint8Array
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', // raw format of the key - should be Uint8Array
        enc.encode(hmacKey), {
            // algorithm details
            name: 'HMAC',
            hash: {
                name: 'SHA-256'
            }
        }, false, // export = false
        ['sign', 'verify'] // what this key can do
        );
        // Create signature for encoded input data
        const signature = await crypto.subtle.sign('HMAC', key, enc.encode(JSON.stringify(data)));
        // Convert back to Hex
        const b = new Uint8Array(signature);
        return Array.prototype.map
            .call(b, x => ('00' + x.toString(16)).slice(-2))
            .join('');
    };
    exports.createSignature = createSignature;
});
define("client/uploader", ["require", "exports", "client/utils", "client/settings"], function (require, exports, utils_1, settings_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Uploader = void 0;
    class Uploader {
        constructor(apiKey) {
            this._apiKey = apiKey;
        }
        encodeLabel(header) {
            let encodedHeader;
            try {
                encodedHeader = encodeURIComponent(header);
            }
            catch (ex) {
                encodedHeader = header;
            }
            return encodedHeader;
        }
        async uploadSample(details, data, sampleData) {
            console.log('uploader uploadSample', details, data, sampleData);
            data.signature = await utils_1.createSignature(details.hmacKey, data);
            let formData = new FormData();
            formData.append("message", new Blob([(JSON.stringify(data))], { type: "application/json" }), "message.json");
            if (sampleData.attachments && sampleData.attachments[0].value) {
                formData.append("image", sampleData.attachments[0].value, "image.jpg");
            }
            return new Promise((resolve, reject) => {
                let xml = new XMLHttpRequest();
                xml.onload = () => {
                    if (xml.status === 200) {
                        resolve(xml.responseText);
                    }
                    else {
                        reject('Failed to upload (status code ' + xml.status + '): ' + xml.responseText);
                    }
                };
                xml.onerror = () => reject();
                xml.open("post", settings_1.getIngestionApi() + details.path);
                xml.setRequestHeader("x-api-key", this._apiKey);
                xml.setRequestHeader("x-file-name", this.encodeLabel(details.label));
                xml.send(formData);
            });
        }
    }
    exports.Uploader = Uploader;
});
define("client/typed-event-emitter", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.once = exports.Emitter = void 0;
    /**
     * Type-safe event emitter.
     */
    class Emitter {
        constructor() {
            this._ = [];
            this.$ = Object.create(null);
        }
        on(type, callback) {
            (this.$[type] = this.$[type] || []).push(callback);
        }
        off(type, callback) {
            const stack = this.$[type];
            if (stack)
                stack.splice(stack.indexOf(callback) >>> 0, 1);
        }
        each(callback) {
            this._.push(callback);
        }
        none(callback) {
            this._.splice(this._.indexOf(callback) >>> 0, 1);
        }
        emit(type, ...args) {
            const stack = this.$[type];
            if (stack)
                stack.slice().forEach(fn => fn(...args));
            this._.slice().forEach(fn => fn({ type, args }));
        }
    }
    exports.Emitter = Emitter;
    /**
     * Helper to listen to an event once only.
     */
    function once(events, type, callback) {
        function self(...args) {
            events.off(type, self);
            return callback(...args);
        }
        events.on(type, self);
        return self;
    }
    exports.once = once;
});
define("client/classifier", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.EdgeImpulseClassifier = void 0;
    class EdgeImpulseClassifier {
        constructor(module) {
            this._initialized = false;
            this._module = module;
            this._module.onRuntimeInitialized = () => {
                this._initialized = true;
            };
        }
        init() {
            if (this._initialized === true)
                return Promise.resolve();
            return new Promise((resolve) => {
                this._module.onRuntimeInitialized = () => {
                    resolve();
                    this._initialized = true;
                };
            });
        }
        getProperties() {
            const ret = this._module.get_properties();
            let sensor;
            if (ret.sensor === 0 || ret.sensor === 2) {
                sensor = "accelerometer";
            }
            else if (ret.sensor === 1) {
                sensor = "microphone";
            }
            else if (ret.sensor === 3) {
                sensor = "camera";
            }
            else {
                throw new Error('Unknown sensor.');
            }
            return {
                sensor: sensor,
                frequency: ret.frequency,
                frameSampleCount: ret.frame_sample_count,
                inputWidth: ret.input_width,
                inputHeight: ret.input_height
            };
        }
        classify(rawData, debug = false) {
            if (!this._initialized)
                throw new Error('Module is not initialized');
            const obj = this._arrayToHeap(rawData);
            const ret = this._module.run_classifier(obj.buffer.byteOffset, rawData.length, debug);
            this._module._free(obj.ptr);
            if (ret.result !== 0) {
                throw new Error('Classification failed (err code: ' + ret.result + ')');
            }
            const jsResult = {
                anomaly: ret.anomaly,
                results: []
            };
            for (let cx = 0; cx < ret.size(); cx++) {
                let c = ret.get(cx);
                jsResult.results.push({ label: c.label, value: c.value, x: c.x, y: c.y, width: c.width, height: c.height });
                c.delete();
            }
            return jsResult;
        }
        _arrayToHeap(data) {
            const typedArray = new Float32Array(data);
            const numBytes = typedArray.length * typedArray.BYTES_PER_ELEMENT;
            const ptr = this._module._malloc(numBytes);
            const heapBytes = new Uint8Array(this._module.HEAPU8.buffer, ptr, numBytes);
            heapBytes.set(new Uint8Array(typedArray.buffer));
            return { ptr: ptr, buffer: heapBytes };
        }
    }
    exports.EdgeImpulseClassifier = EdgeImpulseClassifier;
});
define("client/classification-loader", ["require", "exports", "client/typed-event-emitter", "client/classifier"], function (require, exports, typed_event_emitter_1, classifier_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ClassificationLoader = void 0;
    class ClassificationLoader extends typed_event_emitter_1.Emitter {
        constructor(studioHostUrl, apiKey) {
            super();
            this._studioHost = studioHostUrl + '/v1/api';
            this._wsHost = studioHostUrl.replace('http', 'ws');
            this._apiKey = apiKey;
        }
        async load() {
            this.emit('status', 'Retrieving projects...');
            const project = await this.getProject();
            if (!project) {
                throw new Error('Could not find any projects');
            }
            const projectId = project.id;
            let blob;
            this.emit('status', 'Downloading deployment...');
            try {
                blob = await this.downloadDeployment(projectId);
            }
            catch (ex) {
                let m = typeof ex === 'string' ? ex : (ex.message || ex.toString());
                if (m.indexOf('No deployment yet') === -1) {
                    throw ex;
                }
                this.emit('status', 'Building project...');
                await this.buildDeployment(projectId);
                this.emit('status', 'Downloading deployment...');
                blob = await this.downloadDeployment(projectId);
            }
            console.log('blob', blob);
            this.emit('status', 'Received blob (' + Math.floor(blob.size / 1024) + ' KB), extracting...');
            const data = await this.unzip(blob);
            this.emit('status', 'Extracted ' + data.length + ' files');
            const wasmFile = data.find(d => d.filename.endsWith('.wasm'));
            if (!wasmFile) {
                throw new Error('Cannot find .wasm file in ZIP file');
            }
            const jsFile = data.find(d => d.filename.endsWith('.js'));
            if (!jsFile) {
                throw new Error('Cannot find .js file in ZIP file');
            }
            const wasmUrl = await this.blobToDataUrl(wasmFile.blob);
            this.emit('status', 'WASM URL is ' + wasmUrl.substr(0, 100) + '...');
            let loaderText = await this.blobToText(jsFile.blob);
            loaderText = 'window.WasmLoader = function (wasmBinaryFile) {\n' +
                loaderText + '\n' +
                'return Module;\n' +
                '}';
            loaderText = loaderText.replace('var wasmBinaryFile="edge-impulse-standalone.wasm"', '');
            console.log('loaderText', loaderText);
            const script = document.createElement('script');
            script.innerHTML = loaderText;
            window.document.body.append(script);
            const module = window.WasmLoader(wasmUrl);
            this.emit('status', 'Loaded WASM module');
            const classifier = new classifier_1.EdgeImpulseClassifier(module);
            await classifier.init();
            this.emit('status', 'Initialized classifier');
            return classifier;
        }
        async getProject() {
            return new Promise((resolve, reject) => {
                const x = new XMLHttpRequest();
                x.open('GET', `${this._studioHost}/projects`);
                x.onload = () => {
                    if (x.status !== 200) {
                        reject('No projects found: ' + x.status + ' - ' + JSON.stringify(x.response));
                    }
                    else {
                        if (!x.response.success) {
                            reject(x.response.error);
                        }
                        else {
                            resolve(x.response.projects[0]);
                        }
                    }
                };
                x.onerror = err => reject(err);
                x.responseType = 'json';
                x.setRequestHeader('x-api-key', this._apiKey);
                x.send();
            });
        }
        async getDevelopmentKeys(projectId) {
            return new Promise((resolve, reject) => {
                const x = new XMLHttpRequest();
                x.open('GET', `${this._studioHost}/${projectId}/devkeys`);
                x.onload = () => {
                    if (x.status !== 200) {
                        reject('No development keys found: ' + x.status + ' - ' + JSON.stringify(x.response));
                    }
                    else {
                        if (!x.response.success) {
                            reject(x.response.error);
                        }
                        else {
                            resolve({
                                apiKey: x.response.apiKey,
                                hmacKey: x.response.hmacKey
                            });
                        }
                    }
                };
                x.onerror = err => reject(err);
                x.responseType = 'json';
                x.setRequestHeader('x-api-key', this._apiKey);
                x.send();
            });
        }
        async downloadDeployment(projectId) {
            return new Promise((resolve, reject) => {
                const x = new XMLHttpRequest();
                x.open('GET', `${this._studioHost}/${projectId}/deployment/download?type=wasm&modelType=float32`);
                x.onload = () => {
                    if (x.status !== 200) {
                        const reader = new FileReader();
                        reader.onload = () => {
                            reject('No deployment yet');
                        };
                        reader.readAsText(x.response);
                    }
                    else {
                        resolve(x.response);
                    }
                };
                x.onerror = err => reject(err);
                x.responseType = 'blob';
                x.setRequestHeader('x-api-key', this._apiKey);
                x.send();
            });
        }
        async buildDeployment(projectId) {
            let ws = await this.getWebsocket(projectId);
            // select f32 models for all keras blocks
            let impulseRes = await axios({
                url: `${this._studioHost}/${projectId}/impulse`,
                method: 'GET',
                headers: {
                    "x-api-key": this._apiKey,
                    "Content-Type": "application/json"
                }
            });
            if (impulseRes.status !== 200) {
                throw new Error('Failed to start deployment: ' + impulseRes.status + ' - ' + impulseRes.statusText);
            }
            let jobRes = await axios({
                url: `${this._studioHost}/${projectId}/jobs/build-ondevice-model?type=wasm`,
                method: "POST",
                headers: {
                    "x-api-key": this._apiKey,
                    "Content-Type": "application/json"
                },
                data: {
                    engine: 'tflite',
                    modelType: 'float32'
                }
            });
            if (jobRes.status !== 200) {
                throw new Error('Failed to start deployment: ' + jobRes.status + ' - ' + jobRes.statusText);
            }
            let jobData = jobRes.data;
            if (!jobData.success) {
                throw new Error(jobData.error);
            }
            let jobId = jobData.id;
            console.log('Created job with ID', jobId);
            let allData = [];
            let p = new Promise((resolve2, reject2) => {
                let pingIv = setInterval(() => {
                    ws.send('2');
                }, 25000);
                let checkJobStatusIv = setInterval(async () => {
                    try {
                        let jobStatus = await axios({
                            url: `${this._studioHost}/${projectId}/jobs/${jobId}/status`,
                            method: "GET",
                            headers: {
                                "x-api-key": this._apiKey,
                                "Content-Type": "application/json"
                            }
                        });
                        if (jobStatus.status !== 200) {
                            throw new Error('Failed to start deployment: ' + jobStatus.status + ' - ' +
                                jobStatus.statusText);
                        }
                        let status = jobStatus.data;
                        if (!status.success) {
                            // tslint:disable-next-line: no-unsafe-any
                            throw new Error(status.error);
                        }
                        if (status.job.finished) {
                            if (status.job.finishedSuccessful) {
                                clearInterval(checkJobStatusIv);
                                resolve2();
                            }
                            else {
                                clearInterval(checkJobStatusIv);
                                reject2('Failed to build binary');
                            }
                        }
                    }
                    catch (ex2) {
                        let ex = ex2;
                        console.warn('Failed to check job status', ex.message || ex.toString());
                    }
                }, 3000);
                ws.onmessage = (msg) => {
                    let data = msg.data;
                    try {
                        let m = JSON.parse(data.replace(/^[0-9]+/, ''));
                        if (m[0] === 'job-data-' + jobId) {
                            // tslint:disable-next-line: no-unsafe-any
                            this.emit('buildProgress', m[1].data);
                            allData.push(m[1].data);
                        }
                        else if (m[0] === 'job-finished-' + jobId) {
                            let success = m[1].success;
                            this.emit('buildProgress', null);
                            // console.log(BUILD_PREFIX, 'job finished', success);
                            if (success) {
                                clearInterval(checkJobStatusIv);
                                resolve2();
                            }
                            else {
                                clearInterval(checkJobStatusIv);
                                reject2('Failed to build binary');
                            }
                        }
                    }
                    catch (ex) {
                        // console.log(BUILD_PREFIX, 'Failed to parse', data);
                    }
                };
                ws.onclose = async () => {
                    clearInterval(pingIv);
                    reject2('Websocket was closed');
                };
                setTimeout(() => {
                    reject2('Building did not succeed within 5 minutes: ' + allData.join(''));
                }, 300000);
            });
            p.then(() => {
                ws.close();
            }).catch((err) => {
                ws.close();
            });
            return p;
        }
        async getWebsocket(projectId) {
            let tokenRes = await axios({
                url: `${this._studioHost}/${projectId}/socket-token`,
                method: "GET",
                headers: {
                    "x-api-key": this._apiKey,
                    "Content-Type": "application/json"
                }
            });
            if (tokenRes.status !== 200) {
                throw new Error('Failed to acquire socket token: ' + tokenRes.status + ' - ' + tokenRes.statusText);
            }
            let tokenData = tokenRes.data;
            if (!tokenData.success) {
                throw new Error(tokenData.error);
            }
            let ws = new WebSocket(this._wsHost + '/socket.io/?token=' +
                tokenData.token.socketToken + '&EIO=3&transport=websocket');
            return new Promise((resolve, reject) => {
                ws.onopen = () => {
                    console.log('websocket is open');
                };
                ws.onclose = () => {
                    reject('websocket was closed');
                };
                ws.onerror = err => {
                    reject('websocket error: ' + err);
                };
                ws.onmessage = msg => {
                    try {
                        let m = JSON.parse(msg.data.replace(/^[0-9]+/, ''));
                        if (m[0] === 'hello') {
                            if (m[1].hello && m[1].hello.version === 1) {
                                resolve(ws);
                            }
                            else {
                                reject(JSON.stringify(m[1]));
                            }
                        }
                    }
                    catch (ex) {
                        console.log('Failed to parse', msg.data);
                    }
                };
                setTimeout(() => {
                    reject('Did not authenticate with the websocket API within 10 seconds');
                }, 10000);
            });
        }
        async unzip(blob) {
            const ret = [];
            return new Promise((resolve, reject) => {
                window.blb = blob;
                window.zip.createReader(new window.zip.BlobReader(blob), (reader) => {
                    reader.getEntries((entries) => {
                        for (const e of entries) {
                            e.getData(new window.zip.BlobWriter(), (file) => {
                                ret.push({
                                    filename: e.filename,
                                    blob: file
                                });
                                if (ret.length === entries.length) {
                                    return resolve(ret);
                                }
                            });
                        }
                    });
                }, (error) => {
                    reject(error);
                });
            });
        }
        async blobToDataUrl(blob) {
            return new Promise((resolve, reject) => {
                const a = new FileReader();
                a.onload = e => resolve(((e.target && e.target.result) || '').toString());
                a.onerror = err => reject(err);
                a.readAsDataURL(blob);
            });
        }
        async blobToText(blob) {
            return new Promise(resolve => {
                const reader = new FileReader();
                reader.addEventListener('loadend', (e) => {
                    const text = reader.result;
                    resolve((text || '').toString());
                });
                reader.readAsText(blob, 'ascii');
            });
        }
        async sleep(ms) {
            return new Promise((resolve) => {
                setTimeout(resolve, ms);
            });
        }
    }
    exports.ClassificationLoader = ClassificationLoader;
});
define("client/notify", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Notify = void 0;
    class Notify {
        /**
         * Show a notification
         * @param title Title
         * @param message Message
         * @param placement Location of the notification item
         * @param align Alignment of the notification item
         * @param icon Which icon to show (e.g. fas fa-bolt)
         * @param type Styling of the notification
         */
        static notify(title, message, placement, align, icon, type) {
            // tslint:disable-next-line: no-unsafe-any
            $.notify({
                icon: icon,
                title: title,
                message: message,
                url: ''
            }, {
                element: 'body',
                type: type,
                allow_dismiss: true,
                placement: {
                    from: placement,
                    align: align
                },
                offset: {
                    x: 15,
                    y: 15 // Unless there'll be alignment issues as this value is targeted in CSS
                },
                spacing: 10,
                z_index: 1080,
                delay: 2500,
                url_target: '_blank',
                mouse_over: false,
                animate: {
                    enter: undefined,
                    exit: undefined
                },
                template: '<div data-notify="container" class="alert alert-dismissible alert-{0} alert-notify" role="alert">' +
                    '<span class="alert-icon" data-notify="icon"></span> ' +
                    '<div class="alert-text"> ' +
                    '<span class="alert-title" data-notify="title">{1}</span> ' +
                    '<span data-notify="message">{2}</span>' +
                    '</div>' +
                    // '<div class="progress" data-notify="progressbar">' +
                    // '<div class="progress-bar progress-bar-{0}" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%;"></div>' +
                    // '</div>' +
                    // '<a href="{3}" target="{4}" data-notify="url"></a>' +
                    '<button type="button" class="close" data-notify="dismiss" aria-label="Close"><span aria-hidden="true">&times;</span></button>' +
                    '</div>'
            });
        }
        /**
         * Show an alert
         * @param title Alert title
         * @param message Alert message
         * @param type Styling
         * @returns a promise that resolves when the alert closes
         */
        static async alert(title, message, type, onBeforeOpen) {
            let modalType = type === 'danger' ? 'error' : type;
            return new Promise((resolve) => {
                // tslint:disable-next-line: no-unsafe-any
                swal({
                    title: title,
                    text: message,
                    type: modalType,
                    buttonsStyling: false,
                    confirmButtonClass: 'btn btn-' + type,
                    onClose: resolve,
                    allowEnterKey: true,
                    onBeforeOpen: (el) => {
                        el.id = 'notify-' + (++this._notifyId);
                        if (onBeforeOpen) {
                            onBeforeOpen(el);
                        }
                    }
                });
            });
        }
        /**
         * Show a confirm button
         * @param title Alert title
         * @param message Alert message
         * @param confirmText Text on the confirm button
         * @param type Styling
         * @returns a promise that resolves when the alert closes. Either true or false depending on confirmation.
         */
        static async confirm(title, message, confirmText, modalType, btnType) {
            // tslint:disable-next-line: no-unsafe-any
            let v = await swal({
                title: title,
                text: message,
                type: modalType,
                cancelButtonClass: 'btn',
                showCancelButton: true,
                buttonsStyling: false,
                confirmButtonClass: 'btn btn-' + btnType,
                confirmButtonText: confirmText,
                allowEnterKey: true,
                closeOnConfirm: true,
                reverseButtons: true,
                onBeforeOpen: (el) => {
                    el.id = 'notify-' + (++this._notifyId);
                    let q = el.querySelector('.swal2-question');
                    if (q) {
                        q.classList.add('text-' + btnType);
                        q.classList.add('border-' + btnType);
                    }
                }
            });
            if (v.dismiss) {
                return false;
            }
            return true;
        }
        /**
         * Show a prompt box
         * @param title Alert title
         * @param message Alert message
         * @param confirmText Text on the confirm button
         * @param currentValue Default value of the confirm box
         * @param type Styling
         * @returns a promise that resolves when the alert closes. Either false (if dismissed) or a string
         */
        static async prompt(title, message, confirmText, currentValue, modalType, btnType) {
            // tslint:disable-next-line: no-unsafe-any
            let v = await swal({
                title: title,
                text: message,
                type: modalType,
                cancelButtonClass: 'btn',
                showCancelButton: true,
                buttonsStyling: false,
                confirmButtonClass: 'btn btn-' + btnType,
                confirmButtonText: confirmText,
                allowEnterKey: true,
                closeOnConfirm: true,
                reverseButtons: true,
                input: 'text',
                inputValue: currentValue,
                onBeforeOpen: (el) => {
                    el.id = 'notify-' + (++this._notifyId);
                    let q = el.querySelector('.swal2-question');
                    if (q) {
                        q.classList.add('text-' + btnType);
                        q.classList.add('border-' + btnType);
                    }
                },
                onOpen: (el) => {
                    let input = el.querySelector('.swal2-input');
                    if (input) {
                        input.focus();
                        input.select();
                    }
                }
            });
            if (v.dismiss) {
                return false;
            }
            return v.value || '';
        }
    }
    exports.Notify = Notify;
    Notify._notifyId = 0;
});
define("client/camera-collection-views", ["require", "exports", "client/settings", "client/sensors/camera", "client/uploader", "client/classification-loader", "client/messages", "client/notify"], function (require, exports, settings_2, camera_1, uploader_1, classification_loader_1, messages_1, notify_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CameraDataCollectionClientViews = void 0;
    class CameraDataCollectionClientViews {
        constructor() {
            this._views = {
                loading: document.querySelector('#loading-view'),
                qrcode: document.querySelector('#qrcode-view'),
                connectionFailed: document.querySelector('#remote-mgmt-failed'),
                capture: document.querySelector('#capture-camera'),
                permission: document.querySelector('#permission-view')
            };
            this._elements = {
                deviceId: document.querySelector('#connected-device-id'),
                connectionFailedMessage: document.querySelector('#connection-failed-message'),
                grantPermission: document.querySelector('#grant-permissions-button'),
                loadingText: document.querySelector('#loading-view-text'),
                captureButton: document.querySelector('#capture-camera-button'),
                labelLink: document.querySelector('#camera-label-link'),
                labelText: document.querySelector('#camera-label-text'),
                categoryLink: document.querySelector('#camera-category-link'),
                categoryText: document.querySelector('#camera-category-text'),
                categorySelect: document.querySelector('#camera-category-select'),
                capturedCount: document.querySelector('#images-capture-count')
            };
            this._sensors = [];
            this._numCaptures = 0;
            this._hmacKey = '0';
        }
        async init() {
            var _a;
            settings_2.storeDeviceId(settings_2.getDeviceId());
            const camera = new camera_1.CameraSensor();
            if (!await camera.hasSensor()) {
                this._elements.connectionFailedMessage.textContent = 'No camera detected';
                this.switchView(this._views.connectionFailed);
                return;
            }
            this._sensors.push(camera);
            // if we are not on a platform that overrides the menu action we'll move it to the place
            // of the textbox
            let selectStyle = window.getComputedStyle(this._elements.categorySelect);
            if (selectStyle.webkitAppearance !== 'menulist-button') {
                this._elements.categoryText.style.display = 'none';
                (_a = this._elements.categoryText.parentNode) === null || _a === void 0 ? void 0 : _a.insertBefore(this._elements.categorySelect, this._elements.categoryText);
            }
            if (settings_2.getApiKey()) {
                settings_2.storeApiKey(settings_2.getApiKey());
                try {
                    this.switchView(this._views.loading);
                    let devKeys = await this.getDevelopmentApiKeys(settings_2.getApiKey());
                    if (devKeys.hmacKey) {
                        this._hmacKey = devKeys.hmacKey;
                    }
                    this._elements.labelText.textContent = localStorage.getItem('last-camera-label') || 'unknown';
                    this._elements.categoryText.textContent = localStorage.getItem('last-camera-category') || 'split';
                    this._elements.categorySelect.value = this._elements.categoryText.textContent;
                    this._uploader = new uploader_1.Uploader(settings_2.getApiKey());
                    this._elements.grantPermission.textContent = 'Give access to the camera';
                    let sensor = this._sensors.find(s => s.getProperties().name.toLowerCase() === 'camera');
                    if (sensor && await sensor.checkPermissions(false)) {
                        console.log('sensor checkPermissions OK');
                        this.grantPermission();
                    }
                    else {
                        this.switchView(this._views.permission);
                        this._elements.grantPermission.onclick = ev => {
                            this.grantPermission();
                        };
                    }
                }
                catch (ex) {
                    console.error('Failed to load', ex);
                    this._elements.connectionFailedMessage.textContent = (ex.message || ex.toString());
                    this.switchView(this._views.connectionFailed);
                }
            }
            else {
                this.switchView(this._views.qrcode);
            }
            this._elements.captureButton.onclick = async (ev) => {
                ev.preventDefault();
                if (!this._uploader)
                    return;
                let origHtml = this._elements.captureButton.innerHTML;
                try {
                    this._elements.captureButton.innerHTML = '<i class="fa fa-camera mr-2"></i>Uploading...';
                    this._elements.captureButton.classList.add('disabled');
                    console.log('gonna take sample');
                    let sample = await camera.takeSnapshot({});
                    console.log('took sample');
                    if (!sample.attachments || sample.attachments.length === 0 || !sample.attachments[0].value) {
                        throw new Error('Attachment is supposed to present');
                    }
                    let category = this._elements.categoryText.textContent || 'training';
                    if (this._elements.categoryText.textContent === 'split') {
                        if (this._numCaptures > 0) {
                            category = await this.getCategoryFromBlob(sample.attachments[0].value);
                        }
                        else {
                            category = 'training';
                        }
                    }
                    this._numCaptures = this._numCaptures + 1;
                    let details = {
                        hmacKey: this._hmacKey,
                        interval: 0,
                        label: this._elements.labelText.textContent || 'unknown',
                        length: 0,
                        path: '/api/' + category + '/data',
                        sensor: 'Camera'
                    };
                    let data = messages_1.dataMessage({
                        apiKey: settings_2.getApiKey(),
                        device: {
                            deviceId: settings_2.getDeviceId(),
                            sensors: [camera].map(s => {
                                let p = s.getProperties();
                                return {
                                    name: p.name,
                                    frequencies: p.frequencies,
                                    maxSampleLength: p.maxSampleLength
                                };
                            }),
                            deviceType: 'MOBILE_CLIENT'
                        }
                    }, sample);
                    console.log('details', details, 'data', data, 'sample', sample);
                    // tslint:disable-next-line: no-floating-promises
                    (async () => {
                        if (!this._uploader)
                            return;
                        try {
                            let filename = await this._uploader.uploadSample(details, data, sample);
                            $.notifyClose();
                            notify_1.Notify.notify('', 'Uploaded "' + filename + '" to ' + category + ' category', 'top', 'center', 'far fa-check-circle', 'success');
                        }
                        catch (ex) {
                            $.notifyClose();
                            notify_1.Notify.notify('Failed to upload', ex.message || ex.toString(), 'top', 'center', 'far fa-times-circle', 'danger');
                        }
                    })();
                    // give some indication that the button was pressed
                    await this.sleep(100);
                    let curr = Number(this._elements.capturedCount.textContent || '0');
                    this._elements.capturedCount.textContent = (curr + 1).toString();
                }
                catch (ex) {
                    alert('Failed to upload: ' + (ex.message || ex.toString()));
                }
                finally {
                    this._elements.captureButton.innerHTML = origHtml;
                    this._elements.captureButton.classList.remove('disabled');
                }
            };
            this._elements.labelLink.onclick = ev => {
                ev.preventDefault();
                let v = prompt('Enter a label', this._elements.labelText.textContent || '');
                if (v) {
                    if (v && this._elements.labelText.textContent !== v) {
                        this._elements.capturedCount.textContent = '0';
                    }
                    this._elements.labelText.textContent = v.toLowerCase();
                    localStorage.setItem('last-camera-label', this._elements.labelText.textContent);
                }
            };
            this._elements.categorySelect.oninput = () => {
                if (this._elements.categoryText.textContent !== this._elements.categorySelect.value) {
                    this._elements.capturedCount.textContent = '0';
                }
                this._elements.categoryText.textContent = this._elements.categorySelect.value;
                localStorage.setItem('last-camera-category', this._elements.categoryText.textContent);
            };
            this._elements.categoryLink.onclick = ev => {
                ev.preventDefault();
                console.log('category link click', ev);
                let element = this._elements.categorySelect;
                let event;
                event = document.createEvent('MouseEvents');
                event.initMouseEvent('mousedown', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
                element.dispatchEvent(event);
                // this._elements.categorySelect.focus();
            };
        }
        switchView(view) {
            for (const k of Object.keys(this._views)) {
                this._views[k].style.display = 'none';
            }
            view.style.display = '';
        }
        grantPermission() {
            let sensor = this._sensors.find(s => s.getProperties().name.toLowerCase() === 'camera');
            if (!sensor) {
                this._elements.connectionFailedMessage.textContent = 'Could not find camera';
                this.switchView(this._views.connectionFailed);
                return;
            }
            sensor.checkPermissions(true).then(result => {
                if (result) {
                    this.switchView(this._views.capture);
                    if (!this._elements.labelText.textContent) {
                        this._elements.labelLink.click();
                    }
                }
                else {
                    alert('User has rejected camera permissions');
                }
            }).catch(err => {
                console.error(err);
                this._elements.connectionFailedMessage.textContent = err;
                this.switchView(this._views.connectionFailed);
            });
        }
        sleep(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        }
        async getDevelopmentApiKeys(apiKey) {
            let l = new classification_loader_1.ClassificationLoader(settings_2.getStudioEndpoint(), apiKey);
            let projectId = await l.getProject();
            try {
                return await l.getDevelopmentKeys(projectId.id);
            }
            catch (ex) {
                console.warn('Could not find development keys for project ' + projectId, ex);
                return {
                    apiKey: undefined,
                    hmacKey: undefined
                };
            }
        }
        async getCategoryFromBlob(blob) {
            let hash = await new Promise((resolve, reject) => {
                let a = new FileReader();
                a.readAsArrayBuffer(blob);
                a.onloadend = async () => {
                    if (!a.result || typeof a.result === 'string') {
                        return reject('Failed to calculate hash ' + a.error);
                    }
                    let hashBuffer = await crypto.subtle.digest('SHA-256', a.result);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                    resolve(hashHex);
                };
            });
            while (hash.length > 0 && hash[0] === 'f') {
                hash = hash.substr(1);
            }
            if (hash.length === 0) {
                throw new Error('Failed to calculate SHA256 hash of buffer');
            }
            let firstHashChar = hash[0];
            if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b'].indexOf(firstHashChar) > -1) {
                return 'training';
            }
            else {
                return 'testing';
            }
        }
    }
    exports.CameraDataCollectionClientViews = CameraDataCollectionClientViews;
});
define("client/sensors/accelerometer", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AccelerometerSensor = void 0;
    class AccelerometerSensor {
        constructor() {
            this._permissionGranted = false;
            /* noop */
        }
        async hasSensor() {
            return typeof DeviceMotionEvent !== 'undefined';
        }
        checkPermissions(fromClick) {
            if (!this.hasSensor()) {
                throw new Error('Accelerometer not present on this device');
            }
            if (typeof DeviceMotionEvent.requestPermission !== 'function') {
                return Promise.resolve(true);
            }
            if (this._permissionGranted) {
                return Promise.resolve(true);
            }
            return DeviceMotionEvent.requestPermission().then((response) => {
                return response === 'granted';
            }).catch((err) => {
                let msg = typeof err === 'string' ? err : (err.message || err.toString());
                if (msg.indexOf('requires a user gesture to prompt') > -1) {
                    return Promise.resolve(false);
                }
                else {
                    throw err;
                }
            });
        }
        getProperties() {
            return {
                name: 'Accelerometer',
                maxSampleLength: 5 * 60,
                frequencies: [62.5]
            };
        }
        takeSample(samplingOptions) {
            return new Promise((resolve, _reject) => {
                if (!samplingOptions.frequency) {
                    throw new Error('Frequency not specified');
                }
                if (!samplingOptions.length) {
                    throw new Error('Frequency not specified');
                }
                let frequency = samplingOptions.frequency;
                let length = samplingOptions.length;
                let currentSample;
                let sampleValues = [];
                let firstEvent = true;
                let iv;
                // check if we have any data in the first second...
                const checkSensorTimeout = window.setTimeout(() => {
                    if (sampleValues.length === 0) {
                        clearInterval(iv);
                        return _reject('Was not able to capture any measurements from this device. ' +
                            'This is probably a permission issue on the mobile client.');
                    }
                }, 1000);
                const newSensorEvent = (event) => {
                    if (event.accelerationIncludingGravity) {
                        if (firstEvent) {
                            firstEvent = false;
                            console.log('setting interval', 1000 / frequency, 'length', length);
                            iv = setInterval(() => {
                                if (currentSample) {
                                    sampleValues.push([
                                        currentSample.x,
                                        currentSample.y,
                                        currentSample.z
                                    ]);
                                }
                            }, 1000 / frequency);
                            setTimeout(() => {
                                clearTimeout(checkSensorTimeout);
                                clearInterval(iv);
                                window.removeEventListener('devicemotion', newSensorEvent);
                                console.log('done', sampleValues.length, 'samples');
                                resolve({
                                    values: sampleValues.slice(0, Math.floor(length / (1000 / frequency))),
                                    intervalMs: 1000 / frequency,
                                    sensors: [{
                                            name: "accX",
                                            units: "m/s2"
                                        },
                                        {
                                            name: "accY",
                                            units: "m/s2"
                                        },
                                        {
                                            name: "accZ",
                                            units: "m/s2"
                                        }
                                    ],
                                });
                            }, length + 200);
                        }
                        currentSample = {
                            x: event.accelerationIncludingGravity.x || 0,
                            y: event.accelerationIncludingGravity.y || 0,
                            z: event.accelerationIncludingGravity.z || 0
                        };
                    }
                };
                window.addEventListener('devicemotion', newSensorEvent);
            });
        }
        ;
    }
    exports.AccelerometerSensor = AccelerometerSensor;
});
define("client/sensors/microphone", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MicrophoneSensor = void 0;
    class MicrophoneSensor {
        constructor() {
            this._constraints = {
                audio: true,
                video: false
            };
            if (this.hasSensor()) {
                this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
        }
        async hasSensor() {
            return typeof window.AudioContext !== 'undefined' || typeof window.webkitAudioContext !== 'undefined';
        }
        async checkPermissions(fromButton) {
            var _a;
            if (!this.hasSensor()) {
                throw new Error('Accelerometer not present on this device');
            }
            if (this._recorder) {
                return true;
            }
            if (!fromButton) {
                return false;
            }
            if (((_a = this._audioContext) === null || _a === void 0 ? void 0 : _a.state) === "suspended") {
                // Resume after user interaction
                // https://developers.google.com/web/updates/2017/09/autoplay-policy-changes#webaudio
                await this._audioContext.resume();
            }
            this._stream = await navigator.mediaDevices.getUserMedia(this._constraints);
            return true;
        }
        getProperties() {
            return {
                name: 'Microphone',
                maxSampleLength: 1 * 60,
                frequencies: [16000, 8000, 11000, 32000, 44100, 48000]
            };
        }
        takeSample(samplingOptions) {
            return new Promise((resolve, reject) => {
                if (!this._stream) {
                    return reject('No audio stream');
                }
                if (!samplingOptions.frequency) {
                    throw new Error('Frequency not specified');
                }
                if (!samplingOptions.length) {
                    throw new Error('Frequency not specified');
                }
                let length = samplingOptions.length;
                let frequency = samplingOptions.frequency;
                if (!this._audioContext) {
                    return reject('No audio context');
                }
                // use the stream
                let input = this._audioContext.createMediaStreamSource(this._stream);
                // Create the Recorder object and configure to record mono sound (1 channel)
                // Recording 2 channels will double the file size
                if (!this._recorder) {
                    this._recorder = new Recorder(input, {
                        numChannels: 1
                    });
                    this._recorder.record();
                }
                else {
                    this._recorder.clear();
                }
                setTimeout(() => {
                    if (!this._stream)
                        return;
                    // tell the recorder to stop the recording
                    // this._stream.getAudioTracks()[0].stop();
                    if (samplingOptions.processing) {
                        samplingOptions.processing();
                    }
                    if (!this._recorder)
                        return;
                    // create the wav blob and pass it on to createDownloadLink
                    this._recorder.exportWAV(async (blob) => {
                        let buffer = await new Response(blob).arrayBuffer();
                        console.log('done recording', buffer.byteLength);
                        let wavFileItems = new Int16Array(buffer, 44);
                        let eiData = [];
                        for (let w of wavFileItems) {
                            eiData.push(w);
                        }
                        // this._stream = undefined;
                        resolve({
                            values: eiData.slice(0, length * (frequency / 1000)),
                            intervalMs: 1000 / frequency,
                            sensors: [{
                                    name: "audio",
                                    units: "wav"
                                }
                            ],
                        });
                    }, undefined, frequency);
                }, samplingOptions.continuousMode ? length : length + 100);
            });
        }
    }
    exports.MicrophoneSensor = MicrophoneSensor;
});
define("client/moving-average-filter", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MovingAverageFilter = void 0;
    class MovingAverageFilter {
        /**
         * Create a moving average filter to smooth over results
         * @param filterSize Size of the filter, e.g. number of classifications per second for audio models
         * @param labels All labels in the model
         */
        constructor(filterSize, labels) {
            this._state = {};
            this._filterSize = filterSize;
            for (let l of labels) {
                this._state[l] = {
                    runningSum: 0,
                    buffer: Array.from({ length: filterSize }).map(n => 0),
                    bufferIdx: 0
                };
            }
        }
        /**
         * Apply the moving average filter over incoming results
         * @param result Classification results
         * @returns Classification results with the filter applied
         */
        run(result) {
            if (!result.results) {
                throw new Error('Moving average filter is only supported on classification results');
            }
            for (let l of result.results) {
                let maf = this._state[l.label];
                if (!maf) {
                    throw new Error('Unexpected label "' + l + '" in classification, was not passed into ' +
                        'constructor of the filter');
                }
                maf.runningSum -= maf.buffer[maf.bufferIdx];
                maf.runningSum += Number(l.value);
                maf.buffer[maf.bufferIdx] = Number(l.value);
                if (++maf.bufferIdx >= this._filterSize) {
                    maf.bufferIdx = 0;
                }
                l.value = maf.runningSum / this._filterSize;
            }
            return result;
        }
    }
    exports.MovingAverageFilter = MovingAverageFilter;
});
define("client/classification-views", ["require", "exports", "client/settings", "client/sensors/accelerometer", "client/sensors/microphone", "client/sensors/camera", "client/classification-loader", "client/notify", "client/moving-average-filter"], function (require, exports, settings_3, accelerometer_1, microphone_1, camera_2, classification_loader_2, notify_2, moving_average_filter_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ClassificationClientViews = void 0;
    class ClassificationClientViews {
        constructor() {
            this._views = {
                loading: document.querySelector('#loading-view'),
                qrcode: document.querySelector('#qrcode-view'),
                connectionFailed: document.querySelector('#remote-mgmt-failed'),
                selectSensor: document.querySelector('#permission-view'),
                inferencing: document.querySelector('#inferencing-in-progress'),
            };
            this._elements = {
                deviceId: document.querySelector('#connected-device-id'),
                connectionFailedMessage: document.querySelector('#connection-failed-message'),
                loadingText: document.querySelector('#loading-view-text'),
                grantPermission: document.querySelector('#grant-permissions-button'),
                inferencingSamplingBody: document.querySelector('#inferencing-sampling-body'),
                inferencingTimeLeft: document.querySelector('#inferencing-time-left'),
                inferencingMessage: document.querySelector('#inferencing-recording-data-message'),
                inferencingResult: document.querySelector('#inferencing-result'),
                inferencingResultTable: document.querySelector('#inferencing-result table'),
                buildProgress: document.querySelector('#build-progress'),
                inferenceCaptureBody: document.querySelector('#capture-camera'),
                inferenceCaptureButton: document.querySelector('#capture-camera-button'),
                inferenceRecordingMessageBody: document.querySelector('#inference-recording-message-body'),
                switchToDataCollection: document.querySelector('#switch-to-data-collection'),
                cameraInner: document.querySelector('.capture-camera-inner'),
                cameraVideo: document.querySelector('.capture-camera-inner video'),
                cameraCanvas: document.querySelector('.capture-camera-inner canvas'),
            };
            this._sensors = [];
            this._firstInference = true;
            this._inferenceCount = 0;
            this._isObjectDetection = false;
            this._colors = [
                '#e6194B', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#42d4f4', '#f032e6', '#fabed4',
                '#469990', '#dcbeff', '#9A6324', '#fffac8', '#800000', '#aaffc3',
            ];
            this._labelToColor = {};
        }
        async init() {
            settings_3.storeDeviceId(settings_3.getDeviceId());
            const accelerometer = new accelerometer_1.AccelerometerSensor();
            if (await accelerometer.hasSensor()) {
                console.log('has accelerometer');
                this._sensors.push(accelerometer);
            }
            const microphone = new microphone_1.MicrophoneSensor();
            if (await microphone.hasSensor()) {
                console.log('has microphone');
                this._sensors.push(microphone);
            }
            const camera = new camera_2.CameraSensor();
            if (await camera.hasSensor()) {
                console.log('has camera');
                this._sensors.push(camera);
            }
            if (window.location.search.indexOf('from=camera') > -1) {
                this._elements.switchToDataCollection.href = 'camera.html';
            }
            if (window.location.search.indexOf('from=microphone') > -1) {
                this._elements.switchToDataCollection.href = 'microphone.html';
            }
            if (settings_3.getApiKey()) {
                // persist keys now...
                settings_3.storeApiKey(settings_3.getApiKey());
                window.history.replaceState(null, '', window.location.pathname);
                this._elements.loadingText.textContent = 'Loading classifier...';
                // tslint:disable-next-line: no-floating-promises
                (async () => {
                    let loader = new classification_loader_2.ClassificationLoader(settings_3.getStudioEndpoint(), settings_3.getApiKey());
                    loader.on('status', msg => {
                        console.log('status', msg);
                        this._elements.loadingText.textContent = msg;
                    });
                    loader.on('buildProgress', progress => {
                        console.log('buildProgress', progress);
                        if (typeof progress === 'string') {
                            this._elements.buildProgress.style.display = 'block';
                            this._elements.buildProgress.textContent = progress || ' ';
                        }
                        else {
                            this._elements.buildProgress.style.display = 'none';
                        }
                    });
                    try {
                        this._classifier = await loader.load();
                        let props = this._classifier.getProperties();
                        if (props.sensor === 'microphone' && !microphone.hasSensor()) {
                            throw new Error('Model expects microphone, but device has none');
                        }
                        else if (props.sensor === 'accelerometer' && !accelerometer.hasSensor()) {
                            throw new Error('Model expects accelerometer, but device has none');
                        }
                        else if (props.sensor === 'camera' && !camera.hasSensor()) {
                            throw new Error('Model expects camera, but device has none');
                        }
                        if (props.sensor === 'accelerometer') {
                            this._elements.grantPermission.textContent = 'Berikan akses ke akselerometer';
                        }
                        else if (props.sensor === 'microphone') {
                            this._elements.grantPermission.textContent = 'Berikan akses ke mikrofon';
                        }
                        else if (props.sensor === 'camera') {
                            this._elements.grantPermission.textContent = 'Berikan akses ke kamera';
                        }
                        else {
                            throw new Error('Unexpected sensor: ' + props.sensor);
                        }
                        let sensor = this._sensors.find(s => s.getProperties().name.toLowerCase() === props.sensor);
                        if (sensor && await sensor.checkPermissions(false)) {
                            console.log('sensor checkPermissions OK');
                            this.grantPermission();
                        }
                        else {
                            this.switchView(this._views.selectSensor);
                        }
                    }
                    catch (ex) {
                        console.error('Failed to load', ex);
                        if ((ex.message || ex.toString()).indexOf('No deployment yet') > -1) {
                            this._elements.connectionFailedMessage.innerHTML = 'No deployment yet. Go to the ' +
                                '<strong>Deployment</strong> page in the Edge Impulse studio, and deploy as WebAssembly.';
                        }
                        else {
                            this._elements.connectionFailedMessage.textContent = (ex.message || ex.toString());
                        }
                        this.switchView(this._views.connectionFailed);
                    }
                    finally {
                        this._elements.buildProgress.style.display = 'none';
                    }
                })();
            }
            else {
                this.switchView(this._views.qrcode);
            }
            this._elements.grantPermission.onclick = this.grantPermission.bind(this);
        }
        switchView(view) {
            for (const k of Object.keys(this._views)) {
                this._views[k].style.display = 'none';
            }
            view.style.display = '';
        }
        grantPermission() {
            if (!this._classifier)
                return;
            let prop = this._classifier.getProperties();
            let sensor = this._sensors.find(s => s.getProperties().name.toLowerCase() === prop.sensor);
            if (!sensor) {
                this._elements.connectionFailedMessage.textContent = 'Could not find sensor ' + prop.sensor;
                this.switchView(this._views.connectionFailed);
                return;
            }
            sensor.checkPermissions(true).then(result => {
                if (result) {
                    this.switchView(this._views.inferencing);
                    console.log('prop', prop);
                    if (prop.sensor === 'camera') {
                        this._elements.inferencingSamplingBody.style.display = 'none';
                        this._elements.inferenceCaptureBody.style.display = '';
                        this._elements.inferenceRecordingMessageBody.style.display = 'none';
                    }
                    else {
                        this._elements.inferencingSamplingBody.style.display = '';
                        this._elements.inferenceCaptureBody.style.display = 'none';
                        this._elements.inferenceRecordingMessageBody.style.display = '';
                    }
                    let sampleWindowLength = prop.frameSampleCount * (1000 / prop.frequency);
                    this._elements.inferencingTimeLeft.textContent = 'Waiting';
                    this._elements.inferencingMessage.textContent = 'Starting in 2 seconds...';
                    const renderInferenceResults = async (res, activeTimeout = 1000) => {
                        var _a;
                        if (this._firstInference && res.results.length > 0) {
                            this._firstInference = false;
                            this._isObjectDetection = typeof res.results[0].x === 'number';
                            if (!this._isObjectDetection) {
                                this._elements.inferencingResult.style.visibility = '';
                                let thead = this._elements.inferencingResultTable.querySelector('thead tr');
                                for (let e of res.results) {
                                    let th = document.createElement('th');
                                    th.scope = 'col';
                                    th.textContent = e.label;
                                    th.classList.add('px-0', 'text-center');
                                    thead.appendChild(th);
                                }
                                if (res.anomaly !== 0.0) {
                                    let th = document.createElement('th');
                                    th.scope = 'col';
                                    th.textContent = 'anomaly';
                                    th.classList.add('px-0', 'text-center');
                                    thead.appendChild(th);
                                }
                                if (thead.lastChild) {
                                    thead.lastChild.classList.add('pr-4');
                                }
                            }
                        }
                        if (!this._isObjectDetection && res.results.length > 0) {
                            let tbody = this._elements.inferencingResultTable.querySelector('tbody');
                            let row = document.createElement('tr');
                            row.innerHTML = '<td class="pl-4 pr-0">' + (++this._inferenceCount) + '</td>';
                            row.classList.add('active');
                            setTimeout(() => {
                                row.classList.remove('active');
                            }, activeTimeout);
                            for (let e of res.results) {
                                let td = document.createElement('td');
                                td.textContent = e.value.toFixed(2);
                                td.classList.add('px-0', 'text-center');
                                if (Math.max(...res.results.map(v => v.value)) === e.value) {
                                    td.classList.add('font-weight-bold');
                                }
                                else {
                                    td.classList.add('text-gray');
                                }
                                row.appendChild(td);
                            }
                            if (res.anomaly !== 0.0) {
                                let td = document.createElement('td');
                                td.textContent = res.anomaly.toFixed(2);
                                td.classList.add('px-0', 'text-center');
                                row.appendChild(td);
                            }
                            if (row.lastChild) {
                                row.lastChild.classList.add('pr-4');
                            }
                            if (tbody.childNodes.length === 0) {
                                tbody.appendChild(row);
                            }
                            else {
                                tbody.insertBefore(row, tbody.firstChild);
                            }
                        }
                        else {
                            for (let bx of Array.from(this._elements.cameraInner.querySelectorAll('.bounding-box-container'))) {
                                (_a = bx.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(bx);
                            }
                            if (res.results.length === 0) {
                                notify_2.Notify.notify('', 'No objects found', 'top', 'center', 'fas fa-exclamation-triangle', 'success');
                            }
                            let factor = Number(this._elements.cameraCanvas.height) /
                                Number(this._elements.cameraVideo.clientHeight);
                            for (let b of res.results.filter(bb => bb.value >= 0.5)) {
                                if (typeof b.x !== 'number' ||
                                    typeof b.y !== 'number' ||
                                    typeof b.width !== 'number' ||
                                    typeof b.height !== 'number') {
                                    continue;
                                }
                                let bb = {
                                    x: b.x / factor,
                                    y: b.y / factor,
                                    width: b.width / factor,
                                    height: b.height / factor,
                                    label: b.label,
                                    value: b.value
                                };
                                if (!this._labelToColor[bb.label]) {
                                    this._labelToColor[bb.label] = this._colors[0];
                                    this._colors.splice(0, 1);
                                }
                                let color = this._labelToColor[bb.label];
                                let el = document.createElement('div');
                                el.classList.add('bounding-box-container');
                                el.style.position = 'absolute';
                                el.style.border = 'solid 3px ' + color;
                                el.style.width = (bb.width) + 'px';
                                el.style.height = (bb.height) + 'px';
                                el.style.left = (bb.x) + 'px';
                                el.style.top = (bb.y) + 'px';
                                let label = document.createElement('div');
                                label.classList.add('bounding-box-label');
                                label.style.background = color;
                                label.textContent = bb.label + ' (' + bb.value.toFixed(2) + ')';
                                el.appendChild(label);
                                this._elements.cameraInner.appendChild(el);
                            }
                        }
                    };
                    const sampleNextWindow = async () => {
                        var _a;
                        if (!sensor || !this._classifier)
                            return;
                        this._elements.inferencingMessage.textContent = 'Sampling...';
                        let iv;
                        if (prop.sensor !== 'camera') {
                            let timeLeft = sampleWindowLength;
                            this._elements.inferencingTimeLeft.textContent = Math.round(timeLeft / 1000) + 's';
                            iv = setInterval(() => {
                                timeLeft -= 1000;
                                this._elements.inferencingTimeLeft.textContent = Math.round(timeLeft / 1000) + 's';
                            }, 1000);
                        }
                        try {
                            // clear out so it's clear we're inferencing
                            let samplingOptions = {};
                            if (prop.sensor === 'camera') {
                                samplingOptions.mode = 'raw';
                                samplingOptions.inputWidth = prop.inputWidth;
                                samplingOptions.inputHeight = prop.inputHeight;
                            }
                            else {
                                samplingOptions.length = sampleWindowLength;
                                samplingOptions.frequency = prop.frequency;
                            }
                            let data = await sensor.takeSample(samplingOptions);
                            if (iv) {
                                clearInterval(iv);
                            }
                            if (prop.sensor === 'camera') {
                                console.log('classification disable button');
                                this._elements.inferenceCaptureButton.innerHTML = '<i class="fa fa-camera mr-2"></i>Inferencing...';
                                this._elements.inferenceCaptureButton.classList.add('disabled');
                                if (this._isObjectDetection) {
                                    for (let bx of Array.from(this._elements.cameraInner.querySelectorAll('.bounding-box-container'))) {
                                        (_a = bx.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(bx);
                                    }
                                    await this.sleep(10);
                                }
                                else {
                                    await this.sleep(100);
                                }
                            }
                            else {
                                // give some time to give the idea we're inferencing
                                this._elements.inferencingMessage.textContent = 'Inferencing...';
                                await this.sleep(500);
                            }
                            let d;
                            if (data.values[0] instanceof Array) {
                                d = data.values.reduce((curr, v) => curr.concat(v), []);
                            }
                            else {
                                d = data.values;
                            }
                            // console.log('raw data', d.length, d);
                            console.time('inferencing');
                            let res = this._classifier.classify(d, false);
                            console.timeEnd('inferencing');
                            console.log('inference results', res);
                            await renderInferenceResults(res);
                            if (prop.sensor === 'camera') {
                                console.log('classification enable button again');
                                this._elements.inferenceCaptureBody.style.display = 'initial';
                                this._elements.inferenceRecordingMessageBody.style.display = 'none';
                                this._elements.inferenceCaptureButton.innerHTML = '<i class="fa fa-camera mr-2"></i>Classify';
                                this._elements.inferenceCaptureButton.classList.remove('disabled');
                                // immediately sample next window
                                setTimeout(sampleNextWindow, 0);
                            }
                            else {
                                let startDelay = 2;
                                this._elements.inferenceCaptureBody.style.display = 'none';
                                this._elements.inferenceRecordingMessageBody.style.display = 'initial';
                                this._elements.inferencingTimeLeft.textContent = 'Waiting';
                                this._elements.inferencingMessage.textContent = `Starting in ${startDelay} seconds...`;
                                setTimeout(sampleNextWindow, startDelay * 1000);
                            }
                        }
                        catch (ex) {
                            clearInterval(iv);
                            console.error(ex);
                            this._elements.connectionFailedMessage.textContent = (ex.message || ex.toString());
                            this.switchView(this._views.connectionFailed);
                        }
                    };
                    const sampleAudioContinuous = async () => {
                        if (!sensor || !this._classifier)
                            return;
                        if (prop.sensor !== 'microphone') {
                            throw new Error('Sensor is not microphone, cannot do continuous audio sampling');
                        }
                        this._elements.inferencingMessage.textContent = 'Listening...';
                        let isClassifying = false;
                        let last = Date.now();
                        // should be 250ms. but if not, make it align to window,
                        // e.g. if 800ms. then we use 200ms.
                        let sampleLength = 250 - (sampleWindowLength % 250);
                        let maf;
                        const classify = async (data) => {
                            try {
                                if (!this._classifier)
                                    return;
                                if (isClassifying)
                                    return; // avoid overload on slow devices
                                isClassifying = true;
                                console.log(Date.now() - last, 'data', data.length);
                                last = Date.now();
                                console.time('inferencing');
                                let res = this._classifier.classify(data, false);
                                console.timeEnd('inferencing');
                                console.log('inference results before MAF', res);
                                if (!maf) {
                                    maf = new moving_average_filter_1.MovingAverageFilter(4, res.results.map(x => x.label));
                                }
                                res = maf.run(res);
                                console.log('inference results after MAF', res);
                                await renderInferenceResults(res, sampleLength);
                                let highest = res.results.find(x => x.value >= 0.8);
                                if (highest) {
                                    this._elements.inferencingMessage.textContent = highest.label;
                                }
                                else {
                                    this._elements.inferencingMessage.textContent = 'uncertain';
                                }
                                isClassifying = false;
                            }
                            catch (ex2) {
                                let ex = ex2;
                                this._elements.connectionFailedMessage.textContent = ex.message || ex.toString();
                                this.switchView(this._views.connectionFailed);
                            }
                        };
                        // tslint:disable-next-line: no-floating-promises
                        (async () => {
                            try {
                                let allData = [];
                                while (1) {
                                    let samplingOptions = {
                                        length: sampleLength,
                                        frequency: prop.frequency,
                                        continuousMode: true
                                    };
                                    let data = await sensor.takeSample(samplingOptions);
                                    let d = data.values;
                                    allData = allData.concat(d);
                                    if (allData.length >= prop.frameSampleCount) {
                                        // we do this in a setTimeout so we go read immediately again
                                        setTimeout(() => {
                                            // tslint:disable-next-line: no-floating-promises
                                            classify(allData.slice(allData.length - prop.frameSampleCount));
                                        }, 0);
                                    }
                                }
                            }
                            catch (ex2) {
                                let ex = ex2;
                                this._elements.connectionFailedMessage.textContent = ex.message || ex.toString();
                                this.switchView(this._views.connectionFailed);
                            }
                        })();
                    };
                    if (prop.sensor === 'camera') {
                        setTimeout(sampleNextWindow, 0);
                    }
                    else if (prop.sensor === 'microphone') {
                        return sampleAudioContinuous();
                    }
                    else {
                        setTimeout(sampleNextWindow, 2000);
                    }
                }
                else {
                    alert('User has rejected ' + (prop.sensor) + ' permissions');
                }
            }).catch(err => {
                console.error(err);
                this._elements.connectionFailedMessage.textContent = err;
                this.switchView(this._views.connectionFailed);
            });
        }
        sleep(ms) {
            return new Promise((resolve) => {
                setTimeout(resolve, ms);
            });
        }
    }
    exports.ClassificationClientViews = ClassificationClientViews;
});
define("client/find-segments", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.FindSegments = void 0;
    class FindSegments {
        /**
         * Find segments in a data stream
         * @param data Data
         * @param samplesPerWindow Minimum distance between segments (number of datapoints)
         * @param frequency Data frequency
         * @param shiftSegments Whether to shift segments a little bit randomly, or center around the interesting window
         */
        findSegments(data, samplesPerWindow, frequency, shiftSegments) {
            let combinedData;
            if (typeof data[0] === 'number') {
                combinedData = data;
            }
            else {
                combinedData = data.map(v => v.reduce((curr, x) => curr + Math.abs(x), 0));
                // combinedData = (<number[][]>data).map(v => Math.max(...v.map(vv => Math.abs(vv))));
            }
            let minSegmentDistance = Math.ceil(samplesPerWindow * 0.85);
            let indices = this.findPeaks(combinedData, minSegmentDistance);
            // center each segment around data
            // find segment position with the most energy
            let segments = indices.map(segmentCenter => {
                // if we have a 1sec window we'll start searching 0.85 sec before the peak
                let searchStart = Math.max(segmentCenter - minSegmentDistance, 0);
                // and end at 1sec after the peak
                let searchEnd = Math.min(segmentCenter + minSegmentDistance, data.length - 1);
                let windows = [];
                let frameLength = Math.floor(0.02 * frequency);
                if (frameLength < 1)
                    frameLength = 1;
                let frameStride = Math.floor(0.02 * frequency);
                if (frameStride < 1)
                    frameStride = 1;
                for (let start = searchStart; start < searchEnd - frameLength; start += frameStride) {
                    let dataThisWindow = combinedData.slice(start, start + frameLength);
                    let energy = dataThisWindow.map(a => a * a).reduce((a, b) => a + b, 0);
                    windows.push({
                        start: start,
                        end: start + frameLength,
                        energy: energy
                    });
                }
                let mean = this.avg(windows.map(w => w.energy)) * 2;
                windows = windows.filter(x => x.energy > mean); // <-- all interesting windows
                if (windows.length === 0)
                    return undefined;
                let interestingWindows = [];
                let currInterestingWindow;
                for (let w of windows) {
                    if (!currInterestingWindow) {
                        currInterestingWindow = w;
                        continue;
                    }
                    // two windows are less than 200ms. apart? then update the curr window
                    if (w.start - currInterestingWindow.end < Math.floor(0.2 * frequency)) {
                        currInterestingWindow.end = w.end;
                        currInterestingWindow.energy += w.energy;
                    }
                    else {
                        interestingWindows.push(currInterestingWindow);
                        currInterestingWindow = w;
                    }
                }
                if (currInterestingWindow) {
                    interestingWindows.push(currInterestingWindow);
                }
                let highestEnergy = Math.max(...interestingWindows.map(x => x.energy));
                let mostInterestingWindow = interestingWindows.find(x => x.energy === highestEnergy);
                if (!mostInterestingWindow) {
                    // center window around the peak
                    return {
                        start: segmentCenter - Math.floor(samplesPerWindow / 2),
                        end: segmentCenter + Math.floor(samplesPerWindow / 2)
                    };
                }
                let center = (mostInterestingWindow.end + mostInterestingWindow.start) / 2;
                let begin = center - Math.floor(samplesPerWindow / 2);
                let end = center + Math.floor(samplesPerWindow / 2);
                if (shiftSegments) {
                    // we randomly want to shift the window, but never cut out any data
                    // first determine the direction
                    let shiftDirection = Math.random() >= 0.5 ? 'left' : 'right';
                    // max shift depends on the interesting window we found minus 100ms. (just in case)
                    let maxShift = Math.floor((samplesPerWindow -
                        (mostInterestingWindow.end - mostInterestingWindow.start) - (0.1 * frequency))) / 2;
                    if (maxShift > 0) {
                        let shiftAmount = Math.floor(maxShift * Math.random());
                        if (shiftDirection === 'left') {
                            begin -= shiftAmount;
                            end -= shiftAmount;
                        }
                        else {
                            begin += shiftAmount;
                            end += shiftAmount;
                        }
                    }
                }
                if (begin < 0) {
                    let diff = 0 - begin;
                    begin += diff;
                    end += diff;
                }
                if (end > combinedData.length) {
                    let diff = end - combinedData.length;
                    begin -= diff;
                    end -= diff;
                }
                return {
                    start: begin,
                    end: end
                };
            });
            let allSegments = [];
            let lastSegment;
            for (let s of segments) {
                if (typeof s === 'undefined')
                    continue;
                // max. 15% overlap between windows
                if (lastSegment && s.start - lastSegment.end < -0.15 * samplesPerWindow) {
                    continue;
                }
                lastSegment = s;
                allSegments.push(s);
            }
            allSegments = allSegments.filter(s => {
                let d = data.slice(s.start, s.end);
                let squares = d.map(v => v * v);
                let sum = squares.reduce((curr, v) => (curr + v));
                let mean = sum / data.length;
                console.log('Found segment', s, mean);
                if (mean < 100000) {
                    return false;
                }
                return true;
            });
            if (data.length !== samplesPerWindow && allSegments.length === 1 && allSegments[0].start === 0) {
                return [];
            }
            return allSegments;
        }
        avg(signal) {
            return signal.reduce((a, b) => a + b, 0) / signal.length;
        }
        /**
         * Port of the scipy findpeaks function
         * @param data Array of data items
         * @param distance Distance between peaks (number of datapoints)
         * @param rmsThreshold RMS threshold for peaks (percentage of full data RMS)
         * @returns indices in the data list of the found peaks
         */
        findPeaks(data, distance) {
            // Calculate the RMS as the min peak height required
            // remove mean first...
            let totalMean = this.avg(data);
            data = data.map(d => d - totalMean);
            let squares = data.map(v => v * v);
            let sum = squares.reduce((curr, v) => (curr + v));
            let mean = sum / data.length;
            let threshold = Math.sqrt(mean) * 1.2;
            let peaks = [];
            for (let ix = 1; ix < data.length - 1; ix++) {
                let prev = data[ix - 1];
                let next = data[ix + 1];
                if (data[ix] >= prev && data[ix] > next && data[ix] > threshold) {
                    peaks.push(ix);
                }
            }
            let priority = peaks.map(x => data[x]);
            let peaksSize = peaks.length;
            // np.argsort equivalent
            let sorted = Array.from(priority).map((v, ix) => ({
                ix: ix,
                value: v
            })).sort((a, b) => b.value - a.value).reverse();
            let priorityToPosition = new Array(peaks.length).fill(0);
            for (let sx = 0; sx < sorted.length; sx++) {
                priorityToPosition[sx] = sorted[sx].ix;
            }
            let keep = new Array(peaks.length).fill(1);
            for (let i = peaksSize - 1; i >= 0; i--) {
                let j = priorityToPosition[i];
                if (keep[j] === 0) {
                    continue;
                }
                let k = j - 1;
                while (0 <= k && peaks[j] - peaks[k] < distance) {
                    keep[k] = 0;
                    k -= 1;
                }
                k = j + 1;
                while (k < peaksSize && peaks[k] - peaks[j] < distance) {
                    keep[k] = 0;
                    k += 1;
                }
            }
            let indices = [];
            for (let kx = 0; kx < keep.length; kx++) {
                if (keep[kx] === 1) {
                    indices.push(peaks[kx]);
                }
            }
            return indices;
        }
    }
    exports.FindSegments = FindSegments;
});
define("client/collection-keyword", ["require", "exports", "client/settings", "client/sensors/accelerometer", "client/sensors/microphone", "client/sensors/camera", "client/classification-loader", "client/find-segments", "client/uploader", "client/messages"], function (require, exports, settings_4, accelerometer_2, microphone_2, camera_3, classification_loader_3, find_segments_1, uploader_2, messages_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DataCollectionKeywordClientViews = void 0;
    class DataCollectionKeywordClientViews {
        constructor() {
            this._views = {
                loading: document.querySelector('#loading-view'),
                qrcode: document.querySelector('#qrcode-view'),
                connected: document.querySelector('#remote-mgmt-connected'),
                connectionFailed: document.querySelector('#remote-mgmt-failed'),
                sampling: document.querySelector('#sampling-in-progress'),
                permission: document.querySelector('#permission-view'),
                uploadSucceeded: document.querySelector('#upload-succeeded')
            };
            this._elements = {
                projectName: document.querySelector('#connected-project-name'),
                keyword: document.querySelector('#keyword-name'),
                startSampling: document.querySelector('#start-sampling'),
                connectionFailedMessage: document.querySelector('#connection-failed-message'),
                samplingTimeLeft: document.querySelector('#sampling-time-left'),
                samplingRecordingStatus: document.querySelector('#sampling-recording-data-message'),
                samplingRecordingSensor: document.querySelector('#sampling-recording-sensor'),
                grantPermissionsBtn: document.querySelector('#grant-permissions-button'),
                loadingText: document.querySelector('#loading-view-text'),
                uploadSucceededProjectName: document.querySelector('#upload-succeeded-project-name'),
                uploadSucceededCount: document.querySelector('#upload-succeeded-count'),
            };
            this._sensors = [];
            this._findSegments = new find_segments_1.FindSegments();
        }
        async init() {
            settings_4.storeDeviceId(settings_4.getDeviceId());
            if (!settings_4.getKeyword()) {
                this._elements.connectionFailedMessage.textContent = 'Missing ?keyword= parameter in URL';
                return this.switchView(this._views.connectionFailed);
            }
            if (!settings_4.getSampleLength() || isNaN(settings_4.getSampleLength())) {
                this._elements.connectionFailedMessage.textContent = 'Missing ?sampleLength= parameter in URL';
                return this.switchView(this._views.connectionFailed);
            }
            if (!settings_4.getFrequency() || isNaN(settings_4.getFrequency())) {
                this._elements.connectionFailedMessage.textContent = 'Missing ?frequency= parameter in URL';
                return this.switchView(this._views.connectionFailed);
            }
            settings_4.storeKeyword(settings_4.getKeyword());
            settings_4.storeSampleLength(settings_4.getSampleLength());
            settings_4.storeFrequency(settings_4.getFrequency());
            this._elements.keyword.textContent = settings_4.getKeyword();
            const accelerometer = new accelerometer_2.AccelerometerSensor();
            if (await accelerometer.hasSensor()) {
                console.log('has accelerometer');
                this._sensors.push(accelerometer);
            }
            const microphone = new microphone_2.MicrophoneSensor();
            if (await microphone.hasSensor()) {
                console.log('has microphone');
                this._sensors.push(microphone);
            }
            const camera = new camera_3.CameraSensor();
            if (await camera.hasSensor()) {
                console.log('has camera');
                this._sensors.push(camera);
            }
            if (settings_4.getApiKey()) {
                this.switchView(this._views.loading);
                this._elements.loadingText.textContent = 'Connecting to Edge Impulse...';
                let project = await this.getProject(settings_4.getApiKey());
                this._elements.projectName.textContent = project.name;
                this.switchView(this._views.connected);
                settings_4.storeApiKey(settings_4.getApiKey());
                window.history.replaceState(null, '', window.location.pathname);
                this._elements.startSampling.onclick = async (ev) => {
                    ev.preventDefault();
                    let samplingInterval;
                    try {
                        let sensor = await this.beforeSampling('Microphone');
                        const sampleLength = settings_4.getSampleLength();
                        const segmentWindowLength = 1000;
                        const frequency = settings_4.getFrequency();
                        const minSegments = 1;
                        let remaining = sampleLength;
                        this._elements.samplingRecordingStatus.textContent = 'Recording data';
                        this._elements.samplingTimeLeft.textContent = Math.floor(remaining / 1000) + 's';
                        samplingInterval = setInterval(() => {
                            remaining -= 1000;
                            if (remaining < 0) {
                                return clearInterval(samplingInterval);
                            }
                            this._elements.samplingTimeLeft.textContent = Math.floor(remaining / 1000) + 's';
                        }, 1000);
                        const sampleData = await sensor.takeSample({
                            length: sampleLength,
                            frequency: frequency,
                            processing: () => { }
                        });
                        console.log('done recording', sampleData);
                        clearInterval(samplingInterval);
                        this.switchView(this._views.loading);
                        this._elements.loadingText.textContent = 'Finding keywords...';
                        let segments = this._findSegments.findSegments(sampleData.values, (segmentWindowLength / 1000) * frequency, frequency, false);
                        if (segments.length < minSegments) {
                            throw new Error('Expected to find at least ' + minSegments + ' keywords, but only found ' +
                                segments.length);
                        }
                        this._elements.loadingText.textContent = 'Uploading ' + segments.length + ' keywords... (0%)';
                        let uploader = new uploader_2.Uploader(settings_4.getApiKey());
                        console.log('segments', segments);
                        let done = 0;
                        for (let s of segments) {
                            let sample = {
                                intervalMs: sampleData.intervalMs,
                                sensors: sampleData.sensors,
                                values: sampleData.values.slice(s.start, s.end),
                            };
                            let data = messages_2.dataMessage({
                                apiKey: settings_4.getApiKey(),
                                device: {
                                    deviceId: settings_4.getDeviceId(),
                                    sensors: [camera].map(x => {
                                        let p = x.getProperties();
                                        return {
                                            name: p.name,
                                            frequencies: p.frequencies,
                                            maxSampleLength: p.maxSampleLength
                                        };
                                    }),
                                    deviceType: 'MOBILE_CLIENT'
                                }
                            }, sample);
                            await uploader.uploadSample({
                                sensor: sensor.getProperties().name,
                                hmacKey: '0',
                                interval: sample.intervalMs,
                                label: settings_4.getKeyword(),
                                length: sample.values.length,
                                path: '/api/' + (await this.getCategoryFromValueArray(sample.values)) + '/data',
                            }, data, sample);
                            done++;
                            let pct = Math.round(done / segments.length * 100);
                            this._elements.loadingText.textContent = `Uploading ${segments.length} keywords... (${pct}%)`;
                        }
                        this._elements.uploadSucceededCount.textContent = done.toString();
                        this._elements.uploadSucceededProjectName.textContent = project.name;
                        this.switchView(this._views.uploadSucceeded);
                    }
                    catch (ex) {
                        alert('Failed to record data: ' + ex);
                        this.switchView(this._views.connected);
                    }
                    finally {
                        clearInterval(samplingInterval);
                    }
                };
            }
            else {
                this.switchView(this._views.qrcode);
            }
        }
        switchView(view) {
            for (const k of Object.keys(this._views)) {
                this._views[k].style.display = 'none';
            }
            view.style.display = '';
        }
        async beforeSampling(sensorName) {
            let sensor = this._sensors.find(s => s.getProperties().name === sensorName);
            if (!sensor) {
                throw new Error('Cannot find sensor with name "' + sensorName + '"');
            }
            this._elements.samplingRecordingSensor.textContent = sensor.getProperties().name.toLowerCase();
            if (sensorName !== 'Camera') {
                this._views.sampling.style.display = 'initial';
            }
            else {
                this._views.sampling.style.display = 'none';
            }
            if (await sensor.checkPermissions(true)) {
                if (sensorName !== 'Camera') {
                    this.switchView(this._views.sampling);
                    this._elements.samplingRecordingStatus.textContent = 'Starting in 2 seconds';
                    this._elements.samplingTimeLeft.textContent = 'Waiting...';
                    await this.sleep(2000);
                }
                else {
                    throw new Error('Sensor not supported: ' + sensorName);
                }
                return sensor;
            }
            else {
                this.switchView(this._views.permission);
                this._elements.grantPermissionsBtn.textContent =
                    'Give access to the ' + sensor.getProperties().name;
                return new Promise((resolve, reject) => {
                    let permissionTimeout = setTimeout(() => {
                        reject('User did not grant permissions within one minute');
                    }, 60 * 1000);
                    this._elements.grantPermissionsBtn.onclick = () => {
                        if (!sensor)
                            return reject('Sensor is missing');
                        sensor.checkPermissions(true).then(async (result) => {
                            if (!sensor) {
                                return reject('Sensor is missing');
                            }
                            if (result) {
                                this.switchView(this._views.sampling);
                                this._elements.samplingRecordingStatus.textContent = 'Starting in 2 seconds';
                                this._elements.samplingTimeLeft.textContent = 'Waiting...';
                                await this.sleep(2000);
                                resolve(sensor);
                            }
                            else {
                                reject('User has rejected accelerometer permissions');
                            }
                        }).catch(reject);
                        clearInterval(permissionTimeout);
                    };
                });
            }
        }
        sleep(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        }
        async getProject(apiKey) {
            let l = new classification_loader_3.ClassificationLoader(settings_4.getStudioEndpoint(), apiKey);
            let project = await l.getProject();
            return project;
        }
        async getCategoryFromValueArray(values) {
            let arr = new Float32Array(values);
            let hashBuffer = await crypto.subtle.digest('SHA-256', arr);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            let hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            while (hash.length > 0 && hash[0] === 'f') {
                hash = hash.substr(1);
            }
            if (hash.length === 0) {
                throw new Error('Failed to calculate SHA256 hash of buffer');
            }
            let firstHashChar = hash[0];
            if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b'].indexOf(firstHashChar) > -1) {
                return 'training';
            }
            else {
                return 'testing';
            }
        }
    }
    exports.DataCollectionKeywordClientViews = DataCollectionKeywordClientViews;
});
define("client/remote-mgmt", ["require", "exports", "client/messages", "client/utils", "client/settings", "client/typed-event-emitter", "client/uploader"], function (require, exports, messages_3, utils_2, settings_5, typed_event_emitter_2, uploader_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.RemoteManagementConnection = void 0;
    class RemoteManagementConnection extends typed_event_emitter_2.Emitter {
        constructor(settings, waitForSamplingToStart) {
            super();
            this._socketHeartbeat = -1;
            this.sendMessage = (data) => {
                this._socket.send(JSON.stringify(data));
            };
            this._socket = new WebSocket(settings_5.getRemoteManagementEndpoint());
            this._state = {
                socketConnected: false,
                remoteManagementConnected: false,
                error: null,
                sample: null,
                isSampling: false
            };
            this._settings = settings;
            this._uploader = new uploader_3.Uploader(settings.apiKey);
            this._socket.onopen = _e => {
                this._state.socketConnected = true;
                this.sendMessage(messages_3.helloMessage(this._settings));
                this._socketHeartbeat = window.setInterval(() => {
                    this._socket.send("ping");
                }, 3000);
            };
            this._socket.onmessage = async (event) => {
                const data = await utils_2.parseMessage(event);
                if (!data) {
                    return;
                }
                // ping messages are not understood, so skip those
                if (data.err !== undefined && data.err.indexOf('Failed to parse') === -1) {
                    this.emit('error', data.err);
                }
                if (data.hello !== undefined) {
                    const msg = data.hello;
                    this._state.remoteManagementConnected = msg.hello;
                    this._state.error = msg.error;
                    if (this._state.error) {
                        this.emit('error', this._state.error);
                    }
                    else {
                        this.emit('connected');
                    }
                }
                if (data.sample !== undefined) {
                    const msg = data.sample;
                    if (!msg || !msg.hmacKey) {
                        this.sendMessage(messages_3.sampleRequestFailed("Message or hmacKey empty"));
                        return;
                    }
                    if (!waitForSamplingToStart)
                        return;
                    try {
                        this.sendMessage(messages_3.sampleRequestReceived);
                        let sensor = await waitForSamplingToStart(msg.sensor);
                        // Start to sample
                        this._state.sample = msg;
                        this._state.isSampling = true;
                        if (msg.sensor !== 'Camera') {
                            this.sendMessage(messages_3.sampleStarted);
                        }
                        const sampleDetails = Object.assign({}, msg);
                        this.emit('samplingStarted', msg.length);
                        const sampleData = await sensor.takeSample({
                            length: msg.length,
                            frequency: 1000 / msg.interval,
                            processing: () => {
                                this.emit('samplingProcessing');
                            }
                        });
                        // Upload sample
                        try {
                            this.emit('samplingUploading');
                            this.sendMessage(messages_3.sampleUploading);
                            await this._uploader.uploadSample(sampleDetails, messages_3.dataMessage(this._settings, sampleData), sampleData);
                            this.sendMessage(messages_3.sampleFinished);
                            this.emit('samplingFinished');
                        }
                        catch (ex) {
                            alert(ex.message || ex.toString());
                        }
                        finally {
                            this._state.sample = msg;
                            this._state.isSampling = false;
                        }
                    }
                    catch (ex) {
                        this.emit('samplingFinished');
                        this.emit('samplingError', ex.message || ex.toString());
                        this.sendMessage(messages_3.sampleRequestFailed((ex.message || ex.toString())));
                    }
                }
            };
            this._socket.onclose = event => {
                clearInterval(this._socketHeartbeat);
                const msg = event.wasClean ?
                    `[close] Connection closed cleanly, code=${event.code} reason=${event.reason}` : // e.g. server process killed or network down
                    // event.code is usually 1006 in this case
                    "[close] Connection died";
                this._state.socketConnected = false;
                this._state.remoteManagementConnected = false;
                this._state.error = msg;
                this.emit('error', this._state.error);
            };
            this._socket.onerror = error => {
                this._state.socketConnected = false;
                this._state.remoteManagementConnected = false;
                this._state.error = error;
                this.emit('error', this._state.error);
            };
        }
        readAsBinaryStringAsync(file) {
            return new Promise((resolve, reject) => {
                let reader = new FileReader();
                reader.onload = () => {
                    resolve(reader.result);
                };
                reader.onerror = reject;
                reader.readAsBinaryString(file);
            });
        }
    }
    exports.RemoteManagementConnection = RemoteManagementConnection;
});
define("client/collection-views", ["require", "exports", "client/settings", "client/remote-mgmt", "client/sensors/accelerometer", "client/sensors/microphone", "client/sensors/camera"], function (require, exports, settings_6, remote_mgmt_1, accelerometer_3, microphone_3, camera_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DataCollectionClientViews = void 0;
    class DataCollectionClientViews {
        constructor() {
            this._views = {
                loading: document.querySelector('#loading-view'),
                qrcode: document.querySelector('#qrcode-view'),
                connected: document.querySelector('#remote-mgmt-connected'),
                connectionFailed: document.querySelector('#remote-mgmt-failed'),
                sampling: document.querySelector('#sampling-in-progress'),
                permission: document.querySelector('#permission-view'),
                capture: document.querySelector('#capture-camera')
            };
            this._elements = {
                deviceId: document.querySelector('#connected-device-id'),
                connectionFailedMessage: document.querySelector('#connection-failed-message'),
                samplingTimeLeft: document.querySelector('#sampling-time-left'),
                samplingRecordingStatus: document.querySelector('#sampling-recording-data-message'),
                samplingRecordingSensor: document.querySelector('#sampling-recording-sensor'),
                grantPermissionsBtn: document.querySelector('#grant-permissions-button'),
                loadingText: document.querySelector('#loading-view-text'),
            };
            this._sensors = [];
        }
        async init() {
            settings_6.storeDeviceId(settings_6.getDeviceId());
            const accelerometer = new accelerometer_3.AccelerometerSensor();
            if (await accelerometer.hasSensor()) {
                console.log('has accelerometer');
                this._sensors.push(accelerometer);
            }
            const microphone = new microphone_3.MicrophoneSensor();
            if (await microphone.hasSensor()) {
                console.log('has microphone');
                this._sensors.push(microphone);
            }
            const camera = new camera_4.CameraSensor();
            if (await camera.hasSensor()) {
                console.log('has camera');
                this._sensors.push(camera);
            }
            if (settings_6.getApiKey()) {
                this.switchView(this._views.loading);
                this._elements.loadingText.textContent = 'Menghubungkan ke server...';
                const connection = new remote_mgmt_1.RemoteManagementConnection({
                    apiKey: settings_6.getApiKey(),
                    device: {
                        deviceId: settings_6.getDeviceId(),
                        sensors: this._sensors.map(s => {
                            let p = s.getProperties();
                            return {
                                name: p.name,
                                frequencies: p.frequencies,
                                maxSampleLength: p.maxSampleLength
                            };
                        }),
                        deviceType: 'MOBILE_CLIENT'
                    }
                }, this.beforeSampling.bind(this));
                connection.on('connected', () => {
                    // persist keys now...
                    settings_6.storeApiKey(settings_6.getApiKey());
                    window.history.replaceState(null, '', window.location.pathname);
                    this._elements.deviceId.textContent = settings_6.getDeviceId();
                    this.switchView(this._views.connected);
                });
                connection.on('error', err => {
                    console.error('Connection failed', err);
                    this._elements.connectionFailedMessage.textContent = err;
                    this.switchView(this._views.connectionFailed);
                });
                let samplingInterval;
                connection.on('samplingStarted', length => {
                    let remaining = length;
                    this._elements.samplingRecordingStatus.textContent = 'Recording data';
                    this._elements.samplingTimeLeft.textContent = Math.floor(remaining / 1000) + 's';
                    samplingInterval = setInterval(() => {
                        remaining -= 1000;
                        if (remaining < 0) {
                            return clearInterval(samplingInterval);
                        }
                        this._elements.samplingTimeLeft.textContent = Math.floor(remaining / 1000) + 's';
                    }, 1000);
                });
                connection.on('samplingUploading', () => {
                    clearInterval(samplingInterval);
                    this.switchView(this._views.loading);
                    this._elements.loadingText.textContent = 'Uploading...';
                });
                connection.on('samplingProcessing', () => {
                    clearInterval(samplingInterval);
                    this.switchView(this._views.loading);
                    this._elements.loadingText.textContent = 'Processing...';
                });
                connection.on('samplingFinished', () => {
                    this.switchView(this._views.connected);
                });
                connection.on('samplingError', error => {
                    alert(error);
                });
            }
            else {
                this.switchView(this._views.qrcode);
            }
        }
        switchView(view) {
            for (const k of Object.keys(this._views)) {
                this._views[k].style.display = 'none';
            }
            view.style.display = '';
        }
        async beforeSampling(sensorName) {
            let sensor = this._sensors.find(s => s.getProperties().name === sensorName);
            if (!sensor) {
                throw new Error('Cannot find sensor with name "' + sensorName + '"');
            }
            this._elements.samplingRecordingSensor.textContent = sensor.getProperties().name.toLowerCase();
            if (sensorName !== 'Camera') {
                this._views.sampling.style.display = 'initial';
            }
            else {
                this._views.sampling.style.display = 'none';
            }
            if (await sensor.checkPermissions(false)) {
                if (sensorName !== 'Camera') {
                    this.switchView(this._views.sampling);
                    this._elements.samplingRecordingStatus.textContent = 'Starting in 2 seconds';
                    this._elements.samplingTimeLeft.textContent = 'Waiting...';
                    await this.sleep(2000);
                }
                else {
                    this.switchView(this._views.capture);
                }
                return sensor;
            }
            else {
                this.switchView(this._views.permission);
                this._elements.grantPermissionsBtn.textContent =
                    'Give access to the ' + sensor.getProperties().name;
                return new Promise((resolve, reject) => {
                    let permissionTimeout = setTimeout(() => {
                        reject('User did not grant permissions within one minute');
                    }, 60 * 1000);
                    this._elements.grantPermissionsBtn.onclick = () => {
                        if (!sensor)
                            return reject('Sensor is missing');
                        sensor.checkPermissions(true).then(async (result) => {
                            if (!sensor) {
                                return reject('Sensor is missing');
                            }
                            if (result) {
                                if (sensorName !== 'Camera') {
                                    this.switchView(this._views.sampling);
                                    this._elements.samplingRecordingStatus.textContent = 'Starting in 2 seconds';
                                    this._elements.samplingTimeLeft.textContent = 'Waiting...';
                                    await this.sleep(2000);
                                }
                                else {
                                    this.switchView(this._views.capture);
                                }
                                resolve(sensor);
                            }
                            else {
                                reject('User has rejected accelerometer permissions');
                            }
                        }).catch(reject);
                        clearInterval(permissionTimeout);
                    };
                });
            }
        }
        sleep(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        }
    }
    exports.DataCollectionClientViews = DataCollectionClientViews;
});
define("client/microphone-collection-views", ["require", "exports", "client/settings", "client/uploader", "client/classification-loader", "client/messages", "client/notify", "client/sensors/microphone"], function (require, exports, settings_7, uploader_4, classification_loader_4, messages_4, notify_3, microphone_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MicrophoneDataCollectionClientViews = void 0;
    class MicrophoneDataCollectionClientViews {
        constructor() {
            this._views = {
                loading: document.querySelector('#loading-view'),
                qrcode: document.querySelector('#qrcode-view'),
                connectionFailed: document.querySelector('#remote-mgmt-failed'),
                capture: document.querySelector('#capture-camera'),
                permission: document.querySelector('#permission-view')
            };
            this._elements = {
                deviceId: document.querySelector('#connected-device-id'),
                connectionFailedMessage: document.querySelector('#connection-failed-message'),
                grantPermission: document.querySelector('#grant-permissions-button'),
                loadingText: document.querySelector('#loading-view-text'),
                recordButton: document.querySelector('#microphone-capture-button'),
                labelLink: document.querySelector('#microphone-label-link'),
                labelText: document.querySelector('#microphone-label-text'),
                lengthLink: document.querySelector('#microphone-length-link'),
                lengthText: document.querySelector('#microphone-length-text'),
                categoryLink: document.querySelector('#microphone-category-link'),
                categoryText: document.querySelector('#microphone-category-text'),
                categorySelect: document.querySelector('#microphone-category-select'),
                capturedCount: document.querySelector('#microphone-capture-count'),
                samplingCircle: document.querySelector('#sampling-circle'),
                progressCircle: document.querySelector('#sampling-circle .sampling-circle'),
                samplingTimeLeft: document.querySelector('#sampling-time-left'),
            };
            this._sensors = [];
            this._numCaptures = 0;
            this._hmacKey = '0';
        }
        async init() {
            var _a;
            console.log('init microphone-collection-views');
            settings_7.storeDeviceId(settings_7.getDeviceId());
            const microphone = new microphone_4.MicrophoneSensor();
            if (!await microphone.hasSensor()) {
                this._elements.connectionFailedMessage.textContent = 'No microphone detected';
                this.switchView(this._views.connectionFailed);
                return;
            }
            this._sensors.push(microphone);
            // if we are not on a platform that overrides the menu action we'll move it to the place
            // of the textbox
            let selectStyle = window.getComputedStyle(this._elements.categorySelect);
            if (selectStyle.webkitAppearance !== 'menulist-button') {
                this._elements.categoryText.style.display = 'none';
                (_a = this._elements.categoryText.parentNode) === null || _a === void 0 ? void 0 : _a.insertBefore(this._elements.categorySelect, this._elements.categoryText);
            }
            if (settings_7.getApiKey()) {
                settings_7.storeApiKey(settings_7.getApiKey());
                try {
                    this.switchView(this._views.loading);
                    let devKeys = await this.getDevelopmentApiKeys(settings_7.getApiKey());
                    if (devKeys.hmacKey) {
                        this._hmacKey = devKeys.hmacKey;
                    }
                    this._elements.labelText.textContent = localStorage.getItem('last-microphone-label') || 'unknown';
                    this._elements.lengthText.textContent = localStorage.getItem('last-microphone-length') || '1';
                    this._elements.categoryText.textContent = localStorage.getItem('last-microphone-category') || 'split';
                    this._elements.categorySelect.value = this._elements.categoryText.textContent;
                    this._uploader = new uploader_4.Uploader(settings_7.getApiKey());
                    this._elements.grantPermission.textContent = 'Give access to the microphone';
                    let sensor = this._sensors.find(s => s.getProperties().name.toLowerCase() === 'camera');
                    if (sensor && await sensor.checkPermissions(false)) {
                        console.log('sensor checkPermissions OK');
                        this.grantPermission();
                    }
                    else {
                        this.switchView(this._views.permission);
                        this._elements.grantPermission.onclick = ev => {
                            this.grantPermission();
                        };
                    }
                }
                catch (ex) {
                    console.error('Failed to load', ex);
                    this._elements.connectionFailedMessage.textContent = (ex.message || ex.toString());
                    this.switchView(this._views.connectionFailed);
                }
            }
            else {
                this.switchView(this._views.qrcode);
            }
            this._elements.recordButton.onclick = async (ev) => {
                ev.preventDefault();
                if (!this._uploader)
                    return;
                let origHtml = this._elements.recordButton.innerHTML;
                let samplingInterval;
                try {
                    this._elements.recordButton.innerHTML = '<i class="fas fa-microphone mr-2"></i>Waiting...';
                    this._elements.recordButton.classList.add('disabled');
                    this._elements.progressCircle.classList.remove('no-spin');
                    let length = Number(this._elements.lengthText.textContent) * 1000;
                    let remaining = length;
                    this._elements.samplingTimeLeft.textContent = '...';
                    this._elements.samplingCircle.style.opacity = '1';
                    await this.sleep(500); // give a bit of time for the user
                    this._elements.samplingTimeLeft.textContent = Math.floor(remaining / 1000) + 's';
                    samplingInterval = setInterval(() => {
                        remaining -= 1000;
                        if (remaining < 0) {
                            return clearInterval(samplingInterval);
                        }
                        this._elements.samplingTimeLeft.textContent = Math.floor(remaining / 1000) + 's';
                    }, 1000);
                    this._elements.recordButton.innerHTML = '<i class="fas fa-microphone mr-2"></i>Recording...';
                    let sample = await microphone.takeSample({
                        frequency: 16000,
                        length: length
                    });
                    clearInterval(samplingInterval);
                    this._elements.samplingCircle.style.opacity = '0';
                    this._elements.recordButton.innerHTML = '<i class="fas fa-microphone mr-2"></i>Uploading...';
                    console.log('took sample');
                    let category = this._elements.categoryText.textContent || 'training';
                    if (this._elements.categoryText.textContent === 'split') {
                        if (this._numCaptures > 0) {
                            category = await this.getCategoryFromString(JSON.stringify(sample.values));
                        }
                        else {
                            category = 'training';
                        }
                    }
                    this._numCaptures = this._numCaptures + length;
                    let details = {
                        hmacKey: this._hmacKey,
                        interval: 0,
                        label: this._elements.labelText.textContent || 'unknown',
                        length: 0,
                        path: '/api/' + category + '/data',
                        sensor: microphone.getProperties().name
                    };
                    let data = messages_4.dataMessage({
                        apiKey: settings_7.getApiKey(),
                        device: {
                            deviceId: settings_7.getDeviceId(),
                            sensors: [microphone].map(s => {
                                let p = s.getProperties();
                                return {
                                    name: p.name,
                                    frequencies: p.frequencies,
                                    maxSampleLength: p.maxSampleLength
                                };
                            }),
                            deviceType: 'MOBILE_CLIENT'
                        }
                    }, sample);
                    console.log('details', details, 'data', data, 'sample', sample);
                    // tslint:disable-next-line: no-floating-promises
                    (async () => {
                        if (!this._uploader)
                            return;
                        try {
                            let filename = await this._uploader.uploadSample(details, data, sample);
                            $.notifyClose();
                            notify_3.Notify.notify('', 'Uploaded "' + filename + '" to ' + category + ' category', 'top', 'center', 'far fa-check-circle', 'success');
                        }
                        catch (ex) {
                            $.notifyClose();
                            notify_3.Notify.notify('Failed to upload', ex.message || ex.toString(), 'top', 'center', 'far fa-times-circle', 'danger');
                        }
                    })();
                    let minutes = Math.floor(this._numCaptures / 1000 / 60);
                    let seconds = (this._numCaptures / 1000) % 60;
                    if (minutes > 0) {
                        this._elements.capturedCount.textContent = `${minutes}m${seconds}s`;
                    }
                    else {
                        this._elements.capturedCount.textContent = `${seconds}s`;
                    }
                }
                catch (ex) {
                    alert('Failed to upload: ' + (ex.message || ex.toString()));
                }
                finally {
                    this._elements.recordButton.innerHTML = origHtml;
                    this._elements.recordButton.classList.remove('disabled');
                    this._elements.progressCircle.classList.add('no-spin');
                    this._elements.samplingCircle.style.opacity = '0';
                    if (samplingInterval) {
                        clearInterval(samplingInterval);
                    }
                }
            };
            this._elements.labelLink.onclick = ev => {
                ev.preventDefault();
                let v = prompt('Enter a label', this._elements.labelText.textContent || '');
                if (v) {
                    if (v && this._elements.labelText.textContent !== v) {
                        this._numCaptures = 0;
                        this._elements.capturedCount.textContent = '0s';
                    }
                    this._elements.labelText.textContent = v.toLowerCase();
                    localStorage.setItem('last-microphone-label', this._elements.labelText.textContent);
                }
            };
            this._elements.lengthLink.onclick = ev => {
                ev.preventDefault();
                let v = prompt('Set length in seconds', this._elements.lengthText.textContent || '');
                if (v && !isNaN(Number(v))) {
                    if (v && this._elements.lengthText.textContent !== v) {
                        this._numCaptures = 0;
                        this._elements.capturedCount.textContent = '0s';
                    }
                    this._elements.lengthText.textContent = v.toLowerCase();
                    localStorage.setItem('last-microphone-length', this._elements.lengthText.textContent);
                }
            };
            this._elements.categorySelect.oninput = () => {
                if (this._elements.categoryText.textContent !== this._elements.categorySelect.value) {
                    this._numCaptures = 0;
                    this._elements.capturedCount.textContent = '0s';
                }
                this._elements.categoryText.textContent = this._elements.categorySelect.value;
                localStorage.setItem('last-microphone-category', this._elements.categoryText.textContent);
            };
            this._elements.categoryLink.onclick = ev => {
                ev.preventDefault();
                console.log('category link click', ev);
                let element = this._elements.categorySelect;
                let event;
                event = document.createEvent('MouseEvents');
                event.initMouseEvent('mousedown', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
                element.dispatchEvent(event);
                // this._elements.categorySelect.focus();
            };
        }
        switchView(view) {
            for (const k of Object.keys(this._views)) {
                this._views[k].style.display = 'none';
            }
            view.style.display = '';
        }
        grantPermission() {
            let sensor = this._sensors.find(s => s.getProperties().name.toLowerCase() === 'microphone');
            if (!sensor) {
                this._elements.connectionFailedMessage.textContent = 'Could not find microphone';
                this.switchView(this._views.connectionFailed);
                return;
            }
            sensor.checkPermissions(true).then(result => {
                if (result) {
                    this.switchView(this._views.capture);
                    if (!this._elements.labelText.textContent) {
                        this._elements.labelLink.click();
                    }
                }
                else {
                    alert('User has rejected microphone permissions');
                }
            }).catch(err => {
                console.error(err);
                this._elements.connectionFailedMessage.textContent = err;
                this.switchView(this._views.connectionFailed);
            });
        }
        sleep(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        }
        async getDevelopmentApiKeys(apiKey) {
            let l = new classification_loader_4.ClassificationLoader(settings_7.getStudioEndpoint(), apiKey);
            let projectId = await l.getProject();
            try {
                return await l.getDevelopmentKeys(projectId.id);
            }
            catch (ex) {
                console.warn('Could not find development keys for project ' + projectId, ex);
                return {
                    apiKey: undefined,
                    hmacKey: undefined
                };
            }
        }
        async getCategoryFromString(str) {
            let encoded = new TextEncoder().encode(str);
            let hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            let hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            while (hash.length > 0 && hash[0] === 'f') {
                hash = hash.substr(1);
            }
            if (hash.length === 0) {
                throw new Error('Failed to calculate SHA256 hash of buffer');
            }
            let firstHashChar = hash[0];
            if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b'].indexOf(firstHashChar) > -1) {
                return 'training';
            }
            else {
                return 'testing';
            }
        }
    }
    exports.MicrophoneDataCollectionClientViews = MicrophoneDataCollectionClientViews;
});
define("client/init", ["require", "exports", "client/collection-views", "client/classification-views", "client/settings", "client/camera-collection-views", "client/collection-keyword", "client/microphone-collection-views"], function (require, exports, collection_views_1, classification_views_1, settings_8, camera_collection_views_1, collection_keyword_1, microphone_collection_views_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    async function mobileClientLoader(mode) {
        settings_8.storeIngestionApi(settings_8.getIngestionApi());
        settings_8.storeRemoteManagementEndpoint(settings_8.getRemoteManagementEndpoint());
        settings_8.storeStudioEndpoint(settings_8.getStudioEndpoint());
        if (mode === 'data-collection') {
            let client = new collection_views_1.DataCollectionClientViews();
            await client.init();
            window.client = client;
        }
        else if (mode === 'classifier') {
            let client = new classification_views_1.ClassificationClientViews();
            await client.init();
            window.client = client;
        }
        else if (mode === 'data-collection-camera') {
            let client = new camera_collection_views_1.CameraDataCollectionClientViews();
            await client.init();
            window.client = client;
        }
        else if (mode === 'data-collection-microphone') {
            let client = new microphone_collection_views_1.MicrophoneDataCollectionClientViews();
            await client.init();
            window.client = client;
        }
        else if (mode === 'data-collection-keyword') {
            let client = new collection_keyword_1.DataCollectionKeywordClientViews();
            await client.init();
            window.client = client;
        }
        // tslint:disable-next-line:no-console
        console.log('Hello world from the Edge Impulse mobile client', mode);
    }
    exports.default = mobileClientLoader;
});
//# sourceMappingURL=bundle.js.map