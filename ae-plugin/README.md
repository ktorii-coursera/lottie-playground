# Lottie Token Painter - After Effects CEP Extension

A CEP panel for After Effects that lets animators apply CDS design tokens to shape layers and export a sidecar JSON mapping for the Lottie theming pipeline.

## What it does

1. Load a CDS token library (JSON with light/dark hex values per token)
2. Browse tokens as a visual palette with light and dark color swatches
3. Select a shape layer in AE, pick a token, and click "Apply to Selected"
4. The light-mode color is applied to the layer's fill/stroke properties
5. The layer path + property + token mapping is recorded automatically
6. Import an existing sidecar JSON (e.g. from the Figma plugin) to pre-populate mappings
7. Export the complete sidecar JSON for the conversion pipeline

## Installation

### 1. Replace the CSInterface stub

The included `CSInterface.js` is a development stub. Before installing, replace it with the official Adobe CSInterface library:

- Download from: https://github.com/AdobeDev/CEP-Resources/blob/master/CEP_11.x/CSInterface.js
- Copy it into the `ae-plugin/` directory, overwriting the stub

### 2. Enable unsigned extensions (development)

Open a terminal and run:

**macOS:**
```bash
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
```

**Windows:**
Open Registry Editor and set `PlayerDebugMode` to `1` at:
```
HKEY_CURRENT_USER\Software\Adobe\CSXS.11
```

Restart After Effects after changing this setting.

### 3. Install the extension

Symlink or copy the `ae-plugin` folder to the CEP extensions directory:

**macOS:**
```bash
ln -s "$(pwd)/ae-plugin" ~/Library/Application\ Support/Adobe/CEP/extensions/com.coursera.lottie.tokenpainter
```

**Windows:**
```cmd
mklink /D "%APPDATA%\Adobe\CEP\extensions\com.coursera.lottie.tokenpainter" "%CD%\ae-plugin"
```

### 4. Launch

1. Open After Effects
2. Go to Window > Extensions > Lottie Token Painter

## Usage

### Loading tokens

Paste your CDS token JSON into the textarea and click **Parse Tokens**. The expected format:

```json
{
  "cds-stroke-hard": { "light": "#003872", "dark": "#7EB6FF" },
  "cds-fill-interactive-hard": { "light": "#d52c2c", "dark": "#FF6B6B" }
}
```

Or click **Load from File** to pick a `.json` file from disk.

### Applying tokens

1. Select one or more shape layers in your After Effects comp
2. Click **Refresh Selection** to see the layer's color properties
3. Click a token in the palette to select it
4. Choose the property type (fill, stroke, or all)
5. Click **Apply to Selected**

The light-mode hex color is applied, and a mapping entry is added automatically.

### Importing a sidecar

Click **Import Sidecar** and select a sidecar JSON file (e.g. exported from the Figma plugin). This pre-populates the mappings table. You can then adjust mappings by re-applying tokens to specific layers.

### Exporting the sidecar

Click **Export Sidecar** to save the current mappings as a sidecar JSON file. The format matches the shared schema at `sidecar-schema.json`.

## File structure

```
ae-plugin/
  CSXS/manifest.xml     CEP extension manifest
  index.html             Panel UI
  CSInterface.js         CSInterface library (replace with official version)
  js/main.js             Panel JavaScript (UI logic, host communication)
  jsx/host.jsx           ExtendScript (AE DOM access, color application)
  css/styles.css         Panel styling
  README.md              This file
```

## Sidecar format

See `../sidecar-schema.json` for the full JSON schema. Example:

```json
{
  "version": "1.0",
  "source": "ae-plugin",
  "mappings": [
    {
      "layerPath": "Group 1/Icon/Outline",
      "property": "fill",
      "token": "cds-stroke-hard",
      "hex": "#003872"
    }
  ]
}
```
