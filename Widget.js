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

    // EVENT FUNCTION - Creation of widget
    postCreate: function () {
      console.log('Report widget created...');
      this.inherited(arguments);
      var mapFrame = this;

      // Initially disable submit button
      domClass.add(this.submitButton, 'jimu-state-disabled');
      // Initially disable clear button
      domClass.add(this.clearButton, 'jimu-state-disabled');


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
          width: '70%',
          unique: false,
          editable: false
      }, {
          name: 'scale',
          title: this.nls.scale,
          type: 'text',
          width: '20%',
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
              json.push({
                  map: this.config.maps[a].title,
                  scale: this.config.maps[a].scale
              });
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

      // Load in report quality options to dropdown
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
          this.dataDownloadFormatSelect.set("value", "CSV");
      }
    },

    // EVENT FUNCTION - Startup widget
    startup: function () {
      console.log("Report widget started...");
      widgetState = "Open";
      this.inherited(arguments);
      var mapFrame = this;
      var map = this.map;
      // Graphic and feature layers
      var graphicLayers = []; // Graphic selection layers that have been added to the map to show the feature(s) that is/are selected
      var analysisfeatureLayers = []; // Analysis feature layers added to the map for querying/identifying
      var reportFeatureLayer = null; // The report feature layer added to the map as background layer
      var selectionFeatureLayer = null;
      // Event handlers
      var mapClickEvent = null;
      var selectionEvent = null;
      var featureSelectionEvent = null;
      // Currently selected feature
      var selectedFeatureJSON = null;
      var selectedGeometry = null;
      // Report Geoprocessing service
      var gpService = null;
      var reportGenerating = false;

      // On map table row click
      this.mapTable.on("row-click", function () {
          var allCheckboxes = mapFrame.mapTable._getAllEnabledTdCheckBoxes("include");
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
              domClass.add(mapFrame.submitButton, 'jimu-state-disabled');
          }
          else {
              // If a feature has been selected
              if (selectedFeatureJSON) {
                  // Enable submit button
                  domClass.remove(mapFrame.submitButton, 'jimu-state-disabled');
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
          mapFrame.map.infoWindow.hide();

          domClass.add(mapFrame.submitButton, 'jimu-state-disabled');
          mapFrame.featureSelected.innerHTML = "No features currently selected...";
          selectedFeatureJSON = null;
          selectedGeometry = null;

          var selection = this.get("value");
          // If draw selected
          if (selection.toLowerCase() == mapFrame.nls.draw.toLowerCase()) {
              // Show drawing tools
              html.setStyle(mapFrame.drawTools, "display", "block");
              // Hide selection tool
              html.setStyle(mapFrame.multipleSelectionTable, "display", "none");
              // Hide multiple features selection
              dijit.byId('multipleFeaturesSelect').removeOption(dijit.byId('multipleFeaturesSelect').getOptions());
              html.setStyle(mapFrame.multipleFeaturesTable, "display", "none");
              // Remove the report feature layer
              changeReportLayer(selection, "remove");
          }
          else {
              // Hide drawing tools
              html.setStyle(mapFrame.drawTools, "display", "none");
              // Hide selection tool
              html.setStyle(mapFrame.multipleSelectionTable, "display", "block");
              // Show feature selection
              html.setStyle(mapFrame.featureSelectedTable, "display", "block");
              // Hide multiple features selection
              dijit.byId('multipleFeaturesSelect').removeOption(dijit.byId('multipleFeaturesSelect').getOptions());
              html.setStyle(mapFrame.multipleFeaturesTable, "display", "none");
              // Add the report feature layer
              changeReportLayer(selection, "add");
          }
      })

        // If draw functionality is enabled
      if (String(this.config.enableDraw).toLowerCase() == "true") {
          // On draw end handler
          this.drawBox.on("draw-end", function () {
              // Get JSON for the drawn feature
              var selectedFeature = {};
              selectedGeometry = this.drawLayer.graphics[0].geometry;
              selectedFeature.geometry = this.drawLayer.graphics[0].geometry;
              selectedFeature.attributes = this.drawLayer.graphics[0].attributes;
              selectedFeatureJSON = JSON.stringify(selectedFeature);

              // Enable submit button
              domClass.remove(mapFrame.submitButton, 'jimu-state-disabled');
          });
          // On clear graphics handler
          this.drawBox.on("clear", function () {
              // Reset selection
              mapFrame.map.infoWindow.hide();
              domClass.add(mapFrame.submitButton, 'jimu-state-disabled');
              mapFrame.featureSelected.innerHTML = "No features currently selected...";
              selectedFeatureJSON = null;
              selectedGeometry = null;
          });
      }

      // EVENT FUNCTION - Clear button click
      on(this.clearButton, 'click', lang.hitch(this, function (evt) {
          // Clear info window
          mapFrame.map.infoWindow.hide();

          domClass.add(mapFrame.submitButton, 'jimu-state-disabled');
          mapFrame.featureSelected.innerHTML = "No features currently selected...";
          selectedFeatureJSON = null;
          selectedGeometry = null;
          // Hide multiple features selection
          dijit.byId('multipleFeaturesSelect').removeOption(dijit.byId('multipleFeaturesSelect').getOptions());
          html.setStyle(mapFrame.multipleFeaturesTable, "display", "none");

          // Clear selection graphics
          clearSelectionGraphics();
          // Remove any analysis feature layers from the map
          removeAnalysisFeatureLayers();

          // Disable clear button
          domClass.add(mapFrame.clearButton, 'jimu-state-disabled');
      }));

      // EVENT FUNCTION - Submit button click
      var panEndHandler;
      var zoomEndHandler;
      var mapsProduce = [];
      var reportData = [];
      var downloadData = [];
      connect.connect(this.submitButton, 'click', lang.hitch(this, function (evt) {
          // Remove any analysis feature layers from the map
          removeAnalysisFeatureLayers();

          mapsProduce = [];
          reportData = [];
          downloadData = [];

          // If a feature has been selected
          if (selectedFeatureJSON) {
              // Show loading
              reportGenerating = true;
              html.setStyle(mapFrame.loading, "display", "block");

              // If a point
              if (selectedGeometry.type.toLowerCase() == "point") {
                  // Factor for converting point to extent 
                  var factor = 20;
                  var extent = new esri.geometry.Extent(selectedGeometry.x - factor, selectedGeometry.y - factor, selectedGeometry.x + factor, selectedGeometry.y + factor, mapFrame.map.spatialReference);
              }
              else {
                  // Centre map on the feature
                  var extent = selectedGeometry.getExtent();
              }
              map.setExtent(extent.expand(1.5));

              // After extent has been changed - Pan and zoom events
              panEndHandler = map.on("pan-end", analyseMaps);
              zoomEndHandler = map.on("zoom-end", analyseMaps);
          }
      }));

      // FUNCTION - Change the report layer showing on the map
      function changeReportLayer(url,addRemove) {
        // Remove existing feature layer if single selection
          if (reportFeatureLayer) {
            // Clear selection graphics
            clearSelectionGraphics();
            // Remove any analysis feature layers from the map
            removeAnalysisFeatureLayers();
            // Remove feature layer
            map.removeLayer(reportFeatureLayer);
            reportFeatureLayer = null;
            selectionFeatureLayer = null;
        }

        // If adding layer
        if (addRemove.toLowerCase() == "add") {
            // Add the feature layer to the map
            reportFeatureLayer = new esri.layers.FeatureLayer(url, {
                mode: esri.layers.FeatureLayer.MODE_ONDEMAND,
                outFields: [],
                opacity: 0.7
            });
            reportFeatureLayer.id = "ReportLayer";
            map.addLayer(reportFeatureLayer);
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
          selectionFeatureLayer = new esri.layers.FeatureLayer(url, {
              mode: esri.layers.FeatureLayer.MODE_ONDEMAND,
              outFields: ["*"]
          });

          // EVENT FUNCTION - On map click
          mapClickEvent = map.on("click", function (event) {
              // If a report isn't already generating, draw is not selected and widget is open
              if ((reportGenerating == false) && (mapFrame.layerSelect.value.toLowerCase() != "draw") && (widgetState.toLowerCase() == "open")) {
                  // Get JSON for the current webmap
                  var printTask = new PrintTask();
                  var printParameters = new PrintParameters();
                  var webmap = printTask._getPrintDefinition(map, printParameters);

                  // Clear graphics if single select
                  var multipleSelection = dijit.byId("multipleSelection").checked;
                  if (multipleSelection == false) {
                      // Clear selection graphics
                      clearSelectionGraphics();
                  }

                  // Setup a query
                  var selectQuery = new Query();
                  // Get the map point and make a selection
                  selectQuery.geometry = event.mapPoint;
                  selectionFeatureLayer.selectFeatures(selectQuery,
                            FeatureLayer.SELECTION_NEW);
                  // Show loading
                  html.setStyle(mapFrame.loading, "display", "block");
                  mapFrame.loadingInfo.innerHTML = "Loading...";
              }
          });

          // EVENT FUNCTION - On feature layer selection complete
          selectionEvent = selectionFeatureLayer.on("selection-complete", function (selection) {
            // Hide loading
            html.setStyle(mapFrame.loading, "display", "none");
            mapFrame.loadingInfo.innerHTML = "Loading...";
            // Enable clear button
            domClass.remove(mapFrame.clearButton, 'jimu-state-disabled');
            // Set the symbology
            switch (selectionFeatureLayer.geometryType) {
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
                graphicLayers.push(feature);
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
          if (graphicLayers.length > 0) {
              // Get the display field
              reportLayer = mapFrame.layerSelect.value;
              var len = mapFrame.config.layers.length;
              for (var a = 0; a < len; a++) {
                  if (reportLayer.toLowerCase() == mapFrame.config.layers[a].serviceURL.toLowerCase()) {
                      var displayField = mapFrame.config.layers[a].displayField;
                  }
              }

              // If multiple features returned
              var multipleSelection = dijit.byId("multipleSelection").checked;
              if ((graphicLayers.length > 1) && (multipleSelection == false)) {
                  // Show multiple features selection
                  html.setStyle(mapFrame.multipleFeaturesTable, "display", "block");


                  dijit.byId('multipleFeaturesSelect').removeOption(dijit.byId('multipleFeaturesSelect').getOptions());
                  var len = graphicLayers.length;
                  for (var a = 0; a < len; a++) {
                      var multipleFeaturesResult = {};

                      // Load in the features to the dropdown
                      var option = {
                          graphic: graphicLayers[a],
                          value: graphicLayers[a].attributes[displayField],
                          label: graphicLayers[a].attributes[displayField]
                      };
                      mapFrame.multipleFeaturesSelect.addOption(option);
                  }

                  // Get the initial selection
                  var selectForm = dijit.byId('multipleFeaturesSelect');
                  array.forEach(selectForm.options, function (option) {
                      if (option.selected == true) {
                          var selection = option.graphic;
                          // Get JSON for the selected feature
                          var selectedFeature = {};
                          selectedGeometry = selection.geometry;
                          selectedFeature.geometry = selection.geometry;
                          selectedFeature.attributes = selection.attributes;
                          selectedFeatureJSON = JSON.stringify(selectedFeature);
                          // Update the display text
                          mapFrame.featureSelected.innerHTML = selectedFeature.attributes[displayField];
                      }
                  });

                  // EVENT FUNCTION - When selected feature dropdown is changed
                  featureSelectionEvent = mapFrame.multipleFeaturesSelect.on("change", function () {
                      var selectForm = dijit.byId('multipleFeaturesSelect');
                      array.forEach(selectForm.options, function (option) {
                          if (option.selected == true) {
                              var selection = option.graphic;
                              // Get JSON for the selected feature
                              var selectedFeature = {};
                              selectedGeometry = selection.geometry;
                              selectedFeature.geometry = selection.geometry;
                              selectedFeature.attributes = selection.attributes;
                              selectedFeatureJSON = JSON.stringify(selectedFeature);
                              // Update the display text
                              mapFrame.featureSelected.innerHTML = selectedFeature.attributes[displayField];
                        }
                      });
                  })
              }
              else {
                  // Hide multiple features selection
                  dijit.byId('multipleFeaturesSelect').removeOption(dijit.byId('multipleFeaturesSelect').getOptions());
                  html.setStyle(mapFrame.multipleFeaturesTable, "display", "none");

                  // For each of the graphics that have been selected
                  var graphicLayerCount = 1;
                  array.forEach(graphicLayers, function (graphicLayer) {
                      // Get JSON for the selected feature
                      var selectedFeature = {};
                      // Update the display text
                      if ((multipleSelection == true) && (graphicLayerCount > 1)) {
                          // Merge the geometry
                          selectedFeature.geometry = geometryEngine.union([selectedGeometry, graphicLayer.geometry]);
                          selectedGeometry = selectedFeature.geometry;
                          mapFrame.featureSelected.innerHTML = "Multiple features currently selected...";
                      }
                      else {
                          selectedFeature.geometry = graphicLayer.geometry;
                          selectedGeometry = graphicLayer.geometry;
                          mapFrame.featureSelected.innerHTML = graphicLayer.attributes[displayField];
                      }
                      selectedFeature.attributes = graphicLayer.attributes;
                      selectedFeatureJSON = JSON.stringify(selectedFeature);
                      graphicLayerCount = graphicLayerCount + 1;
                  });
              }

              // Enable submit button
              domClass.remove(mapFrame.submitButton, 'jimu-state-disabled');
          }
          else {
              mapFrame.featureSelected.innerHTML = "No features found for " + dijit.byId("layerSelect").get("displayedValue") + "...";

              // Disable submit button
              domClass.add(mapFrame.submitButton, 'jimu-state-disabled');
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
              "dpi": mapFrame.reportQualitySelect.value
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
          var userMaps = mapFrame.mapTable.getData();
          var mapsInclude = [];
          // For each of the maps
          array.forEach(userMaps, function (userMap) {
              // If the map is checked
              if (String(userMap.include).toLowerCase() == "true") {
                  // Push into array
                  mapsInclude.push(userMap);
              }
          });

          // For each of the maps from the config
          var configMaps = mapFrame.config.maps;
          var mapsAnalyse = [];
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
              query.geometry = selectedGeometry;
              query.spatialRelationship = Query.SPATIAL_REL_INTERSECTS;
              // If showing intersect layers on the map
              if (String(mapFrame.config.showIntersectLayers).toLowerCase() == "true") {
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
              // For each of the results
              var count = 0;
              array.forEach(mapsAnalyse, function (mapAnalyse) {
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
                      query.distance = mapAnalyse.bufferDistance;
                      var executeQuery = queryTask.execute(query);
                      // Push query to execute into array as well as the title
                      intersectQueries.push(executeQuery);
                      mapIntersectQueries.push(mapAnalyse);
                      mapLayerQueryURLs.push(mapAnalyse.intersectLayer);
                  }
                  count = count + 1;
                  // If at the final result
                  if (mapsAnalyse.length == count) {
                      // Execute spatial query
                      spatialQueries(intersectQueries, mapIntersectQueries, mapLayerQueryURLs);
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
                              query.distance = mapLayerQueries[count].bufferDistance;
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
          }
      }

      // FUNCTION - Execute spatial queries
      function spatialQueries(intersectQueries, mapIntersectQueries, mapLayerQueryURLs) {
          // Execute all apatial queries
          mapFrame.loadingInfo.innerHTML = "Querying layers...";
          console.log("Spatially querying services...");

          all(intersectQueries).then(function (results) {
              // Set up array of colours
              var fillColours = [[255,255,0,0.3],[255,0,0,0.3],[0,0,255,0.3],[0,255,0,0.3],[255,0,128,0.3],[255,128,0,0.3],[192,192,192,0.3],[128,255,128,0.3],[255,128,128,0.3],[255,128,255,0.3]]
              var lineColours = [[255,255,0],[255,0,0],[0,0,255],[0,255,0],[255,0,128],[255,128,0],[192,192,192],[128,255,128],[255,128,128],[255,128,255]]

              // For each of the results
              var count = 0;
              array.forEach(results, function (result) {
                    console.log(mapIntersectQueries[count].title + "(" + mapLayerQueryURLs[count] + ") - " + result.features.length + " features returned...");
                    // If results are returned
                    if (result.features.length > 0) {
                        // Setup data to download object
                        var data = {};
                        var dataFeatures = [];
                        data.fields = result.fields;
                        data.geometryType = result.geometryType;
                        data.spatialReference = result.spatialReference;
                        

                        // Delete un-needed fields
                        var deleteFields = ["OBJECTID","OBJECTID_","SHAPE.STArea()","SHAPE.STLength()","Shape.STArea()", "Shape.STLength()"];
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

                        // Add feature set to data
                        var reportFeatures = {};
                        reportFeatures.map = mapIntersectQueries[count].title;
                        // For each of the features
                        var reportAttributes = [];
                        array.forEach(features, function (feature) {
                            reportAttributes.push(feature.attributes);
                        });
                        reportFeatures.features = reportAttributes;
                        reportFeatures.fields = result.fields;
                        reportData.push(reportFeatures);

                        // If showing intersect layers on the map
                        if (String(mapFrame.config.showIntersectLayers).toLowerCase() == "true") {
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
                                    newFieldArea.name = "AreaMetres";
                                    newFieldArea.alias = "Area (Metres)";
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
                                if (mapIntersectQueries[count].reportFields.includes(field['name'])) {
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
                                // For each of the fields to delete
                                array.forEach(fieldsToDelete, function (fieldToDelete) {
                                    // Delete the field
                                    delete feature.attributes[fieldToDelete];
                                });

                                // Set the symbology
                                switch (feature.geometry.type) {
                                    case "polyline":
                                        // Clip the geometry to the selection
                                        var clippedGeometry = geometryEngine.intersect(selectedGeometry, feature.geometry);
                                        feature.geometry = clippedGeometry;
                                        // Update length
                                        if (clippedGeometry) {
                                            var geometryLength = geometryEngine.planarLength(clippedGeometry, "meters");
                                        }
                                        else {
                                            var geometryLength = 0.00;
                                        }
                                        feature.attributes.LengthMetres = parseFloat(geometryLength).toFixed(2);
                                        break;
                                    case "polygon":
                                        // Clip the geometry to the selection
                                        var clippedGeometry = geometryEngine.intersect(selectedGeometry, feature.geometry);
                                        feature.geometry = clippedGeometry;
                                        // Update area and length
                                        if (clippedGeometry) {
                                            var geometryArea = geometryEngine.planarArea(clippedGeometry, "square-meters");
                                            var geometryLength = geometryEngine.planarLength(clippedGeometry, "meters");
                                        }
                                        else {
                                            var geometryArea = 0.00;
                                            var geometryLength = 0.00;
                                        }
                                        feature.attributes.AreaMetres = parseFloat(geometryArea).toFixed(2);
                                        feature.attributes.LengthMetres = parseFloat(geometryLength).toFixed(2);
                                        break;
                                }
                                // Add to features array
                                featuresToAdd.push(feature);
                                // Add features to data download object
                                var dataFeature = {};
                                dataFeature.attributes = feature.attributes;
                                dataFeature.geometry = {};
                                dataFeature.geometry.rings = feature.geometry.rings;
                                dataFeatures.push(dataFeature);
                            });
                            data.features = dataFeatures;

                            if (String(mapFrame.config.downloadDataIntersectLayers).toLowerCase() == "true") {
                                // Add the data download format and title
                                data.downloadFormat = mapFrame.dataDownloadFormatSelect.value;
                                data.title = mapIntersectQueries[count].title;
                            }

                            // Add feature layer to the map and global array
                            analysisfeatureLayers.push(featureLayer);
                            map.addLayer(featureLayer);
                            // Add features to feature layer
                            featureLayer.applyEdits(featuresToAdd, null, null);
                            // Enable clear button
                            domClass.remove(mapFrame.clearButton, 'jimu-state-disabled');
                        }
                        downloadData.push(data);
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
          var userMaps = mapFrame.mapTable.getData();
          var mapsInclude = [];
          // For each of the maps
          array.forEach(userMaps, function (userMap) {
              // If the map is checked
              if (String(userMap.include).toLowerCase() == "true") {
                  // Push into array
                  mapsInclude.push(userMap);
              }
          });

          // Get the report JSON
          var configMaps = mapFrame.config.maps;
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
          if (String(mapFrame.config.downloadDataIntersectLayers).toLowerCase() == "true") {
              // Get the data download JSON
              var downloadDataJSON = JSON.stringify(downloadData);
          }
          else {
              var downloadDataJSON = null;
          }

          mapFrame.loadingInfo.innerHTML = "Creating maps...";
          array.forEach(mapsProduce, function (map) {
              mapFrame.loadingInfo.innerHTML = mapFrame.loadingInfo.innerHTML + "<BR/>" + map;
          });
          console.log("-----Selected Feature JSON-----");
          console.log(selectedFeatureJSON);
          console.log("-----Webmap JSON-----");
          console.log(webmapJSON);
          console.log("-----Report JSON-----");
          console.log(reportJSON);
          console.log("-----Report Data JSON-----");
          console.log(reportDataJSON);
          console.log("-----Download Data JSON-----");
          console.log(downloadDataJSON);
          // Setup the geoprocessing service
          gpService = new Geoprocessor(mapFrame.config.gpService);
          // Setup parameters for GP service
          var gpParams = {
              "Selected_Feature_JSON": selectedFeatureJSON,
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
          gpService.on("error", gpError);
          console.time('Complete Geoprocessing Service');
      }

      // FUNCTION - Get GP service job status
      function gpJobStatus(status) {
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
              mapFrame.loadingInfo.innerHTML = "Report generation complete...";
              console.log("Report geoprocessing service job finished...");
              console.log("PDF located here - " + outputReport.result.value.url + "...");
              // Open the PDF
              window.open(outputReport.result.value.url);
              console.timeEnd('Complete Geoprocessing Service');
              getReportEvent.remove();

              // Get the output data if needed
              if (String(mapFrame.config.downloadDataIntersectLayers).toLowerCase() == "true") {
                  gpService.getResultData(result.jobInfo.jobId, "Output_Data");
                  getDataEvent = gpService.on("get-result-data-complete", function (outputData) {
                      console.log("Data located here - " + outputData.result.value.url + "...");
                      // Download the data
                      window.open(outputData.result.value.url);
                      getDataEvent.remove();
                  });
              }

          });

          // Hide loading
          reportGenerating = false;
          html.setStyle(mapFrame.loading, "display", "none");
          mapFrame.loadingInfo.innerHTML = "Loading...";
      }

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

          // Hide loading
          reportGenerating = false;
          html.setStyle(mapFrame.loading, "display", "none");
          mapFrame.loadingInfo.innerHTML = "Loading...";
      }

        // FUNCTION - Clear all selection graphics  
      function clearSelectionGraphics() {
          if (graphicLayers.length > 0) {
              console.log("Removing all graphic selection layers from the map...");
              // Clear selection graphics
              map.graphics.clear();
              selectionFeatureLayer.clear();
              // Reset global array for layers
              graphicLayers = [];
          }
      }

      // FUNCTION - Remove all analysis feature layers   
      function removeAnalysisFeatureLayers() {
          // Remove feature layers from the map
          if (analysisfeatureLayers.length > 0) {
              console.log("Removing all analysis feature layers from the map...");
              array.forEach(analysisfeatureLayers, function (analysisfeatureLayer) {
                  map.removeLayer(analysisfeatureLayer);
                  analysisfeatureLayer = null;
              });
              // Reset global array
              analysisfeatureLayers = [];
          }
      }
    },

    // EVENT FUNCTION - Open widget
    onOpen: function(){
        console.log('Report widget opened...');
        widgetState = "Open";
    },

    // EVENT FUNCTION - Close widget
    onClose: function(){
        console.log('Report widget closed...');
        widgetState = "Closed";
    },

    // EVENT FUNCTION - Minimise widget
    onMinimize: function(){
        console.log('Report widget minimised...');
        widgetState = "Open";
    },

    // EVENT FUNCTION - Maximised widget
    onMaximize: function(){
        console.log('Report widget maximised...');
        widgetState = "Open";
    }
  });
});