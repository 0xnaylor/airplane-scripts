const { MongoClient } = require("mongodb");
const CoinGecko = require('coingecko-api');
require('dotenv').config()

const URL = process.env.MONGODB_CONNECTION;
const client = new MongoClient(URL);
const CoinGeckoClient = new CoinGecko();
let ethereumPriceData = []

export default async function(params) {
  try {
    const coinIds = [ "yield-guild-games", "alethea-artificial-liquid-intelligence-token",
    "immutable-x", "rainbow-token-2", "superfarm", "matic-network", "sipher", "blackpool-token", "apecoin"]
  
    await client.connect()
    const db = client.db("historical_price_data")
  
    const startDate = 1609462800 // Jan 1st 2021
    const endDate = Date.now() / 1000
  
    // First pull ethereum prices
    await createPosition("ethereum", db, startDate, endDate)
  
    for (let i = 0; i < coinIds.length; i++) {
      await createPosition(coinIds[i], db, startDate, endDate)
    }
  } catch (e) {
      console.log(e)
      throw e
  } finally{
    await client.close()
    console.log("Disconnected")
  }
}

function calculateEthPrice(tokenElement) {
  const timestamp = tokenElement[0]
  const ethElement = ethereumPriceData.find(x => x.time == timestamp)
  return tokenElement[1] / ethElement.usd_value
}

async function createPosition(_coinName, _db, _startDate, _endDate) {
  
  console.log(`Pulling price data for: ${_coinName}`)
  const col = _db.collection(_coinName);
  const data = await CoinGeckoClient.coins.fetchMarketChartRange(_coinName, { from: _startDate, to: _endDate })
  const priceDataArray = data.data.prices
  const mappedPriceDataArray = priceDataArray.map((element, index, array) => {

    console.log(JSON.stringify(element))

      let usdIndexedValue
      let ethIndexedValue
      let currentValue = element[1]
      let firstUsdValue = array[0][1]
      let firstEthValue = calculateEthPrice(array[0])
      const eth_value = (_coinName == "ethereum") ? 1 : calculateEthPrice(element)

      // calculate indexed USD value 
      if (index < 1) {
          usdIndexedValue = 100
          ethIndexedValue = 100
      } else {
          usdIndexedValue = 100 * ( currentValue / firstUsdValue)
          ethIndexedValue = 100 * ( currentValue / firstEthValue)
      } 

      

      return {
          "time" : element[0],
          "usd_value" : parseFloat(element[1]),
          "indexed_usd_value": usdIndexedValue,
          "eth_value" : eth_value,
          "indexed_eth_value": ethIndexedValue,
      }
  })

  if (_coinName == "ethereum") {
      ethereumPriceData = [...mappedPriceDataArray]
  }
  
  col.createIndex( { "time": 1 }, { unique: true } )
  const docsToWrite = await writeDocs(mappedPriceDataArray, col, _coinName)
  if (docsToWrite.length) {
      await col.insertMany(docsToWrite, { ordered : false});
  }
}

async function writeDocs(mappedData, col) {   
  const docsToAdd = [];
  for (const x of mappedData){
      const count = await col.countDocuments( { time: x.time })
      if(!count) {
          docsToAdd.push(x);
          console.log(`Adding price data for: ${(new Date(x.time)).toLocaleString()}`)
      }
  }
  return docsToAdd
}