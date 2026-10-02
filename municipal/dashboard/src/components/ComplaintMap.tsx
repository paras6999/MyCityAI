import 'leaflet/dist/leaflet.css'

import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet'

/** Small OpenStreetMap view with a marker at the complaint location. */
export function ComplaintMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={16}
      scrollWheelZoom={false}
      className="h-56 w-full rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {/* CircleMarker avoids Leaflet's default icon images, which break in bundlers. */}
      <CircleMarker
        center={[lat, lng]}
        radius={10}
        pathOptions={{ color: '#1d4ed8', fillColor: '#1d4ed8', fillOpacity: 0.35, weight: 2 }}
      />
    </MapContainer>
  )
}
