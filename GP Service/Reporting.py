#-------------------------------------------------------------
# Name:       Reporting
# Purpose:    Produces a PDF report including maps and information based of JSON data. Parameters required:
#             - selectedFeatureJSON - Geometry and attributes of the selected feature.
#             - webmapJSON - JSON of the current webmap basemap, property selected, extent, scale, etc.
#             - reportJSON - Report configuration, what maps etc. to include.
#             - reportDataJSON - Report data to go into the reports.
#             - downloadDataJSON - Spatial data to download.
#             - mapTemplate - MXD template for maps.
#             - featureReportTemplate - MXD template for feature reports.
#             - portalUrl - ArcGIS Online or portal URL (Needed if accessing secure services)
#             - portalAdminName - Admin user for portal (Needed if accessing secure services)
#             - portalAdminPassword - Admin user password for portal (Needed if accessing secure services)
#             Packages required:
#             - ReportLab 2.6+
# Author:     Shaun Weston (shaun_weston@eagle.co.nz)
# Date Created:    27/04/2017
# Last Updated:    29/04/2019
# Copyright:   (c) Eagle Technology
# ArcGIS Version:   ArcMap 10.4+
# Python Version:   2.7
#--------------------------------

# Import main modules
import os
import sys
import logging
import smtplib

# Set global variables
# Logging
enableLogging = "false" # Use within code - logger.info("Example..."), logger.warning("Example..."), logger.error("Example...") and to print messages - printMessage("xxx","info"), printMessage("xxx","warning"), printMessage("xxx","error")
logFile = "" # e.g. os.path.join(os.path.dirname(__file__), "Example.log")
# Email logging
sendErrorEmail = "false"
emailServerName = "" # e.g. smtp.gmail.com
emailServerPort = 0 # e.g. 25
emailTo = ""
emailUser = ""
emailPassword = ""
emailSubject = ""
emailMessage = ""
# Proxy
enableProxy = "false"
requestProtocol = "http" # http or https
proxyURL = ""
# Output
output = None
# ArcGIS desktop installed
arcgisDesktop = "true"

# If ArcGIS desktop installed
if (arcgisDesktop == "true"):
    # Import extra modules
    import arcpy
    # Enable data to be overwritten
    arcpy.env.overwriteOutput = True
# Python version check
if sys.version_info[0] >= 3:
    # Python 3.x
    import urllib.request as urllib2
else:
    # Python 2.x
    import urllib2
import uuid
import json
import urllib
import datetime
import string
import zipfile
import ssl
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, A3, portrait, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_LEFT, TA_RIGHT
pdfPages = 0
tablesToMerge = []
tablesMergedCount = 0
mergedTableData = []
# Layers in the web map to not show in the reports
webmaplayersNotShow = ["NES-PF Fish Spawning Indicators","NES-PF Erosion Susceptibility Classification","Boundaries"]
# Layer names to not show in legend
noLegendLayers = ["Road Labels","Masterton","Carterton","South Wairarapa","Masterton Property","Carterton Property","South Wairarapa Property","Territorial Boundary","Regional Boundary"]


