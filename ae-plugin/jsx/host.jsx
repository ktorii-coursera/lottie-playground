/**
 * host.jsx - ExtendScript for After Effects
 *
 * Runs inside the AE scripting engine. Called from the CEP panel via
 * CSInterface.evalScript(). Provides layer inspection, color application,
 * and path resolution for the sidecar mapping.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a slash-separated path from a layer up to the comp root.
 * e.g. "Group 1/Icon/Outline"
 */
function getLayerPath(layer) {
  var parts = [];
  var current = layer;
  while (current !== null && current !== undefined) {
    parts.unshift(current.name);
    // PropertyGroup items inside a shape layer don't have .parent that is a
    // layer, so we stop when we hit the top-level layer.
    current = current.parent;
    // After Effects layers at the top level have containingComp as parent,
    // not another layer. Stop there.
    if (current !== null && current !== undefined && current instanceof CompItem) {
      break;
    }
  }
  return parts.join("/");
}

/**
 * Convert a hex color string (#RRGGBB) to an AE [r,g,b] array (0-1 range).
 */
function hexToAEColor(hex) {
  hex = hex.replace("#", "");
  var r = parseInt(hex.substring(0, 2), 16) / 255;
  var g = parseInt(hex.substring(2, 4), 16) / 255;
  var b = parseInt(hex.substring(4, 6), 16) / 255;
  return [r, g, b];
}

/**
 * Convert an AE [r,g,b] (0-1) color to a hex string.
 */
function aeColorToHex(color) {
  function toHex(val) {
    var h = Math.round(val * 255).toString(16);
    return h.length === 1 ? "0" + h : h;
  }
  return "#" + toHex(color[0]) + toHex(color[1]) + toHex(color[2]);
}

