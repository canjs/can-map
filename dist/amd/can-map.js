/*can-map@3.1.0-pre.4#can-map*/
define(function (require, exports, module) {
    var bubble = require('./bubble');
    var mapHelpers = require('./map-helpers');
    var canEvent = require('can-event');
    var canBatch = require('can-event/batch');
    var eventLifecycle = require('can-event/lifecycle');
    var Construct = require('can-construct');
    var Observation = require('can-observation');
    var ObserveReader = require('can-observation/reader');
    var canCompute = require('can-compute');
    var singleReference = require('can-compute/single-reference');
    var namespace = require('can-namespace');
    var dev = require('can-util/js/dev');
    var CID = require('can-cid');
    var deepAssign = require('can-util/js/deep-assign');
    var isFunction = require('can-util/js/is-function');
    var assign = require('can-util/js/assign');
    var types = require('can-types');
    var canReflect = require('can-reflect');
    var canSymbol = require('can-symbol');
    var unobservable = { 'constructor': true };
    var hasOwnProperty = {}.hasOwnProperty;
    var setValueSymbol = canSymbol.for('can.setValue');
    var Map = Construct.extend({
        setup: function (baseMap) {
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
                    mapHelpers.define(this, baseMap.prototype.define);
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
            Observation.add(map, '__keys');
            return canReflect.getOwnEnumerableKeys(map._data);
        }
    }, {
        setup: function (obj) {
            if (canReflect.isObservableLike(obj) && typeof obj.serialize === 'function') {
                obj = obj.serialize();
            }
            this._data = Object.create(null);
            CID(this, '.map');
            this._setupComputedProperties();
            var teardownMapping = obj && mapHelpers.addToMap(obj, this);
            var defaultValues = this._setupDefaults(obj);
            var data = assign(deepAssign(true, {}, defaultValues), obj);
            this.attr(data);
            if (teardownMapping) {
                teardownMapping();
            }
        },
        _setupComputedProperties: function () {
            this._computedAttrs = Object.create(null);
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
                    Observation.add(this, attr);
                    return value;
                }
                var first = attr.substr(0, dotIndex), second = attr.substr(dotIndex + 1);
                var current = this.__get(first);
                return current && canReflect.getKeyValue(current, second);
            } else {
                return this.__get(attr);
            }
        },
        __get: function (attr) {
            if (!unobservable[attr] && !this._computedAttrs[attr]) {
                Observation.add(this, attr);
            }
            return this.___get(attr);
        },
        ___get: function (attr) {
            if (attr !== undefined) {
                var computedAttr = this._computedAttrs[attr];
                if (computedAttr && computedAttr.compute) {
                    return computedAttr.compute();
                } else {
                    return hasOwnProperty.call(this._data, attr) ? this._data[attr] : undefined;
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
                if (canReflect.isMapLike(current)) {
                    canReflect.setKeyValue(current, second, value);
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
            if (typeof value === 'object' && !canReflect.isObservableLike(value) && mapHelpers.canMakeObserve(value) && !canReflect.isListLike(value)) {
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
                var changeType = computedAttr || current !== undefined || hasOwnProperty.call(this.___get(), prop) ? 'set' : 'add';
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
                return canReflect.deleteKeyValue(current, parts.join('.'));
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
                if (canReflect.isMapLike(curVal) && mapHelpers.canMakeObserve(newVal)) {
                    if (setValueSymbol in curVal) {
                        curVal[setValueSymbol](newVal, remove);
                    } else {
                        canReflect.eachKey(curVal, function (val, key) {
                            if (newVal[key]) {
                                canReflect.setKeyValue(curVal, key, val);
                            } else if (remove) {
                                canReflect.deleteKeyValue(curVal, key);
                            }
                        });
                    }
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
                canEvent.dispatch.call(this, {
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
            canEvent.dispatch.call(this, {
                type: attr,
                target: this,
                batchNum: batchNum
            }, [
                newVal,
                oldVal
            ]);
            if (how === 'remove' || how === 'add') {
                canEvent.dispatch.call(this, {
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
                    canReflect.onValue(computedBinding.compute, computedBinding.handler);
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
                    canReflect.offValue(computedBinding.compute, computedBinding.handler);
                } else {
                    computedBinding.count--;
                }
            }
            bubble.unbind(this, eventName);
            return eventLifecycle.removeAndTeardown.apply(this, arguments);
        },
        compute: function (prop) {
            if (isFunction(this.constructor.prototype[prop])) {
                return canCompute(this[prop], this);
            } else {
                var reads = ObserveReader.reads(prop);
                var last = reads.length - 1;
                return canCompute(function (newVal) {
                    if (arguments.length) {
                        ObserveReader.write(this, reads[last].key, newVal);
                    } else {
                        return ObserveReader.get(this, prop);
                    }
                }, this);
            }
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
                if (hasOwnProperty.call(data, prop)) {
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
    canReflect.set(Map.prototype, canSymbol.for('can.onKeyValue'), function (key, handler) {
        var translationHandler = function (ev, newValue, oldValue) {
            handler.call(this, newValue, oldValue);
        };
        singleReference.set(handler, this, translationHandler, key);
        this.addEventListener(key, translationHandler);
    });
    canReflect.set(Map.prototype, canSymbol.for('can.offKeyValue'), function (key, handler) {
        this.removeEventListener(key, singleReference.getAndDelete(handler, this, key));
    });
    Map.prototype[canSymbol.for('can.isMapLike')] = true;
    Map.prototype[canSymbol.for('can.isListLike')] = false;
    Map.prototype[canSymbol.for('can.isValueLike')] = false;
    Map.prototype[canSymbol.for('can.getKeyValue')] = Map.prototype._get;
    Map.prototype[canSymbol.for('can.setKeyValue')] = Map.prototype._set;
    Map.prototype[setValueSymbol] = Map.prototype._setAttrs;
    Map.prototype[canSymbol.for('can.deleteKeyValue')] = Map.prototype._remove;
    Map.prototype[canSymbol.for('can.keyHasDependencies')] = function (key) {
        return this._computedAttrs && this._computedAttrs[key] && this._computedAttrs[key].compute && canReflect.valueHasDependencies(this._computedAttrs[key].compute);
    };
    Map.prototype[canSymbol.for('can.getKeyDependencies')] = function (key) {
        return this._computedAttrs && this._computedAttrs[key] && canReflect.getValueDependencies(this._computedAttrs[key].compute);
    };
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