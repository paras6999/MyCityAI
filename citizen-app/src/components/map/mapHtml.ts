// Leaflet (the same map library the municipal dashboard uses) rendered from an HTML string.
// The same page runs in an <iframe> on web and in a WebView on phones, so there is one map
// implementation. It talks to React through postMessage: { type: 'pick', lat, lng } out,
// window.setState({...}) in.

export interface MapMarker { lat: number; lng: number; label?: string }
export interface MapState {
  center: { lat: number; lng: number } | null
  pin: { lat: number; lng: number } | null
  others: MapMarker[]
  editable: boolean
}

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'

export function buildMapHtml(initial: MapState): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="${LEAFLET_CSS}">
<style>html,body,#map{height:100%;margin:0;background:#EEF2F7}
.pin{width:30px;height:30px;border-radius:50% 50% 50% 0;background:#1D4ED8;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)}
.pin::after{content:"";position:absolute;left:8px;top:8px;width:8px;height:8px;border-radius:50%;background:#fff}
.dot{width:14px;height:14px;border-radius:50%;background:#B45309;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)}
.leaflet-control-attribution{font-size:9px}</style></head>
<body><div id="map"></div>
<script src="${LEAFLET_JS}"></script>
<script>
var map=L.map('map',{zoomControl:true,attributionControl:true}).setView([20.59,78.96],4);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
var pinIcon=L.divIcon({className:'',html:'<div class="pin"></div>',iconSize:[30,30],iconAnchor:[15,30]});
var dotIcon=L.divIcon({className:'',html:'<div class="dot"></div>',iconSize:[14,14],iconAnchor:[7,7]});
var pin=null,othersLayer=L.layerGroup().addTo(map),editable=false,centered=false;
function post(m){var s=JSON.stringify(m);
 if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(s)}else if(window.parent!==window){window.parent.postMessage(s,'*')}}
function emit(ll){post({type:'pick',lat:ll.lat,lng:ll.lng})}
function place(p){
 if(!p){if(pin){map.removeLayer(pin);pin=null}return}
 if(!pin){pin=L.marker([p.lat,p.lng],{icon:pinIcon,draggable:editable}).addTo(map);
  pin.on('dragend',function(){emit(pin.getLatLng())})}
 else{pin.setLatLng([p.lat,p.lng]);if(pin.dragging){editable?pin.dragging.enable():pin.dragging.disable()}}}
window.setState=function(s){
 editable=!!s.editable;place(s.pin);othersLayer.clearLayers();
 (s.others||[]).forEach(function(o){var m=L.marker([o.lat,o.lng],{icon:dotIcon}).addTo(othersLayer);if(o.label)m.bindTooltip(o.label)});
 var c=s.pin||s.center;
 if(c){if(!centered){map.setView([c.lat,c.lng],17);centered=true}else if(!map.getBounds().contains([c.lat,c.lng])){map.panTo([c.lat,c.lng])}}};
map.on('click',function(e){if(editable){emit(e.latlng)}});
window.addEventListener('message',function(e){try{var d=typeof e.data==='string'?JSON.parse(e.data):e.data;if(d&&d.type==='state')window.setState(d.state)}catch(_){}});
window.setState(${JSON.stringify(initial)});
post({type:'ready'});
</script></body></html>`
}
