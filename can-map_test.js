/* jshint asi:true */
/*jshint -W079 */
var Map = require('can-map');
var QUnit = require('steal-qunit');
var canCompute = require('can-compute');
var ObservationRecorder = require('can-observation-recorder');
var Construct = require('can-construct');
var observeReader = require('can-stache-key');
var canReflect = require('can-reflect');
var canSymbol = require('can-symbol');
var queues = require("can-queues");

QUnit.module('can-map');

test("Basic Map", 4, function () {

	var state = new Map({
		category: 5,
		productType: 4
	});

	state.bind("change", function (ev, attr, how, val, old) {
		equal(attr, "category", "correct change name");
		equal(how, "set");
		equal(val, 6, "correct");
		equal(old, 5, "correct");
	});

	state.attr("category", 6);

	state.unbind("change");

});

test("Nested Map", 5, function () {
	var me = new Map({
		name: {
			first: "Justin",
			last: "Meyer"
		}
	});

	ok(me.attr("name") instanceof Map);

	me.bind("change", function (ev, attr, how, val, old) {
		equal(attr, "name.first", "correct change name");
		equal(how, "set");
		equal(val, "Brian", "correct");
		equal(old, "Justin", "correct");
	});

	me.attr("name.first", "Brian");

	me.unbind("change");

});

test("remove attr", function () {
	var state = new Map({
		category: 5,
		productType: 4
	});
	state.removeAttr("category");
	deepEqual(Map.keys(state), ["productType"], "one property");
});

test("remove attr on key with dot", function () {
	var state = new Map({
		"key.with.dots": 12,
		productType: 4
	});
	var state2 = new Map({
		"key.with.dots": 4,
		key: {
			"with": {
				someValue: 20
			}
		}
	});
	state.removeAttr("key.with.dots");
	state2.removeAttr("key.with.someValue");
	deepEqual( Map.keys(state), ["productType"], "one property");
	deepEqual( Map.keys(state2), ["key.with.dots", "key"], "two properties");
	deepEqual( Map.keys( state2.key["with"] ) , [], "zero properties");
});

test("nested event handlers are not run by changing the parent property (#280)", function () {

	var person = new Map({
		name: {
			first: "Justin"
		}
	})
	person.bind("name.first", function (ev, newName) {
		ok(false, "name.first should never be called")
		//equal(newName, "hank", "name.first handler called back with correct new name")
	});
	person.bind("name", function () {
		ok(true, "name event triggered")
	})

	person.attr("name", {
		first: "Hank"
	});

});

test("cyclical objects (#521)", function () {

	var foo = {};
	foo.foo = foo;

	var fooed = new Map(foo);

	ok(true, "did not cause infinate recursion");

	ok(fooed.attr('foo') === fooed, "map points to itself")

	var me = {
		name: "Justin"
	}
	var references = {
		husband: me,
		friend: me
	}
	var ref = new Map(references)

	ok(ref.attr('husband') === ref.attr('friend'), "multiple properties point to the same thing")

})

test('_cid add to original object', function () {
	var map = new Map(),
		obj = {
			'name': 'thecountofzero'
		};

	map.attr('myObj', obj);
	ok(!obj._cid, '_cid not added to original object');
});

test("Map serialize triggers reading (#626)", function () {
	var old = ObservationRecorder.add;

	var attributesRead = [];
	var readingTriggeredForKeys = false;

	ObservationRecorder.add = function (object, attribute) {
		if (attribute === "__keys") {
			readingTriggeredForKeys = true;
		} else {
			attributesRead.push(attribute);
		}
	};

	var testMap = new Map({
		cats: "meow",
		dogs: "bark"
	});

	testMap.serialize();



	ok(attributesRead.indexOf("cats") !== -1 && attributesRead.indexOf("dogs") !== -1, "map serialization triggered __reading on all attributes");
	ok(readingTriggeredForKeys, "map serialization triggered __reading for __keys");

	ObservationRecorder.add = old;
})

test("Test top level attributes", 7, function () {
	var test = new Map({
		'my.enable': false,
		'my.item': true,
		'my.count': 0,
		'my.newCount': 1,
		'my': {
			'value': true,
			'nested': {
				'value': 100
			}
		}
	});

	equal(test.attr('my.value'), true, 'correct');
	equal(test.attr('my.nested.value'), 100, 'correct');
	ok(test.attr("my.nested") instanceof Map);

	equal(test.attr('my.enable'), false, 'falsey (false) value accessed correctly');
	equal(test.attr('my.item'), true, 'truthey (true) value accessed correctly');
	equal(test.attr('my.count'), 0, 'falsey (0) value accessed correctly');
	equal(test.attr('my.newCount'), 1, 'falsey (1) value accessed correctly');
});