# Start of main function
def mainFunction(selectedFeatureJSON,webmapJSON,reportsJSON,reportingJSON,downloadDataJSON,mapTemplate,featureReportTemplate,portalUrl,portalAdminName,portalAdminPassword,outputReport,outputData): # Get parameters from ArcGIS Desktop tool by seperating by comma e.g. (var1 is 1st parameter,var2 is 2nd parameter,var3 is 3rd parameter)
    try:
        # --------------------------------------- Start of code --------------------------------------- #
        global pdfPages
        global tablesToMerge
        global webmaplayersNotShow
        global noLegendLayers

        if ((selectedFeatureJSON) and (webmapJSON) and (reportsJSON) and (reportingJSON)):
            # If portal site is specified
            if (portalUrl):
                printMessage("Connecting to Portal - " + portalUrl + "...","info")
                # Generate token for portal
                token = generateToken(portalAdminName, portalAdminPassword, portalUrl)
            else:
                token = ""

            # Convert selected feature string to JSON object
            selectedFeatureData = json.loads(selectedFeatureJSON)

            # Convert web map string to JSON object
            webmapData = json.loads(webmapJSON)

            # Convert reports string to JSON object
            reportsData = json.loads(reportsJSON)

            # Convert reporting data string to JSON object
            reportingData = json.loads(reportingJSON)

            # If download data JSON is provided
            if (downloadDataJSON):
                # Convert download data string to JSON object
                downloadData = json.loads(downloadDataJSON)

            # Get the webmap scale
            if "scale" in webmapData["mapOptions"]:
                webmapScale = webmapData["mapOptions"]["scale"]

            # Get the basemap and operational layers from the web map
            if "baseMap" in webmapData:
                # Basemap is already set
                basemap = ""
                # Get all other operational layers
                webmapOperationalLayers = webmapData["operationalLayers"]
            else:
                # Get the basemap from the first layer in operational layers
                basemap = webmapData["operationalLayers"][0]
                del webmapData["operationalLayers"][0]
                # Get all other operational layers
                webmapOperationalLayers = webmapData["operationalLayers"]

            # Get any graphics added from the web map
            webmapGraphicsLayers = []
            count = 0
            for webmapOperationalLayer in webmapOperationalLayers:
                # If feature collection and doesn't have an ID of report layer then is a graphics layer
                if "featureCollection" in webmapOperationalLayer:
                    if webmapOperationalLayer["id"].lower() != "reportlayer":
                        webmapGraphicsLayers.append(webmapOperationalLayer)
                        del webmapOperationalLayers[count]
                count = count + 1

            # Get the tables to merge
            for reportData in reportsData:
                if "mergeTable" in reportData:
                    if (str(reportData['mergeTable']).lower() == "true"):
                        tablesToMerge.append(reportData['title'].lower())

            # For each report object
            PDFs = []
            for reportData in reportsData:
                # Clear the operational layers and legend
                webmapData["operationalLayers"] = []
                webmapData["layoutOptions"]["legendOptions"]["operationalLayers"] = []

                # Set the title for the map from the reports JSON object
                webmapData["layoutOptions"]["titleText"] = reportData["title"]

                # Set the scale for the map from the reports JSON object
                if "scale" in webmapData["mapOptions"]:
                    # If scale is in reports JSON object
                    if (("scale" in reportData) and (reportData["scale"] > 0)):
                        webmapData["mapOptions"]["scale"] = reportData["scale"]
                    else:
                        webmapData["mapOptions"]["scale"] = webmapScale
                    # If the map is to be created over multiple pages
                    if "multiplePageMap" in reportData:
                        if(str(reportData["multiplePageMap"]).lower() == "true"):
                            # Set the scale to 0, so the extent will not be fixed in the MXD and can be changed for each each index
                            webmapData["mapOptions"]["scale"] = 0

                # Add the basemap to operational layers if necessary
                if (basemap):
                    # Update the max scale for basemap to show when zoomed in close
                    if "maxScale" in basemap:
                        basemap['maxScale'] = 0
                    webmapData["operationalLayers"].append(basemap)

                # Add the operational layers from the webmap
                for webmapOperationalLayer in webmapOperationalLayers:
                    addLayer = True

                    if "title" in webmapOperationalLayer:
                        # If layer in not show array, don't add
                        if webmapOperationalLayer['title'] in webmaplayersNotShow:
                            addLayer = False

                        # If layer is already in the reports JSON object layers
                        for operationalLayer in reportData["operationalLayers"]:
                            if (operationalLayer['title'].lower() == webmapOperationalLayer['title'].lower()):
                                addLayer = False
                    # If adding layer
                    if (addLayer == True):
                        webmapData["operationalLayers"].append(webmapOperationalLayer)
                        # Don't add report layer to legend
                        if "title" in webmapOperationalLayer:
                            if (webmapOperationalLayer['title'].lower() != "reportlayer"):
                                webmapData["layoutOptions"]["legendOptions"]["operationalLayers"].append(webmapOperationalLayer)

                # Add the operational layers for the map from the reports JSON object
                if "operationalLayers" in reportData:
                    operationalLayers = reportData["operationalLayers"]
                    for operationalLayer in operationalLayers:
                        # Add layer object
                        webmapData["operationalLayers"].append(operationalLayer)

                        # Add the layer object if legend paramter is not false
                        if "legend" in operationalLayer:
                            if (str(operationalLayer["legend"]).lower() == "true"):
                                webmapData["layoutOptions"]["legendOptions"]["operationalLayers"].append(operationalLayer)

                # Add in the token to all secure operational layers
                for operationalLayer in webmapData["operationalLayers"]:
                    if "secure" in operationalLayer:
                        if (str(operationalLayer["secure"]).lower() == "true"):
                            operationalLayer["token"] = token

                # Add the graphics layers from the webmap
                for webmapGraphicsLayer in webmapGraphicsLayers:
                    webmapData["operationalLayers"].append(webmapGraphicsLayer)

                # Convert web map JSON object back to string
                webmapJSON = json.dumps(webmapData)

                # If feature report - Set template
                if (reportData["type"].lower() == "report - feature"):
                    template = featureReportTemplate
                # If map
                else:
                    template = mapTemplate

                # If creating a map
                if (reportData["type"].lower() != "report"):
                    # TO DO - Work with ArcGIS Pro
                    # Python version check for ArcGIS Pro
                    #if sys.version_info[0] >= 3:
                        # Python 3.x - ArcGIS Pro - Create report
                        #createReportArcGISPro(propertyReportTemplate)
                    #else:
                        # Python 2.x - ArcMap - Create report
                        #createReportArcMap(propertyReportTemplate)
                    # ------------- Setup ArcGIS project ------------------------
                    #aprx = arcpy.mp.ArcGISProject("CURRENT")
                    # Set the map and the layout
                    #map = aprx.listMaps("Property Report")[0]
                    #layout = aprx.listLayouts("Property Report")[0]
                    # ----------------------------------------------------------------

                    # Set the active data frame to layers in the template as the ConvertWebMapToMapDocument will use the active data frame, so need to make sure it's set to Layers
                    mxdTemplate = arcpy.mapping.MapDocument(template)
                    # If the active data frame is not layers
                    if (mxdTemplate.activeDataFrame.name.lower() != "layers"):
                        # Check the layers data frame exists
                        for df in arcpy.mapping.ListDataFrames(mxdTemplate, "*"):
                            if df.name.lower() == "layers":
                                # Set the active data frame to layers
                                mxdTemplate.activeView = df.name
                                mxdTemplate.save()

                    # Convert the WebMap to a map document. Note: ConvertWebMapToMapDocument renames the active dataframe in the template_mxd to "Webmap"
                    printMessage("Converting web map to a map document for " + reportData["title"] + "...","info")
                    result = arcpy.mapping.ConvertWebMapToMapDocument(webmapJSON, template)
                    mxd = result.mapDocument

                    # If the map is to be created over multiple pages
                    multiplePageMap = False
                    if "multiplePageMap" in reportData:
                        if(str(reportData["multiplePageMap"]).lower() == "true"):
                            # Create the multi page index
                            mxd = multiPageIndex(mxd,selectedFeatureData)
                            multiplePageMap = True

                    # If single page map
                    if (multiplePageMap == False):
                        # Remove the overview data frame if it exists
                        for df in arcpy.mapping.ListDataFrames(mxd, "*"):
                            if (df.name.lower() == "overview"):
                                # Remove the data frame by moving it off the page
                                df.elementPositionX = -5000
                                df.elementPositionY = -5000

                    # Update text element - Subtitle
                    for element in arcpy.mapping.ListLayoutElements(mxd, "TEXT_ELEMENT"):
                        if element.text == "[Subtitle]":
                            if "subtitle" in reportData:
                                if(reportData["subtitle"]):
                                    # Update the subtitle in the mxd
                                    element.text = reportData["subtitle"]
                                else:
                                    # Update the subtitle in the mxd
                                    element.text = " "
                            else:
                                # Update the subtitle in the mxd
                                element.text = " "

                    # If feature report
                    if (reportData["type"].lower() == "report - feature"):
                        # Create report
                        featureReport(mxd,selectedFeatureData)

                    # Get the PDF and reset values
                    DPI = result.DPI
                    # Good print option
                    if (int(DPI) == 150):
                        DPI = 96
                    # Best print option
                    elif (int(DPI) == 300):
                        DPI = 180
                    # Fast print option
                    else:
                        DPI = 72

                    # If there is a legend element
                    legendPDF = ""
                    if (len(arcpy.mapping.ListLayoutElements(mxd, "LEGEND_ELEMENT")) > 0):
                        # Reference the legend in the map document
                        legend = arcpy.mapping.ListLayoutElements(mxd, "LEGEND_ELEMENT")[0]

                        # Get a list of service layers that are on in the legend
                        legendServiceLayerNames = [lslyr.name for lslyr in legend.listLegendItemLayers()
                                           if lslyr.isServiceLayer and not lslyr.isGroupLayer]

                        # For each layer in the legend
                        for lvlyr in legend.listLegendItemLayers():
                            # If operational layers are in the report data object
                            if "operationalLayers" in reportData:
                                operationalLayers = reportData["operationalLayers"]
                                for operationalLayer in operationalLayers:
                                    # For this legend item
                                    if (lvlyr.name == operationalLayer["title"]):
                                        # If the legend extent parameter is set
                                        if "legendExtent" in operationalLayer:
                                            legendExtentBoolean = True
                                            if (str(operationalLayer["legendExtent"]).lower() == "false"):
                                                legendExtentBoolean = False
                                            # Update whether to use the visible extent for the legend or not, default is true
                                            legend.updateItem(lvlyr, use_visible_extent = legendExtentBoolean)

                            # Remove all layers from the legend specified in the no legend layers global array
                            if lvlyr.name in noLegendLayers:
                                legend.removeItem(lvlyr)

                        # If legend is full
                        if (legend.isOverflowing):
                            # Remove the legend by moving it off the page
                            legend.elementPositionX = -5000
                            legend.elementPositionY = -5000

                            # Remove all graphic elements
                            for element in arcpy.mapping.ListLayoutElements(mxd, "GRAPHIC_ELEMENT"):
                                # Remove the graphic by moving it off the page
                                element.elementPositionX = -5000
                                element.elementPositionY = -5000
                            # Resize data frame element if needed by adding values - Height, width, X and Y
                            dataFrameElement = arcpy.mapping.ListLayoutElements(mxd, "DATAFRAME_ELEMENT")[0]
                            reSizeElement(mxd,"DATAFRAME_ELEMENT",dataFrameElement.elementHeight,mxd.pageSize.width-2,dataFrameElement.elementPositionX,dataFrameElement.elementPositionY)

                    # Order for PDFs - Map/feature report, legend, report
                    # If single page map
                    if (multiplePageMap == False):
                        pdfPages = pdfPages + 1
                        # Update text element - Page number
                        for element in arcpy.mapping.ListLayoutElements(mxd, "TEXT_ELEMENT"):
                            # If there is a page number text element
                            if element.name.lower() == "page number":
                                # Update the page number in the mxd
                                element.text = pdfPages

                        # Use the uuid module to generate a GUID as part of the output name, this will ensure a unique output name
                        outputFileName = 'Map_{}.{}'.format(str(uuid.uuid1()), ".pdf")
                        outputPath = os.path.join(arcpy.env.scratchFolder, outputFileName)
                        # Export the map to PDF
                        printMessage("Exporting " + reportData["title"] + " map to PDF...","info")
                        arcpy.mapping.ExportToPDF(mxd, outputPath, resolution=DPI)
                        PDFs.append(outputPath)
                    # Multi map page
                    else:
                        # Set the data frames
                        webmapFrame = arcpy.mapping.ListDataFrames(mxd, "Webmap")[0]

                        # Check if overview data frame exists
                        overviewFrameExists = False
                        for df in arcpy.mapping.ListDataFrames(mxd, "*"):
                            if df.name.lower() == "overview":
                                overviewFrameExists = True
                                overviewFrame = arcpy.mapping.ListDataFrames(mxd, "Overview")[0]

                        if (overviewFrameExists == False):
                            printMessage("No overview map frame exists in template...","warning")

                        # Check if index layer exists
                        indexLayerExists = False
                        for layer in arcpy.mapping.ListLayers(mxd, "*", webmapFrame):
                            if layer.name.lower() == "index":
                                indexLayerExists = True
                                 # Get the index layer
                                indexLayer = arcpy.mapping.ListLayers(mxd, "Index", webmapFrame)[0]
                                # Get the number of pages from the index
                                result = arcpy.GetCount_management(indexLayer)
                                pageCount = int(result.getOutput(0))

                                # For each page
                                currentPage = 0
                                while (currentPage < pageCount):
                                    currentPage = currentPage + 1
                                    # Select the index for the page and zoom to it
                                    arcpy.SelectLayerByAttribute_management(indexLayer, "NEW_SELECTION", '"PageNumber" = ' + str(currentPage))
                                    webmapFrame.extent = indexLayer.getSelectedExtent()
                                    # Clear the selection
                                    arcpy.SelectLayerByAttribute_management(indexLayer, "CLEAR_SELECTION")

                                    # Check if overview data frame exists
                                    for df in arcpy.mapping.ListDataFrames(mxd, "*"):
                                        if df.name.lower() == "overview":
                                            # Check if overview index layer exists
                                            overviewIndexLayerExists = False
                                            for layer in arcpy.mapping.ListLayers(mxd, "*", overviewFrame):
                                                if layer.name.lower() == "index":
                                                    overviewIndexLayerExists = True
                                                    # Get the index layer
                                                    overviewIndexLayer = arcpy.mapping.ListLayers(mxd, "Index", overviewFrame)[0]
                                                    # Select the index for the page
                                                    arcpy.SelectLayerByAttribute_management(overviewIndexLayer, "NEW_SELECTION", '"PageNumber" = ' + str(currentPage))
                                            if (overviewIndexLayerExists == False):
                                                printMessage("No index layer exists in overview template...","warning")

                                    pdfPages = pdfPages + 1
                                    # Update text element - Page number
                                    for element in arcpy.mapping.ListLayoutElements(mxd, "TEXT_ELEMENT"):
                                        # If there is a page number text element
                                        if element.name.lower() == "page number":
                                            # Update the page number in the mxd
                                            element.text = pdfPages

                                    # Use the uuid module to generate a GUID as part of the output name, this will ensure a unique output name
                                    outputFileName = 'Map_{}.{}'.format(str(uuid.uuid1()), ".pdf")
                                    outputPath = os.path.join(arcpy.env.scratchFolder, outputFileName)
                                    # Export the map to PDF
                                    printMessage("Exporting " + reportData["title"] + " maps to PDF - " + str(currentPage) + " of " + str(pageCount) + "...","info")
                                    arcpy.mapping.ExportToPDF(mxd, outputPath, resolution=DPI)
                                    PDFs.append(outputPath)
                        if (indexLayerExists == False):
                            printMessage("No index layer exists in template...","warning")

                    # If creating legend page
                    if (len(arcpy.mapping.ListLayoutElements(mxd, "LEGEND_ELEMENT")) > 0):
                        # Reference the legend in the map document
                        legend = arcpy.mapping.ListLayoutElements(mxd, "LEGEND_ELEMENT")[0]

                        if (legend.isOverflowing):
                            printMessage("Legend is full, creating legend on new page...","info")

                            # Create legend page
                            pdfPages = pdfPages + 1
                            legendPDF = createLegend(mxd)

                            # Append the legend PDF
                            PDFs.append(legendPDF)

                    # If creating analysis report
                    if (reportData["type"].lower() == "report - analysis"):
                        # Create the report
                        reportPDF = analysisReport(reportData["title"],reportsData,reportingData)
                        # Append the report PDF
                        PDFs.append(reportPDF)

                    # Clean up - delete the map document reference
                    filePath = mxd.filePath
                    del mxd, result
                    os.remove(filePath)
                # Produce just the report
                else:
                    # Create the report
                    reportPDF = analysisReport(reportData["title"],reportsData,reportingData)
                    # Append the report PDF
                    if (reportPDF):
                        PDFs.append(reportPDF)

            # Join all the PDFs together into one document
            printMessage("Building PDF Report...","info")
            outputFileName = 'Report_{}.{}'.format(str(uuid.uuid1()), "pdf")
            outputReport = os.path.join(arcpy.env.scratchFolder, outputFileName)
            outputPDF = arcpy.mapping.PDFDocumentCreate(outputReport)
            # Loop through and append each PDF in the list
            for eachPDF in PDFs:
               # Remove out apostrophes
               PDF = str(eachPDF).replace("'", "")
               outputPDF.appendPages(PDF)
            # Save the changes and close
            outputPDF.saveAndClose()
            printMessage("Output Report - " + outputReport + "...","info")

            # If download data JSON is provided
            if (downloadDataJSON):
                if (len(downloadData) > 0):
                    for data in downloadData:
                        # Get download format
                        downloadFormat = data['downloadFormat']
                    # Setup the zip file
                    outputData = os.path.join(arcpy.env.scratchFolder, "Data_" + str(uuid.uuid1()) + ".zip")

                    # Create output folder
                    folderName = "Folder" + str(uuid.uuid1())
                    arcpy.CreateFolder_management(arcpy.env.scratchFolder, folderName)
                    outputFolder = os.path.join(arcpy.env.scratchFolder, folderName)
                    if (downloadFormat.lower() == "file geodatabase"):
                        # Create output geodatabase
                        outputGeodatabase = os.path.join(outputFolder, "Data.gdb")
                        arcpy.CreateFileGDB_management(outputFolder, "Data.gdb")

                    printMessage("Creating data...","info")
                    for data in downloadData:
                        # Create JSON file
                        jsonFilePath = os.path.join(arcpy.env.scratchFolder, "Data" + str(uuid.uuid1()) + ".json")
                        with open(jsonFilePath, 'w') as jsonFile:
                            json.dump(data, jsonFile)

                        # Get title
                        title = str(data['title']).replace(" ","_").replace("-","_").replace(".","_").replace("&","_").replace(":","_").replace("%","_")
                        if (downloadFormat.lower() == "file geodatabase"):
                            # Convert json file to features - File goedatabase
                            outputDataset = os.path.join(outputGeodatabase, title)
                            arcpy.JSONToFeatures_conversion(jsonFilePath, outputDataset)
                        elif (downloadFormat.lower() == "csv"):
                            # Convert json file to features - CSV
                            arcpy.JSONToFeatures_conversion(jsonFilePath, os.path.join(arcpy.env.scratchGDB, title))
                            arcpy.TableToTable_conversion(os.path.join(arcpy.env.scratchGDB, title), outputFolder, title + ".csv")
                        else:
                            # Convert json file to features - Shapefile
                            outputDataset = os.path.join(outputFolder, title + ".shp")
                            arcpy.JSONToFeatures_conversion(jsonFilePath, outputDataset)

                    # Zip up folder
                    zippedFolder = zipfile.ZipFile(outputData, "w", allowZip64=True)
                    # Zip up the geodatabase
                    root_len = len(os.path.abspath(str(outputFolder)))
                    # For each of the directories in the folder
                    for root, dirs, files in os.walk(str(outputFolder)):
                      archive_root = os.path.abspath(root)[root_len:]
                      # For each file
                      for f in files:
                        fullpath = os.path.join(root, f)
                        archive_name = os.path.join(archive_root, f)
                        zippedFolder.write(fullpath, archive_name)
                    # Close zip file
                    zippedFolder.close()
                    printMessage("Output Data - " + outputData + "...","info")

        # --------------------------------------- End of code --------------------------------------- #
        # If called from gp tool return the arcpy parameter
        if __name__ == '__main__':
            # Return the output if there is any
            if outputReport:
                arcpy.SetParameter(10, outputReport)
            # Return the output if there is any
            if outputData:
                arcpy.SetParameter(11, outputData)
        # Otherwise return the result
        else:
            # Return the output if there is any
            if outputReport:
                return outputReport
        # Logging
        if (enableLogging == "true"):
            # Log end of process
            logger.info("Process ended.")
            # Remove file handler and close log file
            logMessage.flush()
            logMessage.close()
            logger.handlers = []
    # If arcpy error
    except arcpy.ExecuteError:
        # Build and show the error message
        errorMessage = arcpy.GetMessages(2)
        printMessage(errorMessage,"error")
        # Logging
        if (enableLogging == "true"):
            # Log error
            logger.error(errorMessage)
            # Log end of process
            logger.info("Process ended.")
            # Remove file handler and close log file
            logMessage.flush()
            logMessage.close()
            logger.handlers = []
        if (sendErrorEmail == "true"):
            # Send email
            sendEmail(errorMessage)
    # If python error
    except Exception as e:
        errorMessage = ""
        # Build and show the error message
        # If many arguments
        if (e.args):
            for i in range(len(e.args)):
                if (i == 0):
                    # Python version check
                    if sys.version_info[0] >= 3:
                        # Python 3.x
                        errorMessage = str(e.args[i]).encode('utf-8').decode('utf-8')
                    else:
                        # Python 2.x
                        errorMessage = unicode(e.args[i]).encode('utf-8')
                else:
                    # Python version check
                    if sys.version_info[0] >= 3:
                        # Python 3.x
                        errorMessage = errorMessage + " " + str(e.args[i]).encode('utf-8').decode('utf-8')
                    else:
                        # Python 2.x
                        errorMessage = errorMessage + " " + unicode(e.args[i]).encode('utf-8')
        # Else just one argument
        else:
            errorMessage = e
        printMessage(errorMessage,"error")
        # Logging
        if (enableLogging == "true"):
            # Log error
            logger.error(errorMessage)
            # Log end of process
            logger.info("Process ended.")
            # Remove file handler and close log file
            logMessage.flush()
            logMessage.close()
            logger.handlers = []
        if (sendErrorEmail == "true"):
            # Send email
            sendEmail(errorMessage)
