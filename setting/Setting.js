define([
  "dojo/_base/declare",
  "dojo/on",
  "dojo/_base/lang",
  "dojo/_base/html",
  "dijit/_WidgetsInTemplateMixin",
  "jimu/BaseWidgetSetting",
  "jimu/dijit/SimpleTable",
  "jimu/dijit/Popup"
],
function (
    declare,
    on,
    lang,
    html,
    _WidgetsInTemplateMixin,
    BaseWidgetSetting,
    Table,
    Popup
) {

    return declare([BaseWidgetSetting, _WidgetsInTemplateMixin], {
    baseClass: 'jimu-widget-report-setting',
    opLayerFields: null,

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
        // Set the description
        this.description.set('value', this.config.description);
        // Set the GP service
        this.gpService.set('value', this.config.gpService);

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
            type: 'text',
            width: '10%',
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
            width: '20%',
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
            width: '20%',
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
            var json = [];
            var len = this.config.maps.length;
            for (var a = 0; a < len; a++) {
                json.push({
                    type: this.config.maps[a].type,
                    title: this.config.maps[a].title,
                    scale: this.config.maps[a].scale,
                    intersectLayer: this.config.maps[a].intersectLayer,
                    bufferDistance: this.config.maps[a].bufferDistance,
                    reportFields: this.config.maps[a].reportFields,
                    operationalLayers: this.config.maps[a].operationalLayers
                });
                // Add operational layers data to array
                this.opLayerFields[this.config.maps[a].title] = this.config.maps[a].operationalLayers;
            }
            this.mapTable.addRows(json);
        }

        this.own(on(
          this.mapTable,
          'actions-edit',
          lang.hitch(this, this.editLayersClick)
        ));

        // Set the intersect layers option
        this.enableIntersectLayers.set('checked', config.showIntersectLayers);
    },

    // FUNCTION - When edit layers button is clicked
    editLayersClick: function (tr) {
        console.log("Editing operational layers...")

        // Setup the layers table
        var fields = [{
            name: 'title',
            title: this.nls.title,
            type: 'text',
            width: '30%',
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
            width: '50%',
            unique: false,
            editable: true
        }, {
            name: 'secure',
            title: this.nls.secure,
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
        var content = html.create("div");
        var table = new Table(args);
        table.autoHeight = true;   
        html.place(table.domNode, content);

        // If there are maps
        if (this.config.maps.length > 0) {

            // For each map
            var json = [];
            var mapLen = this.config.maps.length;
            for (var a = 0; a < mapLen; a++) {
                var selectionData = this.mapTable.getRowData(tr);
                // For the map selected
                if (selectionData.title == this.config.maps[a].title) {
                    // For each layer
                    var layerLen = this.config.maps[a].operationalLayers.length
                    for (var b = 0; b < layerLen; b++) {
                        // Load the operational layer information
                        json.push({
                            title: this.config.maps[a].operationalLayers[b].title,
                            opacity: this.config.maps[a].operationalLayers[b].opacity,
                            url: this.config.maps[a].operationalLayers[b].url,
                            secure: this.config.maps[a].operationalLayers[b].secure
                        });
                    }
                }
            }
            table.addRows(json);
        }

        // Show the operational layers popup
        var layersPopup = new Popup({
            titleLabel: this.nls.operationalLayers,
            width: 1000,
            maxHeight: 700,
            autoHeight: true,
            content: content,
            buttons: [{
                label: this.nls.ok,
                onClick: lang.hitch(this, function () {
                    // Add operational layers data to array for selected map
                    this.opLayerFields[selectionData.title] = table.getData();
                    layersPopup.close();
                })
            }, {
                label: this.nls.cancel,
                classNames: ['jimu-btn-vacation'],
                onClick: lang.hitch(this, function () {
                    layersPopup.close();
                })
            }],
            onClose: function () {

            }
        });
        table.startup();
    },

    // FUNCTION - Get the configuration parameters from the configure widget and load into configuration file
    getConfig: function () {
        // Get the description
        this.config.description = this.description.get('value');
        // Get the GP service
        this.config.gpService = this.gpService.get('value');

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
        var data = this.mapTable.getData();
        var json = [];
        var len = data.length;
        for (var i = 0; i < len; i++) {
            // Add in the operational layers
            data[i].operationalLayers = this.opLayerFields[data[i].title];
            json.push(data[i]);
        }
        this.config.maps = json;

        // Get the intersect layers option
        this.config.showIntersectLayers = this.enableIntersectLayers.checked;

        // Return the configuration parameters
        return this.config;
    }
  });
});