// ---------------------------------------------------------------------------
// Recursively search a property group for fill/stroke color properties.
// Returns an array of objects: { property, type, path }
// ---------------------------------------------------------------------------
function findColorProperties(group, pathPrefix) {
  var results = [];
  for (var i = 1; i <= group.numProperties; i++) {
    var prop = group.property(i);
    var currentPath = pathPrefix ? pathPrefix + "/" + prop.name : prop.name;

    if (prop.matchName === "ADBE Vector Graphic - Fill" ||
        prop.matchName === "ADBE Vector Graphic - G-Fill") {
      var colorProp = prop.property("ADBE Vector Fill Color") || prop.property("Color");
      var type = prop.matchName === "ADBE Vector Graphic - Fill" ? "fill" : "gradient-fill";
      if (colorProp) {
        results.push({ property: colorProp, type: type, path: currentPath });
      }
    } else if (prop.matchName === "ADBE Vector Graphic - Stroke" ||
               prop.matchName === "ADBE Vector Graphic - G-Stroke") {
      var strokeColor = prop.property("ADBE Vector Stroke Color") || prop.property("Color");
      var sType = prop.matchName === "ADBE Vector Graphic - Stroke" ? "stroke" : "gradient-stroke";
      if (strokeColor) {
        results.push({ property: strokeColor, type: sType, path: currentPath });
      }
    } else if (prop.propertyType === PropertyType.PROPERTY) {
      // skip non-group leaf properties
    } else {
      // Recurse into sub-groups
      var sub = findColorProperties(prop, currentPath);
      results = results.concat(sub);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Public API - called from the panel via CSInterface.evalScript()
// ---------------------------------------------------------------------------

/**
 * Get info about the currently selected layer(s).
 * Returns a JSON string with layer details.
 */
function getSelectedLayerInfo() {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    return JSON.stringify({ error: "No active composition. Please open a composition." });
  }
  if (comp.selectedLayers.length === 0) {
    return JSON.stringify({ error: "No layers selected. Please select a layer." });
  }

  var results = [];
  for (var i = 0; i < comp.selectedLayers.length; i++) {
    var layer = comp.selectedLayers[i];
    var layerPath = getLayerPath(layer);
    var colorProps = [];

    // Shape layers have a Contents group
    if (layer instanceof ShapeLayer) {
      var contents = layer.property("ADBE Root Vectors Group");
      if (contents) {
        colorProps = findColorProperties(contents, "");
      }
    }

    var propsInfo = [];
    for (var j = 0; j < colorProps.length; j++) {
      var cp = colorProps[j];
      var val = cp.property.value;
      propsInfo.push({
        type: cp.type,
        path: cp.path,
        currentColor: aeColorToHex([val[0], val[1], val[2]])
      });
    }

    results.push({
      name: layer.name,
      layerPath: layerPath,
      index: layer.index,
      isShape: layer instanceof ShapeLayer,
      colorProperties: propsInfo
    });
  }

  return JSON.stringify({ layers: results });
}

/**
 * Apply a hex color to all fill/stroke properties of the selected layer(s).
 * propertyType: "fill", "stroke", "gradient-fill", "gradient-stroke", or "all"
 * Returns JSON with the mappings that were applied.
 */
function applyColorToSelected(hexColor, propertyType) {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    return JSON.stringify({ error: "No active composition." });
  }
  if (comp.selectedLayers.length === 0) {
    return JSON.stringify({ error: "No layers selected." });
  }

  var aeColor = hexToAEColor(hexColor);
  var applied = [];

  app.beginUndoGroup("Apply Token Color");

  for (var i = 0; i < comp.selectedLayers.length; i++) {
    var layer = comp.selectedLayers[i];
    var layerPath = getLayerPath(layer);

    if (layer instanceof ShapeLayer) {
      var contents = layer.property("ADBE Root Vectors Group");
      if (contents) {
        var colorProps = findColorProperties(contents, "");
        for (var j = 0; j < colorProps.length; j++) {
          var cp = colorProps[j];
          if (propertyType === "all" || cp.type === propertyType) {
            // Set the color value (AE expects [r, g, b, a] for shape fills)
            var newVal = [aeColor[0], aeColor[1], aeColor[2], cp.property.value[3] || 1];
            cp.property.setValue(newVal);
            applied.push({
              layerPath: layerPath,
              property: cp.type,
              subPath: cp.path
            });
          }
        }
      }
    }
  }

  app.endUndoGroup();

  return JSON.stringify({ applied: applied });
}

/**
 * Apply a hex color to a specific property path on a specific layer.
 * Used when re-applying from an imported sidecar.
 * layerName: the top-level layer name
 * propertyType: "fill", "stroke", etc.
 * hexColor: "#RRGGBB"
 */
function applyColorToLayerByName(layerName, propertyType, hexColor) {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    return JSON.stringify({ error: "No active composition." });
  }

  var layer = null;
  for (var i = 1; i <= comp.numLayers; i++) {
    // Match by the full layer path or just the layer name
    var candidate = comp.layer(i);
    var candidatePath = getLayerPath(candidate);
    if (candidatePath === layerName || candidate.name === layerName) {
      layer = candidate;
      break;
    }
  }

  if (!layer) {
    return JSON.stringify({ error: "Layer not found: " + layerName });
  }

  var aeColor = hexToAEColor(hexColor);
  var applied = [];

  app.beginUndoGroup("Apply Sidecar Token Color");

  if (layer instanceof ShapeLayer) {
    var contents = layer.property("ADBE Root Vectors Group");
    if (contents) {
      var colorProps = findColorProperties(contents, "");
      for (var j = 0; j < colorProps.length; j++) {
        var cp = colorProps[j];
        if (cp.type === propertyType) {
          var newVal = [aeColor[0], aeColor[1], aeColor[2], cp.property.value[3] || 1];
          cp.property.setValue(newVal);
          applied.push({
            layerPath: getLayerPath(layer),
            property: cp.type
          });
        }
      }
    }
  }

  app.endUndoGroup();

  return JSON.stringify({ applied: applied });
}

/**
 * List all layers and their color properties in the active comp.
 * Useful for building a full mapping overview.
 */
function getAllLayerColors() {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    return JSON.stringify({ error: "No active composition." });
  }

  var allLayers = [];
  for (var i = 1; i <= comp.numLayers; i++) {
    var layer = comp.layer(i);
    if (layer instanceof ShapeLayer) {
      var layerPath = getLayerPath(layer);
      var contents = layer.property("ADBE Root Vectors Group");
      if (contents) {
        var colorProps = findColorProperties(contents, "");
        var propsInfo = [];
        for (var j = 0; j < colorProps.length; j++) {
          var cp = colorProps[j];
          var val = cp.property.value;
          propsInfo.push({
            type: cp.type,
            path: cp.path,
            currentColor: aeColorToHex([val[0], val[1], val[2]])
          });
        }
        if (propsInfo.length > 0) {
          allLayers.push({
            name: layer.name,
            layerPath: layerPath,
            colorProperties: propsInfo
          });
        }
      }
    }
  }

  return JSON.stringify({ layers: allLayers });
}
