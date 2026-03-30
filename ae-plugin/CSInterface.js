/**
 * CSInterface.js - Adobe CEP CSInterface Library (v11.x)
 *
 * This is a minimal stub. In a production CEP extension, use the official
 * CSInterface.js from Adobe's CEP-Resources repository:
 * https://github.com/AdobeDev/CEP-Resources/tree/master/CEP_11.x
 *
 * When the extension loads inside After Effects, the CEP runtime injects
 * the real CSInterface. This file provides the constructor and method
 * signatures so the panel can be developed and tested outside AE.
 *
 * IMPORTANT: Replace this file with the official CSInterface.js before
 * installing in After Effects. Download from:
 * https://github.com/AdobeDev/CEP-Resources/blob/master/CEP_11.x/CSInterface.js
 */

/* global SystemPath */

/**
 * @constructor
 */
function CSInterface() {}

/**
 * Enum for system paths.
 */
var SystemPath = {
  USER_DATA: "userData",
  COMMON_FILES: "commonFiles",
  MY_DOCUMENTS: "myDocuments",
  APPLICATION: "application",
  EXTENSION: "extension",
  HOST_APPLICATION: "hostApplication",
};

/**
 * Retrieve the path of a system directory.
 * @param {string} pathType - One of the SystemPath enum values.
 * @returns {string} The path.
 */
CSInterface.prototype.getSystemPath = function (pathType) {
  // Stub: returns empty string outside CEP runtime
  return "";
};

/**
 * Evaluate an ExtendScript expression in the host application.
 * @param {string} script - The ExtendScript code to evaluate.
 * @param {function} [callback] - Callback receiving the result string.
 */
CSInterface.prototype.evalScript = function (script, callback) {
  console.warn("[CSInterface stub] evalScript called:", script);
  if (typeof callback === "function") {
    callback("EvalScript error.");
  }
};

/**
 * Register a callback for a CEP event.
 * @param {string} type - Event type string.
 * @param {function} listener - Event handler.
 * @param {object} [obj] - Context object.
 */
CSInterface.prototype.addEventListener = function (type, listener, obj) {
  console.warn("[CSInterface stub] addEventListener called:", type);
};

/**
 * Dispatch a CEP event.
 * @param {object} event - Event object with type and data.
 */
CSInterface.prototype.dispatchEvent = function (event) {
  console.warn("[CSInterface stub] dispatchEvent called:", event);
};

/**
 * Remove a CEP event listener.
 * @param {string} type - Event type string.
 * @param {function} listener - Event handler.
 * @param {object} [obj] - Context object.
 */
CSInterface.prototype.removeEventListener = function (type, listener, obj) {
  console.warn("[CSInterface stub] removeEventListener called:", type);
};

/**
 * Request to open a URL in the default browser.
 * @param {string} url - The URL to open.
 */
CSInterface.prototype.openURLInDefaultBrowser = function (url) {
  console.warn("[CSInterface stub] openURLInDefaultBrowser called:", url);
};

/**
 * Get the host environment information.
 * @returns {object} Host environment info.
 */
CSInterface.prototype.getHostEnvironment = function () {
  return {
    appName: "AEFT",
    appVersion: "0.0",
    appLocale: "en_US",
    appUILocale: "en_US",
    appId: "AEFT",
    isAppOnline: true,
    appSkinInfo: {},
  };
};

/**
 * Close the extension.
 */
CSInterface.prototype.closeExtension = function () {
  console.warn("[CSInterface stub] closeExtension called");
};
