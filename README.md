# Leaflet.Canvas-ImageOverlays
[Leaflet](https://leafletjs.com/) plugin for displaying multiple [ImageOverlays](https://leafletjs.com/reference.html#imageoverlay) (Used to load and display a single image over specific bounds of the map, whose pixel size changes as the map is zoomed in or zoomed out) on canvas instead of DOM, boosting better performance and responsiveness when the map is being zoomed, moved or resized. Working with Leaflet 1.0.0 and above. Inspired by https://github.com/eJuke/Leaflet.Canvas-Markers .


## Methods
* addImageOverlay(imageOverlay): Adds an imageOverlay to the layer.
* addImageOverlays(imageOverlays): Adds multiple imageOverlays to the layer.
* removeImageOverlay(imageOverlays, redraw): Removes an imageOverlay from the layer. Set redraw to true if you want to redraw the layer (the entire canvas context) after removing the imageOverlay
* redraw(): Redraws the layer
* addOnClickListener(eventHandler): Adds common click listener for all imageOverlays
* addOnHoverListener(eventHandler): Adds a hover over listener for all imageOverlays
* **setBounds**(): reset the bounds of the imageOverlay that is already added to the layer. I rewrote it to replace the original method for imageOverlay of Leaflet for compatibility.
* Just like Canvas-Markers, addLayer, addLayers and removeLayer (equal to removeImageOverlay(imageOverlay, true) methods are also supported.