test("serializing cycles", function(){
	var map1 = new Map({name: "map1"});
	var map2 = new Map({name: "map2"});

	map1.attr("map2", map2);
	map2.attr("map1", map1);

	var res = map1.serialize();
	equal(res.name, "map1");
	equal(res.map2.name, "map2");
});

test("Unbinding from a map with no bindings doesn't throw an error (#1015)", function() {
	expect(0);

	var test = new Map({});

	try {
		test.unbind('change');
	} catch(e) {
		ok(false, 'No error should be thrown');
	}
});

test("Fast dispatch event still has target and type (#1082)", 4, function() {
	var data = new Map({
		name: 'CanJS'
	});

	data.bind('change', function(ev){
		equal(ev.type, 'change');
		equal(ev.target, data);
	});

	data.bind('name', function(ev){
		equal(ev.type, 'name');
		equal(ev.target, data);
	});

	data.attr('name', 'David');
});

test("map passed to Map constructor (#1166)", function(){
	function y() {}

	var map = new Map({
		x: 1,
		y: y
	});
	var res = new Map(map);
	deepEqual(res.attr(), {
		x: 1,
		y: y
	}, "has the same properties");
});

test("constructor passed to scope is threated as a property (#1261)", function(){
	var Constructor = Construct.extend({});

	var MyMap = Map.extend({
	  Todo: Constructor
	});

	var m = new MyMap();

	equal(m.attr("Todo"), Constructor);
});

test('_bindings count maintained after calling .off() on undefined property (#1490) ', function () {

	var map = new Map({
		test: 1
	});

	map.on('test', function(){});
	var handlers = map[canSymbol.for("can.meta")].handlers;

	equal(handlers.get([]).length, 1, 'The number of bindings is correct');

	map.off('undefined_property');

	equal(handlers.get([]).length, 1, 'The number of bindings is still correct');
});

test("Should be able to get and set attribute named 'watch' on Map in Firefox", function() {
	var map = new Map({});
	map.attr("watch");
	ok(true, "can have attribute named 'watch' on a Map instance");
});

test("Should be able to get and set attribute named 'unwatch' on Map in Firefox", function() {
	var map = new Map({});
	map.attr("unwatch");
	ok(true, "can have attribute named 'unwatch' on a Map instance");
});

test('should get an empty string property value correctly', function() {
	var map = new Map({
		foo: 'foo',
		'': 'empty string'
	});

	equal(map.attr(''), 'empty string');
});


test("ObserveReader - can.Construct derived classes should be considered objects, not functions (#450)", function() {
	var foostructor = Map.extend({ text: "bar" }, {}),
		obj = {
			next_level: {
				thing: foostructor,
				text: "In the inner context"
			}
		},
		read;
	foostructor.self = foostructor;

	read = observeReader.read(obj, observeReader.reads("next_level.thing.self.text") );
	equal(read.value, "bar", "static properties on a can.Construct-based function");

	read = observeReader.read(obj, observeReader.reads("next_level.thing.self"), { isArgument: true });
	ok(read.value === foostructor, "arguments shouldn't be executed");

});

// TODO re-enable tests after getting can-compute up to speed or replacing with simple observables
// test("Basic Map.prototype.compute", function () {

// 	var state = new Map({
// 		category: 5,
// 		productType: 4
// 	});
// 	var catCompute = state.compute('category');
// 	var prodCompute = state.compute('productType');

// 	catCompute.bind("change", function (ev, val, old) {
// 		equal(val, 6, "correct");
// 		equal(old, 5, "correct");
// 	});

// 	state.bind('productType', function(ev, val, old) {
// 		equal(val, 5, "correct");
// 		equal(old, 4, "correct");
// 	});

// 	state.attr("category", 6);
// 	prodCompute(5);

// 	catCompute.unbind("change");
// 	state.unbind("productType");

// });

// test("Deep Map.prototype.compute", function () {

// 	var state = new Map({
// 		product: {
// 			category: 5,
// 			productType: 4
// 		}
// 	});
// 	var catCompute = state.compute('product.category');
// 	var prodCompute = state.compute('product.productType');

