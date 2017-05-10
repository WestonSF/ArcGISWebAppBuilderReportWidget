define(["dojo/_base/declare",
"dojo/_base/connect",
"dojo/_base/lang",
'dojo/_base/array',
"dojo/dom-class",
'dojo/on',
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
"esri/graphicsUtils"],
function (declare,
connect,
lang,
array,
domClass,
on,
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
graphicsUtils) {
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
      console.log('Report widget started...');
      this.inherited(arguments);
      var mapFrame = this;
      var map = this.map;
      var popup = map.infoWindow;
      var selectedFeatureJSON;
      var selectedGeometry;

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
      connect.connect(this.submitButton, 'click', lang.hitch(this, function (evt) {
          // If a feature has been selected
          if (selectedFeatureJSON) {
              // Show loading
              mapFrame.loading.show();

              // Centre map on the feature
              var extent = selectedGeometry.getExtent();
              map.setExtent(extent.expand(1));
              // After extent has been changed
              panEndHandler = map.on("pan-end", analyseMaps);
              zoomEndHandler = map.on("zoom-end", analyseMaps);
          }
      }));

      // FUNCTION - Get maps that are needed
      function analyseMaps() {
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
                          // Push into array
                          mapsAnalyse.push(configMap);
                      }
                  }
              });
          });

          // For each of the maps
          array.forEach(mapsAnalyse, function (mapAnalyse) {
              // Query the service
              var queryTask = new QueryTask("https://gis.mstn.govt.nz/arcgis/rest/services/PropertyAndBoundaries/Wards/MapServer/0");
              var query = new Query();
              query.where = "1=1";
              query.outFields = ["*"];
              query.distance = mapAnalyse.bufferDistance;
              query.geometry = selectedGeometry;
              query.spatialRelationship = Query.SPATIAL_REL_INTERSECTS;
              query.returnGeometry = false;
              queryTask.execute(query);
              queryTask.on("complete", queryComplete);
              queryTask.on("error", queryError);
          });
      }

      // FUNCTION - On  query completion
      function queryComplete(results) {
          console.log(results);
      }

      // FUNCTION - On  query error
      function queryError(error) {
          console.error(error);
      }

      // FUNCTION - Submit parameters to GP service
      function submitReport() {
          // Disconnect event handler
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

          // Get the report JSON
          var configMaps = mapFrame.config.maps;
          var report = [];
          // For each of the maps from the config
          array.forEach(configMaps, function (configMap) {
              // For each of the maps to include
              array.forEach(mapsInclude, function (mapInclude) {
                  // If the map is to be included
                  if (configMap.title.toLowerCase() == mapInclude.map.toLowerCase()) {
                      // Update scale
                      configMap.scale = Number(mapInclude.scale);

                      // Push into array
                      report.push(configMap);
                  }
              });
          });
          var reportJSON = JSON.stringify(report);

          console.log("Submitting job to geoprocessing service...");
          console.log("-----Selected Feature JSON-----");
          console.log(selectedFeatureJSON);
          console.log("-----Webmap JSON-----");
          console.log(webmapJSON);
          console.log("-----Report JSON-----");
          console.log(reportJSON);
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
          mapFrame.loading.hide();
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
          mapFrame.loading.hide();
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