# End of main function


# Start of feature report function
def featureReport(mxd,selectedFeatureData):
    global pdfPages

    printMessage("Creating feature report...","info")
    # For each of the text element in the map document
    for element in arcpy.mapping.ListLayoutElements(mxd, "TEXT_ELEMENT"):
        # If there is a page number text element
        if element.name.lower() == "page number":
            # Update the page number in the mxd
            element.text = pdfPages

        # If element name in attribute fields
        if element.name in selectedFeatureData["attributes"]:
            value = selectedFeatureData["attributes"][element.name]
            # If value is valid, otherwise make it blank
            if (value != "None"):
              # If value text length is too long then add new lines
              if (len(str(value)) > 50):
                  # Split string by spaces
                  stringArray = value.split()

                  # For each of the words, build the text
                  newText = ""
                  textCounter = ""
                  for i in range(len(stringArray)):
                      # Add to element text until reaches max line width then add new line
                      if (textCounter == ""):
                          newText = newText + stringArray[i]
                      else:
                          newText = newText + " " + stringArray[i]
                      textCounter = textCounter + " " + stringArray[i]
                      if (len(textCounter) > 50):
                          # Add new line
                          textCounter = ""
                          newText = newText + "\r\n"
                  # Set the text element
                  element.text = newText
              # Otherwise just replace text in text element
              else:
                  if ((element.name == "CapitalValue") or (element.name == "LandValue") or (element.name == "ImprValue") or (element.name == "TotalRates")):
                      element.text = "$ " + '{:12,.2f}'.format(float(value))
                  elif (element.name == "Hectares"):
                      element.text = '{:20,.2f}'.format(float(value))
                  else:
                      element.text = value
            else:
                element.text = " "
