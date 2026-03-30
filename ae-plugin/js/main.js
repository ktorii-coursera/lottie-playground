/**
 * main.js - CEP Panel JavaScript for Lottie Token Painter
 *
 * Manages the UI: token palette rendering, selection state, mapping table,
 * and communication with ExtendScript (host.jsx) via CSInterface.
 */

(function () {
  "use strict";

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  var csInterface = new CSInterface();
  var tokens = {};          // { tokenName: { light: "#hex", dark: "#hex" } }
  var selectedToken = null; // token name string
  var mappings = [];        // array of { layerPath, property, token, hex }
  var currentSelection = null; // last refreshed layer info from AE

  // -----------------------------------------------------------------------
  // DOM references
  // -----------------------------------------------------------------------

  var $tokenInput = document.getElementById("token-json-input");
  var $tokenPalette = document.getElementById("token-palette");
  var $selectionInfo = document.getElementById("selection-info");
  var $propertySelect = document.getElementById("property-type-select");
  var $mappingsEmpty = document.getElementById("mappings-empty");
  var $mappingsTable = document.getElementById("mappings-table");
  var $mappingsTbody = document.getElementById("mappings-tbody");
  var $mappingCount = document.getElementById("mapping-count");
  var $sidecarPreview = document.getElementById("sidecar-preview");
  var $statusBar = document.getElementById("status-bar");

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  function setStatus(msg, type) {
    $statusBar.textContent = msg;
    $statusBar.className = type || "";
  }

  /**
   * Call an ExtendScript function and parse the JSON result.
   * callback receives (error, parsedResult).
   */
  function callHost(fnCall, callback) {
    csInterface.evalScript(fnCall, function (result) {
      if (result === "EvalScript error.") {
        callback("ExtendScript evaluation error. Is After Effects running?", null);
        return;
      }
      try {
        var parsed = JSON.parse(result);
        if (parsed.error) {
          callback(parsed.error, null);
        } else {
          callback(null, parsed);
        }
      } catch (e) {
        callback("Failed to parse host response: " + result, null);
      }
    });
  }

  /**
   * Read a file from disk using the CEP node.js fs module.
   */
  function readFileFromDisk(path, callback) {
    try {
      var fs = require("fs");
      fs.readFile(path, "utf8", function (err, data) {
        if (err) {
          callback(err.message, null);
        } else {
          callback(null, data);
        }
      });
    } catch (e) {
      callback("File system access not available: " + e.message, null);
    }
  }

  /**
   * Write a file to disk.
   */
  function writeFileToDisk(path, content, callback) {
    try {
      var fs = require("fs");
      fs.writeFile(path, content, "utf8", function (err) {
        if (err) {
          callback(err.message);
        } else {
          callback(null);
        }
      });
    } catch (e) {
      callback("File system access not available: " + e.message);
    }
  }

  /**
   * Open a file dialog. Returns the selected path or null.
   * type: "open" or "save"
   * filter: file filter string, e.g. "JSON Files:*.json"
   */
  function fileDialog(type, title, filter, callback) {
    var result;
    if (type === "open") {
      result = csInterface.evalScript(
        'File.openDialog("' + title + '", "' + filter + '")',
        function (res) {
          // ExtendScript returns the file path or null
          if (res && res !== "null" && res !== "undefined") {
            callback(res.replace(/^~/, csInterface.getSystemPath(SystemPath.USER_DATA)));
          } else {
            callback(null);
          }
        }
      );
    } else {
      result = csInterface.evalScript(
        'File.saveDialog("' + title + '", "' + filter + '")',
        function (res) {
          if (res && res !== "null" && res !== "undefined") {
            callback(res);
          } else {
            callback(null);
          }
        }
      );
    }
  }

  // -----------------------------------------------------------------------
  // Token palette
  // -----------------------------------------------------------------------

  function parseTokens() {
    var raw = $tokenInput.value.trim();
    if (!raw) {
      setStatus("Paste token JSON first.", "error");
      return;
    }
    try {
      tokens = JSON.parse(raw);
    } catch (e) {
      setStatus("Invalid JSON: " + e.message, "error");
      return;
    }

    var names = Object.keys(tokens);
    if (names.length === 0) {
      setStatus("No tokens found in JSON.", "error");
      return;
    }

    renderTokenPalette();
    setStatus("Loaded " + names.length + " token(s).", "success");
  }

  function renderTokenPalette() {
    $tokenPalette.innerHTML = "";
    var names = Object.keys(tokens);

    names.forEach(function (name) {
      var t = tokens[name];
      var card = document.createElement("div");
      card.className = "token-card" + (selectedToken === name ? " selected" : "");
      card.setAttribute("data-token", name);

      var swatches = document.createElement("div");
      swatches.className = "token-swatches";

      var lightSwatch = document.createElement("div");
      lightSwatch.className = "token-swatch light";
      lightSwatch.style.backgroundColor = t.light || "#000";
      lightSwatch.title = "Light: " + (t.light || "N/A");

      var darkSwatch = document.createElement("div");
      darkSwatch.className = "token-swatch dark";
      darkSwatch.style.backgroundColor = t.dark || "#000";
      darkSwatch.title = "Dark: " + (t.dark || "N/A");

      swatches.appendChild(lightSwatch);
      swatches.appendChild(darkSwatch);

      var label = document.createElement("div");
      label.className = "token-name";
      label.textContent = name;

      card.appendChild(swatches);
      card.appendChild(label);

      card.addEventListener("click", function () {
        selectToken(name);
      });

      $tokenPalette.appendChild(card);
    });
  }

  function selectToken(name) {
    selectedToken = name;
    // Update visual selection
    var cards = $tokenPalette.querySelectorAll(".token-card");
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle("selected", cards[i].getAttribute("data-token") === name);
    }
    setStatus("Selected token: " + name, "");
  }

  function loadTokensFromFile() {
    fileDialog("open", "Load Token JSON", "JSON Files:*.json", function (path) {
      if (!path) return;
      readFileFromDisk(path, function (err, data) {
        if (err) {
          setStatus("Error reading file: " + err, "error");
          return;
        }
        $tokenInput.value = data;
        parseTokens();
      });
    });
  }

  // -----------------------------------------------------------------------
  // Layer selection
  // -----------------------------------------------------------------------

  function refreshSelection() {
    callHost("getSelectedLayerInfo()", function (err, result) {
      if (err) {
        $selectionInfo.innerHTML = '<span class="empty-state">' + err + "</span>";
        currentSelection = null;
        setStatus(err, "error");
        return;
      }

      currentSelection = result;
      var layers = result.layers;

      if (!layers || layers.length === 0) {
        $selectionInfo.innerHTML = '<span class="empty-state">No layers selected.</span>';
        return;
      }

      var html = "";
      layers.forEach(function (layer) {
        html += '<div><span class="layer-name">' + escapeHtml(layer.layerPath) + "</span>";
        if (layer.colorProperties && layer.colorProperties.length > 0) {
          html += " &mdash; " + layer.colorProperties.length + " color prop(s):";
          html += "<ul style='margin:2px 0 4px 14px;padding:0;list-style:disc;'>";
          layer.colorProperties.forEach(function (cp) {
            html +=
              "<li>" +
              escapeHtml(cp.type) +
              ' <span class="color-dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' +
              cp.currentColor +
              ';border:1px solid rgba(255,255,255,0.2);vertical-align:middle;"></span> ' +
              cp.currentColor +
              "</li>";
          });
          html += "</ul>";
        } else {
          html += ' <span style="color:var(--text-muted);">(no color properties found)</span>';
        }
        html += "</div>";
      });

      $selectionInfo.innerHTML = html;
      setStatus("Selection refreshed.", "success");
    });
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // -----------------------------------------------------------------------
  // Apply token
  // -----------------------------------------------------------------------

  function applyToken() {
    if (!selectedToken) {
      setStatus("Select a token from the palette first.", "error");
      return;
    }

    var token = tokens[selectedToken];
    if (!token || !token.light) {
      setStatus("Selected token has no light color value.", "error");
      return;
    }

    var propertyType = $propertySelect.value;
    var hexColor = token.light;

    callHost(
      'applyColorToSelected("' + hexColor + '", "' + propertyType + '")',
      function (err, result) {
        if (err) {
          setStatus("Error: " + err, "error");
          return;
        }

        if (!result.applied || result.applied.length === 0) {
          setStatus("No matching color properties found on selected layer(s).", "error");
          return;
        }

        // Record mappings
        result.applied.forEach(function (item) {
          addMapping({
            layerPath: item.layerPath,
            property: item.property,
            token: selectedToken,
            hex: hexColor,
          });
        });

        setStatus(
          "Applied " +
            selectedToken +
            " (" +
            hexColor +
            ") to " +
            result.applied.length +
            " propert(ies).",
          "success"
        );

        // Refresh selection to show updated colors
        refreshSelection();
      }
    );
  }

  // -----------------------------------------------------------------------
  // Mapping management
  // -----------------------------------------------------------------------

  function addMapping(entry) {
    // Check for duplicate (same layerPath + property) and update
    for (var i = 0; i < mappings.length; i++) {
      if (
        mappings[i].layerPath === entry.layerPath &&
        mappings[i].property === entry.property
      ) {
        mappings[i].token = entry.token;
        mappings[i].hex = entry.hex;
        renderMappings();
        return;
      }
    }
    mappings.push(entry);
    renderMappings();
  }

  function removeMapping(index) {
    mappings.splice(index, 1);
    renderMappings();
  }

  function clearMappings() {
    if (mappings.length === 0) return;
    mappings = [];
    renderMappings();
    setStatus("Mappings cleared.", "");
  }

  function renderMappings() {
    $mappingCount.textContent = mappings.length;

    if (mappings.length === 0) {
      $mappingsEmpty.style.display = "";
      $mappingsTable.style.display = "none";
      return;
    }

    $mappingsEmpty.style.display = "none";
    $mappingsTable.style.display = "";

    var html = "";
    mappings.forEach(function (m, idx) {
      html += "<tr>";
      html += "<td>" + escapeHtml(m.layerPath) + "</td>";
      html += "<td>" + escapeHtml(m.property) + "</td>";
      html += "<td>" + escapeHtml(m.token) + "</td>";
      html +=
        '<td><span class="color-dot" style="background:' +
        m.hex +
        ';"></span>' +
        m.hex +
        "</td>";
      html +=
        '<td><button class="remove-btn" data-index="' +
        idx +
        '" title="Remove">&times;</button></td>';
      html += "</tr>";
    });
    $mappingsTbody.innerHTML = html;

    // Bind remove buttons
    var removeBtns = $mappingsTbody.querySelectorAll(".remove-btn");
    for (var i = 0; i < removeBtns.length; i++) {
      removeBtns[i].addEventListener("click", function () {
        removeMapping(parseInt(this.getAttribute("data-index"), 10));
      });
    }
  }

  // -----------------------------------------------------------------------
  // Sidecar import / export
  // -----------------------------------------------------------------------

  function exportSidecar() {
    var sidecar = {
      version: "1.0",
      source: "ae-plugin",
      mappings: mappings,
    };

    var json = JSON.stringify(sidecar, null, 2);
    $sidecarPreview.value = json;

    fileDialog("save", "Export Sidecar JSON", "JSON Files:*.json", function (path) {
      if (!path) {
        setStatus("Sidecar JSON copied to preview area.", "success");
        return;
      }
      // Ensure .json extension
      if (!/\.json$/i.test(path)) {
        path += ".json";
      }
      writeFileToDisk(path, json, function (err) {
        if (err) {
          setStatus("Error saving: " + err, "error");
        } else {
          setStatus("Sidecar exported to: " + path, "success");
        }
      });
    });
  }

  function importSidecar() {
    fileDialog("open", "Import Sidecar JSON", "JSON Files:*.json", function (path) {
      if (!path) return;
      readFileFromDisk(path, function (err, data) {
        if (err) {
          setStatus("Error reading file: " + err, "error");
          return;
        }
        try {
          var sidecar = JSON.parse(data);
        } catch (e) {
          setStatus("Invalid JSON: " + e.message, "error");
          return;
        }

        if (!sidecar.mappings || !Array.isArray(sidecar.mappings)) {
          setStatus("No mappings found in sidecar file.", "error");
          return;
        }

        // Merge imported mappings
        sidecar.mappings.forEach(function (m) {
          addMapping({
            layerPath: m.layerPath || "",
            property: m.property || "fill",
            token: m.token || "",
            hex: m.hex || "",
          });
        });

        $sidecarPreview.value = data;
        setStatus(
          "Imported " + sidecar.mappings.length + " mapping(s) from sidecar.",
          "success"
        );
      });
    });
  }

  // -----------------------------------------------------------------------
  // Section collapse toggle
  // -----------------------------------------------------------------------

  function initSectionToggles() {
    var headers = document.querySelectorAll(".section-header");
    for (var i = 0; i < headers.length; i++) {
      headers[i].addEventListener("click", function () {
        var body = this.nextElementSibling;
        var isHidden = body.classList.contains("hidden");
        body.classList.toggle("hidden", !isHidden);
        this.classList.toggle("collapsed", !isHidden);
      });
    }
  }

  // -----------------------------------------------------------------------
  // Event bindings
  // -----------------------------------------------------------------------

  function init() {
    initSectionToggles();

    document.getElementById("btn-parse-tokens").addEventListener("click", parseTokens);
    document.getElementById("btn-load-tokens").addEventListener("click", loadTokensFromFile);
    document.getElementById("btn-refresh-selection").addEventListener("click", refreshSelection);
    document.getElementById("btn-apply-token").addEventListener("click", applyToken);
    document.getElementById("btn-clear-mappings").addEventListener("click", clearMappings);
    document.getElementById("btn-import-sidecar").addEventListener("click", importSidecar);
    document.getElementById("btn-export-sidecar").addEventListener("click", exportSidecar);

    renderMappings();
    setStatus("Ready. Paste token JSON and click Parse Tokens.", "");
  }

  // -----------------------------------------------------------------------
  // Boot
  // -----------------------------------------------------------------------

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
