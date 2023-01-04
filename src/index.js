/* eslint-disable max-len */
/* eslint-disable no-shadow */
/* eslint-disable brace-style */
/* eslint-disable new-cap */
/* eslint-disable no-param-reassign */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-plusplus */
import L from 'leaflet';
import { throttle } from 'lodash';

const rbush = require('rbush');

const ratio = 2;
const url = new URL(window.location.href);
const fps = Number(url.searchParams.get('_markerFps')) || 24;
/* eslint-disable no-underscore-dangle */
function layerFactory(L) {
  const CanvasImageLayer = L.FeatureGroup.extend({
    // Add event listeners to initialized section.
    initialize(options) {
      L.setOptions(this, options);
      this._onClickListeners = [];
      this._onClickElsewhereListeners = [];
      this._onHoverListeners = [];
      this.throttleReset = throttle(this._reset.bind(this), 1000 / fps);
    },

    setOptions(options) {
      L.setOptions(this, options);
      return this.redraw();
    },

    redraw() {
      this._redraw(true);
    },

    // Multiple layers at a time for rBush performance
    addImageOverlays(imageOverlays) {
      const self = this;
      const tmpMark = [];
      const tmpLatLng = [];

      imageOverlays.forEach((imageOverlay) => {
        if (!(imageOverlay.options.pane === 'overlayPane' && imageOverlay._url)) {
          console.error("Layer isn't an imageOverlay");
          return;
        }
        const bounds = imageOverlay.getBounds();
        const isDisplaying = self._map.getBounds().intersects(bounds);
        const s = self._addImageOverlay(imageOverlay, bounds, isDisplaying);

        // Only add to Point Lookup if we are on map
        if (isDisplaying === true) tmpMark.push(s[0]);

        tmpLatLng.push(s[1]);
      });

      self._imageOverlays.load(tmpMark);
      self._latlngImageOverlays.load(tmpLatLng);
    },

    // Adds single layer at a time. Less efficient for rBush
    addImageOverlay(imageOverlay) {
      const self = this;
      const bounds = imageOverlay.getBounds();
      const isDisplaying = self._map.getBounds().intersects(bounds);
      const dat = self._addImageOverlay(imageOverlay, bounds, isDisplaying);

      // Only add to Point Lookup if we are on map
      if (isDisplaying === true) self._imageOverlays.insert(dat[0]);

      self._latlngImageOverlays.insert(dat[1]);
    },

    setBounds(layer, bounds) {
      if (layer.options.pane === 'overlayPane' && layer._url && bounds.getSouthWest) { this.setImageOverlayBounds(layer, bounds); } else console.error("Layer isn't an imageOverlay");
    },

    setImageOverlayBounds(layer, bounds) {
      this.removeLayer(layer);
      const newImageOverlay = L.imageOverlay(layer._url, bounds);
      this.addImageOverlay(newImageOverlay);
    },

    addLayer(layer) {
      if (layer.options.pane === 'overlayPane' && layer._url) { this.addImageOverlay(layer); } else console.error("Layer isn't an imageOverlay");
    },

    addLayers(layers) {
      this.addImageOverlays(layers);
    },
    hasLayer(layer) {
      if (layer.options.pane === 'overlayPane' && layer._url) { this.hasImageOverlay(layer); } else console.error("Layer isn't an imageOverlay");
    },
    // if the imageOverlay is loaded (even if outside the current view bounds)
    hasImageOverlay(imageOverlay) {
      if (!imageOverlay || !imageOverlay.getBounds || !this._latlngImageOverlays) {
        return false;
      }
      const minX = imageOverlay.getWest();
      const minY = imageOverlay.getSouth();
      const maxX = imageOverlay.getEast();
      const maxY = imageOverlay.getNorth();
      return this._latlngImageOverlays.collides({
        minX, minY, maxX, maxY
      });
    },
    removeLayer(layer) {
      this.removeImageOverlay(layer, true);
    },
    removeLayers(layers) {
      if (layers && layers.length) {
        layers.forEach((layer) => {
          this.removeLayer(layer);
        });
      }
    },
    removeImageOverlay(imageOverlay, redraw) {
      const self = this;

      // If we are removed point
      if (imageOverlay.minX) imageOverlay = imageOverlay.data;

      const bounds = imageOverlay.getBounds();
      const isDisplaying = self._map.getBounds().intersects(bounds);

      const minX = bounds.getWest();
      const minY = bounds.getSouth();
      const maxX = bounds.getEast();
      const maxY = bounds.getNorth();

      const markerData = {
        minX,
        minY,
        maxX,
        maxY,
        data: imageOverlay
      };
      self._latlngImageOverlays.remove(markerData, (a, b) => a.data._leaflet_id === b.data._leaflet_id);

      self._latlngImageOverlays.total--;
      self._latlngImageOverlays.dirty++;

      if (isDisplaying === true && redraw === true) {
        self.redraw();
      }
    },
    // Called on map.addLayer(layer). in down below addTo()
    onAdd(map) {
      this._map = map;

      if (!this._canvas) this._initCanvas();

      if (this.options.pane) this.getPane().appendChild(this._canvas);
      else map._panes.overlayPane.appendChild(this._canvas);

      map.on('move', this._reset, this);
      map.on('resize', this.throttleReset, this);
      map.on('zoom', this.throttleReset, this);

      map.on('click', this._executeListeners, this);
      map.on('mousemove', this._executeListeners, this);
    },

    onRemove(map) {
      if (this.options.pane) this.getPane().removeChild(this._canvas);
      else map.getPanes().overlayPane.removeChild(this._canvas);

      map.off('move', this._reset, this);
      map.off('resize', this.throttleReset, this);
      map.off('zoom', this.throttleReset, this);

      map.off('click', this._executeListeners, this);
      map.off('mousemove', this._executeListeners, this);
    },

    addTo(map) {
      map.addLayer(this);
      return this;
    },

    clearLayers() {
      this._latlngImageOverlays = null;
      this._imageOverlays = null;
      this._redraw(true);
    },

    _addImageOverlay(imageOverlay, bounds, isDisplaying) {
      const self = this;
      // Needed for pop-up & tooltip to work.
      imageOverlay._map = self._map;

      // _imageOverlays contains Points of markers currently displaying on map
      if (!self._imageOverlays) self._imageOverlays = new rbush();

      // _latlngImageOverlays contains Lat\Long coordinates of all markers in layer.
      if (!self._latlngImageOverlays) {
        self._latlngImageOverlays = new rbush();
        self._latlngImageOverlays.dirty = 0;
        self._latlngImageOverlays.total = 0;
      }
      L.Util.stamp(imageOverlay); // Returns the unique ID of an object, assigning it one if it doesn't have it.
      const pointPos = self._getPointPos(bounds);

      const ret = [
        {
          minX: pointPos.minX,
          minY: pointPos.minY,
          maxX: pointPos.maxX,
          maxY: pointPos.maxY,
          data: imageOverlay
        },
        {
          minX: bounds.getWest(),
          minY: bounds.getSouth(),
          maxX: bounds.getEast(),
          maxY: bounds.getNorth(),
          data: imageOverlay
        }
      ];

      self._latlngImageOverlays.dirty++;
      self._latlngImageOverlays.total++;

      // Only draw if we are on map
      if (isDisplaying === true) self._drawImageOverlay(imageOverlay, pointPos);

      return ret;
    },

    _getPointPos(bounds) {
      let res = null;
      const southWest = bounds.getSouthWest();
      const northEast = bounds.getNorthEast();

      // actual x, y coordinate of the diagonal of the bounds on the map
      const southWestPointPos = this._map.latLngToContainerPoint(southWest);
      const northEastPointPos = this._map.latLngToContainerPoint(northEast);
      res = {
        minX: southWestPointPos.x,
        minY: southWestPointPos.y,
        maxX: northEastPointPos.x,
        maxY: northEastPointPos.y
      };
      return res;
    },

    _drawImageOverlay(imageOverlay, pointPos) {
      const self = this;
      if (!this._imageLookup) this._imageLookup = {};
      if (!pointPos) {
        const bounds = imageOverlay.getBounds();
        pointPos = self._getPointPos(bounds);
      }

      const iconUrl = imageOverlay._url;

      if (imageOverlay.canvas_img) {
        self._drawImage(imageOverlay, pointPos);
      } else if (self._imageLookup[iconUrl]) {
        imageOverlay.canvas_img = self._imageLookup[iconUrl][0];

        if (self._imageLookup[iconUrl][1] === false) {
          self._imageLookup[iconUrl][2].push([imageOverlay, pointPos]);
        } else {
          self._drawImage(imageOverlay, pointPos);
        }
      } else {
        const i = new Image();
        i.crossOrigin = 'Anonymous';
        i.src = iconUrl;
        imageOverlay.canvas_img = i;

        // Image,isLoaded,marker\pointPos ref
        self._imageLookup[iconUrl] = [i, false, [[imageOverlay, pointPos]]];

        i.onload = function () {
          self._imageLookup[iconUrl][1] = true;
          self._imageLookup[iconUrl][2].forEach((e) => {
            self._drawImage(e[0], e[1]); // e[0] marker  e[1] pointPos
          });
        };
      }
    },

    _drawImage(imageOverlay, pointPos) {
      const iconImg = imageOverlay.canvas_img;
      const drawIcon = () => {
        this._context.drawImage(
          iconImg,
          pointPos.minX * ratio, // iconAnchor The coordinates of the "tip" of the icon (relative to its top left corner).
          pointPos.minY * ratio,
          (Math.abs(pointPos.maxX - pointPos.minX)) * ratio,
          (Math.abs(pointPos.maxY - pointPos.minY)) * ratio
        );
      };
      drawIcon();
      this._context.restore();
    },

    _drawNormalImage() {},
    _drawUnderGroundImage() {},
    // reset the position and size of the canvas, then call redraw
    _reset() {
      this._resetCanvas();
      this._redraw();
    },

    _resetCanvas() {
      const topLeft = this._map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, topLeft);

      const size = this._map.getSize();
      this._canvas.style.width = `${size.x}px`;
      this._canvas.style.height = `${size.y}px`;
      this._canvas.width = size.x * ratio;
      this._canvas.height = size.y * ratio;
    },

    _redraw(clear) {
      const self = this;
      // if clear equals true, clear the context of the canvas appended to the map
      if (clear) { this._context.clearRect(0, 0, this._canvas.width, this._canvas.height); }
      if (!this._map || !this._latlngImageOverlays) return;

      let tmp = []; // tmp purpose ? reload the rbush contents

      // If we are 10% individual inserts\removals, reconstruct lookup for efficiency
      if (self._latlngImageOverlays.dirty / self._latlngImageOverlays.total >= 0.1) {
        self._latlngImageOverlays.all().forEach((e) => {
          tmp.push(e);
        });

        self._latlngImageOverlays.clear(); // _latlngImageOverlays clear, load == bulk inserting data
        self._latlngImageOverlays.load(tmp);
        self._latlngImageOverlays.dirty = 0;
        tmp = [];
      }

      const mapBounds = self._map.getBounds();

      // Only re-draw what we are showing on the map.

      const mapBoxCoords = {
        minX: mapBounds.getWest(),
        minY: mapBounds.getSouth(),
        maxX: mapBounds.getEast(),
        maxY: mapBounds.getNorth()
      };

      self._latlngImageOverlays.search(mapBoxCoords).forEach((e) => {
        // Readjust Point Map
        // Given a geographical coordinate, returns the corresponding pixel coordinate relative to the map container
        const bounds = e.data.getBounds();
        const pointPos = self._getPointPos(bounds);

        // the complete pos range of the icon marker
        const newCoords = {
          minX: pointPos.minX,
          minY: pointPos.minY,
          maxX: pointPos.maxX,
          maxY: pointPos.maxY,
          data: e.data
        };

        tmp.push(newCoords); // tmp for for clearing and inserting the markers that show in the map view into _imageOverlays r-tree

        // Redraw points
        self._drawImageOverlay(e.data, pointPos);
      });

      // Clear rBush & Bulk Load for performance
      this._imageOverlays.clear();
      this._imageOverlays.load(tmp);
    },

    _initCanvas() {
      this._canvas = L.DomUtil.create(
        'canvas',
        'leaflet-canvas-image-layer leaflet-layer'
      );
      const originProp = L.DomUtil.testProp([
        'transformOrigin',
        'WebkitTransformOrigin',
        'msTransformOrigin'
      ]);
      this._canvas.style[originProp] = '50% 50%';
      const size = this._map.getSize();
      this._canvas.style.width = `${size.x}px`;
      this._canvas.style.height = `${size.y}px`;
      this._canvas.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      this._canvas.style.display = 'none';
      this._canvas.width = size.x * ratio;
      this._canvas.height = size.y * ratio;

      this._context = this._canvas.getContext('2d');

      const animated = this._map.options.zoomAnimation && L.Browser.any3d; // any3d true for all browsers supporting CSS transforms.
      L.DomUtil.addClass(
        this._canvas,
        `leaflet-zoom-${animated ? 'animated' : 'hide'}`
      );
    },

    setDisplayState(state) {
      this._canvas.style.display = state ? 'block' : 'none';
    },

    addOnClickListener(listener) {
      this._onClickListeners.push(listener);
    },

    addOnClickElsewhereListener(listener) {
      this._onClickElsewhereListeners.push(listener);
    },

    addOnHoverListener(listener) {
      this._onHoverListeners.push(listener);
    },

    _executeListeners(event) {
      const me = this;
      const x = event.containerPoint.x;
      const y = event.containerPoint.y;

      if (me._openToolTip) {
        me._openToolTip.closeTooltip();
        delete me._openToolTip;
      }

      const ret = this._imageOverlays && this._imageOverlays.search({
        minX: x,
        minY: y + 12,
        maxX: x,
        maxY: y + 22
      });
      if (ret && ret.length > 0) {
        me._map._container.style.cursor = 'pointer';

        if (event.type === 'click') {
          const hasPopup = ret[0].data.getPopup();
          if (hasPopup) ret[0].data.openPopup();

          me._onClickListeners.forEach((listener) => {
            listener(event, ret);
          });
        }

        if (event.type === 'mousemove') {
          const hasTooltip = ret[0].data.getTooltip();
          if (hasTooltip) {
            me._openToolTip = ret[0].data;
            ret[0].data.openTooltip();
          }

          me._onHoverListeners.forEach((listener) => {
            listener(event, ret);
          });
        }
      } else {
        me._map._container.style.cursor = '';
        if (event.type === 'click') {
          me._onClickElsewhereListeners.forEach((listener) => {
            listener(event);
          });
        }
      }
    }
  });

  L.canvasImageLayer = function (options) {
    return new CanvasImageLayer(options);
  };
}

window.L.CanvasImageLayer = layerFactory(L);
