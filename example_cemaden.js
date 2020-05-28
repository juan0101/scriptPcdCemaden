const Cemaden = require('./Cemaden').Cemaden;
const config = require('./config.json');

// Create Cemaden provider
const cemaden = new Cemaden(config);

// Retrieve Data and store in config.dataDir
cemaden.getData()
  .then(dcps => {
    console.log(`Done. Saved ${dcps.length} DCPs in ${config.dataDir}`);
    process.exit(0);
  })
  .catch(err => {
    console.error(`Got error while retrieving DCPS. ${err.toString()}`);
    process.exit(1);
  });
