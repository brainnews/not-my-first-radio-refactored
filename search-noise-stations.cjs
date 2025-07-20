const https = require('https');

// Radio Browser API base URLs 
const API_SERVERS = [
  'de1.api.radio-browser.info',
  'nl1.api.radio-browser.info',
  'at1.api.radio-browser.info'
];

function makeRequest(hostname, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'NotMyFirstRadio/2.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          resolve(parsedData);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.abort();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

async function searchStations(query, limit = 50) {
  for (const server of API_SERVERS) {
    try {
      console.log(`Searching for "${query}" on ${server}...`);
      const path = `/json/stations/search?name=${encodeURIComponent(query)}&limit=${limit}&order=votes&reverse=true`;
      const stations = await makeRequest(server, path);
      console.log(`Found ${stations.length} stations for "${query}"`);
      return stations;
    } catch (error) {
      console.log(`Failed to search on ${server}:`, error.message);
      continue;
    }
  }
  throw new Error('All servers failed');
}

async function searchByTag(tag, limit = 50) {
  for (const server of API_SERVERS) {
    try {
      console.log(`Searching by tag "${tag}" on ${server}...`);
      const path = `/json/stations/bytag/${encodeURIComponent(tag)}?limit=${limit}&order=votes&reverse=true`;
      const stations = await makeRequest(server, path);
      console.log(`Found ${stations.length} stations for tag "${tag}"`);
      return stations;
    } catch (error) {
      console.log(`Failed to search by tag on ${server}:`, error.message);
      continue;
    }
  }
  throw new Error('All servers failed');
}

async function findNoiseStations() {
  const searches = [
    { type: 'name', query: 'ambient' },
    { type: 'name', query: 'white noise' },
    { type: 'name', query: 'brown noise' },
    { type: 'name', query: 'nature sounds' },
    { type: 'name', query: 'relaxation' },
    { type: 'tag', query: 'ambient' },
    { type: 'tag', query: 'chillout' },
    { type: 'tag', query: 'meditation' },
    { type: 'tag', query: 'relaxation' }
  ];

  const allStations = [];
  const seenStations = new Set();

  for (const search of searches) {
    try {
      let stations;
      if (search.type === 'name') {
        stations = await searchStations(search.query, 30);
      } else {
        stations = await searchByTag(search.query, 30);
      }

      // Filter and deduplicate stations
      stations.forEach(station => {
        if (!seenStations.has(station.stationuuid) && 
            station.votes > 5 && 
            station.bitrate > 0 &&
            station.url && 
            station.name) {
          seenStations.add(station.stationuuid);
          allStations.push(station);
        }
      });
    } catch (error) {
      console.log(`Search failed for ${search.query}:`, error.message);
    }
  }

  // Sort by votes (descending) and take top stations
  allStations.sort((a, b) => (b.votes || 0) - (a.votes || 0));
  
  console.log(`\nFound ${allStations.length} unique noise/ambient stations`);
  console.log('\nTop stations by votes:');
  
  allStations.slice(0, 15).forEach((station, i) => {
    console.log(`${i + 1}. ${station.name} (${station.votes} votes, ${station.bitrate}kbps)`);
    console.log(`   ${station.tags || 'No tags'}`);
    console.log(`   ${station.country || 'Unknown country'} - ${station.url.substring(0, 60)}...`);
    console.log('');
  });

  return allStations.slice(0, 6); // Return top 6 for starter pack
}

// Run the search
findNoiseStations()
  .then(topStations => {
    console.log('\n=== TOP 6 STATIONS FOR NOISE STARTER PACK ===');
    const starterPack = {
      stations: topStations.map(station => ({
        name: station.name,
        tags: station.tags || 'ambient,relaxation',
        url: station.url,
        stationuuid: station.stationuuid,
        bitrate: station.bitrate || 128,
        countrycode: station.countrycode || station.country || 'Unknown',
        favicon: station.favicon || '',
        homepage: station.homepage || '',
        votes: station.votes || 0,
        note: `Perfect for relaxation and focus`
      })),
      version: '1.0',
      username: 'Claude',
      description: 'Ambient, white noise, and relaxation stations for focus and sleep.',
      thumbnail_path: './starter-packs/noise-thumb.png'
    };

    console.log('\nStarter pack preview:');
    starterPack.stations.forEach((station, i) => {
      console.log(`${i + 1}. ${station.name} (${station.votes} votes)`);
    });

    console.log('\n=== JSON OUTPUT ===');
    console.log(JSON.stringify(starterPack, null, 2));
  })
  .catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });