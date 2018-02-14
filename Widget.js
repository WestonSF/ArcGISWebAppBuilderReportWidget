define(["dojo/_base/declare",
"dojo/_base/connect",
"dojo/_base/lang",
"dojo/_base/array",
"dojo/dom-class",
"dojo/_base/html",
"dojo/on",
"dojo/promise/all",
"dijit/_WidgetsInTemplateMixin",
"dijit/form/CheckBox",
"jimu/BaseWidget",
"jimu/utils",
"jimu/dijit/SimpleTable",
"jimu/dijit/Message",
"esri/geometry/geometryEngine",
"esri/geometry/Extent",
"esri/tasks/PrintTask",
"esri/tasks/PrintTemplate",
"esri/tasks/PrintParameters",
"esri/tasks/Geoprocessor",
"esri/tasks/QueryTask",
"esri/tasks/query",
"esri/layers/FeatureLayer",
"esri/layers/GraphicsLayer",
"esri/renderers/SimpleRenderer",
"esri/geometry/scaleUtils",
"esri/graphicsUtils",
"esri/graphic",
"esri/InfoTemplate",
"esri/request",
"esri/symbols/SimpleMarkerSymbol",
"esri/symbols/SimpleFillSymbol",
"esri/symbols/SimpleLineSymbol",
"jimu/dijit/DrawBox"],
function (declare,
connect,
lang,
array,
domClass,
html,
on,
all,
_WidgetsInTemplateMixin,
CheckBox,
BaseWidget,
utils,
Table,
Message,
geometryEngine,
Extent,
PrintTask,
PrintTemplate,
PrintParameters,
Geoprocessor,
QueryTask,
Query,
FeatureLayer,
GraphicsLayer,
SimpleRenderer,
scaleUtils,
graphicsUtils,
Graphic,
InfoTemplate,
esriRequest,
SimpleMarkerSymbol,
SimpleFillSymbol,
SimpleLineSymbol) {
  // Base widget
  return declare([BaseWidget, _WidgetsInTemplateMixin], {
    baseClass: 'jimu-widget-report',  
    widgetState: null,
    reportGenerating: false,
    // Graphic and feature layers
    graphicLayers: [], // Graphic selection layers that have been added to the map to show the feature(s) that is/are selected
    analysisfeatureLayers: [], // Analysis feature layers added to the map for querying/identifying
    reportFeatureLayer: null, // The report feature layer added to the map as background layer
    selectionFeatureLayer: null,
      // Currently selected feature
    selectionState: null,
    selectedFeatureJSON: null,
    selectedGeometry: null,
    // Download URLs
    reportDownloadLink: null,
    dataDownloadLink: null,

    // EVENT FUNCTION - Creation of widget
    postCreate: function () {
      console.log('Report widget created...');
      this.inherited(arguments);
      var self = this;

      // Initially disable submit button
      domClass.add(this.submitButton, 'jimu-state-disabled');
      // Initially disable clear button
      domClass.add(this.clearButton, 'jimu-state-disabled');
      // Initially disable cancel button
      domClass.add(this.cancelButton, 'jimu-state-disabled');
      // Initially Disable download buttons
      domClass.add(self.reportDownloadButton, 'jimu-state-disabled');
      domClass.add(self.dataDownloadButton, 'jimu-state-disabled');

      // Load in layers to dropdown
      var len = this.config.layers.length;
      for (var a = 0; a < len; a++) {
          var option = {
              value: this.config.layers[a].serviceURL,
              label: this.config.layers[a].layerName
          };
          this.layerSelect.addOption(option);
      }
      
      // If draw functionality is enabled
      if (String(this.config.enableDraw).toLowerCase() == "true") {
          var option = {
              value: "Draw",
              label: this.nls.draw
          };
          this.layerSelect.addOption(option);
          // Set the draw tool
          this.drawBox.setMap(this.map);

          // Set the default symbology
          this.drawBox.setPointSymbol(new SimpleMarkerSymbol(esri.symbol.SimpleMarkerSymbol.STYLE_SQUARE, 26,
          new esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID,
          new dojo.Color([0, 0, 0]), 2),
          new dojo.Color([0,255,255,0.70])));
          this.drawBox.setLineSymbol(new SimpleLineSymbol(esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID,
          new dojo.Color([0, 255, 255]), 3)));
          this.drawBox.setPolygonSymbol(new SimpleFillSymbol(esri.symbol.SimpleFillSymbol.STYLE_SOLID,
          new esri.symbol.SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID,
          new dojo.Color([0, 255, 255]), 3), new dojo.Color([0, 0, 0, 0])));
      }

      this.featureSelected.innerHTML = "No features currently selected...";

      // Setup the maps table
      var fields = [{
          name: 'include',
          type: 'checkbox',
          width: '10%',
          'class': 'show'
      }, {
          name: 'map',
          title: this.nls.map,
          type: 'text',
          width: '65%',
          unique: false,
          editable: false
      }, {
          name: 'scale',
          title: this.nls.scale,
          type: 'text',
          width: '25%',
          unique: false,
          editable: true
      }
      ];
      var args = {
          fields: fields,
          selectable: false
      };
      this.mapTable = new Table(args);
      this.mapTable.autoHeight = true;
      this.mapTable.placeAt(this.mapsTable);
      this.mapTable.startup();

      // Load in maps
      if (this.config.maps.length > 0) {
          var json = [];
          var len = this.config.maps.length;
          for (var a = 0; a < len; a++) {
              // If no parent map is defined
              if (!this.config.maps[a].parentMap) {
                  // Push map into list
                  json.push({
                      map: this.config.maps[a].title,
                      scale: this.config.maps[a].scale
                  });
              }
          }
          this.mapTable.addRows(json);
      }
      // Check all checkboxes
      this.mapTable._checkAllTdCheckBoxes("include");

      // Load report quality
      reportQuality =  [
      {
        "label": "Low",
        "quality": 96
      },
      {
          "label": "Medium",
          "quality": 150
      },
      {
          "label": "High",
          "quality": 300
      }]

      // Show multiple page map option if needed
      if (String(this.config.showMultiplePageMap).toLowerCase() == "true") {
          html.setStyle(this.multiplePageMapTable, "display", "block");
      }

      // Show subtitle if needed
      if (String(this.config.showSubtitle).toLowerCase() == "true") {
          html.setStyle(this.subtitleTable, "display", "block");
      }

      // Show report quality table if needed
      if (String(this.config.showReportQuality).toLowerCase() == "true") {
          html.setStyle(this.reportQualityTable, "display", "block");
      }

      var len = reportQuality.length;
      for (var a = 0; a < len; a++) {
          var option = {
              value: reportQuality[a].quality,
              label: reportQuality[a].label
          };
          this.reportQualitySelect.addOption(option);

          // Set the default option
          if (reportQuality[a].label.toLowerCase() == this.config.defaultReportQuality.toLowerCase()) {
              this.reportQualitySelect.set("value", reportQuality[a].quality);
          }
      }

      // Load in data download formats if needed
      if (String(this.config.downloadDataIntersectLayers).toLowerCase() == "true") {
          html.setStyle(this.dataDownloadFormatTable, "display", "block");

          // Load data download options
          dataOptions = [
          {
              "label": "None",
              "value": "None"
          },
          {
              "label": "CSV",
              "value": "CSV"
          },
          {
              "label": "File Geodatabase",
              "value": "File Geodatabase"
          },
          {
              "label": "Shapefile",
              "value": "Shapefile"
          }]

          // Load in data download options to dropdown
          var len = dataOptions.length;
          for (var a = 0; a < len; a++) {
              var option = {
                  value: dataOptions[a].value,
                  label: dataOptions[a].label
              };
              this.dataDownloadFormatSelect.addOption(option);
          }
          // Set the default option
          this.dataDownloadFormatSelect.set("value", "None");
      }
    },

    // EVENT FUNCTION - Startup widget
    startup: function () {
      console.log("Report widget started...");
      this.widgetState = "Open";
      this.inherited(arguments);
      var self = this;
      var map = this.map;
      // Event handlers
      var mapClickEvent = null;
      var selectionEvent = null;
      var featureSelectionEvent = null;
      var gpErrorEvent = null;
      var setMapScaleEvent = null;
      // Report Geoprocessing service
      var gpService = null;
      var reportGenerating = false;
      var gpServiceJobId = null;

      // On map table row click
      this.mapTable.on("row-click", function () {
          var allCheckboxes = self.mapTable._getAllEnabledTdCheckBoxes("include");
          // For each of the checkboxes
          var checked = 0;
          array.forEach(allCheckboxes, function (checkbox) {
              // Check if the checkbox is checked
              if (checkbox.checked == true) {
                  checked = checked + 1;
              }
          });
          // If no checkboxes are checked
          if (checked == 0) {
              // Disable submit button
              domClass.add(self.submitButton, 'jimu-state-disabled');
          }
          else {
              // If a feature has been selected
              if (self.selectedFeatureJSON) {
                  // Enable submit button
                  domClass.remove(self.submitButton, 'jimu-state-disabled');
              }
          }
      });

      // Get the initial selection
      var selection = dijit.byId('layerSelect').attr('value')
      // Add the report feature layer
      changeReportLayer(selection,"add");
      // EVENT FUNCTION - When selection dropdown is changed
      this.layerSelect.on("change", function () {
          // Clear info window
          self.map.infoWindow.hide();

          domClass.add(self.submitButton, 'jimu-state-disabled');
          self.featureSelected.innerHTML = "No features currently selected...";
          self.selectedFeatureJSON = null;
          self.selectedGeometry = null;

          var selection = this.get("value");
          // If draw selected
          if (selection.toLowerCase() == self.nls.draw.toLowerCase()) {
              // Show drawing tools
              html.setStyle(self.drawTools, "display", "block");
              // Hide selection tool
              html.setStyle(self.multipleSelectionTable, "display", "none");
              // Hide multiple features selection
              dijit.byId('multipleFeaturesSelect').removeOption(dijit.byId('multipleFeaturesSelect').getOptions());
              html.setStyle(self.multipleFeaturesTable, "display", "none");
              // Remove the report feature layer
              changeReportLayer(selection, "remove");
          }
          else {
              // Hide drawing tools
              html.setStyle(self.drawTools, "display", "none");
              // Hide selection tool
              html.setStyle(self.multipleSelectionTable, "display", "block");
              // Show feature selection
              html.setStyle(self.featureSelectedTable, "display", "block");
              // Hide multiple features selection
              dijit.byId('multipleFeaturesSelect').removeOption(dijit.byId('multipleFeaturesSelect').getOptions());
              html.setStyle(self.multipleFeaturesTable, "display", "none");
              // Add the report feature layer
              changeReportLayer(selection, "add");
          }
      })

        // If draw functionality is enabled
      if (String(this.config.enableDraw).toLowerCase() == "true") {
          // On draw end handler
          this.drawBox.on("draw-end", function () {
              // Set the selection state
              self.selectionState = "Draw";
              // Get JSON for the drawn feature
              var selectedFeature = {};

              // For each of the graphics drawn
              var len = this.drawLayer.graphics.length;
              for (var a = 0; a < len; a++) {
                  // If the first graphic
                  if (a == 0) {
                      // Set the selected geometry
                      self.selectedGeometry = this.drawLayer.graphics[a].geometry;
                  }
                  // If it's the last graphic
                  else if (a == (len-1)) {
                      // If graphic geometry is the same as the first one - If mixed geometry, won't append and will ignore the other geometries
                      if (self.selectedGeometry.type.toLowerCase() == this.drawLayer.graphics[a].geometry.type.toLowerCase()) {
                          // If a point
                          if (self.selectedGeometry.type.toLowerCase() == "point") {
                              // Update the entire geometry
                              // TODO - Convert to multi point
                              self.selectedGeometry = this.drawLayer.graphics[a].geometry;
                          }
                          // If a polyline
                          else if (self.selectedGeometry.type.toLowerCase() == "polyline") {
                              // Append to existing geometry
                              self.selectedGeometry.paths.push(this.drawLayer.graphics[a].geometry.paths[0]);
                          }
                          // Else polygon
                          else {
                              // Append to existing geometry
                              self.selectedGeometry.rings.push(this.drawLayer.graphics[a].geometry.rings[0]);
                          }
                      }
                  }
              }

              selectedFeature.geometry = self.selectedGeometry;
              selectedFeature.attributes = null;

              console.log(selectedFeature);
              self.selectedFeatureJSON = JSON.stringify(selectedFeature);

              // Enable submit button
              domClass.remove(self.submitButton, 'jimu-state-disabled');
              // Enable clear button
              domClass.remove(self.clearButton, 'jimu-state-disabled');
          });
      }

      // Set the current scale of the map
      self.setMapsScale();
      // EVENT FUNCTION - When extent is changed on the map
      setMapScaleEvent = on(map, 'extent-change', lang.hitch(this, function (evt) {
          // Set the current scale of the map
          self.setMapsScale();
      }));

      // EVENT FUNCTION - Clear button click
      on(this.clearButton, 'click', lang.hitch(this, function (evt) {
          // Clear info window
          self.map.infoWindow.hide();

          domClass.add(self.submitButton, 'jimu-state-disabled');
          self.featureSelected.innerHTML = "No features currently selected...";
          self.selectedFeatureJSON = null;
          self.selectedGeometry = null;
          // Hide multiple features selection
          dijit.byId('multipleFeaturesSelect').removeOption(dijit.byId('multipleFeaturesSelect').getOptions());
          html.setStyle(self.multipleFeaturesTable, "display", "none");

          // Clear selection graphics
          self.clearSelectionGraphics();
          // Remove any analysis feature layers from the map
          self.removeAnalysisFeatureLayers();

          // Disable clear button
          domClass.add(self.clearButton, 'jimu-state-disabled');
      }));

     // EVENT FUNCTION - Cancel button click
      on(this.cancelButton, 'click', lang.hitch(this, function (evt) {
          // If a report is generating
          if ((reportGenerating == true) && (gpServiceJobId)) {
              
              // Cancel the GP service job
              gpService.cancelJob(gpServiceJobId, function (cancel) {
                  console.log("Report geoprocessing service job cancelled...");
                  // Disconnect gp error handler
                  if (gpErrorEvent) {
                      gpErrorEvent.remove();
                  }

                  // Enable submit button
                  domClass.remove(self.submitButton, 'jimu-state-disabled');
                  // Enable clear button
                  domClass.remove(self.clearButton, 'jimu-state-disabled');
                  // Disable cancel button
                  domClass.add(self.cancelButton, 'jimu-state-disabled');
                  // Disable download buttons
                  domClass.add(self.reportDownloadButton, 'jimu-state-disabled');
                  domClass.add(self.dataDownloadButton, 'jimu-state-disabled');
                  // Hide loading
                  reportGenerating = false;
                  html.setStyle(self.loading, "display", "none");
                  self.loadingInfo.innerHTML = "Loading...";
              });
          }
      }));

      // EVENT FUNCTION - Submit button click
      var panEndHandler;
      var zoomEndHandler;
      var mapsProduce = [];
      var reportData = [];
      var downloadData = [];
      connect.connect(this.submitButton, 'click', lang.hitch(this, function (evt) {
          // Clear info window
          self.map.infoWindow.hide();

          // Remove any analysis feature layers from the map
          self.removeAnalysisFeatureLayers();

          mapsProduce = [];
          reportData = [];
          downloadData = [];

          // If a feature has been selected
          if (self.selectedFeatureJSON) {
              // Disable submit button
              domClass.add(self.submitButton, 'jimu-state-disabled');
              // Disable clear button
              domClass.add(self.clearButton, 'jimu-state-disabled');

              // Show loading
              reportGenerating = true;
              html.setStyle(self.loading, "display", "block");

              // If a point
              if (self.selectedGeometry.type.toLowerCase() == "point") {
                  // Factor for converting point to extent 
                  var factor = 50;
                  var extent = new esri.geometry.Extent(self.selectedGeometry.x - factor, self.selectedGeometry.y - factor, self.selectedGeometry.x + factor, self.selectedGeometry.y + factor, self.map.spatialReference);
                  // Expand extent out
                  map.setExtent(extent.expand(3));
              }
              // If a polyline
              else if (self.selectedGeometry.type.toLowerCase() == "polyline") {
                  // Centre map on the feature
                  self.selectedGeometry.clearCache();
                  var extent = self.selectedGeometry.getExtent();
                  // Expand extent out
                  map.setExtent(extent.expand(2));
              }
              // Else polygon
              else {
                  // Centre map on the feature
                  self.selectedGeometry.clearCache();
                  var extent = self.selectedGeometry.getExtent();

                  // Get area of polygon
                  var geometryArea = geometryEngine.planarArea(self.selectedGeometry, "square-meters");
                  if (geometryArea < 10000) {
                      // Expand extent out
                      map.setExtent(extent.expand(1.5));
                  }
                  else if (geometryArea < 30000) {
                      // Expand extent out
                      map.setExtent(extent.expand(2));
                  }
                  else {
                      // Expand extent out
                      map.setExtent(extent.expand(3));
                  }
              }

              // After extent has been changed - Pan and zoom events
              panEndHandler = map.on("pan-end", analyseMaps);
              zoomEndHandler = map.on("zoom-end", analyseMaps);
          }
      }));

      // FUNCTION - Change the report layer showing on the map
      function changeReportLayer(url,addRemove) {
        // Remove existing feature layer if single selection
          if (self.reportFeatureLayer) {
            // Clear selection graphics
            self.clearSelectionGraphics();
            // Remove any analysis feature layers from the map
            self.removeAnalysisFeatureLayers();
            // Remove feature layer
            map.removeLayer(self.reportFeatureLayer);
            self.reportFeatureLayer = null;
            self.selectionFeatureLayer = null;
        }

        // If adding layer
        if (addRemove.toLowerCase() == "add") {
            // Add the feature layer to the map
            this.reportFeatureLayer = new esri.layers.FeatureLayer(url, {
                mode: esri.layers.FeatureLayer.MODE_ONDEMAND,
                outFields: []
            });
            this.reportFeatureLayer.id = "ReportLayer";
            // Set the minimum scale
            this.reportFeatureLayer.minScale = 20000;
            // Add layer to map
            map.addLayer(this.reportFeatureLayer);
            initSelectionLayer(url);
        }
      }

      // FUNCTION - Initialise the selection layer
      function initSelectionLayer(url) {
          // Disconnect map click handler
          if (mapClickEvent) {
              mapClickEvent.remove();
          }

          // Disconnect selection handler
          if (selectionEvent) {
              selectionEvent.remove();
          }

          // Add the feature layer to the map
          self.selectionFeatureLayer = new esri.layers.FeatureLayer(url, {
              mode: esri.layers.FeatureLayer.MODE_ONDEMAND,
              outFields: ["*"]
          });

          // EVENT FUNCTION - On map click
          mapClickEvent = map.on("click", lang.hitch(this, function (event) {
            self.mapClick(event.mapPoint);
          }));

          // EVENT FUNCTION - On feature layer selection complete
          selectionEvent = self.selectionFeatureLayer.on("selection-complete", function (selection) {
            // Hide loading
            html.setStyle(self.loading, "display", "none");
            self.loadingInfo.innerHTML = "Loading...";
            // Enable clear button
            domClass.remove(self.clearButton, 'jimu-state-disabled');

            // Set the symbology
            switch (self.selectionFeatureLayer.geometryType) {
                case "esriGeometryPoint":
                    var symbol = new SimpleMarkerSymbol(esri.symbol.SimpleMarkerSymbol.STYLE_SQUARE, 26,
                    new esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID,
                    new dojo.Color([0, 0, 0]), 2),
                    new dojo.Color([0, 255, 255, 0.3]));
                    break;
                case "esriGeometryPolyline":
                    var symbol = new SimpleLineSymbol(esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID,
                    new dojo.Color([0, 255, 255]), 3));
                    break;
                case "esriGeometryPolygon":
                    var symbol = new SimpleFillSymbol(esri.symbol.SimpleFillSymbol.STYLE_SOLID,
                    new esri.symbol.SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID,
                    new dojo.Color([0, 255, 255]), 3), new dojo.Color([0, 255, 255, 0]));
                    break;
            }
            // For each of the features in the selection
            array.forEach(selection.features, function (feature) {
                // Set symbology
                feature.setSymbol(symbol);
                // Add to global array and map
                self.graphicLayers.push(feature);
                map.graphics.add(feature);
            });
            // Refresh graphics layer
            map.graphics.redraw();
            // Update the selection info
            updateSelectionInfo();
          });
      }

      // FUNCTION - Update the selection information
      function updateSelectionInfo() {
          // Disconnect feature selection handler
          if (featureSelectionEvent) {
              featureSelectionEvent.remove();
          }

          // If features are returned
          if (self.graphicLayers.length > 0) {
              // Set the selection state
              self.selectionState = "Selection";

              // Get the display field
              reportLayer = self.layerSelect.value;
              var len = self.config.layers.length;
              for (var a = 0; a < len; a++) {
                  if (reportLayer.toLowerCase() == self.config.layers[a].serviceURL.toLowerCase()) {
                      var displayField = self.config.layers[a].displayField;
                      var displayLabel = self.config.layers[a].displayLabel;
                  }
              }

              // If multiple features returned
              var multipleSelection = dijit.byId("multipleSelection").checked;
              if ((self.graphicLayers.length > 1) && (multipleSelection == false)) {
                  // Show multiple features selection
                  html.setStyle(self.multipleFeaturesTable, "display", "block");


                  dijit.byId('multipleFeaturesSelect').removeOption(dijit.byId('multipleFeaturesSelect').getOptions());
                  var len = self.graphicLayers.length;
                  for (var a = 0; a < len; a++) {
                      var multipleFeaturesResult = {};

                      // Load in the features to the dropdown
                      var option = {
                          graphic: self.graphicLayers[a],
                          value: self.graphicLayers[a].attributes[displayField],
                          label: self.graphicLayers[a].attributes[displayField]
                      };
                      self.multipleFeaturesSelect.addOption(option);
                  }

                  // Get the initial selection
                  var selectForm = dijit.byId('multipleFeaturesSelect');
                  array.forEach(selectForm.options, function (option) {
                      if (option.selected == true) {
                          var selection = option.graphic;
                          // Get JSON for the selected feature
                          var selectedFeature = {};
                          self.selectedGeometry = selection.geometry;
                          selectedFeature.geometry = selection.geometry;
                          selectedFeature.attributes = selection.attributes;
                          self.selectedFeatureJSON = JSON.stringify(selectedFeature);
                          // Update the display text
                          self.featureSelected.innerHTML = displayLabel + selectedFeature.attributes[displayField];
                      }
                  });

                  // EVENT FUNCTION - When selected feature dropdown is changed
                  featureSelectionEvent = self.multipleFeaturesSelect.on("change", function () {
                      var selectForm = dijit.byId('multipleFeaturesSelect');
                      array.forEach(selectForm.options, function (option) {
                          if (option.selected == true) {
                              var selection = option.graphic;
                              // Get JSON for the selected feature
                              var selectedFeature = {};
                              self.selectedGeometry = selection.geometry;
                              selectedFeature.geometry = selection.geometry;
                              selectedFeature.attributes = selection.attributes;
                              self.selectedFeatureJSON = JSON.stringify(selectedFeature);
                              // Update the display text
                              self.featureSelected.innerHTML = displayLabel + selectedFeature.attributes[displayField];
                        }
                      });
                  })
              }
              else {
                  // Hide multiple features selection
                  dijit.byId('multipleFeaturesSelect').removeOption(dijit.byId('multipleFeaturesSelect').getOptions());
                  html.setStyle(self.multipleFeaturesTable, "display", "none");

                  // For each of the graphics that have been selected
                  var graphicLayerCount = 1;
                  array.forEach(self.graphicLayers, function (graphicLayer) {
                      // Get JSON for the selected feature
                      var selectedFeature = {};
                      // Update the display text
                      if ((multipleSelection == true) && (graphicLayerCount > 1)) {
                          // Merge the geometry
                          selectedFeature.geometry = geometryEngine.union([self.selectedGeometry, graphicLayer.geometry]);
                          self.selectedGeometry = selectedFeature.geometry;
                          self.featureSelected.innerHTML = "Multiple features currently selected...";
                      }
                      else {
                          selectedFeature.geometry = graphicLayer.geometry;
                          self.selectedGeometry = graphicLayer.geometry;
                          self.featureSelected.innerHTML = displayLabel + graphicLayer.attributes[displayField];
                      }
                      selectedFeature.attributes = graphicLayer.attributes;
                      self.selectedFeatureJSON = JSON.stringify(selectedFeature);
                      graphicLayerCount = graphicLayerCount + 1;
                  });
              }

              // Enable submit button
              domClass.remove(self.submitButton, 'jimu-state-disabled');
          }
          else {
              self.featureSelected.innerHTML = "No features found for " + dijit.byId("layerSelect").get("displayedValue") + "...";

              // Disable submit button
              domClass.add(self.submitButton, 'jimu-state-disabled');
          }
      }

      // FUNCTION - Get maps that are needed
      function analyseMaps() {
          // Disconnect event handlers
          panEndHandler.remove();
          zoomEndHandler.remove();

          // Get JSON for the current webmap
          var printTask = new PrintTask();
          var printParameters = new PrintParameters();
          var webmap = printTask._getPrintDefinition(map, printParameters);

          // Set the report quality
          webmap.exportOptions = {
              "dpi": self.reportQualitySelect.value
          }
          webmap.layoutOptions = {
              "titleText": "",
              "legendOptions": {
                  "operationalLayers": []
              }
          }
          // Set the scale from the map
          webmap.mapOptions.scale = map.getScale();
          webmapJSON = JSON.stringify(webmap);

          // Get the maps to include from the table
          var userMaps = self.mapTable.getData();
          var mapsInclude = [];
          // For each of the maps
          array.forEach(userMaps, function (userMap) {
              // If the map is checked
              if (String(userMap.include).toLowerCase() == "true") {
                  // Push into array
                  mapsInclude.push(userMap);

                  // For each of the maps from the config
                  var configMaps = self.config.maps;
                  array.forEach(configMaps, function (configMap) {
                      // If parent map is defined
                      if (configMap.parentMap) {
                          // If it is the current map
                          if (userMap.map == configMap.parentMap) {
                              // Add to maps to include array
                              var childMap = {};
                              childMap.include = true;
                              childMap.map = configMap.title;
                              childMap.scale = "";
                              mapsInclude.push(childMap);
                          }
                      }
                  });
              }
          });

          var mapsAnalyse = [];
          var configMaps = self.config.maps;
          array.forEach(configMaps, function (configMap) {
              // For each of the maps to include
              array.forEach(mapsInclude, function (mapInclude) {
                  // If the map is to be included
                  if (configMap.title.toLowerCase() == mapInclude.map.toLowerCase()) {
                      // If an intersect layer is specified
                      if (configMap.intersectLayer) {
                          // Push into array of maps to analyse
                          mapsAnalyse.push(configMap);
                      }
                      // No intersect layer specified
                      else {
                          // Push into array of maps to produce
                          mapsProduce.push(configMap.title);
                      }
                  }
              });
          });

          // If no intersect layers specified
          if (mapsAnalyse.length == 0) {
              // Submit report to GP service
              submitReport();
          }
          // Need to spatially query layers in maps
          else {
              // Setup query parameters for intersect
              var query = new Query();
              query.where = "1=1";
              query.outFields = ["*"];
              query.units = "meters";
              query.geometry = self.selectedGeometry;
              query.spatialRelationship = Query.SPATIAL_REL_INTERSECTS;
              // If showing intersect layers on the map
              if (String(self.config.showIntersectLayers).toLowerCase() == "true") {
                  query.returnGeometry = true;
              }
              else {
                  query.returnGeometry = false;
              }

              // For each of the maps
              var intersectQueries = [];
              var mapIntersectQueries = [];
              var layerQueries = [];
              var mapLayerQueries = [];
              var mapLayerQueryURLs = [];
              // For each of the maps
              array.forEach(mapsAnalyse, function (mapAnalyse) {
                  // If there is a comma in the string - multiple intersect layers
                  if (mapAnalyse.intersectLayer.indexOf(",") > 0) {
                      // Push the intersect layers into an array
                      var intersectLayers = mapAnalyse.intersectLayer.split(',');
                      // For each of the intersect layers
                      array.forEach(intersectLayers, function (intersectLayer) {
                          // Set the URL
                          var url = intersectLayer;

                          // Setup the query parameters
                          var queryTask = new QueryTask(url);
                          // If doing a buffer
                          if ((mapAnalyse.bufferDistance) && (Number(mapAnalyse.bufferDistance) > 0)) {
                              query.distance = mapAnalyse.bufferDistance;
                          }
                          else {
                              query.distance = "";
                          }
                          var executeQuery = queryTask.execute(query);
                          // Push query to execute into array as well as the title
                          intersectQueries.push(executeQuery);
                          mapIntersectQueries.push(mapAnalyse);
                          mapLayerQueryURLs.push(intersectLayer);

                      });
                  }
                  // Single intersect layer
                  else {
                      // Split the URL
                      var urlSplit = mapAnalyse.intersectLayer.split("/");
                      // If the last character is not a number, then must be a map service
                      if (isNaN(urlSplit[urlSplit.length - 1])) {
                          // Setup the query to get layers from a map service
                          var layersRequest = esriRequest({
                              url: mapAnalyse.intersectLayer + "/layers",
                              content: { f: "json" },
                              handleAs: "json",
                              callbackParamName: "callback"
                          });
                          layerQueries.push(layersRequest);
                          mapLayerQueries.push(mapAnalyse);
                      }
                      else {
                          // Set the URL
                          var url = mapAnalyse.intersectLayer;

                          // Setup the query parameters
                          var queryTask = new QueryTask(url);
                          // If doing a buffer
                          if ((mapAnalyse.bufferDistance) && (Number(mapAnalyse.bufferDistance) > 0)) {
                              query.distance = mapAnalyse.bufferDistance;
                          }
                          else {
                              query.distance = "";
                          }
                          var executeQuery = queryTask.execute(query);
                          // Push query to execute into array as well as the title
                          intersectQueries.push(executeQuery);
                          mapIntersectQueries.push(mapAnalyse);
                          mapLayerQueryURLs.push(mapAnalyse.intersectLayer);
                      }
                  }
              });

              // If there are any layer queries
              if (layerQueries.length > 0) {
                  // Execute all layer queries
                  console.log("Querying services for layers...");
                  all(layerQueries).then(function (results) {
                      // For each of the results
                      var count = 0;
                      array.forEach(results, function (result) {
                          // For each of the layers
                          array.forEach(result.layers, function (layer) {
                              // Setup the query parameters
                              var queryTask = new QueryTask(mapLayerQueries[count].intersectLayer + "/" + layer.id);
                              // If doing a buffer
                              if ((mapLayerQueries[count].bufferDistance) && (Number(mapLayerQueries[count].bufferDistance) > 0)) {
                                  query.distance = mapLayerQueries[count].bufferDistance;
                              }
                              else {
                                  query.distance = "";
                              }
                              var executeQuery = queryTask.execute(query);
                              // Push query to execute into array as well as the title
                              intersectQueries.push(executeQuery);
                              mapIntersectQueries.push(mapLayerQueries[count]);
                              mapLayerQueryURLs.push(mapLayerQueries[count].intersectLayer + "/" + layer.id);
                          });
                          count = count + 1;
                          // If at the final result
                          if (results.length == count) {
                              // Execute spatial queries
                              spatialQueries(intersectQueries, mapIntersectQueries, mapLayerQueryURLs);
                          }
                      });
                  });
              }
              // No layer queries to perform
              else {
                  // Execute spatial queries
                  spatialQueries(intersectQueries, mapIntersectQueries, mapLayerQueryURLs);
              }

          }
      }

      // FUNCTION - Execute spatial queries
      function spatialQueries(intersectQueries, mapIntersectQueries, mapLayerQueryURLs) {
          // Execute all apatial queries
          self.loadingInfo.innerHTML = "Querying layers...";
          console.log("Spatially querying services...");

          all(intersectQueries).then(function (results) {
              // Set up array of colours
              var fillColours = [[255,255,0,0.3],[255,0,0,0.3],[0,0,255,0.3],[0,255,0,0.3],[255,0,128,0.3],[255,128,0,0.3],[192,192,192,0.3],[128,255,128,0.3],[255,128,128,0.3],[255,128,255,0.3],[128,0,255,0.3],[0,0,64,0.3]]
              var lineColours = [[255,255,0],[255,0,0],[0,0,255],[0,255,0],[255,0,128],[255,128,0],[192,192,192],[128,255,128],[255,128,128],[255,128,255],[128,0,255],[0,0,64]]
              // For each of the results
              var count = 0;
              array.forEach(results, function (result) {
                    console.log(mapIntersectQueries[count].title + "(" + mapLayerQueryURLs[count] + ") - " + result.features.length + " features returned...");
                    // If results are returned
                    if (result.features.length > 0) {
                        // For each of the fields
                        array.forEach(result.fields, function (field) {
                            // Clip the field length if needed
                            if (field.name.length > 60) {
                                field.name = field.name.substring(0, 60);
                            }
                        });

                        // Setup data to download object
                        var data = {};
                        var dataFeatures = [];
                        data.fields = result.fields;
                        data.geometryType = result.geometryType;
                        data.spatialReference = result.spatialReference;        

                        // Delete un-needed fields
                        var deleteFields = ["OBJECTID","OBJECTID_","SHAPE.STArea()","SHAPE.STLength()","Shape.STArea()","Shape.STLength()","Shape__Area","Shape__Length"];
                        var fieldsLength = result.fields.length;
                        var fieldsToDelete = [];
                        // For each of the fields
                        for (var fieldCount = 0; fieldCount < fieldsLength;) {
                            // If the field is in the delete fields
                            if (deleteFields.indexOf(result.fields[fieldCount].name) != -1) {
                                fieldsToDelete.push(result.fields[fieldCount].name);
                                // Delete the field
                                result.fields.splice(fieldCount, 1);
                                fieldsLength = fieldsLength - 1;
                            }
                            else {
                                fieldCount = fieldCount + 1;
                            }
                        }

                        var features = result.features;

                        // If showing intersect layers on the map
                        if (String(self.config.showIntersectLayers).toLowerCase() == "true") {
                            // Set the symbology
                            switch (features[0].geometry.type) {
                                case "point":
                                    var symbol = new SimpleMarkerSymbol(esri.symbol.SimpleMarkerSymbol.STYLE_SQUARE, 26,
                                    new esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID,
                                    new dojo.Color([0, 0, 0]), 2),
                                    new dojo.Color(fillColours[count]));
                                    break;
                                case "polyline":
                                    var symbol = new SimpleLineSymbol(esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID,
                                    new dojo.Color(lineColours[count]), 3));
                                    break;
                                case "polygon":
                                    var symbol = new SimpleFillSymbol(esri.symbol.SimpleFillSymbol.STYLE_SOLID,
                                    new esri.symbol.SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID,
                                    new dojo.Color(lineColours[count]), 3), new dojo.Color(fillColours[count]));
                                    break;
                            }
                        }

                        // Add feature set to data
                        var reportFeatures = {};
                        reportFeatures.map = mapIntersectQueries[count].title;
                        // For each of the features
                        var reportAttributes = [];
                        array.forEach(features, function (feature) {
                            reportAttributes.push(feature.attributes);
                        });
                        // If being used in a report
                        if ((mapIntersectQueries[count].type.toLowerCase() == "report") || (mapIntersectQueries[count].type.toLowerCase() == "report - analysis")) {
                            reportFeatures.features = reportAttributes;
                            reportFeatures.fields = result.fields;
                        }
                        else {
                            reportFeatures.features = [];
                            reportFeatures.fields = [];
                        }
                        reportData.push(reportFeatures);


                        // If showing intersect layers on the map
                        if ((String(self.config.showIntersectLayers).toLowerCase() == "true") && (String(mapIntersectQueries[count].showIntersectLayer).toLowerCase() == "true")) {
                            // Add in area and length fields
                            switch (features[0].geometry.type) {
                                case "polyline":
                                    var newFieldLength = {}
                                    newFieldLength.name = "LengthMetres";
                                    newFieldLength.alias = "Length (Metres)";
                                    newFieldLength.type = "esriFieldTypeDouble";
                                    result.fields.push(newFieldLength);
                                    break;
                                case "polygon":
                                    var newFieldArea = {}
                                    newFieldArea.name = "Hectares";
                                    newFieldArea.alias = "Hectares";
                                    newFieldArea.type = "esriFieldTypeDouble";
                                    result.fields.push(newFieldArea);
                                    var newFieldLength = {}
                                    newFieldLength.name = "LengthMetres";
                                    newFieldLength.alias = "Length (Metres)";
                                    newFieldLength.type = "esriFieldTypeDouble";
                                    result.fields.push(newFieldLength);
                                    break;
                            }

                            // Create a feature collection
                            var featureCollection = {
                                "layerDefinition": null,
                                "featureSet": {
                                    "features": [],
                                    "geometryType": features[0].geometryType
                                }
                            };
                            featureCollection.layerDefinition = {
                                "geometryType": features[0].geometryType,
                                "fields": result.fields,

                            };

                            // Create a feature layer
                            var infoTemplate = new InfoTemplate();
                            var featureLayer = new FeatureLayer(featureCollection,
                            {
                                infoTemplate: infoTemplate,
                                outFields: ["*"]
                            });
                            // Set the info window title
                            infoTemplate.setTitle(mapIntersectQueries[count].title);
                            // Set the info window content
                            var content = "";
                            array.forEach(result.fields, function (field) {
                                // If field is in the report fields configuration
                                if (mapIntersectQueries[count].reportFields.indexOf(field['name']) !== -1) {
                                    content = content + field['alias'] + ": ${" + field['name'] + "} <br/>";
                                }
                            });
                            infoTemplate.setContent(content);
                            featureLayer.name = mapIntersectQueries[count].title;
                            // Set the feature layer renderer
                            var renderer = new SimpleRenderer(symbol);
                            featureLayer.setRenderer(renderer);

                            // For each of the features returned
                            var featuresToAdd = [];
                            array.forEach(features, function (feature) {
                                // If the geometry is not null
                                if (feature.geometry) {
                                    // For each of the attributes
                                    for (var key in feature.attributes) {
                                        // Clip the field length if needed
                                        if (key.length > 60) {
                                            feature.attributes[key.substring(0, 60)] = feature.attributes[key];
                                            delete feature.attributes[key];
                                        }
                                    }

                                    // For each of the fields to delete
                                    array.forEach(fieldsToDelete, function (fieldToDelete) {
                                        // Delete the field
                                        delete feature.attributes[fieldToDelete];
                                    });

                                    // Set the symbology
                                    switch (feature.geometry.type) {
                                        case "polyline":
                                            // If not doing a buffer
                                            if ((!mapIntersectQueries[count].bufferDistance) || (Number(mapIntersectQueries[count].bufferDistance) == 0)) {
                                                // Clip the geometry to the selection
                                                var clippedGeometry = geometryEngine.intersect(self.selectedGeometry, feature.geometry);
                                                feature.geometry = clippedGeometry;
                                                // Update length
                                                if (clippedGeometry) {
                                                    feature.geometry.type = "polyline";
                                                    var geometryLength = geometryEngine.planarLength(clippedGeometry, "meters");
                                                }
                                                else {
                                                    var geometryLength = 0.0000;
                                                }
                                                feature.attributes.LengthMetres = parseFloat(geometryLength).toFixed(4);
                                            }
                                            break;
                                        case "polygon":
                                            // If not doing a buffer
                                            if ((!mapIntersectQueries[count].bufferDistance) || (Number(mapIntersectQueries[count].bufferDistance) == 0)) {
                                                // Clip the geometry to the selection
                                                var clippedGeometry = geometryEngine.intersect(self.selectedGeometry, feature.geometry);
                                                feature.geometry = clippedGeometry;
                                                // Update area and length
                                                if (clippedGeometry) {
                                                    feature.geometry.type = "polygon";
                                                    var geometryArea = geometryEngine.planarArea(clippedGeometry, "hectares");
                                                    var geometryLength = geometryEngine.planarLength(clippedGeometry, "meters");
                                                }
                                                else {
                                                    var geometryArea = 0.0000;
                                                    var geometryLength = 0.0000;
                                                }
                                                feature.attributes.Hectares = parseFloat(geometryArea).toFixed(4);
                                                feature.attributes.LengthMetres = parseFloat(geometryLength).toFixed(4);
                                            }
                                            break;
                                    }
                                    // Add to features array
                                    featuresToAdd.push(feature);
                                    // Add features to data download object
                                    var dataFeature = {};
                                    dataFeature.attributes = feature.attributes;
                                    // Get the geoemtry
                                    dataFeature.geometry = {};
                                    if (feature.geometry) {
                                        switch (feature.geometry.type) {
                                            case "point":
                                                dataFeature.geometry.x = feature.geometry.x;
                                                dataFeature.geometry.y = feature.geometry.y;
                                            case "polyline":
                                                dataFeature.geometry.paths = feature.geometry.paths;
                                            case "polygon":
                                                dataFeature.geometry.rings = feature.geometry.rings;
                                        }
                                    }
                                    dataFeatures.push(dataFeature);
                                }
                            });
                            data.features = dataFeatures;

                            if ((String(self.config.downloadDataIntersectLayers).toLowerCase() == "true") && (String(self.dataDownloadFormatSelect.value).toLowerCase() != "none")) {
                                // Add the data download format and title
                                data.downloadFormat = self.dataDownloadFormatSelect.value;
                                data.title = mapIntersectQueries[count].title;
                            }
                            // Add feature layer to the map and global array
                            self.analysisfeatureLayers.push(featureLayer);
                            map.addLayer(featureLayer);
                            // Add features to feature layer
                            featureLayer.applyEdits(featuresToAdd, null, null);

                            // Enable clear button
                            domClass.remove(self.clearButton, 'jimu-state-disabled');

                            downloadData.push(data);
                        }
                    }  
                    count = count + 1;
                    // If at the final result
                    if (results.length == count) {
                        // Submit report to GP service
                        submitReport();
                    }
              });
          });
      }

      // FUNCTION - Submit parameters to GP service
      function submitReport() {
          // Update maps to produce array based on spatial query
          array.forEach(reportData, function (report) {
              mapsProduce.push(report.map);
          });

          // Get the maps to include from the table
          var userMaps = self.mapTable.getData();
          var mapsInclude = [];
          // For each of the maps
          array.forEach(userMaps, function (userMap) {
              // If the map is checked
              if (String(userMap.include).toLowerCase() == "true") {
                  // Push into array
                  mapsInclude.push(userMap);

                  // For each of the maps from the config
                  var configMaps = self.config.maps;
                  array.forEach(configMaps, function (configMap) {
                      // If parent map is defined
                      if (configMap.parentMap) {
                          // If it is the current map
                          if (userMap.map == configMap.parentMap) {
                              // Add to maps to include array
                              var childMap = {};
                              childMap.include = true;
                              childMap.map = configMap.title;
                              childMap.scale = "";
                              mapsInclude.push(childMap);
                          }
                      }
                  });
              }
          });

          // Get the report JSON
          var configMaps = self.config.maps;
          var report = [];
          // For each of the maps from the config
          array.forEach(configMaps, function (configMap) {
              // For each of the maps to include
              array.forEach(mapsInclude, function (mapInclude) {
                  // If the map is to be included
                  if (configMap.title.toLowerCase() == mapInclude.map.toLowerCase()) {
                      if (mapsProduce.indexOf(mapInclude.map) != -1) {
                          // Update scale
                          configMap.scale = Number(mapInclude.scale);

                          // If multiple page map is enabled
                          if (String(self.config.showMultiplePageMap).toLowerCase() == "true") {
                              // Add option to config
                              configMap.multiplePageMap = "true";
                          }
                          else {
                              // Add option to config
                              configMap.multiplePageMap = "false";
                          }

                          // Set the subtitle for the maps if needed
                          if (String(self.config.showSubtitle).toLowerCase() == "true") {
                              // If subtitle text is blank
                              if (self.subtitleText.get('value') == "") {
                                  // If a feature is selected
                                  if (self.selectionState.toLowerCase() == "selection") {
                                      configMap.subtitle = self.featureSelected.innerHTML;
                                  }
                                  else {
                                      configMap.subtitle = "";
                                  }
                              }
                              // Subtitle text is populated
                              else {
                                configMap.subtitle = self.subtitleText.get('value');
                              }
                          }

                          // Push into array
                          report.push(configMap);
                      }
                  }
              });
          });
          var reportJSON = JSON.stringify(report);

          // Get the report data JSON
          var reportDataJSON = JSON.stringify(reportData);

          // If download data is enabled
          if ((String(self.config.downloadDataIntersectLayers).toLowerCase() == "true") && (String(self.dataDownloadFormatSelect.value).toLowerCase() != "none")) {
              // Get the data download JSON
              var downloadDataJSON = JSON.stringify(downloadData);
          }
          else {
              var downloadDataJSON = null;
          }

          self.loadingInfo.innerHTML = "Creating maps...";
          array.forEach(mapsProduce, function (map) {
              self.loadingInfo.innerHTML = self.loadingInfo.innerHTML + "<BR/>" + map;
          });
          console.log("-----Selected Feature JSON-----");
          console.log(self.selectedFeatureJSON);
          console.log("-----Webmap JSON-----");
          console.log(webmapJSON);
          console.log("-----Report JSON-----");
          console.log(reportJSON);
          console.log("-----Report Data JSON-----");
          console.log(reportDataJSON);
          console.log("-----Download Data JSON-----");
          console.log(downloadDataJSON);
          // Setup the geoprocessing service
          gpService = new Geoprocessor(self.config.gpService);
          // Setup parameters for GP service
          var gpParams = {
              "Selected_Feature_JSON": self.selectedFeatureJSON,
              "Web_Map_as_JSON": webmapJSON,
              "Reports_JSON": reportJSON,
              "Report_Data_JSON": reportDataJSON,
              "Download_Data_JSON": downloadDataJSON,
          };

          // Submit job to GP service
          gpService.submitJob(gpParams);
          // Add GP event handlers
          gpService.on("status-update", gpJobStatus);
          gpService.on("job-complete", gpComplete);
          gpErrorEvent = gpService.on("error", gpError);
          console.time('Complete Geoprocessing Service');
          // Enable cancel button
          domClass.remove(self.cancelButton, 'jimu-state-disabled');
      }

      // FUNCTION - Get GP service job status
      function gpJobStatus(status) {
          gpServiceJobId = status.jobInfo.jobId;
          switch (status.jobInfo.jobStatus) {
              case 'esriJobSubmitted':
                  // Log status
                  console.log("Submitted job to report geoprocessing service...");
                  break;
              case 'esriJobExecuting':
                  // Log status
                  console.log("Report geoprocessing service job executing...");
                  break;
              case 'esriJobFailed':
                  // Log job information
                  console.log(status.jobInfo);
                  break;
          }
      }

      // FUNCTION - GP service complete
      function gpComplete(result) {
          // Get the output report
          gpService.getResultData(result.jobInfo.jobId, "Output_File");
          getReportEvent = gpService.on("get-result-data-complete", function (outputReport) {
              // Get report download link
              reportDownloadLink = outputReport.result.value.url;
              // Enable report download button
              domClass.remove(self.reportDownloadButton, 'jimu-state-disabled');

              self.loadingInfo.innerHTML = "Report generation complete...";
              console.log("Report geoprocessing service job finished...");
              console.log("PDF located here - " + reportDownloadLink + "...");
              // Open the PDF
              window.open(reportDownloadLink);
              console.timeEnd('Complete Geoprocessing Service');
              getReportEvent.remove();

              // Get the output data if needed
              if ((String(self.config.downloadDataIntersectLayers).toLowerCase() == "true") && (String(self.dataDownloadFormatSelect.value).toLowerCase() != "none")) {
                  gpService.getResultData(result.jobInfo.jobId, "Output_Data");
                  getDataEvent = gpService.on("get-result-data-complete", function (outputData) {
                      // Get data download link
                      dataDownloadLink = outputData.result.value.url;
                      // Enable data download button
                      domClass.remove(self.dataDownloadButton, 'jimu-state-disabled');

                      console.log("Data located here - " + dataDownloadLink + "...");
                      // Download the data
                      window.open(dataDownloadLink);
                      getDataEvent.remove();
                  });
              }

          });

          // Enable submit button
          domClass.remove(self.submitButton, 'jimu-state-disabled');
          // Enable clear button
          domClass.remove(self.clearButton, 'jimu-state-disabled');
          // Disable cancel button
          domClass.add(self.cancelButton, 'jimu-state-disabled');

          // Hide loading
          reportGenerating = false;
          html.setStyle(self.loading, "display", "none");
          self.loadingInfo.innerHTML = "Loading...";
      }

      // EVENT FUNCTION - Report download button click
      on(this.reportDownloadButton, 'click', lang.hitch(this, function (evt) {
          // Open the PDF
          if (reportDownloadLink) {
              window.open(reportDownloadLink);
          }
      }));

      // EVENT FUNCTION - Data download button click
      on(this.dataDownloadButton, 'click', lang.hitch(this, function (evt) {
          // Download the data
          if (dataDownloadLink) {
              window.open(dataDownloadLink);
          }
      }));

      // FUNCTION - Error from GP service
      function gpError(error) {
          // Log error message
          console.error("An error occurred producing the report...");
          // Show error message
          new Message({
              type: 'error',
              message: String("An error occurred producing the report, please try again...")
          });
          console.error(error.error);

          // Enable submit button
          domClass.remove(self.submitButton, 'jimu-state-disabled');
          // Enable clear button
          domClass.remove(self.clearButton, 'jimu-state-disabled');
          // Disable cancel button
          domClass.add(self.cancelButton, 'jimu-state-disabled');
          // Disable download buttons
          domClass.add(self.reportDownloadButton, 'jimu-state-disabled');
          domClass.add(self.dataDownloadButton, 'jimu-state-disabled');
          // Hide loading
          reportGenerating = false;
          html.setStyle(self.loading, "display", "none");
          self.loadingInfo.innerHTML = "Loading...";
      }
    },

    // FUNCTION - When data is received from another widget
    onReceiveData: function (name, widgetId, data, historyData) {
        // If search integration functionality is enabled
        if (String(this.config.enableSearchIntegration).toLowerCase() == "true") {
            // If it is the search widget
            if (name.toLowerCase() == "search") {
                // If search result has been selected
                if (data.selectResult) {
                    // If a point
                    if (data.selectResult.result.feature.geometry.type.toLowerCase() == "point") {
                        // Send the returned point to the map click function
                        this.mapClick(data.selectResult.result.feature.geometry);
                    }
                        // If a polyline
                    else if (data.selectResult.result.feature.geometry.type.toLowerCase() == "polyline") {
                        // Send the returned polyline to the map click function
                        this.mapClick(data.selectResult.result.feature.geometry);
                    }
                        // Else polygon
                    else {
                        // Send the returned polygon centre point to the map click function
                        this.mapClick(data.selectResult.result.feature.geometry.getCentroid());
                    }
                }
            }
        }
    },

    // FUNCTION - Map click
    mapClick: function (mapPoint) {
        // If a report isn't already generating, draw is not selected and widget is open
        if ((this.reportGenerating == false) && (dijit.byId('layerSelect').attr('value').toLowerCase() != "draw") && (this.widgetState.toLowerCase() == "open")) {
            // Get JSON for the current webmap
            var printTask = new PrintTask();
            var printParameters = new PrintParameters();
            var webmap = printTask._getPrintDefinition(this.map, printParameters);

            // Clear graphics if single select
            var multipleSelection = dijit.byId("multipleSelection").checked;
            if (multipleSelection == false) {
                // Clear selection graphics
                this.clearSelectionGraphics();
            }

            // Setup a query
            var selectQuery = new Query();
            // Get the map point and make a selection
            selectQuery.geometry = mapPoint;
            this.selectionFeatureLayer.selectFeatures(selectQuery,
                      FeatureLayer.SELECTION_NEW);
            // Show loading
            html.setStyle(this.loading, "display", "block");
            this.loadingInfo.innerHTML = "Loading...";
        }
    },

    // FUNCTION - Set current scale for the maps
    setMapsScale: function () {
        // Get the current scale of the map
        var scale = scaleUtils.getScale(this.map);
        // Update the display text for scale
        if (this.currentScale) {
            this.currentScale.innerHTML = "1:" + Math.round(scale).toString();
        }

    },

    // FUNCTION - Clear all selection graphics 
    clearSelectionGraphics: function () {
        if (this.graphicLayers.length > 0) {
            console.log("Removing all graphic selection layers from the map...");
            // Clear selection graphics
            this.map.graphics.clear();
            this.selectionFeatureLayer.clear();
            // Reset global array for layers
            this.graphicLayers = [];
        }

        // Clear drawings
        this.drawBox.clear();
    },

    // FUNCTION - Remove all analysis feature layers   
    removeAnalysisFeatureLayers: function () {
        var self = this;
        // Remove feature layers from the map
        if (this.analysisfeatureLayers.length > 0) {
            console.log("Removing all analysis feature layers from the map...");
            array.forEach(this.analysisfeatureLayers, function (analysisfeatureLayer) {
                self.map.removeLayer(analysisfeatureLayer);
                analysisfeatureLayer = null;
            });
            // Reset global array
            this.analysisfeatureLayers = [];
        }
    },

    // EVENT FUNCTION - Open widget
    onOpen: function(){
        console.log('Report widget opened...');
        this.widgetState = "Open";
    },

    // EVENT FUNCTION - Close widget
    onClose: function(){
        console.log('Report widget closed...');
        this.widgetState = "Closed";

        // Clear info window
        this.map.infoWindow.hide();

        domClass.add(this.submitButton, 'jimu-state-disabled');
        this.featureSelected.innerHTML = "No features currently selected...";
        this.selectedFeatureJSON = null;
        this.selectedGeometry = null;
        // Hide multiple features selection
        dijit.byId('multipleFeaturesSelect').removeOption(dijit.byId('multipleFeaturesSelect').getOptions());
        html.setStyle(this.multipleFeaturesTable, "display", "none");

        // Clear selection graphics
        this.clearSelectionGraphics();
        // Remove any analysis feature layers from the map
        this.removeAnalysisFeatureLayers();

        // Disable clear button
        domClass.add(this.clearButton, 'jimu-state-disabled');
    },

    // EVENT FUNCTION - Minimise widget
    onMinimize: function(){
        console.log('Report widget minimised...');
        this.widgetState = "Open";
    },

    // EVENT FUNCTION - Maximised widget
    onMaximize: function(){
        console.log('Report widget maximised...');
        this.widgetState = "Open";
    }
  });
});