# End of feature report function


# Start of analysis report function
def analysisReport(reportTitle,reportsData,reportingData):
    global pdfPages
    global tablesToMerge
    global tablesMergedCount
    global mergedTableData

    completeReport = True
    printMessage("Creating analysis report...","info")

    # For each of the reports
    reportFields = ""
    subtitleText = ""
    for repData in reportsData:
        # If subtitle is to be added
        if "subtitle" in repData:
            subtitleText = repData["subtitle"]

        # Get the report fields for the current map
        if (repData['title'].lower() == reportTitle.lower()):
            reportFields = repData['reportFields']
    # If a string, convert to array
    if isinstance(reportFields, basestring):
        reportFields = string.split(reportFields, ",")

    # For each of the report data objects - Get the data
    tableData = []
    for reportData in reportingData:
        # Get the report data object for the current map
        if (reportData['map'].lower() == reportTitle.lower()):
            # For each of the features in the report
            featureCount = 0
            for feature in reportData['features']:
                # If the first feature
                if (featureCount == 0):
                    fieldRow = []
                    # For each of the report fields
                    for reportField in reportFields:
                        # If there is a field name and value specified in the fields specified using the "=" symbol
                        if ("=" in reportField):
                            reportFieldSplit = string.split(reportField, "=")
                            if (reportFieldSplit[0]):
                                fieldName = reportFieldSplit[0]
                            if (reportFieldSplit[1]):
                                fieldValue = reportFieldSplit[1]
                            fieldRow.append(fieldName)

                        # If there is a field name with an alternative field name specified using the ">" symbol
                        fieldAliasSet = False
                        if (">" in reportField):
                            # Split the field to get the field name and alias
                            fieldAlias = string.split(reportField, ">")[1]
                            reportField = string.split(reportField, ">")[0]
                            fieldAliasSet = True

                        # For each of the fields in the feature
                        for field in feature:
                            # If in the reporting fields
                            if (field.lower() == reportField.lower()):
                                # If field alias has not been set
                                if (fieldAliasSet == False):
                                    # Get the field alias if not specified
                                    fieldAlias = ""
                                    for field2 in reportData['fields']:
                                        if(field == field2['name']):
                                            fieldAlias = field2['alias']
                                # Push into array
                                fieldRow.append(fieldAlias)
                    tableData.append(fieldRow)
                    # If the map is to be merged with others
                    if (reportData['map'].lower() in tablesToMerge):
                        # If it's the first merged table
                        if (tablesMergedCount == 0):
                            mergedTableData.append(fieldRow)
                valueRow = []
                # For each of the report fields
                for reportField in reportFields:
                    # If there is a field name and value specified in the fields specified using the "=" symbol
                    if ("=" in reportField):
                        reportFieldSplit = string.split(reportField, "=")
                        if (reportFieldSplit[0]):
                            fieldName = reportFieldSplit[0]
                        if (reportFieldSplit[1]):
                            fieldValue = reportFieldSplit[1]
                        valueRow.append(fieldValue)

                    # If there is a field name with an alternative field name specified using the ">" symbol
                    if (">" in reportField):
                        # Split the field to get the field name and alias
                        reportField = string.split(reportField, ">")[0]

                    # For each of the fields
                    for field in feature:
                        # If in the reporting fields
                        if (field.lower() == reportField.lower()):
                            if (feature[field]):
                                # Python version check
                                if sys.version_info[0] >= 3:
                                    # Python 3.x
                                    value = str(feature[field]).encode('utf-8').decode('utf-8')
                                    # Replace any invalid characters
                                    value = value.replace("&", "and").replace(">", "greater than").replace("<", "less than")
                                else:
                                    # Python 2.x
                                    value = unicode(feature[field]).encode('utf-8')
                                    # Replace any invalid characters
                                    value = value.replace("&", "and").replace(">", "greater than").replace("<", "less than")
                                # Push into array and encode the string
                                valueRow.append(value)
                            else:
                                # Push blank value into array
                                valueRow.append("")
                tableData.append(valueRow)
                # If the map is to be merged with others
                if (reportData['map'].lower() in tablesToMerge):
                    mergedTableData.append(valueRow)
                featureCount = featureCount + 1

            # If the map is to be merged with others
            if (reportData['map'].lower() in tablesToMerge):
                completeReport = False
                # Add to count
                tablesMergedCount = tablesMergedCount + 1
                # If at the last table to merge
                if (tablesMergedCount == len(tablesToMerge)):
                    for repData in reportsData:
                        # Get the current map
                        if (repData['title'].lower() == reportTitle.lower()):
                            # Update the report title
                            reportTitle = repData['parentMap']

                    # Update the table data
                    tableData = mergedTableData
                    completeReport = True

    if (completeReport == True):
        # Use the uuid module to generate a GUID as part of the output name
        # This will ensure a unique output name
        outputFileName = 'ReportAnalysis_{}.{}'.format(str(uuid.uuid1()), ".pdf")
        outputPath = os.path.join(arcpy.env.scratchFolder, outputFileName)

        # Get the longest value in the table
        longestFieldLength = 0
        for row in tableData:
            for value in row:
                if (len(str(value)) > longestFieldLength):
                    # Update the longest field length parameter
                    longestFieldLength = len(str(value))

        # Set the page size based on the size of the longest value
        if(longestFieldLength > 1000):
            printMessage("Setting page size to A3...","info")
            reportPageSize = A3
        else:
            printMessage("Setting page size to A4...","info")
            reportPageSize = A4

        # Export the report
        printMessage("Exporting report to PDF...","info")
        # Setup document
        doc = SimpleDocTemplate(outputPath,pagesize=reportPageSize,
                                rightMargin=40,leftMargin=40,
                                topMargin=20,bottomMargin=20)
        # Maximum of 4 columns for portrait
        if (len(fieldRow) > 4):
          doc.pagesize = landscape(reportPageSize)
        else:
          doc.pagesize = portrait(reportPageSize)
        elements = []

        # Configure styles
        # Table
        styles = getSampleStyleSheet()
        tableStyle = styles["BodyText"]
        tableStyle.fontSize = 9
        tableStyle.wordWrap = 'CJK'
        # Title
        styles=getSampleStyleSheet()
        title = styles["Title"]
        title.alignment = TA_CENTER
        title.fontSize = 14
        # Subtitle
        styles=getSampleStyleSheet()
        subtitle = styles["Italic"]
        subtitle.alignment = TA_LEFT
        subtitle.fontSize = 8
        # Date
        styles=getSampleStyleSheet()
        date = styles["Normal"]
        date.alignment = TA_LEFT
        date.fontSize = 6

        # Add the date
        currentDate = datetime.datetime.now()
        currentDateString = currentDate.strftime("%d/%m/%y")
        elements.append(Paragraph(currentDateString, date))

        # Add a title
        elements.append(Paragraph(reportTitle, title))
        elements.append(Spacer(1, 2))

        # If subtitle is to be added
        if subtitleText:
            # Add a subtitle
            elements.append(Paragraph(subtitleText, subtitle))
            elements.append(Spacer(1, 12))

        # Add a table
        tableData = [[Paragraph(cell, tableStyle) for cell in row] for row in tableData]
        # Repeats first row on multiple pages
        table=Table(tableData, splitByRow=1, repeatRows=1)
        table.setStyle(TableStyle([
                ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
                ('ALIGN',(0, 0),(0,-1), 'LEFT'),
                ('INNERGRID', (0, 0), (-1, -1), 0.50, colors.black),
                ('BOX', (0,0), (-1,-1), 0.25, colors.black),
            ]))
        elements.append(table)

        # Add the page number
        reportPages = 0
        def addPageNumber(canvas, doc):
            pageNumber = canvas.getPageNumber()+pdfPages
            canvas.setFont('Helvetica', 10)

            # If document size is A4 landscape
            if (doc.pagesize == landscape(A4)):
                canvas.drawString(280 * mm, 5 * mm, str(pageNumber))
            # If document size is A3 landscape
            elif (doc.pagesize == landscape(A3)):
                canvas.drawString(405 * mm, 5 * mm, str(pageNumber))
            # If document size is A3 Portrait
            elif (doc.pagesize == portrait(A3)):
                canvas.drawString(285 * mm, 5 * mm, str(pageNumber))
            # If document size is A4 Portrait
            else:
                canvas.drawString(195 * mm, 5 * mm, str(pageNumber))

        # Build the report
        doc.build(elements, onFirstPage=addPageNumber, onLaterPages=addPageNumber)
        pdfPages = pdfPages + doc.page
        return outputPath
    else:
        return None
