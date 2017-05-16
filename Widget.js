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

    // EVENT FUNCTION - Creation of widget
    postCreate: function () {
      console.log('Report widget created...');
      this.inherited(arguments);

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
              value: this.nls.draw,
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
    },

    // EVENT FUNCTION - Startup widget
    startup: function () {
      console.log("Report widget started...");
      this.inherited(arguments);
      var mapFrame = this;
      var map = this.map;
      var graphicLayers = [];
      var reportFeatureLayer = null;
      var selectionFeatureLayer = null;
      var mapClickEvent = null;
      var selectionEvent = null;
      var featureSelectionEvent = null;
      var popup = map.infoWindow;
      var selectedFeatureJSON;
      var selectedGeometry;

      // Get the initial selection
      var selection = dijit.byId('layerSelect').attr('value')
      // Add the report feature layer
      changeReportLayer(selection,"add");
      // EVENT FUNCTION - When selection dropdown is changed
      this.layerSelect.on("change", function () {
          // Reset selection
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
          // Reset selection
          mapFrame.map.infoWindow.hide();
          domClass.add(mapFrame.submitButton, 'jimu-state-disabled');
          mapFrame.featureSelected.innerHTML = "No features currently selected...";
          selectedFeatureJSON = null;
          selectedGeometry = null;
          // Hide multiple features selection
          dijit.byId('multipleFeaturesSelect').removeOption(dijit.byId('multipleFeaturesSelect').getOptions());
          html.setStyle(mapFrame.multipleFeaturesTable, "display", "none");

          // Clear selection
          map.graphics.clear();
          selectionFeatureLayer.clear();
          // Reset global array
          graphicLayers = [];

          // Disable clear button
          domClass.add(mapFrame.clearButton, 'jimu-state-disabled');
      }));

      // EVENT FUNCTION - Submit button click
      var panEndHandler;
      var zoomEndHandler;
      var mapsProduce = [];
      var reportData = [];
      connect.connect(this.submitButton, 'click', lang.hitch(this, function (evt) {
          mapsProduce = [];
          reportData = [];

          // If a feature has been selected
          if (selectedFeatureJSON) {
              // Show loading
              html.setStyle(mapFrame.loading, "display", "block");

              // If a point
              if (selectedGeometry.type.toLowerCase() == "point") {
                  console.log(selectedGeometry);
                  // Factor for converting point to extent 
                  var factor = 20;
                  var extent = new esri.geometry.Extent(selectedGeometry.x - factor, selectedGeometry.y - factor, selectedGeometry.x + factor, selectedGeometry.y + factor, mapFrame.map.spatialReference);
              }
              else {
                  // Centre map on the feature
                  var extent = selectedGeometry.getExtent();
              }
              map.setExtent(extent.expand(1));

              // After extent has been changed - Pan and zoom events
              panEndHandler = map.on("pan-end", analyseMaps);
              zoomEndHandler = map.on("zoom-end", analyseMaps);
          }
      }));

      // FUNCTION - Change the report layer showing on the map
      function changeReportLayer(url,addRemove) {
        // Remove existing feature layer if single selection
          if (reportFeatureLayer) {
            // Clear selection
            map.graphics.clear();
            selectionFeatureLayer.clear();
            // Reset global array
            graphicLayers = [];
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
                outFields: ["*"]
            });
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
              mode: esri.layers.FeatureLayer.MODE_SELECTION,
              outFields: ["*"]
          });

          // EVENT FUNCTION - On map click
          mapClickEvent = map.on("click", function (event) {
              // Clear graphics if single select
              var multipleSelection = dijit.byId("multipleSelection").checked;
              if (multipleSelection == false) {
                  // Clear selection
                  map.graphics.clear();
                  selectionFeatureLayer.clear();
                  // Reset global array
                  graphicLayers = [];
              }

              // Setup a query
              var selectQuery = new Query();
              // Get the map point and make a selection
              selectQuery.geometry = event.mapPoint;
              selectionFeatureLayer.selectFeatures(selectQuery,
                        FeatureLayer.SELECTION_NEW);

              // Enable clear button
              domClass.remove(mapFrame.clearButton, 'jimu-state-disabled');
          });

          // EVENT FUNCTION - On feature layer selection complete
          selectionEvent = selectionFeatureLayer.on("selection-complete", function (selection) {
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
                      var multipleFeaturesResult = {

                      };

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
          // Set print parameters
          webmap.exportOptions = {
              "dpi": 96
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
                        var layerFields = result.fields;
                        // Delete un-needed fields
                        var deleteFields = ["Shape.STArea()", "Shape.STLength()"];
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
                                "fields": result.fields
                            };
                            // Create a feature layer
                            var infoTemplate = new InfoTemplate("Details", "${*}");
                            var featureLayer = new FeatureLayer(featureCollection,
                            {
                                infoTemplate: infoTemplate,
                                outFields: ["*"]
                            });
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
                                        var geometryLength = geometryEngine.planarLength(clippedGeometry, "meters");
                                        feature.attributes.LengthMetres = geometryLength;
                                        break;
                                    case "polygon":
                                        // Clip the geometry to the selection
                                        var clippedGeometry = geometryEngine.intersect(selectedGeometry, feature.geometry);
                                        feature.geometry = clippedGeometry;
                                        // Update area and length
                                        var geometryArea = geometryEngine.planarArea(clippedGeometry, "square-meters");
                                        var geometryLength = geometryEngine.planarLength(clippedGeometry, "meters");
                                        feature.attributes.AreaMetres = geometryArea;
                                        feature.attributes.LengthMetres = geometryLength;
                                        break;
                                }
                                // Add to features array
                                featuresToAdd.push(feature);
                            });
                            // Add feature layer to the map
                            map.addLayer(featureLayer);
                            // Add features to feature layer
                            featureLayer.applyEdits(featuresToAdd, null, null);

                            // Enable clear button
                            domClass.remove(mapFrame.clearButton, 'jimu-state-disabled');
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

          mapFrame.loadingInfo.innerHTML = "Creating maps...";
          array.forEach(mapsProduce, function (map) {
              mapFrame.loadingInfo.innerHTML = mapFrame.loadingInfo.innerHTML + "<BR/>" + map;
          });
          console.log("Submitting job to geoprocessing service...");
          console.log("-----Selected Feature JSON-----");
          console.log(selectedFeatureJSON);
          console.log("-----Webmap JSON-----");
          console.log(webmapJSON);
          console.log("-----Report JSON-----");
          console.log(reportJSON);
          console.log("-----Report Data JSON-----");
          console.log(reportDataJSON);
          // Setup the geoprocessing service
          gpService = new Geoprocessor(mapFrame.config.gpService);
          // Setup parameters for GP service
          var gpParams = {
              "selectedFeatureJSON": selectedFeatureJSON,
              "webmapJSON": webmapJSON,
              "reportJSON": reportJSON,
              "reportDataJSON": reportDataJSON,
          };
          // Submit job to GP service
          html.setStyle(mapFrame.loading, "display", "none");
          gpService.submitJob(gpParams, gpJobComplete, gpJobStatus, gpJobFailed);
      }

      // FUNCTION - On GP service completion
      function gpJobComplete(jobinfo) {
          // Hide loading
          html.setStyle(mapFrame.loading, "display", "none");
          mapFrame.loadingInfo.innerHTML = "Loading...";
      }

      // FUNCTION - Get GP service job status
      function gpJobStatus(jobinfo) {
          var jobStatus = '';
          switch (jobinfo.jobStatus) {
              case 'esriJobSubmitted':
                  jobStatus = 'Submitted...';
                  break;
              case 'esriJobExecuting':
                  jobStatus = 'Executing...';
                  break;
              case 'esriJobSucceeded':
                  jobStatus = 'Finished...';
                  break;
          }
          console.log(jobStatus);
      }

      // FUNCTION - If GP service fails
      function gpJobFailed(error) {
          console.error(error);
          // Hide loading
          html.setStyle(mapFrame.loading, "display", "none");
          mapFrame.loadingInfo.innerHTML = "Loading...";
      }
    },

    // EVENT FUNCTION - Open widget
    onOpen: function(){
        console.log('Report widget opened...');
    },

    // EVENT FUNCTION - Close widget
    onClose: function(){
        console.log('Report widget closed...');
    },

    // EVENT FUNCTION - Minimise widget
    onMinimize: function(){
        console.log('Report widget minimised...');
    },

    // EVENT FUNCTION - Maximised widget
    onMaximize: function(){
        console.log('Report widget maximised...');
    }
  });
});