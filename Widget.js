define(["dojo/_base/declare",
"dojo/_base/connect",
"dojo/_base/lang",
"dojo/_base/array",
"dojo/dom-class",
"dojo/_base/html",
"dojo/on",
"dojo/promise/all",
"dijit/_WidgetsInTemplateMixin",
"jimu/BaseWidget",
"jimu/utils",
"jimu/dijit/SimpleTable",
"esri/tasks/PrintTask",
"esri/tasks/PrintTemplate",
"esri/tasks/PrintParameters",
"esri/tasks/Geoprocessor",
"esri/tasks/QueryTask",
"esri/tasks/query",
"esri/graphicsUtils",
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
BaseWidget,
utils,
Table,
PrintTask,
PrintTemplate,
PrintParameters,
Geoprocessor,
QueryTask,
Query,
graphicsUtils,
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
      var popup = map.infoWindow;
      var selectedFeatureJSON;
      var selectedGeometry;

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
              // Hide feature selection
              html.setStyle(mapFrame.featureSelectedTable, "display", "none");
          }
          else {
              // Hide drawing tools
              html.setStyle(mapFrame.drawTools, "display", "none");
              // Show feature selection
              html.setStyle(mapFrame.featureSelectedTable, "display", "block");
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

      // EVENT FUNCTION - When feature is selected with popups
      connect.connect(popup, "onSelectionChange", function () {
          // If features are returned
          if (this.count > 0) {
              selectedFeatureURL = this.getSelectedFeature().getLayer().url;
              reportLayer = mapFrame.layerSelect.value;

              // If layer from layer dropdown has been selected
              if (reportLayer.toLowerCase() == selectedFeatureURL.toLowerCase()) {
                  // Enable submit button
                  domClass.remove(mapFrame.submitButton, 'jimu-state-disabled');

                  // Get the display field
                  var len = mapFrame.config.layers.length;
                  for (var a = 0; a < len; a++) {
                      if (reportLayer.toLowerCase() == mapFrame.config.layers[a].serviceURL.toLowerCase()) {
                          var displayField = mapFrame.config.layers[a].displayField;
                      }
                  }

                  mapFrame.featureSelected.innerHTML = this.getSelectedFeature().attributes[displayField];

                  // Get JSON for the selected feature
                  var selectedFeature = {};
                  selectedGeometry = this.getSelectedFeature().geometry;
                  selectedFeature.geometry = this.getSelectedFeature().geometry;
                  selectedFeature.attributes = this.getSelectedFeature().attributes;
                  selectedFeatureJSON = JSON.stringify(selectedFeature);     
              }
              else {
                  mapFrame.featureSelected.innerHTML = "No features found for " + dijit.byId("layerSelect").get("displayedValue") + "...";

                  // Disable submit button
                  domClass.add(mapFrame.submitButton, 'jimu-state-disabled');
              }
          }
          else {
              mapFrame.featureSelected.innerHTML = "No features currently selected...";

              // Disable submit button
              domClass.add(mapFrame.submitButton, 'jimu-state-disabled');
          }

      });

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

              // Centre map on the feature
              var extent = selectedGeometry.getExtent();
              map.setExtent(extent.expand(1));
              // After extent has been changed - Pan and zoom events
              panEndHandler = map.on("pan-end", analyseMaps);
              zoomEndHandler = map.on("zoom-end", analyseMaps);
          }
      }));

      // FUNCTION - Get maps that are needed
      function analyseMaps() {
          // Disconnect event handlers
          panEndHandler.remove();
          zoomEndHandler.remove();

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
              query.returnGeometry = false;


              // For each of the maps
              var intersectQueries = [];
              var mapIntersectQueries = [];
              var layerQueries = [];
              var mapLayerQueries = [];
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
                          });
                          count = count + 1;
                          // If at the final result
                          if (results.length == count) {
                              // Execute spatial queries
                              spatialQueries(intersectQueries, mapIntersectQueries);
                          }
                      });
                  });
              }
          }
      }

      // FUNCTION - Execute spatial queries
      function spatialQueries(intersectQueries, mapIntersectQueries) {
          // Execute all apatial queries
          mapFrame.loadingInfo.innerHTML = "Querying layers...";
          console.log("Spatially querying services...");
          all(intersectQueries).then(function (results) {
              // For each of the results
              var count = 0;
              array.forEach(results, function (result) {
                  console.log(mapIntersectQueries[count].title + "(" + mapIntersectQueries[count].intersectLayer + ") - " + result.features.length + " features returned...");
                  // If results are returned
                  if (result.features.length > 0) {
                      // Add the map title
                      result.map = mapIntersectQueries[count].title
                      // Add feature set to data
                      reportData.push(result);
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
              "reportJSON": reportJSON
          };
          // Submit job to GP service
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