# End of analysis report function


# Start of re-size element function
def reSizeElement(mxd,elementType,height,width,X,Y):
    # Resize element by setting the values below
    element = arcpy.mapping.ListLayoutElements(mxd, elementType)[0]
    element.elementHeight = height
    element.elementWidth = width
    element.elementPositionX = X
    element.elementPositionY = Y
# End of re-size element function


# Start of create legend function
def createLegend(mxd):
    global pdfPages

    # Create a copy of the MXD
    copyMXD = 'Legend_{}.{}'.format(str(uuid.uuid1()), ".mxd")
    mxd.saveACopy(copyMXD)
    legendMXD = arcpy.mapping.MapDocument(copyMXD)

    # Remove all data frame elements
    for element in arcpy.mapping.ListLayoutElements(legendMXD, "DATAFRAME_ELEMENT"):
        # Remove the data frame by moving it off the page
        element.elementPositionX = -5000
        element.elementPositionY = -5000
    # Remove all text elements
    for element in arcpy.mapping.ListLayoutElements(legendMXD, "TEXT_ELEMENT"):
        # If there is a page number text element
        if element.name.lower() == "page number":
            # Update the page number in the mxd
            element.text = pdfPages
        else:
            # Remove the text by moving it off the page
            element.elementPositionX = -5000
            element.elementPositionY = -5000
    # Remove all picture elements
    for element in arcpy.mapping.ListLayoutElements(legendMXD, "PICTURE_ELEMENT"):
        # Remove the picture by moving it off the page
        element.elementPositionX = -5000
        element.elementPositionY = -5000
    # Remove all graphic elements
    for element in arcpy.mapping.ListLayoutElements(legendMXD, "GRAPHIC_ELEMENT"):
        # Remove the graphic by moving it off the page
        element.elementPositionX = -5000
        element.elementPositionY = -5000
    # Remove all map surround elements
    for element in arcpy.mapping.ListLayoutElements(legendMXD, "MAPSURROUND_ELEMENT"):
        # Remove the map surround by moving it off the page
        element.elementPositionX = -5000
        element.elementPositionY = -5000

    # Resize legend element by adding values - Height, width, X and Y
    legend = arcpy.mapping.ListLayoutElements(legendMXD, "LEGEND_ELEMENT")[0]
    height = legendMXD.pageSize.height-2 # Resize legend to whole page
    width = legendMXD.pageSize.width-2 # Resize legend to whole page
    X = 1  # Move the legend to the top left corner of the page
    Y = legendMXD.pageSize.height - 1 # Move the legend to the top left corner of the page
    reSizeElement(legendMXD,"LEGEND_ELEMENT",height,width,X,Y)
    # Use the uuid module to generate a GUID as part of the output name
    # This will ensure a unique output name
    outputFileName = 'Legend_{}.{}'.format(str(uuid.uuid1()), ".pdf")
    outputPath = os.path.join(arcpy.env.scratchFolder, outputFileName)
    # Export the WebMap
    printMessage("Exporting legend to PDF...","info")
    arcpy.mapping.ExportToPDF(legendMXD, outputPath)
    return outputPath
