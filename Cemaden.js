const axios  = require('axios');
const fs     = require('fs');
const moment = require('moment');
const path   = require('path');
const csv    = require('csvtojson');

// Exceptions
class ConfigFileError extends Error { };
class ClientError extends Error { };
class GetDataError extends Error { };
class DisabledDCP extends Error { };
class NoDataFoundError extends Error { };
class DateError extends Error { };
module.exports.ConfigFileError = ConfigFileError;
module.exports.ClientError = ClientError;
module.exports.GetDataError = GetDataError;
module.exports.NoDataFoundError = NoDataFoundError;
module.exports.DateError = DateError;

/**
 * Open a file and retrieve a FileDescriptor
 * When file exists, open in append mode. Otherwise, open in write mode
 * and store default data information (header)
 *
 * @param {string} fileName Path to the file to open
 * @param {string} defaultData Default data to write on top
 * @return {number} File descriptor identifier
 */
function openFile(fileName, defaultData) {
  let fileDescriptor = null;
  let fileSize = 0;

  try {
    fileDescriptor = fs.openSync(fileName, 'a+');
    fileSize = fs.statSync(fileName).size;
  } catch (error) {
    fileDescriptor = fs.openSync(fileName, 'w');
  } finally {
    if (fileDescriptor === null) {
      console.error(`Could not open file ${fileName}`);
      return;
    }
    // When file is empty, write header information
    if (fileSize === 0) {
      fs.writeSync(fileDescriptor, defaultData);
    }
  }

  return fileDescriptor;
}

function buildKeys(dcp, excludeOptions) {
  return Object.keys(dcp).filter(element => !excludeOptions.includes(element));
}

function buildLine(dcp, arrayKeys) {
  arrayKeys = arrayKeys.reverse();

  var csvLine = moment(dcp.dataHora).format('MM/DD/YYYY HH:mm:ss')+";";

  for (let index = 0; index < arrayKeys.length; index++) {
    const element = arrayKeys[index];
    csvLine+=`${dcp[element] == null ? "" : dcp[element]}${index == (arrayKeys.length - 1) ? "\r\n" : ";"}`;
  }

  return csvLine;
}

function buildHeader(station, arrayKeys) {
  arrayKeys = arrayKeys.reverse();

  var header = `TIMESTAMP;`;

  for (let index = 0; index < arrayKeys.length; index++) {
    const element = arrayKeys[index];
    header+=`${element}${index == (arrayKeys.length - 1) ? "\r\n" : ";"}`;
  }

  return header;
}

function buildFileName(dcp) {
  
  let dcpCodEstacao = dcp.codestacao;
  let dcpDataHora = moment(dcp.dataHora).format('YYYYMMDD_HHmmss');

  let fileName = dcpCodEstacao+"_"+dcpDataHora;
  return fileName;
}

function listFileFromDirectory(directoryPath) {
  return new Promise(function(resolve, reject) {  
    fs.readdir(directoryPath, function (err, files) {
      //handling error
      if (err) {
          return console.log('Unable to scan directory: ' + err);
      }

      resolve(files);
    });
  });  
}

function compareDates(stationDate, lastFileDate){
  let timeStation = moment(new Date(stationDate));
  let timeLastFile = moment(new Date(lastFileDate));

  if(timeStation.isSameOrBefore(timeLastFile)){
    return false;
  } else{
    return true;
  }
}

function saveLastDate(pathFileDir, newDate){
  return new Promise(function(resolve, reject) { 
    fs.readFile(pathFileDir, function read(err, data) {
      if (err) {
          throw err;
      }
      const content = data;

      fs.writeFile(pathFileDir, newDate, 'utf8', function (err) {
        if (err) return resolve(false);
        resolve(true);
      });

    });
  });
}

function getLastDate(pathFileDir){
  return new Promise(function(resolve, reject) { 
    fs.readFile(pathFileDir, function read(err, data) {
      if (err) {
          throw err;
      }
      const content = data;
  
      resolve(data);
    });
  });
}

class Cemaden {
  constructor(configFile) {
    if (!configFile) {
      throw new ConfigFileError('No config.json file set');
    }

    if (!configFile.dataDir) {
      throw new ConfigFileError('No data directory set to store data. Please check key "dataDir" in config.json');
    }
    /**
     * Target directory to download DCPs
     * @type {string}
     */
    this.targetDir = configFile.dataDir;

    if (!configFile.url) {
      throw new ConfigFileError(`Could not find attribute "url" in file "config.json"`);
    }

  /**
    * DCP Cemaden Provider
    * @type {string}
    */
    this.resourceURL = configFile.url;

  /**
    * JSON config.json file
    * @type {any}
    */
    this.config = configFile;

  /**
    * JSON config.json file
    * @type {any}
    */
    this.excludeOptions = configFile.exclude;
  }

