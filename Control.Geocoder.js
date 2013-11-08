(function (factory) {
	// Packaging/modules magic dance
	var L;
	if (typeof define === 'function' && define.amd) {
		// AMD
		define(['leaflet'], factory);
	} else if (typeof module !== 'undefined') {
		// Node/CommonJS
		L = require('leaflet');
		module.exports = factory(L);
	} else {
		// Browser globals
		if (typeof window.L === 'undefined')
			throw 'Leaflet must be loaded first';
		factory(window.L);
	}
}(function (L) {
	'use strict';
	L.Control.Geocoder = L.Control.extend({
		options: {
			collapsed: true,
			position: 'topright',
			placeholder: 'Search...',
			errorMessage: 'Nothing found.'
		},

		_callbackId: 0,

		initialize: function (options) {
			L.Util.setOptions(this, options);
			if (!this.options.geocoder) {
				this.options.geocoder = new L.Control.Geocoder.Nominatim();
			}
		},

		onAdd: function (map) {
			this._map = map;
			var className = 'leaflet-control-geocoder';

			var form = this._form = L.DomUtil.create('form', className + '-form');

			var input = this._input = document.createElement('input');
			input.type = 'text';
			//input.placeholder = this.options.placeholder;
			L.DomEvent.addListener(input, 'onkeydown', this._clearResults, this);
			L.DomEvent.addListener(input, 'onpaste', this._clearResults, this);
			L.DomEvent.addListener(input, 'oninput', this._clearResults, this);

			this._errorElement = document.createElement('div');
			this._errorElement.className = className + '-form-no-error';
			this._errorElement.innerHTML = this.options.errorMessage;

			this._alts = L.DomUtil.create('ul', className + '-alternatives');
			this._alts.style.display = 'none';

			form.appendChild(input);
			form.appendChild(this._errorElement);
			form.appendChild(this._alts);

			L.DomEvent.addListener(form, 'submit', this._geocode, this);

			if (this.options.collapsed) {
				L.DomEvent.addListener(input, 'mouseover', this._expand, this);
				L.DomEvent.addListener(input, 'mouseout', this._collapse, this);

				this._map.on('movestart', this._collapse, this);
			} else {
				this._expand();
			}

			return form;
		},

		_geocodeResult: function (results) {
			this._input.className = this._input.className.replace(' leaflet-control-geocoder-throbber', '');
			if (results.length === 1) {
				this.markGeocode(results[0]);
			} else if (results.length > 0) {
				this._results = results;
				this._alts.style.display = 'block';
				for (var i = 0; i < results.length; i++) {
					this._alts.appendChild(this._createAlt(results[i]));
				}
			} else {
				L.DomUtil.addClass(this._errorElement, 'leaflet-control-geocoder-error');
			}
		},

		markGeocode: function(result) {
			this._map.fitBounds(result.bbox);

			if (this._geocodeMarker) {
				this._map.removeLayer(this._geocodeMarker);
			}

			this._geocodeMarker = new L.Marker(result.center)
				.bindPopup(result.name)
				.addTo(this._map)
				.openPopup();

			return this;
		},

		_geocode: function(event) {
			L.DomEvent.preventDefault(event);

			this._input.className += ' leaflet-control-geocoder-throbber';
			this._clearResults();
			this.options.geocoder.geocode(this._input.value, this._geocodeResult, this);

			return false;
		},

		_expand: function () {
			L.DomUtil.addClass(this._container, 'leaflet-control-geocoder-expanded');
		},

		_collapse: function () {
			this._container.className = this._container.className.replace(' leaflet-control-geocoder-expanded', '');
		},

		_clearResults: function () {
			this._alts.style.display = 'none';
			this._alts.innerHTML = '';
			L.DomUtil.removeClass(this._errorElement, 'leaflet-control-geocoder-error');
		},

		_createAlt: function(result) {
			var _this = this,
				li = document.createElement('li');
			li.innerHTML = '<a href="#">' + result.name + '</a>';
			li.onclick = function() {
				_this.markGeocode.call(_this, result);
			};

			return li;
		}
	});

	L.Control.geocoder = function(id, options) {
		return new L.Control.Geocoder(id, options);
	};

	L.Control.Geocoder.callbackId = 0;
	L.Control.Geocoder.jsonp = function(url, params, callback, context, jsonpParam) {
		var callbackId = '_l_geocoder_' + (L.Control.Geocoder.callbackId++);
		params[jsonpParam || 'callback'] = callbackId;
		window[callbackId] = L.Util.bind(callback, context);
		var script = document.createElement('script');
		script.type = 'text/javascript';
		script.src = url + L.Util.getParamString(params);
		script.id = callbackId;
		document.getElementsByTagName('head')[0].appendChild(script);
	};

	L.Control.Geocoder.Nominatim = L.Class.extend({
		options: {
			serviceUrl: 'http://nominatim.openstreetmap.org/search/'
		},

		initialize: function(options) {
			L.Util.setOptions(this, options);
		},

		geocode: function(query, cb, context) {
			L.Control.Geocoder.jsonp(this.options.serviceUrl, {
				q: query,
				limit: 5,
				format: 'json'
			}, function(data) {
				var results = [];
				for (var i = data.length - 1; i >= 0; i--) {
					var bbox = data[i].boundingbox;
					for (var j = 0; j < 4; j++) bbox[j] = parseFloat(bbox[j]);
					results[i] = {
						name: data[i].display_name,
						bbox: L.latLngBounds([bbox[0], bbox[2]], [bbox[1], bbox[3]]),
						center: L.latLng((bbox[0] + bbox[1]) / 2, (bbox[2] + bbox[3]) / 2)
					};
				}
				cb.call(context, results);
			}, this, 'json_callback');
		},
	});

	L.Control.Geocoder.nominatim = function(options) {
		return new L.Control.Geocoder.Nominatim(options);
	};

	L.Control.Geocoder.Bing = L.Class.extend({
		initialize: function(key) {
			this.key = key;
		},

		geocode : function (query, cb, context) {
			L.Control.Geocoder.jsonp('http://dev.virtualearth.net/REST/v1/Locations', {
				query: query,
				key : this.key
			}, function(data) {
				var results = [];
				for (var i = data.resourceSets.resources.length - 1; i >= 0; i--) {
					var resource = data.resourceSets.resources[i];
					results[i] = {
						name: resource.name,
						bbox: L.latLngBounds(resource.bbox),
						center: L.latLng(resource.point.coordinates)
					};
				}
				cb.call(context, results);
			}, this, 'jsonp');
		},
	});

	L.Control.Geocoder.bing = function() {
		return new L.Control.Geocoder.Bing();
	};

	L.Control.Geocoder.RaveGeo = L.Class.extend({
		options: {
			querySuffix: '',
			deepSearch: true,
			wordBased: false
		},

		jsonp: function(params, callback, context) {
			var callbackId = '_l_geocoder_' + (L.Control.Geocoder.callbackId++);
			params.prepend = callbackId + '(';
			params.append = ')';
			window[callbackId] = L.Util.bind(callback, context);
			var script = document.createElement('script');
			script.type = 'text/javascript';
			script.src = this._serviceUrl + '?' + L.Util.getParamString(params);
			script.id = callbackId;
			document.getElementsByTagName('head')[0].appendChild(script);
		},

		initialize: function(serviceUrl, scheme, options) {
			L.Util.setOptions(this, options);

			this._serviceUrl = serviceUrl;
			this._scheme = scheme;
		},

		geocode: function(query, cb, context) {
			L.Control.Geocoder.jsonp(this._serviceUrl, {
				address: query + this.options.querySuffix,
				scheme: this._scheme,
				outputFormat: 'jsonp',
				deepSearch: this.options.deepSearch,
				wordBased: this.options.wordBased
			}, function(data) {
				var results = [];
				for (var i = data.length - 1; i >= 0; i--) {
					var r = data[i],
						c = L.latLng(r.y, r.x);
					results[i] = {
						name: r.address,
						bbox: L.latLngBounds([c]),
						center: c
					};
				}
				cb.call(context, results);
			}, this);
		}
	});

	return L.Control.Geocoder;
}));