# End of create legend function


# Start of create multi page index function
def multiPageIndex(mxd,selectedFeatureData):
    printMessage("Creating the map over multiple pages...","info")

    # Convert selected feature to a feature class
    selectedGeometry = arcpy.AsShape(selectedFeatureData["geometry"], True)

    # Create temporary feature class to get shape type
    arcpy.CopyFeatures_management(selectedGeometry, os.path.join(arcpy.env.scratchGDB, "SelectedFeature"))

    # Create data driven page index features based on the size of the extent of the polygon
    heightNumber = 2
    widthNumber = 2
    featureDetails = arcpy.Describe(os.path.join(arcpy.env.scratchGDB, "SelectedFeature"))
    featureExtent = featureDetails.extent

    # Get the data frame aspect ratio
    webmapFrame = arcpy.mapping.ListDataFrames(mxd, "Webmap")[0]
    webmapFrameAspectRatio = webmapFrame.elementWidth/webmapFrame.elementHeight
    # Get the feature aspect ratio
    featureAspectRatio = (featureExtent.width/widthNumber)/(featureExtent.height/heightNumber)

    # Update the aspect ratio to be the same as the data frame
    featureWidth = featureExtent.height*webmapFrameAspectRatio
    featureHeight = featureExtent.height

    # Get the current total width of the index
    rowsNumber = heightNumber
    colsNumber = widthNumber
    indexWidthTotal = (featureWidth/widthNumber)*colsNumber

    # If the selection width is bigger than the index width
    if (featureExtent.width > indexWidthTotal):
        # Keep adding extra columns until selected extent is covered
        while (featureExtent.width > indexWidthTotal):
            # Add an extra column
            colsNumber = colsNumber + 1
            indexWidthTotal = (featureWidth/widthNumber)*colsNumber
    # If the selection width is less than the index width
    else:
        # Change index width to the same width as the selection width
        featureWidth = featureExtent.width
        featureHeight = featureExtent.width/webmapFrameAspectRatio
        # Get the current total height of the index
        indexHeightTotal = (featureHeight/heightNumber)*rowsNumber

        # Keep adding extra rows until selected extent is covered
        while (featureExtent.height > indexHeightTotal):
            # Add an extra row
            rowsNumber = rowsNumber + 1
            indexHeightTotal = (featureHeight/heightNumber)*rowsNumber

    # Create the grid
    arcpy.GridIndexFeatures_cartography(os.path.join(arcpy.env.scratchGDB, "SelectedFeatureGrid"), os.path.join(arcpy.env.scratchGDB, "SelectedFeature"), "INTERSECTFEATURE", "NO_USEPAGEUNIT", "", str(featureWidth/widthNumber) + " Meters", str(featureHeight/heightNumber) + " Meters", "0 0", rowsNumber, colsNumber, "1", "NO_LABELFROMORIGIN")

    # Add data priven page indexes to map for the main data frame
    df = arcpy.mapping.ListDataFrames(mxd, 'Webmap')[0]
    for lyr in arcpy.mapping.ListLayers(mxd, "*", df):
        if (lyr.name.lower() == "index"):
            lyr.replaceDataSource(arcpy.env.scratchGDB, "FILEGDB_WORKSPACE", "SelectedFeatureGrid")

    # If overview data frame exists
    for df in arcpy.mapping.ListDataFrames(mxd, "*"):
        if (df.name.lower() == "overview"):
            # Add data priven page indexes to map for the overview frame
            df = arcpy.mapping.ListDataFrames(mxd, 'Overview')[0]
            for lyr in arcpy.mapping.ListLayers(mxd, "*", df):
                if (lyr.name.lower() == "selection"):
                    lyr.replaceDataSource(arcpy.env.scratchGDB, "FILEGDB_WORKSPACE", "SelectedFeature")
                if (lyr.name.lower() == "index"):
                    lyr.replaceDataSource(arcpy.env.scratchGDB, "FILEGDB_WORKSPACE", "SelectedFeatureGrid")
                    # Zoom to the grid in the map
                    ext = lyr.getExtent()
                    df.extent = ext
                    df.scale = df.scale * 1.5

    return mxd
