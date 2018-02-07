define([
  "dojo/_base/declare",
  "dojo/on",
  "dojo/query",
  "dojo/_base/lang",
  "dojo/_base/array",
  "dojo/_base/html",
  "dijit/form/Select",
  "dijit/_WidgetsInTemplateMixin",
  "jimu/BaseWidgetSetting",
  "jimu/dijit/SimpleTable",
  "jimu/dijit/Popup"
],
function (
    declare,
    on,
    query,
    lang,
    array,
    html,
    Select,
    _WidgetsInTemplateMixin,
    BaseWidgetSetting,
    Table,
    Popup
) {

    return declare([BaseWidgetSetting, _WidgetsInTemplateMixin], {
    baseClass: 'jimu-widget-report-setting',
    opLayerFields: null,
    mapSelected: null,
    // Set the map type options
    mapTypes: [{
        value: 'Map',
        label: 'Map'
    }, {
        value: 'Report',
        label: 'Report'
    }, {
        value: 'Report - Feature',
        label: 'Report - Feature'
    }, {
        value: 'Report - Analysis',
        label: 'Report - Analysis'
    }],

    // EVENT FUNCTION - Creation of widget
    postCreate: function(){
        this.inherited(arguments);
    },

    // EVENT FUNCTION - Startup of widget
    startup: function () {
        this.opLayerFields = [];
        // Set the default configuration parameters from the config file
        this.setConfig(this.config);
    },

    // FUNCTION - Set the default configuration parameters in the configure widget from the config file
    setConfig: function (config) {
        var mapFrame = this;

        // Set the description
        this.description.set('value', this.config.description);
        // Set the GP service
        this.gpService.set('value', this.config.gpService);

        // Set the search integration option
        this.enableSearchIntegration.set('checked', config.enableSearchIntegration);

        // Setup the layers table
        var fields = [{
            name: 'layerName',
            title: this.nls.layerName,
            type: 'text',
            unique: false,
            editable: true
        }, {
            name: 'serviceURL',
            title: this.nls.serviceURL,
            type: 'text',
            unique: false,
            editable: true
        }, {
            name: 'displayLabel',
            title: this.nls.displayLabel,
            type: 'text',
            unique: false,
            editable: true
        }, {
            name: 'displayField',
            title: this.nls.displayField,
            type: 'text',
            unique: false,
            editable: true
        },
        {
            name: '',
            title: '',
            width: '100px',
            type: 'actions',
            actions: ['up', 'down', 'delete']
        }
        ];
        var args = {
            fields: fields,
            selectable: false
        };
        this.layerTable = new Table(args);
        this.layerTable.autoHeight = true;
        this.layerTable.placeAt(this.layersTable);
        this.layerTable.startup();

        // Load in layers
        if (this.config.layers.length > 0) {
            var json = [];
            var len = this.config.layers.length;
            for (var a = 0; a < len; a++) {
                json.push({
                    layerName: this.config.layers[a].layerName,
                    serviceURL: this.config.layers[a].serviceURL,
                    displayLabel: this.config.layers[a].displayLabel,
                    displayField: this.config.layers[a].displayField
                });
            }
            this.layerTable.addRows(json);
        }

        // Set the draw tools option
        this.enableDrawTools.set('checked', config.enableDraw);

        // Setup the maps table
        var fields = [{
            name: 'type',
            title: this.nls.type,
            type: 'empty',
            width: '20%',
            unique: false,
            editable: true
        }, {
            name: 'title',
            title: this.nls.title,
            type: 'text',
            width: '20%',
            unique: false,
            editable: true
        }, {
            name: 'parentMap',
            title: this.nls.parentMap,
            type: 'text',
            width: '10%',
            unique: false,
            editable: true
        }, {
            name: 'scale',
            title: this.nls.scale,
            type: 'text',
            width: '10%',
            unique: false,
            editable: true
        }, {
            name: 'intersectLayer',
            title: this.nls.intersectLayer,
            type: 'text',
            width: '10%',
            unique: false,
            editable: true
        }, {
            name: 'showIntersectLayer',
            title: this.nls.showIntersectLayer,
            type: 'text',
            width: '10%',
            unique: false,
            editable: true
        }, {
            name: 'bufferDistance',
            title: this.nls.bufferDistance,
            type: 'text',
            width: '10%',
            unique: false,
            editable: true
        }, {
            name: 'reportFields',
            title: this.nls.reportFields,
            type: 'text',
            width: '10%',
            unique: false,
            editable: true
        },
        {
            name: 'operationalLayers',
            title: this.nls.operationalLayers,
            type: 'actions',
            width: '10%',
            actions: ['edit'],
            'class': 'symbol'
        },
        {
            name: '',
            title: '',
            width: '100px',
            type: 'actions',
            actions: ['up', 'down', 'delete']
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
            var len = this.config.maps.length;
            for (var a = 0; a < len; a++) {
                var json = [];
                json.push({
                    type: this.config.maps[a].type,
                    title: this.config.maps[a].title,
                    parentMap: this.config.maps[a].parentMap,
                    scale: this.config.maps[a].scale,
                    intersectLayer: this.config.maps[a].intersectLayer,
                    showIntersectLayer: this.config.maps[a].showIntersectLayer,
                    bufferDistance: this.config.maps[a].bufferDistance,
                    reportFields: this.config.maps[a].reportFields,
                    operationalLayers: this.config.maps[a].operationalLayers
                });
                // Add a row from the JSON config
                var result = this.mapTable.addRow(json[0]);
                // If row has been added
                if (result.success && result.tr) {
                    // Add a selection to the first column for map types
                    var tr = result.tr;
                    var typeOptions = lang.clone(this.mapTypes);
                    var td = query('.simple-table-cell', tr)[0];
                    if (td) {
                        html.setStyle(td, "verticalAlign", "middle");
                        var selectTypes = new Select({
                            style: {
                                width: "100%"
                            },
                            options: typeOptions
                        });
                        selectTypes.placeAt(td);
                        selectTypes.startup();
                        tr.selectTypes = selectTypes;
                        selectTypes.set("value", this.config.maps[a].type);
                    }
                }
                // Add operational layers data to array
                this.opLayerFields[this.config.maps[a].title] = this.config.maps[a].operationalLayers;
            }
        }

        this.own(on(
          this.mapTable,
          'actions-edit',
          lang.hitch(this, this.editLayersClick)
        ));

        // Set the subtitle option
        this.enableSubtitle.set('checked', config.showSubtitle);

        // Set the intersect layers option
        this.enableIntersectLayers.set('checked', config.showIntersectLayers);

        // Set the download data option
        this.downloadDataIntersectLayers.set('checked', config.downloadDataIntersectLayers);

        // Set the report quality option
        this.enableReportQuality.set('checked', config.showReportQuality);

        // Report quality options
        reportQuality = [
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
            this.defaultReportQualitySelect.addOption(option);
        }

        // Get the default report quality
        array.forEach(reportQuality, function (quality) {
            if (quality["label"].toLowerCase() == config.defaultReportQuality.toLowerCase()) {
                mapFrame.defaultReportQualitySelect.set("value", quality["quality"]);
            }
        });    
    },

    // FUNCTION - When add selection layer button is clicked
    onSelectAddClick: function () {
        console.log("Adding selection layer...")
        // Add new row to table for editing
        var result = this.layerTable.addRow({});
        if (result.success && result.tr) {
        }
    },

    // FUNCTION - When add map button is clicked
    onMapAddClick: function () {
        console.log("Adding map...")
        // Add new row to table for editing
        var result = this.mapTable.addRow({});
        if (result.success && result.tr) {
            // Add a selection to the first column for map types
            var tr = result.tr;
            var typeOptions = lang.clone(this.mapTypes);
            var td = query('.simple-table-cell', tr)[0];
            if (td) {
                html.setStyle(td, "verticalAlign", "middle");
                var selectTypes = new Select({
                    style: {
                        width: "100%"
                    },
                    options: typeOptions
                });
                selectTypes.placeAt(td);
                selectTypes.startup();
                tr.selectTypes = selectTypes;
            }
        }
    },

    // FUNCTION - When add operational layer button is clicked
    onOpAddClick: function () {
        console.log("Adding operational layer...")
        // Add new row to table for editing
        var result = this.opLayerTable.addRow({});
        if (result.success && result.tr) {
        }
    },

    // FUNCTION - When save is clicked on configure operational layers
    saveOpLayers: function () {
        // For each of the maps
        var layerLen = this.config.maps.length;
        for (var c = 0; c < layerLen; c++) {
            // Get the selected map
            if (this.config.maps[c].title.toLowerCase() == this.mapSelected.toLowerCase()) {
                var opLayersselectionData = this.opLayerTable.getData();
                // Update the operational layers for this map
                this.config.maps[c].operationalLayers = opLayersselectionData;

                // For each operational layer
                var layerLen = this.config.maps[c].operationalLayers.length;
                for (var d = 0; d < layerLen; d++) {
                    var visibleLayers = this.config.maps[c].operationalLayers[d].visibleLayers;
                    // Convert operational layers to array
                    this.config.maps[c].operationalLayers[d].visibleLayers = JSON.parse("[" + visibleLayers + "]");
                }
            }
        }
        // Close dialog
        this.configOpLayers.hide();
        html.empty(this.opLayersTable);
    },

    // FUNCTION - When cancel is clicked on configure operational layers
    cancelOpLayers: function () {
        // Close dialog
        this.configOpLayers.hide();
        html.empty(this.opLayersTable);
    },

    // FUNCTION - When edit layers button is clicked on a map
    editLayersClick: function (tr) {
        console.log("Editing operational layers...")

        // Setup the layers table
        var fields = [{
            name: 'title',
            title: this.nls.title,
            type: 'text',
            width: '20%',
            unique: false,
            editable: true
        }, {
            name: 'opacity',
            title: this.nls.opacity,
            type: 'text',
            width: '10%',
            unique: false,
            editable: true
        }, {
            name: 'url',
            title: this.nls.serviceURL,
            type: 'text',
            width: '40%',
            unique: false,
            editable: true
        }, {
             name: 'visibleLayers',
             title: this.nls.visibleLayers,
             type: 'text',
             width: '10%',
             unique: false,
             editable: true
         }, {
            name: 'secure',
            title: this.nls.secure,
            type: 'text',
            width: '10%',
            unique: false,
            editable: true
         }, {
             name: 'legend',
             title: this.nls.legend,
             type: 'text',
             width: '10%',
             unique: false,
             editable: true
         },
        {
            name: '',
            title: '',
            width: '100px',
            type: 'actions',
            actions: ['up', 'down', 'delete']
        }
        ];
        var args = {
            fields: fields,
            selectable: false
        };

        this.opLayerTable = new Table(args);
        this.opLayerTable.autoHeight = true;
        this.opLayerTable.placeAt(this.opLayersTable);
        this.opLayerTable.startup();

        // If there are maps
        if (this.config.maps.length > 0) {
            // For each map
            var json = [];
            var mapLen = this.config.maps.length;
            for (var a = 0; a < mapLen; a++) {
                this.mapSelected = this.mapTable.getRowData(tr).title;
                // For the map selected
                if (this.mapSelected == this.config.maps[a].title) {
                    // For each layer
                    var layerLen = this.config.maps[a].operationalLayers.length;
                    for (var b = 0; b < layerLen; b++) {
                        // Load the operational layer information
                        json.push({
                            title: this.config.maps[a].operationalLayers[b].title,
                            opacity: this.config.maps[a].operationalLayers[b].opacity,
                            url: this.config.maps[a].operationalLayers[b].url,
                            visibleLayers: this.config.maps[a].operationalLayers[b].visibleLayers,
                            secure: this.config.maps[a].operationalLayers[b].secure,
                            legend: this.config.maps[a].operationalLayers[b].legend,
                        });
                    }
                }
            }
            this.opLayerTable.addRows(json);
        }    

        // Show the operational layers popup
        this.configOpLayers.show();
    },

    // FUNCTION - Get the configuration parameters from the configure widget and load into configuration file
    getConfig: function () {
        var mapFrame = this;

        // Get the description
        this.config.description = this.description.get('value');
        // Get the GP service
        this.config.gpService = this.gpService.get('value');

        // Get the search integration option
        this.config.enableSearchIntegration = this.enableSearchIntegration.checked;

        // Get the layers
        var data = this.layerTable.getData();
        var json = [];
        var len = data.length;
        for (var i = 0; i < len; i++) {
            json.push(data[i]);
        }
        this.config.layers = json;

        // Get the draw tools option
        this.config.enableDraw = this.enableDrawTools.checked;

        // Get the maps
        var json = [];
        var trs = this.mapTable.getRows();
        var count = 0;
        array.forEach(trs, lang.hitch(this, function (tr) {
            // Get the row data and push into array
            var row = this.mapTable.getRowData(tr);
            row.type = tr.selectTypes.value;
            // If the map has already been setup
            if (this.config.maps[count]) {
                row.operationalLayers = this.config.maps[count].operationalLayers;
            }
            // Else a newly added map
            else {
                row.operationalLayers = [];
            }

            json.push(row);
            count++;
        }));
        this.config.maps = json;

        // Get the subtitle option
        this.config.showSubtitle = this.enableSubtitle.checked;

        // Get the intersect layers option
        this.config.showIntersectLayers = this.enableIntersectLayers.checked;

        // Get the download data option
        this.config.downloadDataIntersectLayers = this.downloadDataIntersectLayers.checked;

        // Get the report quality option
        this.config.showReportQuality = this.enableReportQuality.checked;

        // Report quality options
        reportQuality = [
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
        // Get the default report quality
        array.forEach(reportQuality, function (quality) {
            if (quality["quality"] == mapFrame.defaultReportQualitySelect.value) {
                mapFrame.config.defaultReportQuality = quality["label"].toLowerCase();
            }
        });

        // Return the configuration parameters
        return this.config;
    }
  });
});