  /**
   * Collect information of DCP Station
   *
   * @param {Object} station - station object to retrieve DCP
   * @param {string} station.codEstacao - Unique code of DCP Station
   * @param {any} client - Http Client
   * @returns {Promise<any[]>} Array of DCPs associated
   */
  getDCPs(station, client) {
    return new Promise((resolve, reject) => {
      if (!client) {
        return reject(new ClientError(`No JSON client provided`));
      }

      const service = client.create();
      service.defaults.timeout = 2500;
      client.get(this.config.url ,{
        timeout: 5000
      })
      .then(function (response) {

        const arrayDCPsJson = JSON.parse(JSON.stringify(response.data));
        const arrayDCPsJsonCemaden = arrayDCPsJson['cemaden'];

        let pcdInfoArrary = [];

        arrayDCPsJsonCemaden.forEach(element => {
          if(element.codestacao === station.codEstacao)
            pcdInfoArrary.push(element);
        });

        if (!pcdInfoArrary.length) {
          return reject(new DisabledDCP(`${station.codEstacao}`));
        }

        resolve(pcdInfoArrary);
      })
      .catch(function (error) {
        reject(error);
      });
    });
  }
  clean() {
    this.config.stations.forEach(station => {
      const filePath = path.join(this.targetDir, `${station.codEstacao}.txt`);
      fs.unlink(filePath);
    })
    fs.rmdirSync(this.targetDir);
  }
  /**
   * Retrieves DCPs from Data Server and store in disk
   *
   * @returns {Promise<any[]>} List of DCPs affected
   */
  async getData() {

    // Create directory if does not exist
    if (!fs.existsSync(this.targetDir)) {
      console.warn(`The directory ${this.targetDir} does not exist. Creating...`);
      fs.mkdirSync(this.targetDir);
    }

    let outputDCP = [];

    // For each of interest points
    for(let station of this.config.stations) {
      try {
        const dcps = await this.getDCPs(station, axios)

        //Getting the first dcp from dcps list
        const firstDcp = dcps[0];
        const lastDcp = dcps[dcps.length-1];

        if(!firstDcp)
          return reject(new NoDataFoundError("No dcp found."));

        let dcpName = lastDcp.codestacao;  

        let filesInDirectory = [];

        // create directory for document
        if (!fs.existsSync(this.targetDir+"/"+dcpName)) {
          console.warn(`The directory ${this.targetDir}/${dcpName} does not exist. Creating...`);
          fs.mkdirSync(this.targetDir+"/"+dcpName);

          if (typeof lastDcp !== "undefined") {
            const fileLastDate = path.join(this.targetDir+"/"+dcpName, `lastDate.dat`);

            const fileLastDateDescriptor = openFile(fileLastDate, lastDcp.dataHora);
          }

        } else{
          filesInDirectory = await listFileFromDirectory(this.targetDir+"/"+dcpName);
        }
        
        if(filesInDirectory != null && filesInDirectory.length > 0){

          let lastDate = await getLastDate(this.targetDir+"/"+dcpName+"/lastDate.dat");
          let dcpsToSave = [];

          for(let dcp of dcps) {
            if(compareDates(dcp.dataHora, lastDate)){
              dcpsToSave.push(dcp);
            }
          }

          if(dcpsToSave.length > 0){

            // Save Last Date
            if(await saveLastDate(this.targetDir+"/"+dcpName+"/lastDate.dat", dcpsToSave[dcpsToSave.length-1].dataHora)){
              //console.log("salvou Lastdate");
            } else{
              //console.log("não salvou lastDate")
            }

            // Setting DCP INPE Header
            const header = buildHeader(station, buildKeys(dcpsToSave[0], this.excludeOptions));

            let fileNameSave = buildFileName(dcpsToSave[dcpsToSave.length-1]);

            const fileName = path.join(this.targetDir+"/"+dcpName, `${fileNameSave}.dat`);

            const fileDescriptor = openFile(fileName, header);

            const csvDocument = await csv().fromFile(fileName);

            for(let dcpToSave of dcpsToSave) {
              const csvLine = buildLine(dcpToSave, buildKeys(dcpToSave, this.excludeOptions));
              fs.writeSync(fileDescriptor, csvLine);
            }

            // Closing file
            fs.closeSync(fileDescriptor);
          }          

        } else {

          // Setting DCP INPE Header
          const header = buildHeader(station, buildKeys(firstDcp, this.excludeOptions));

          let fileNameSave = buildFileName(lastDcp);

          const fileName = path.join(this.targetDir+"/"+dcpName, `${fileNameSave}.dat`);

          const fileDescriptor = openFile(fileName, header);

          const csvDocument = await csv().fromFile(fileName);

          for(let dcp of dcps) {
            const csvLine = buildLine(dcp, buildKeys(dcp, this.excludeOptions));
            fs.writeSync(fileDescriptor, csvLine);
          }

          // Closing file
          fs.closeSync(fileDescriptor);

        }        

        outputDCP.push(dcps);
      } catch (error) {
        //console.log(error);
        if(error instanceof DisabledDCP) {
          //buildDisabledDCPFile(this.targetDir+"/"+station, error.message);
          console.error(`Could not retrieve data for station with code: ${error.message}`);
        }
      }
    }

    return outputDCP;
  }
}

module.exports.Cemaden = Cemaden;