export type LocationMapMode = 'static' | 'picker' | 'interactive'

export function buildLocationMapHtml(
  latitude: number,
  longitude: number,
  mode: LocationMapMode,
  zoom = 16,
): string {
  const lat = latitude.toFixed(6)
  const lon = longitude.toFixed(6)
  const picker = mode === 'picker'
  const interactive = mode === 'interactive' || picker

  const markerBlock =
    mode === 'interactive' || mode === 'static'
      ? `L.marker([${lat}, ${lon}], { icon: icon }).addTo(map);`
      : ''

  const pickerBlock = picker
    ? `
    function postCenter() {
      var c = map.getCenter();
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'center',
        lat: c.lat,
        lng: c.lng
      }));
    }
    map.on('moveend', postCenter);
    map.whenReady(postCenter);
  `
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #e8ecef; }
    .leaflet-control-attribution { font-size: 8px; opacity: 0.6; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: ${interactive ? 'true' : 'false'},
      dragging: ${interactive ? 'true' : 'false'},
      touchZoom: ${interactive ? 'true' : 'false'},
      scrollWheelZoom: false,
      doubleClickZoom: ${interactive ? 'true' : 'false'},
      boxZoom: false,
      keyboard: false,
      tap: ${interactive ? 'true' : 'false'},
      attributionControl: true
    }).setView([${lat}, ${lon}], ${zoom});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    var icon = L.divIcon({
      className: '',
      html: '<div style="width:22px;height:22px;margin-left:-11px;margin-top:-22px;background:#00A884;border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 22]
    });
    ${markerBlock}
    ${pickerBlock}
  </script>
</body>
</html>`
}