# End of create multi page index function


# Start of get token function
def generateToken(username, password, portalUrl):
    # Python version check
    if sys.version_info[0] >= 3:
        # Python 3.x
        # Encode parameters
        parameters = urllib.parse.urlencode({'username' : username,
                        'password' : password,
                        'client' : 'referer',
                        'referer': portalUrl,
                        'expiration': 60,
                        'f' : 'json'})
    else:
        # Python 2.x
        # Encode parameters
        parameters = urllib.urlencode({'username' : username,
                        'password' : password,
                        'client' : 'referer',
                        'referer': portalUrl,
                        'expiration': 60,
                        'f' : 'json'})
    parameters = parameters.encode('utf-8')
    try:
        context = ssl._create_unverified_context()
        response = urllib2.urlopen(portalUrl + '/sharing/rest/generateToken?',parameters, context=context)
    except Exception as e:
        printMessage( 'Unable to open the url %s/sharing/rest/generateToken' % (portalUrl),'error')
        printMessage(e,'error')

    # Python version check
    if sys.version_info[0] >= 3:
        # Python 3.x
        # Read json response
        responseJSON = json.loads(response.read().decode('utf8'))
    else:
        # Python 2.x
        # Read json response
        responseJSON = json.loads(response.read())

    # Log results
    if "error" in responseJSON:
        errDict = responseJSON['error']
        if int(errDict['code'])==498:
            message = 'Token Expired. Getting new token... '
            token = generateToken(username,password, portalUrl)
        else:
            message =  'Error Code: %s \n Message: %s' % (errDict['code'],
            errDict['message'])
            printMessage(message,'error')
    token = responseJSON.get('token')
    return token