// 	catCompute.bind("change", function (ev, val, old) {
// 		equal(val, 6, "correct");
// 		equal(old, 5, "correct");
// 	});

// 	state.attr('product').bind('productType', function(ev, val, old) {
// 		equal(val, 5, "correct");
// 		equal(old, 4, "correct");
// 	});

// 	state.attr("product.category", 6);
// 	prodCompute(5);

// 	catCompute.unbind("change");
// 	state.unbind("productType");

// });

test("works with can-reflect", 7, function(){
	var b = new Map({ "foo": "bar" });
	var c = new (Map.extend({
		"baz": canCompute(function(){
			return b.attr("foo");
		})
	}))({ "foo": "bar", thud: "baz" });

	QUnit.equal( canReflect.getKeyValue(b, "foo"), "bar", "unbound value");

	function bazHandler(newValue){
		QUnit.equal(newValue, "quux", "observed new value on baz");

		// Turn off the "foo" handler but "thud" should still be bound.
		canReflect.offKeyValue(c, "baz", bazHandler);
	}
	function thudHandler(newValue){
		QUnit.equal(newValue, "quux", "observed new value on thud");

		// Turn off the "foo" handler but "thud" should still be bound.
		canReflect.offKeyValue(c, "thud", thudHandler);
	}
	QUnit.ok(!canReflect.isValueLike(c), "isValueLike is false");
	QUnit.ok(canReflect.isMapLike(c), "isMapLike is true");
	QUnit.ok(!canReflect.isListLike(c), "isListLike is false");

	canReflect.onKeyValue(c, "baz", bazHandler);
	// Do a second binding to check that you can unbind correctly.
	canReflect.onKeyValue(c, "thud", thudHandler);

	b.attr("foo", "quux");
	c.attr("thud", "quux");

	QUnit.equal( canReflect.getKeyValue(c, "baz"), "quux", "bound value");
	// sanity checks to ensure that handler doesn't get called again.
	b.attr("foo", "thud");
	c.attr("baz", "jeek");

});

QUnit.test("onKeyValue and queues", function(){
	var b = new Map({ "foo": "bar" });
	var order = [];
	canReflect.onKeyValue(b, "foo", function(){
		order.push("onKeyValue");
	},"notify");

	queues.batch.start();
	queues.mutateQueue.enqueue(function(){
		order.push("mutate");
	});
	b.attr("foo","baz");
	queues.batch.stop();
	QUnit.deepEqual(order,["onKeyValue", "mutate"]);
});

QUnit.test("can-reflect setKeyValue", function(){
	var a = new Map({ "a": "b" });

	canReflect.setKeyValue(a, "a", "c");
	QUnit.equal(a.attr("a"), "c", "setKeyValue");
});

QUnit.test("can-reflect getKeyDependencies", function() {
	var a = new Map({ "a": "a" });
	var b = new (Map.extend({
		"a": canCompute(function(){
			return a.attr("a");
		}),
		"b": "b"
	}))();

	ok(canReflect.getKeyDependencies(b, "a"), "Dependencies on computed attr");
	ok(!canReflect.getKeyDependencies(b, "b"), "No dependencies on data attr");
	b.on("a", function() {});
	ok(canReflect.getKeyDependencies(b, "a").valueDependencies.has(b._computedAttrs.a.compute), "dependencies returned");
	ok(
		canReflect.getValueDependencies(b._computedAttrs.a.compute).valueDependencies,
		"dependencies returned from compute"
	);

});

QUnit.test("registered symbols", function() {
	var a = new Map({ "a": "a" });

	ok(a[canSymbol.for("can.isMapLike")], "can.isMapLike");
	equal(a[canSymbol.for("can.getKeyValue")]("a"), "a", "can.getKeyValue");
	a[canSymbol.for("can.setKeyValue")]("a", "b");
	equal(a.attr("a"), "b", "can.setKeyValue");

	function handler(val) {
		equal(this, a);
		equal(val, "c", "can.onKeyValue");
	}

	a[canSymbol.for("can.onKeyValue")]("a", handler);
	a.attr("a", "c");

	a[canSymbol.for("can.offKeyValue")]("a", handler);
	a.attr("a", "d"); // doesn't trigger handler
});


require("can-reflect-tests/observables/map-like/type/type")("Map", function(){
    return Map.extend({});
});


