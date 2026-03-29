const fs = require('fs');
const file = 'client/src/components/RealTimeRiderMap.tsx';
let content = fs.readFileSync(file, 'utf8');

const target1 = `    setMapboxRetryNonce((prev) => prev + 1);\n  }, [preferOpenSourceMap, mapboxInitFailed]);`;
const target2 = `    setMapboxRetryNonce((prev) => prev + 1);\r\n  }, [preferOpenSourceMap, mapboxInitFailed]);`;

const replacement = `    if (mapboxRetryNonce >= 3) {
      console.warn("Mapbox failed to load 3 times. Falling back to OpenSource map.");
      setPreferOpenSourceMap(true);
      return;
    }
    setMapboxRetryNonce((prev) => prev + 1);
  }, [preferOpenSourceMap, mapboxInitFailed, mapboxRetryNonce]);`;

if (content.includes(target1)) {
    content = content.replace(target1, replacement);
    fs.writeFileSync(file, content);
    console.log("Replaced target1");
} else if (content.includes(target2)) {
    content = content.replace(target2, replacement.replace(/\n/g, '\r\n'));
    fs.writeFileSync(file, content);
    console.log("Replaced target2");
} else {
    console.log("Target not found");
}
