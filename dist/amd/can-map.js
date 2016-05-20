/*can-map@3.0.0-pre.4#can-map*/
define(function (require, exports, module) {
    var bubble = require('./bubble');
    var mapHelpers = require('./map-helpers');
    var canEvent = require('can-event');
    var canBatch = require('can-event/batch');
    var eventLifecycle = require('can-event/lifecycle');
    var Construct = require('can-construct');
    var ObserveInfo = require('can-observe-info');
    var namespace = require('can-util/namespace');
    var dev = require('can-util/js/dev');
    var CID = require('can-util/js/cid');
    var deepExtend = require('can-util/js/deep-extend');
    var assign = require('can-util/js/assign');
    var types = require('can-util/js/types');
    var isArray = require('can-util/js/is-array');
    var unobservable = { 'constructor': true };
    var Map = Construct.extend({
        setup: function () {
            Construct.setup.apply(this, arguments);
            this._computedPropertyNames = [];
            if (Map) {
                if (!this.defaults) {
                    this.defaults = {};
                }
                for (var prop in this.prototype) {
                    if (prop !== 'define' && prop !== 'constructor' && (typeof this.prototype[prop] !== 'function' || this.prototype[prop].prototype instanceof Construct)) {
                        this.defaults[prop] = this.prototype[prop];
                    } else if (this.prototype[prop].isComputed) {
                        this._computedPropertyNames.push(prop);
                    }
                }
                if (mapHelpers.define) {
                    mapHelpers.define(this);
                }
            }
        },
        shortName: 'Map',
        _bubbleRule: function (eventName) {
            return eventName === 'change' || eventName.indexOf('.') >= 0 ? ['change'] : [];
        },
        addEventListener: eventLifecycle.addAndSetup,
        removeEventListener: eventLifecycle.removeAndTeardown,
        keys: function (map) {
            var keys = [];
            ObserveInfo.observe(map, '__keys');
            for (var keyName in map._data) {
                keys.push(keyName);
            }
            return keys;
        }
    }, {
        setup: function (obj) {
            if (obj instanceof Map) {
                obj = obj.serialize();
            }
            this._data = {};
            CID(this, '.map');
            this._setupComputedProperties();
            var teardownMapping = obj && mapHelpers.addToMap(obj, this);
            var defaultValues = this._setupDefaults(obj);
            var data = assign(deepExtend(true, {}, defaultValues), obj);
            this.attr(data);
            if (teardownMapping) {
                teardownMapping();
            }
        },
        _setupComputedProperties: function () {
            this._computedAttrs = {};
            var computes = this.constructor._computedPropertyNames;
            for (var i = 0, len = computes.length; i < len; i++) {
                var attrName = computes[i];
                mapHelpers.addComputedAttr(this, attrName, this[attrName].clone(this));
            }
        },
        _setupDefaults: function () {
            return this.constructor.defaults || {};
        },
        attr: function (attr, val) {
            var type = typeof attr;
            if (attr === undefined) {
                return this._getAttrs();
            } else if (type !== 'string' && type !== 'number') {
                return this._setAttrs(attr, val);
            } else if (arguments.length === 1) {
                return this._get(attr + '');
            } else {
                this._set(attr + '', val);
                return this;
            }
        },
        _get: function (attr) {
            var dotIndex = attr.indexOf('.');
            if (dotIndex >= 0) {
                var value = this.___get(attr);
                if (value !== undefined) {
                    ObserveInfo.observe(this, attr);
                    return value;
                }
                var first = attr.substr(0, dotIndex), second = attr.substr(dotIndex + 1);
                var current = this.__get(first);
                return current && current._get ? current._get(second) : undefined;
            } else {
                return this.__get(attr);
            }
        },
        __get: function (attr) {
            if (!unobservable[attr] && !this._computedAttrs[attr]) {
                ObserveInfo.observe(this, attr);
            }
            return this.___get(attr);
        },
        ___get: function (attr) {
            if (attr !== undefined) {
                var computedAttr = this._computedAttrs[attr];
                if (computedAttr && computedAttr.compute) {
                    return computedAttr.compute();
                } else {
                    return this._data.hasOwnProperty(attr) ? this._data[attr] : undefined;
                }
            } else {
                return this._data;
            }
        },
        _set: function (attr, value, keepKey) {
            var dotIndex = attr.indexOf('.'), current;
            if (dotIndex >= 0 && !keepKey) {
                var first = attr.substr(0, dotIndex), second = attr.substr(dotIndex + 1);
                current = this.__inSetup ? undefined : this.___get(first);
                if (types.isMapLike(current)) {
                    current._set(second, value);
                } else {
                    throw new Error('can-map: Object does not exist');
                }
            } else {
                current = this.__inSetup ? undefined : this.___get(attr);
                if (this.__convert) {
                    value = this.__convert(attr, value);
                }
                this.__set(attr, this.__type(value, attr), current);
            }
        },
        __type: function (value, prop) {
            if (typeof value === 'object' && !types.isMapLike(value) && mapHelpers.canMakeObserve(value) && !isArray(value)) {
                var cached = mapHelpers.getMapFromObject(value);
                if (cached) {
                    return cached;
                }
                var MapConstructor = this.constructor.Map || Map;
                return new MapConstructor(value);
            }
            return value;
        },
        __set: function (prop, value, current) {
            if (value !== current) {
                var computedAttr = this._computedAttrs[prop];
                var changeType = computedAttr || current !== undefined || this.___get().hasOwnProperty(prop) ? 'set' : 'add';
                this.___set(prop, typeof value === 'object' ? bubble.set(this, prop, value, current) : value);
                if (!computedAttr || !computedAttr.count) {
                    this._triggerChange(prop, changeType, value, current);
                }
                if (typeof current === 'object') {
                    bubble.teardownFromParent(this, current);
                }
            }
        },
        ___set: function (prop, val) {
            var computedAttr = this._computedAttrs[prop];
            if (computedAttr) {
                computedAttr.compute(val);
            } else {
                this._data[prop] = val;
            }
            if (typeof this.constructor.prototype[prop] !== 'function' && !computedAttr) {
                this[prop] = val;
            }
        },
        removeAttr: function (attr) {
            return this._remove(attr);
        },
        _remove: function (attr) {
            var parts = mapHelpers.attrParts(attr), prop = parts.shift(), current = this.___get(prop);
            if (parts.length && current) {
                return current.removeAttr(parts);
            } else {
                if (typeof attr === 'string' && !!~attr.indexOf('.')) {
                    prop = attr;
                }
                this.__remove(prop, current);
                return current;
            }
        },
        __remove: function (prop, current) {
            if (prop in this._data) {
                this.___remove(prop);
                this._triggerChange(prop, 'remove', undefined, current);
            }
        },
        ___remove: function (prop) {
            delete this._data[prop];
            if (!(prop in this.constructor.prototype)) {
                delete this[prop];
            }
        },
        ___serialize: function (name, val) {
            return mapHelpers.getValue(this, name, val, 'serialize');
        },
        _getAttrs: function () {
            return mapHelpers.serialize(this, 'attr', {});
        },
        _setAttrs: function (props, remove) {
            props = assign({}, props);
            var prop, self = this, newVal;
            canBatch.start();
            this._each(function (curVal, prop) {
                if (prop === '_cid') {
                    return;
                }
                newVal = props[prop];
                if (newVal === undefined) {
                    if (remove) {
                        self.removeAttr(prop);
                    }
                    return;
                }
                if (self.__convert) {
                    newVal = self.__convert(prop, newVal);
                }
                if (types.isMapLike(curVal) && mapHelpers.canMakeObserve(newVal)) {
                    curVal.attr(newVal, remove);
                } else if (curVal !== newVal) {
                    self.__set(prop, self.__type(newVal, prop), curVal);
                }
                delete props[prop];
            });
            for (prop in props) {
                if (prop !== '_cid') {
                    newVal = props[prop];
                    this._set(prop, newVal, true);
                }
            }
            canBatch.stop();
            return this;
        },
        serialize: function () {
            return mapHelpers.serialize(this, 'serialize', {});
        },
        _triggerChange: function (attr, how, newVal, oldVal, batchNum) {
            if (bubble.isBubbling(this, 'change')) {
                canBatch.trigger.call(this, {
                    type: 'change',
                    target: this,
                    batchNum: batchNum
                }, [
                    attr,
                    how,
                    newVal,
                    oldVal
                ]);
            }
            canBatch.trigger.call(this, {
                type: attr,
                target: this,
                batchNum: batchNum
            }, [
                newVal,
                oldVal
            ]);
            if (how === 'remove' || how === 'add') {
                canBatch.trigger.call(this, {
                    type: '__keys',
                    target: this,
                    batchNum: batchNum
                });
            }
        },
        _eventSetup: function () {
        },
        _eventTeardown: function () {
        },
        one: canEvent.one,
        addEventListener: function (eventName, handler) {
            var computedBinding = this._computedAttrs && this._computedAttrs[eventName];
            if (computedBinding && computedBinding.compute) {
                if (!computedBinding.count) {
                    computedBinding.count = 1;
                    computedBinding.compute.addEventListener('change', computedBinding.handler);
                } else {
                    computedBinding.count++;
                }
            }
            bubble.bind(this, eventName);
            return eventLifecycle.addAndSetup.apply(this, arguments);
        },
        removeEventListener: function (eventName, handler) {
            var computedBinding = this._computedAttrs && this._computedAttrs[eventName];
            if (computedBinding) {
                if (computedBinding.count === 1) {
                    computedBinding.count = 0;
                    computedBinding.compute.removeEventListener('change', computedBinding.handler);
                } else {
                    computedBinding.count--;
                }
            }
            bubble.unbind(this, eventName);
            return eventLifecycle.removeAndTeardown.apply(this, arguments);
        },
        each: function (callback, context) {
            var key, item;
            var keys = Map.keys(this);
            for (var i = 0, len = keys.length; i < len; i++) {
                key = keys[i];
                item = this.attr(key);
                if (callback.call(context || item, item, key, this) === false) {
                    break;
                }
            }
            return this;
        },
        _each: function (callback) {
            var data = this.___get();
            for (var prop in data) {
                if (data.hasOwnProperty(prop)) {
                    callback(data[prop], prop);
                }
            }
        },
        dispatch: canEvent.dispatch
    });
    Map.prototype.on = Map.prototype.bind = Map.prototype.addEventListener;
    Map.prototype.off = Map.prototype.unbind = Map.prototype.removeEventListener;
    Map.on = Map.bind = Map.addEventListener;
    Map.off = Map.unbind = Map.removeEventListener;
    var oldIsMapLike = types.isMapLike;
    types.isMapLike = function (obj) {
        if (obj instanceof Map) {
            return true;
        } else {
            return oldIsMapLike.call(this, obj);
        }
    };
    if (!types.DefaultMap) {
        types.DefaultMap = Map;
    }
    module.exports = namespace.Map = Map;
});