QUnit.test("can.isBound", function(){
	var Person = Map.extend({
        first: "any",
        last: "any"
    });
	var p = new Person();
	QUnit.ok(! p[canSymbol.for("can.isBound")](), "not bound");
});

QUnit.test("prototype properties", function(assert) {
	var MyMap = Map.extend({ letters: "ABC" });
	var map = new MyMap();
	assert.equal(map.attr("letters"), "ABC");
});

QUnit.test("can read numbers", function(assert) {
	var map = new Map({ 0: "zero" });
	assert.equal(canReflect.getKeyValue(map, 0), "zero");
	assert.equal(map.attr(0), "zero");


	canReflect.onKeyValue(0, function handler(ev, newVal) {
		assert.equal(newVal, "one");
		canReflect.offKeyValue(0, handler);
	});

	canReflect.setKeyValue(map, 0, "one");
});

QUnit.test("attr should work when remove === 'true'", function(assert) {
	var map = new Map({ 0: "zero" });

	map.attr({ 1: "one" }, "true");

	assert.equal(canReflect.getKeyValue(map, 0), undefined);
	assert.equal(map.attr(0), undefined);

	assert.equal(canReflect.getKeyValue(map, 1), "one");
	assert.equal(map.attr(1), "one");
});

QUnit.test("constructor should not bind on __keys (#106)", function(assert) {
	var map;

	var comp = canCompute(function() {
		map = new Map();
	});

	canReflect.onValue(comp, function() {});

	map.attr('foo', 'bar');

	assert.equal(map.attr('foo'), 'bar', 'map should not be reset');
});

QUnit.test(".attr(props) should overwrite if _legacyAttrBehavior is true (#112)", function(){
	Map.prototype._legacyAttrBehavior = true;

	var myMap1Instance = new Map({prop1: new Map()});

	var changes = 0;
	myMap1Instance.on("prop1", function() {
		changes++;
	});

	var map2 = new Map({prop1: "xyz"});

	myMap1Instance.attr({
		"prop1": map2
	});

	delete Map.prototype._legacyAttrBehavior;
	QUnit.equal(changes,1, "caused a change event");

	QUnit.equal(myMap1Instance.attr("prop1"), map2, "overwrite with maps");
});

QUnit.test(".attr() leaves typed instances alone if _legacyAttrBehavior is true (#111)", function(){

	Map.prototype._legacyAttrBehavior = true;


	function MyClass(value){
		this.value = value;
	}
	MyClass.prototype.log = function(){
		return this.value;
	};

	var myMap = new Map({
		myClass: new MyClass(5)
	});

	QUnit.equal( myMap.attr().myClass,  myMap.attr("myClass") )

	delete Map.prototype._legacyAttrBehavior;
});

QUnit.test(".serialize() leaves typed instances alone if _legacyAttrBehavior is true", function(){
	function MyClass(value) {
		this.value = value;
	}

	var myMap = new Map({
		_legacyAttrBehavior: true,
		myClass: new MyClass('foo')
	});

	var ser = myMap.serialize();
	QUnit.equal(ser.myClass, myMap.attr("myClass"));
});

QUnit.test("keys with undefined values should not be dropped (#118)", function() {
	// handles new instances
	var obj1 = { "keepMe": undefined };
	var map = new Map(obj1);
	// handles late props
	map.attr('foo', undefined);

	var keys = Map.keys(map);

	QUnit.deepEqual(keys, ["keepMe", "foo"])
});

QUnit.test("Can assign nested properties that are not CanMaps", function(){
	var MyType = function() {
		this.one = 'one';
		this.two = 'two';
		this.three = 'three';
	};
	MyType.prototype[canSymbol.for("can.onKeyValue")] = function(){};
	MyType.prototype[canSymbol.for("can.isMapLike")] = true;

	var map = new Map({
		_legacyAttrBehavior: true,
		foo: 'bar',
		prop: new MyType()
	});

	map.attr({
		prop: {one: '1', two: '2'}
	});

	// Did an assign
	QUnit.equal(map.attr("prop.one"), "1");
	QUnit.equal(map.attr("prop.two"), "2");
	QUnit.equal(map.attr("prop.three"), "three");

	// An update
	map.attr({
		prop: {one: 'one', two: 'two'}
	}, true);

	QUnit.equal(map.attr("prop.one"), "one");
	QUnit.equal(map.attr("prop.two"), "two");
	QUnit.equal(map.attr("prop.three"), undefined);
});