# End of get token function


# Start of print message function
def printMessage(message,type):
    # If ArcGIS desktop installed
    if (arcgisDesktop == "true"):
        if (type.lower() == "warning"):
            arcpy.AddWarning(message)
        elif (type.lower() == "error"):
            arcpy.AddError(message)
        else:
            arcpy.AddMessage(message)
    # ArcGIS desktop not installed
    else:
        print(message)
# End of print message function


# Start of set logging function
def setLogging(logFile):
    # Create a logger
    logger = logging.getLogger(os.path.basename(__file__))
    logger.setLevel(logging.DEBUG)
    # Setup log message handler
    logMessage = logging.FileHandler(logFile)
    # Setup the log formatting
    logFormat = logging.Formatter("%(asctime)s: %(levelname)s - %(message)s", "%d/%m/%Y - %H:%M:%S")
    # Add formatter to log message handler
    logMessage.setFormatter(logFormat)
    # Add log message handler to logger
    logger.addHandler(logMessage)

    return logger, logMessage
# End of set logging function


# Start of send email function
def sendEmail(message):
    # Send an email
    printMessage("Sending email...","info")
    # Server and port information
    smtpServer = smtplib.SMTP(emailServerName,emailServerPort)
    smtpServer.ehlo()
    smtpServer.starttls()
    smtpServer.ehlo
    # Login with sender email address and password
    smtpServer.login(emailUser, emailPassword)
    # Email content
    header = 'To:' + emailTo + '\n' + 'From: ' + emailUser + '\n' + 'Subject:' + emailSubject + '\n'
    body = header + '\n' + emailMessage + '\n' + '\n' + message
    # Send the email and close the connection
    smtpServer.sendmail(emailUser, emailTo, body)
# End of send email function


# This test allows the script to be used from the operating
# system command prompt (stand-alone), in a Python IDE,
# as a geoprocessing script tool, or as a module imported in
# another script
if __name__ == '__main__':
    # Test to see if ArcGIS desktop installed
    if ((os.path.basename(sys.executable).lower() == "arcgispro.exe") or (os.path.basename(sys.executable).lower() == "arcmap.exe") or (os.path.basename(sys.executable).lower() == "arccatalog.exe")):
        arcgisDesktop = "true"

    # If ArcGIS desktop installed
    if (arcgisDesktop == "true"):
        argv = tuple(arcpy.GetParameterAsText(i)
            for i in range(arcpy.GetArgumentCount()))
    # ArcGIS desktop not installed
    else:
        argv = sys.argv
        # Delete the first argument, which is the script
        del argv[0]
    # Logging
    if (enableLogging == "true"):
        # Setup logging
        logger, logMessage = setLogging(logFile)
        # Log start of process
        logger.info("Process started.")
    # Setup the use of a proxy for requests
    if (enableProxy == "true"):
        # Setup the proxy
        proxy = urllib2.ProxyHandler({requestProtocol : proxyURL})
        openURL = urllib2.build_opener(proxy)
        # Install the proxy
        urllib2.install_opener(openURL)
    mainFunction(*argv)
