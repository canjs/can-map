/*can-map@3.4.1#map-helpers*/
define([
    'require',
    'exports',
    'module',
    'can-util/js/is-plain-object',
    'can-util/js/is-promise',
    'can-cid',
    'can-util/js/assign',
    'can-reflect'
], function (require, exports, module) {
    var isPlainObject = require('can-util/js/is-plain-object');
    var isPromise = require('can-util/js/is-promise');
    var CID = require('can-cid');
    var assign = require('can-util/js/assign');
    var canReflect = require('can-reflect');
    var madeMap = null;
    var teardownMap = function () {
        for (var cid in madeMap) {
            if (madeMap[cid].added) {
                delete madeMap[cid].obj._cid;
            }
        }
        madeMap = null;
    };
    var mapHelpers = {
        attrParts: function (attr, keepKey) {
            if (keepKey) {
                return [attr];
            }
            return typeof attr === 'object' ? attr : ('' + attr).split('.');
        },
        canMakeObserve: function (obj) {
            return obj && !isPromise(obj) && (Array.isArray(obj) || isPlainObject(obj));
        },
        reflectSerialize: function (unwrapped) {
            this.each(function (val, name) {
                if (this.___serialize) {
                    val = this.___serialize(name, val);
                } else {
                    val = canReflect.serialize(val);
                }
                if (val !== undefined) {
                    unwrapped[name] = val;
                }
            }, this);
            return unwrapped;
        },
        reflectUnwrap: function (unwrapped) {
            this.each(function (value, key) {
                if (value !== undefined) {
                    unwrapped[key] = canReflect.unwrap(value);
                }
            });
            return unwrapped;
        },
        removeSpecialKeys: function (map) {
            if (map) {
                [
                    '_data',
                    'constructor',
                    '_cid',
                    '__bindEvents'
                ].forEach(function (key) {
                    delete map[key];
                });
            }
            return map;
        },
        define: null,
        addComputedAttr: function (map, attrName, compute) {
            map._computedAttrs[attrName] = {
                compute: compute,
                count: 0,
                handler: function (newVal, oldVal) {
                    map._triggerChange(attrName, 'set', newVal, oldVal);
                }
            };
        },
        addToMap: function addToMap(obj, instance) {
            var teardown;
            if (!madeMap) {
                teardown = teardownMap;
                madeMap = {};
            }
            var hasCid = obj._cid;
            var cid = CID(obj);
            if (!madeMap[cid]) {
                madeMap[cid] = {
                    obj: obj,
                    instance: instance,
                    added: !hasCid
                };
            }
            return teardown;
        },
        getMapFromObject: function (obj) {
            return madeMap && madeMap[obj._cid] && madeMap[obj._cid].instance;
        },
        twoLevelDeepExtend: function (destination, source) {
            for (var prop in source) {
                destination[prop] = destination[prop] || {};
                assign(destination[prop], source[prop]);
            }
        }
    };
    module.exports = exports = mapHelpers;
});