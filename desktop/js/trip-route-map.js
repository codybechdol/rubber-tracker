/**
 * trip-route-map.js - Interactive Google Maps-Style Route Scheduler & Live GPS Tracking
 * 
 * Features:
 * - Google Maps-style road & satellite views with Leaflet.js
 * - Live GPS "Follow Me" vehicle tracking (pulsing blue location dot, accuracy radius, heading)
 * - Real-time distance and drive time readout to the next scheduled stop
 * - Proximity arrival detection (<0.5 mi) with quick check-in
 * - Daily itinerary sequence (Helena HQ -> Stops -> Return to Helena)
 * - Stops checklist: equipment swaps, crew trainings, drug tests, vehicle unit numbers
 * - All-Week Route Overview with color-coded daily loops
 * - 1-Click "Open in Google Maps" turn-by-turn voice navigation export
 */

/* global L */

class TripRouteMap {
  constructor(db, tripPlanner) {
    this.db = db;
    this.tripPlanner = tripPlanner;
    this.map = null;
    this.currentTileLayer = null;
    this.activeLayerType = 'streets'; // 'streets' or 'satellite'
    this.activeMode = 'single-day'; // 'single-day' or 'all-week'
    this.activeDateKey = null;
    this.activeWeekMonday = null;
    this.routeMarkers = [];
    this.routePolylines = [];
    this.gpsWatchId = null;
    this.userPosition = null;
    this.userMarker = null;
    this.accuracyCircle = null;
    this.followMe = false;
    this.isTracking = false;
    this.mapViewMode = 'google-maps'; // 'google-maps' (default embedded) or 'gps-tracker'
    this.customStopOrder = {};
    this.roadGeometryCache = {};
    this.lastRoutedOrigin = null;

    // Standard Montana Hubs, Substations, and Service Bases with verified GPS coordinates
    this.montanaCoordinates = {
      'helena': { name: 'Helena', lat: 46.5958, lng: -112.0270, type: 'HQ Base' },
      'belgrade': { name: 'Belgrade', lat: 45.7760, lng: -111.1764, type: 'Service Dock' },
      'belgrade dock': { name: 'Belgrade Dock', lat: 45.7760, lng: -111.1764, type: 'Service Dock' },
      'bozeman': { name: 'Bozeman', lat: 45.6770, lng: -111.0429, type: 'Town Center' },
      'great falls': { name: 'Great Falls', lat: 47.5053, lng: -111.3008, type: 'Division Base' },
      'butte': { name: 'Butte', lat: 46.0038, lng: -112.5348, type: 'Division Base' },
      'missoula': { name: 'Missoula', lat: 46.8721, lng: -113.9940, type: 'Division Base' },
      'billings': { name: 'Billings', lat: 45.7833, lng: -108.5007, type: 'Division Base' },
      'big sky': { name: 'Big Sky', lat: 45.2638, lng: -111.3033, type: 'Service Area' },
      'hamilton': { name: 'Hamilton', lat: 46.2471, lng: -114.1557, type: 'Service Dock' },
      'darby': { name: 'Darby', lat: 45.9755, lng: -114.1782, type: 'Field Site' },
      'livingston': { name: 'Livingston', lat: 45.6624, lng: -110.5613, type: 'Town Center' },
      'three forks': { name: 'Three Forks', lat: 45.8927, lng: -111.5519, type: 'Town Center' },
      'three rivers sub': { name: 'Three Rivers Sub', lat: 45.8927, lng: -111.5519, type: 'Substation' },
      'townsend': { name: 'Townsend', lat: 46.3208, lng: -111.5175, type: 'Field Site' },
      'montana city': { name: 'Montana City', lat: 46.5372, lng: -111.9286, type: 'Service Area' },
      'east helena': { name: 'East Helena', lat: 46.5911, lng: -111.9161, type: 'Service Dock' },
      'clancy': { name: 'Clancy', lat: 46.4644, lng: -111.9861, type: 'Town Center' },
      'jefferson city': { name: 'Jefferson City', lat: 46.3983, lng: -112.0233, type: 'Town Center' },
      'boulder': { name: 'Boulder', lat: 46.2372, lng: -112.1197, type: 'Town Center' },
      'whitehall': { name: 'Whitehall', lat: 45.8708, lng: -112.0975, type: 'Town Center' },
      'anaconda': { name: 'Anaconda', lat: 46.1285, lng: -112.9423, type: 'Town Center' },
      'anaconda city sub': { name: 'Anaconda City Sub', lat: 46.1285, lng: -112.9423, type: 'Substation' },
      'ennis': { name: 'Ennis', lat: 45.3491, lng: -111.7297, type: 'Field Site' },
      'melville': { name: 'Melville', lat: 46.0355, lng: -110.0468, type: 'Field Site' },
      'laurel': { name: 'Laurel', lat: 45.6708, lng: -108.7724, type: 'Service Dock' },
      'kalispell': { name: 'Kalispell', lat: 48.1958, lng: -114.3129, type: 'Division Base' },
      'miles city': { name: 'Miles City', lat: 46.4083, lng: -105.8406, type: 'Service Dock' },
      'glendive': { name: 'Glendive', lat: 47.1053, lng: -104.7125, type: 'Field Site' },
      'sidney': { name: 'Sidney', lat: 47.7169, lng: -104.1561, type: 'Service Dock' },
      'havre': { name: 'Havre', lat: 48.5500, lng: -109.6841, type: 'Division Base' },
      'elliston': { name: 'Elliston', lat: 46.5647, lng: -112.4289, type: 'Town Center' },
      'deer lodge': { name: 'Deer Lodge', lat: 46.3958, lng: -112.7303, type: 'Town Center' },
      'manhattan': { name: 'Manhattan', lat: 45.8588, lng: -111.3314, type: 'Town Center' },
      'glen': { name: 'Glen', lat: 45.4744, lng: -112.6844, type: 'Field Site' },
      'raynesford': { name: 'Raynesford', lat: 47.2880, lng: -110.7410, type: 'Substation' },
      'raynesford sub': { name: 'Raynesford Sub', lat: 47.2880, lng: -110.7410, type: 'Substation' },
      'dillon': { name: 'Dillon', lat: 45.2163, lng: -112.6372, type: 'Town Center' },
      'lolo': { name: 'Lolo', lat: 46.7588, lng: -114.0798, type: 'Town Center' },
      'stanford': { name: 'Stanford', lat: 47.1530, lng: -110.2177, type: 'Town Center' },
      'post falls': { name: 'Post Falls', lat: 47.7121, lng: -116.9496, type: 'Service Dock' },
      'northern lights': { name: 'Northern Lights (Sandpoint)', lat: 48.2766, lng: -116.5532, type: 'Service Dock' },
      'whitefish': { name: 'Whitefish', lat: 48.4111, lng: -114.3376, type: 'Town Center' },
      'lewistown': { name: 'Lewistown', lat: 47.0625, lng: -109.4282, type: 'Division Base' },
      'polson': { name: 'Polson', lat: 47.6936, lng: -114.1632, type: 'Town Center' },
      'cut bank': { name: 'Cut Bank', lat: 48.6328, lng: -112.3261, type: 'Town Center' },
      'shelby': { name: 'Shelby', lat: 48.5050, lng: -111.8569, type: 'Town Center' },
      'conrad': { name: 'Conrad', lat: 48.1703, lng: -111.9458, type: 'Town Center' },
      'choteau': { name: 'Choteau', lat: 47.8116, lng: -112.1822, type: 'Town Center' },
      'columbus': { name: 'Columbus', lat: 45.6369, lng: -109.2504, type: 'Town Center' },
      'red lodge': { name: 'Red Lodge', lat: 45.1858, lng: -109.2468, type: 'Town Center' },
      'big timber': { name: 'Big Timber', lat: 45.8344, lng: -109.9546, type: 'Town Center' },
      'roundup': { name: 'Roundup', lat: 46.4464, lng: -108.5418, type: 'Town Center' },
      'hardin': { name: 'Hardin', lat: 45.7311, lng: -107.6115, type: 'Town Center' },
      'baker': { name: 'Baker', lat: 46.3683, lng: -104.2830, type: 'Town Center' },
      'glasgow': { name: 'Glasgow', lat: 48.1969, lng: -106.6353, type: 'Town Center' },
      'wolf point': { name: 'Wolf Point', lat: 48.0903, lng: -105.6417, type: 'Town Center' }
    };

    // Week day color themes for multi-day route loops
    this.dayColors = {
      0: { name: 'Monday', hex: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6' },
      1: { name: 'Tuesday', hex: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981' },
      2: { name: 'Wednesday', hex: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b' },
      3: { name: 'Thursday', hex: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', border: '#a855f7' },
      4: { name: 'Friday', hex: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', border: '#ec4899' }
    };
  }

  /**
   * Initializes the Route Map system.
   */
  init() {
    this.setDefaultDate();
  }

  /**
   * Sets default date based on TripPlanner's current week/date.
   */
  setDefaultDate() {
    if (this.tripPlanner && this.tripPlanner.currentDate) {
      const mon = this.tripPlanner.getMondayForDate(this.tripPlanner.currentDate);
      this.activeWeekMonday = mon;
      // Default to current date key or Monday of active week
      const todayKey = this.formatDateToKey(new Date());
      const weekDays = this.tripPlanner.getDaysForWeek(mon, this.tripPlanner.activeSchedule || 'Mon-Thu');
      const hasToday = weekDays.some(d => d.dateKey === todayKey);
      this.activeDateKey = hasToday ? todayKey : (weekDays[0] ? weekDays[0].dateKey : todayKey);
    } else {
      const now = new Date();
      this.activeDateKey = this.formatDateToKey(now);
    }
  }

  formatDateToKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  parseDateKey(dateKey) {
    if (!dateKey) return new Date();
    const parts = dateKey.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
  }

  getMondayForDate(date) {
    if (this.tripPlanner && typeof this.tripPlanner.getMondayForDate === 'function') {
      return this.tripPlanner.getMondayForDate(date);
    }
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  /**
   * Resolves location name to GPS coordinates.
   */
  getCoords(locationName) {
    if (!locationName) return this.montanaCoordinates['helena'];
    const clean = String(locationName).trim().toLowerCase()
      .replace(/\s*\([^)]*\)/g, '') // remove parentheses like (Dock)
      .trim();

    if (this.montanaCoordinates[clean]) {
      return this.montanaCoordinates[clean];
    }

    // Partial match search
    const keys = Object.keys(this.montanaCoordinates);
    for (const k of keys) {
      if (clean.includes(k) || k.includes(clean)) {
        return this.montanaCoordinates[k];
      }
    }

    // Default fallback to Helena HQ
    return { name: locationName, lat: 46.5958, lng: -112.0270, type: 'Field Location' };
  }

  /**
   * Computes Haversine distance in miles between two coordinates.
   */
  calculateDistanceMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Radius of Earth in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round((R * c) * 10) / 10;
  }

  /**
   * Estimates highway drive time given distance in miles.
   */
  estimateDriveTime(miles) {
    if (miles <= 0) return '0m';
    // Assume average 58 mph highway travel including turns
    const minutes = Math.round((miles / 58) * 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    return `${h}h ${m < 10 ? '0' : ''}${m}m`;
  }

  /**
   * Initializes Leaflet Map instance with Google Maps-style tiles.
   */
  ensureMap() {
    const container = document.getElementById('trip-route-map');
    if (!container) return;

    if (!this.map && typeof L !== 'undefined') {
      // Default center: Helena, MT (state capital & HQ)
      this.map = L.map('trip-route-map', {
        center: [46.5958, -112.0270],
        zoom: 8,
        zoomControl: true,
        attributionControl: false
      });

      // Layer 1: Google Maps Standard Road Layer (Crisp highways, road shields, towns - No API Key / No Watermarks)
      this.streetsLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['0', '1', '2', '3']
      });

      // Layer 2: Google Maps Hybrid Satellite Layer (Satellite photography + roads & place names)
      this.satelliteLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['0', '1', '2', '3']
      });

      // Add default layer
      if (this.activeLayerType === 'satellite') {
        this.satelliteLayer.addTo(this.map);
        this.currentTileLayer = this.satelliteLayer;
      } else {
        this.streetsLayer.addTo(this.map);
        this.currentTileLayer = this.streetsLayer;
      }

      // Add custom Leaflet listeners
      this.map.on('dragstart', () => {
        // If user manually drags map, temporarily unlock "Follow Me" so user can explore
        if (this.followMe) {
          this.setFollowMe(false);
        }
      });
    }

    // Force map to recalculate container dimensions when rendered
    setTimeout(() => {
      if (this.map) this.map.invalidateSize();
    }, 100);
  }

  /**
   * Toggles map engine between Integrated Google Maps (Default) and GPS Tracker (Leaflet).
   */
  setMapMode(mode) {
    this.mapViewMode = mode || 'google-maps';
    const gmapsContainer = document.getElementById('google-maps-embed-container');
    const leafletContainer = document.getElementById('trip-route-map');
    const btnGmaps = document.getElementById('map-btn-mode-gmaps');
    const btnGps = document.getElementById('map-btn-mode-gps');
    const gpsControls = document.getElementById('gps-tracker-controls-group');

    if (this.mapViewMode === 'google-maps') {
      if (gmapsContainer) gmapsContainer.style.display = 'flex';
      if (leafletContainer) leafletContainer.style.display = 'none';
      if (btnGmaps) btnGmaps.classList.add('active');
      if (btnGps) btnGps.classList.remove('active');
      if (gpsControls) gpsControls.style.display = 'none';
      this.updateGoogleMapsEmbed();
    } else {
      if (gmapsContainer) gmapsContainer.style.display = 'none';
      if (leafletContainer) leafletContainer.style.display = 'block';
      if (btnGps) btnGps.classList.add('active');
      if (btnGmaps) btnGmaps.classList.remove('active');
      if (gpsControls) gpsControls.style.display = 'flex';
      this.ensureMap();
      this.renderMap();
      if (!this.isTracking) {
        this.startGpsTracking();
      }
      setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 60);
    }
  }

  /**
   * Reloads the active map view.
   */
  reloadCurrentMap() {
    if (this.mapViewMode === 'google-maps') {
      const iframe = document.getElementById('google-maps-embed-frame');
      if (iframe) {
        const currentSrc = iframe.src;
        iframe.src = '';
        setTimeout(() => { iframe.src = currentSrc; }, 50);
      }
    } else {
      if (this.map) {
        this.renderMap();
        this.fitRoute();
      }
    }
  }

  /**
   * Generates Google Maps Directions embed URL with origin, ordered waypoints, and return to Helena.
   */
  generateGoogleMapsEmbedUrl(routeData, layerType = 'streets') {
    const tParam = (layerType === 'satellite') ? 'k' : 'm';
    const origin = (this.userPosition && this.userPosition.lat && this.userPosition.lng)
      ? `${this.userPosition.lat},${this.userPosition.lng}`
      : 'Helena,+MT';
    const destination = 'Helena,+MT';

    if (!routeData || !routeData.stops || routeData.stops.length === 0) {
      return `https://maps.google.com/maps?q=Helena,+MT&t=${tParam}&z=9&output=embed`;
    }

    const waypoints = routeData.stops.map(s => {
      return encodeURIComponent(s.location + ', MT');
    });

    const daddr = waypoints.join('+to:') + '+to:' + destination;
    return `https://maps.google.com/maps?saddr=${origin}&daddr=${daddr}&t=${tParam}&output=embed`;
  }

  /**
   * Updates the embedded Google Maps iframe src with current day/week route.
   */
  updateGoogleMapsEmbed() {
    const iframe = document.getElementById('google-maps-embed-frame');
    if (!iframe) return;

    let routeData;
    if (this.activeMode === 'all-week') {
      const mon = this.activeWeekMonday || (this.tripPlanner ? this.tripPlanner.getMondayForDate(this.tripPlanner.currentDate) : new Date());
      const weekData = this.collectWeekData(mon);
      const allStops = [];
      weekData.forEach(d => {
        (d.stops || []).forEach(s => {
          if (!allStops.some(existing => existing.location.toLowerCase() === s.location.toLowerCase())) {
            allStops.push(s);
          }
        });
      });
      routeData = { stops: allStops };
    } else {
      routeData = this.collectRouteDataForDate(this.activeDateKey);
    }

    const newUrl = this.generateGoogleMapsEmbedUrl(routeData, this.activeLayerType);
    if (iframe.src !== newUrl) {
      iframe.src = newUrl;
    }
  }

  /**
   * Toggles between Streets and Satellite views.
   */
  setMapLayer(type) {
    this.activeLayerType = type;

    // Update buttons in UI
    const btnStreets = document.getElementById('map-btn-layer-streets');
    const btnSat = document.getElementById('map-btn-layer-sat');
    if (btnStreets && btnSat) {
      if (type === 'satellite') {
        btnSat.classList.add('active');
        btnStreets.classList.remove('active');
      } else {
        btnStreets.classList.add('active');
        btnSat.classList.remove('active');
      }
    }

    if (this.mapViewMode === 'google-maps') {
      this.updateGoogleMapsEmbed();
      return;
    }

    if (!this.map) return;

    if (type === 'satellite') {
      if (this.map.hasLayer(this.streetsLayer)) this.map.removeLayer(this.streetsLayer);
      this.satelliteLayer.addTo(this.map);
      this.currentTileLayer = this.satelliteLayer;
    } else {
      if (this.map.hasLayer(this.satelliteLayer)) this.map.removeLayer(this.satelliteLayer);
      this.streetsLayer.addTo(this.map);
      this.currentTileLayer = this.streetsLayer;
    }
  }

  /**
   * Starts or stops live GPS tracking.
   */
  toggleGpsTracking() {
    if (this.isTracking) {
      this.stopGpsTracking();
    } else {
      this.startGpsTracking();
    }
  }

  startGpsTracking() {
    this.isTracking = true;
    this.setFollowMe(true);
    this.updateGpsStatusUi(true, 'Acquiring GPS fix...');

    const btn = document.getElementById('map-btn-gps-toggle');
    if (btn) {
      btn.classList.add('active');
      btn.innerHTML = '<span>📡</span> Tracking On';
    }

    let hasReceivedPosition = false;

    // Fast fallback timer: if browser/laptop geolocation does not answer within 2.5s
    // (typical on Windows Electron where Chromium has no Google Location API keys),
    // immediately resolve via network IP so the user sees their Navigation Arrow right away!
    const fallbackTimer = setTimeout(async () => {
      if (!hasReceivedPosition && this.isTracking) {
        console.log('Browser geolocation delayed; retrieving fast network location for laptop...');
        const netPos = await this.fetchFastNetworkPosition();
        if (netPos && !hasReceivedPosition && this.isTracking) {
          hasReceivedPosition = true;
          this.onGpsPosition(netPos);
        } else if (!hasReceivedPosition && this.isTracking) {
          // Default to Montana City if network fails
          const mc = this.montanaCoordinates['montana city'];
          if (mc) {
            hasReceivedPosition = true;
            this.onGpsPosition({
              coords: { latitude: mc.lat, longitude: mc.lng, accuracy: 50, speed: 0, heading: null },
              isManualPreset: true
            });
          }
        }
      }
    }, 2500);

    if (navigator.geolocation) {
      const startWatch = (highAccuracy) => {
        return navigator.geolocation.watchPosition(
          (pos) => {
            hasReceivedPosition = true;
            clearTimeout(fallbackTimer);
            this.onGpsPosition(pos);
          },
          (err) => {
            console.warn(`GPS Watch (highAccuracy=${highAccuracy}) error:`, err.message);
            if (highAccuracy) {
              if (this.gpsWatchId !== null) navigator.geolocation.clearWatch(this.gpsWatchId);
              this.gpsWatchId = startWatch(false);
            } else if (!hasReceivedPosition) {
              this.fetchFastNetworkPosition().then(netPos => {
                if (netPos && !hasReceivedPosition) {
                  hasReceivedPosition = true;
                  this.onGpsPosition(netPos);
                }
              });
            }
          },
          {
            enableHighAccuracy: highAccuracy,
            timeout: highAccuracy ? 5000 : 12000,
            maximumAge: 10000
          }
        );
      };

      if (this.gpsWatchId !== null) navigator.geolocation.clearWatch(this.gpsWatchId);
      this.gpsWatchId = startWatch(true);
    }
  }

  async fetchFastNetworkPosition() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('http://ip-api.com/json/', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data && data.lat && data.lon) {
          return {
            coords: {
              latitude: data.lat,
              longitude: data.lon,
              accuracy: 1500,
              speed: 0,
              heading: null
            },
            isNetworkEstimated: true,
            city: data.city || 'Montana City / Helena Area'
          };
        }
      }
    } catch (e) {
      console.warn('Network location fallback error:', e);
    }
    return null;
  }

  setLocationToMontanaCity() {
    const mc = this.montanaCoordinates['montana city'];
    if (mc) {
      this.onGpsPosition({
        coords: {
          latitude: mc.lat,
          longitude: mc.lng,
          accuracy: 25,
          speed: 0,
          heading: null
        },
        isManualPreset: true
      });
      if (this.map) {
        this.map.setView([mc.lat, mc.lng], 13, { animate: true });
      }
    }
  }

  calculateHeadingToNextStop(lat, lng) {
    const routeData = this.collectRouteDataForDate(this.activeDateKey);
    if (routeData && routeData.stops && routeData.stops.length > 0) {
      const nextStop = routeData.stops[0];
      if (nextStop && nextStop.coords) {
        return this.calculateBearing(lat, lng, nextStop.coords.lat, nextStop.coords.lng);
      }
    }
    return 0; // Default North
  }

  calculateBearing(lat1, lng1, lat2, lng2) {
    const toRad = deg => deg * (Math.PI / 180);
    const toDeg = rad => rad * (180 / Math.PI);
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const deltaLambda = toRad(lng2 - lng1);
    const y = Math.sin(deltaLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
    const theta = Math.atan2(y, x);
    return Math.round((toDeg(theta) + 360) % 360);
  }

  getCompassDirection(deg) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  }

  stopGpsTracking() {
    if (this.gpsWatchId !== null) {
      navigator.geolocation.clearWatch(this.gpsWatchId);
      this.gpsWatchId = null;
    }
    this.isTracking = false;
    this.setFollowMe(false);
    this.updateGpsStatusUi(false, 'GPS Standby');

    const btn = document.getElementById('map-btn-gps-toggle');
    if (btn) {
      btn.classList.remove('active');
      btn.innerHTML = '<span>📡</span> Live GPS';
    }

    if (this.userMarker && this.map) {
      this.map.removeLayer(this.userMarker);
      this.userMarker = null;
    }
    if (this.accuracyCircle && this.map) {
      this.map.removeLayer(this.accuracyCircle);
      this.accuracyCircle = null;
    }
  }

  /**
   * Handles incoming real-time GPS position update.
   */
  onGpsPosition(pos) {
    if (!pos || !pos.coords) return;
    const { latitude, longitude, accuracy, speed, heading } = pos.coords;
    this.userPosition = { lat: latitude, lng: longitude, accuracy, speed, heading, timestamp: new Date() };

    const angle = (heading !== null && heading !== undefined) ? Math.round(heading) : this.calculateHeadingToNextStop(latitude, longitude);
    const compassDir = this.getCompassDirection(angle);

    const accLabel = accuracy > 120 ? `Wi-Fi Est. (±${Math.round(accuracy)}m)` : `Active (±${Math.round(accuracy)}m)`;
    this.updateGpsStatusUi(true, accLabel);

    if (!this.map) return;

    const latLng = [latitude, longitude];

    // Create or update real-time Navigation Arrow marker
    if (!this.userMarker) {
      const userIcon = L.divIcon({
        className: 'gps-nav-marker-wrapper',
        html: `
          <div class="gps-nav-arrow-container">
            <div class="gps-nav-pulse"></div>
            <div class="gps-nav-beam" id="gps-nav-beam" style="transform: rotate(${angle}deg);"></div>
            <div class="gps-nav-arrow-icon" id="gps-nav-arrow-icon" style="transform: rotate(${angle}deg);">
              <svg viewBox="0 0 24 24" class="gps-nav-svg-arrow">
                <path d="M12 2L4 21L12 17L20 21L12 2Z" fill="#2563eb" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>
        `,
        iconSize: [48, 48],
        iconAnchor: [24, 24]
      });

      this.userMarker = L.marker(latLng, { icon: userIcon, zIndexOffset: 2000 }).addTo(this.map);
    } else {
      this.userMarker.setLatLng(latLng);
      const iconEl = document.getElementById('gps-nav-arrow-icon');
      const beamEl = document.getElementById('gps-nav-beam');
      if (iconEl) iconEl.style.transform = `rotate(${angle}deg)`;
      if (beamEl) beamEl.style.transform = `rotate(${angle}deg)`;
    }

    this.userMarker.bindPopup(`
      <div style="font-size: 12px; font-weight: 700; color: #1e293b; padding: 2px;">
        🧭 Your Location (Live Navigation Arrow)<br>
        <span style="font-size: 11px; font-weight: 400; color: #64748b;">
          Heading: <b>${angle}° (${compassDir})</b><br>
          Speed: ${speed ? Math.round(speed * 2.23694) + ' mph' : 'Stationary'}<br>
          Accuracy: ±${Math.round(accuracy)} meters<br>
          ${accuracy > 100 ? '<span style="color:#d97706;">⚠️ Estimated on laptop. Phones/tablets give 10ft satellite GPS.</span><br>' : ''}
        </span>
        <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #e2e8f0; display: flex; gap: 4px;">
          <button onclick="window.tripRouteMap.setLocationToMontanaCity()" style="background: #2563eb; color: white; border: none; padding: 3px 8px; border-radius: 4px; font-size: 10.5px; cursor: pointer; font-weight: 600;">
            📍 In Montana City? Snap Here
          </button>
        </div>
      </div>
    `);

    // Create or update accuracy ring
    if (!this.accuracyCircle) {
      this.accuracyCircle = L.circle(latLng, {
        radius: Math.max(accuracy, 25),
        color: '#3b82f6',
        weight: 1,
        fillColor: '#3b82f6',
        fillOpacity: 0.12
      }).addTo(this.map);
    } else {
      this.accuracyCircle.setLatLng(latLng);
      this.accuracyCircle.setRadius(Math.max(accuracy, 25));
    }

    // Auto-center if "Follow Me" is enabled
    if (this.followMe) {
      this.map.panTo(latLng, { animate: true, duration: 0.8 });
    }

    // Update real-time distance and ETA to next scheduled stop
    this.updateLiveNextStopHud();

    // Re-plan route if user position shifts or on first fix so route connects to current location
    const prevOrigin = this.lastRoutedOrigin;
    const distFromPrev = prevOrigin ? this.calculateDistance(latitude, longitude, prevOrigin[0], prevOrigin[1]) : 999;
    if (distFromPrev > 0.2) {
      this.lastRoutedOrigin = [latitude, longitude];
      if (this.activeMode === 'single-day') {
        this.renderMap();
        this.renderItinerarySidebar();
      }
    }
  }

  toggleFollowMe() {
    this.setFollowMe(!this.followMe);
    if (this.followMe && this.userPosition && this.map) {
      this.map.setView([this.userPosition.lat, this.userPosition.lng], 12);
    }
  }

  setFollowMe(val) {
    this.followMe = !!val;
    const btn = document.getElementById('map-btn-follow-me');
    if (btn) {
      if (this.followMe) {
        btn.classList.add('active');
        btn.innerHTML = '<span>🎯</span> Following Me';
      } else {
        btn.classList.remove('active');
        btn.innerHTML = '<span>🎯</span> Follow Me';
      }
    }
  }

  recenterOnUser() {
    if (this.userPosition && this.map) {
      this.setFollowMe(true);
      this.map.setView([this.userPosition.lat, this.userPosition.lng], 13, { animate: true });
    } else {
      this.startGpsTracking();
    }
  }

  updateGpsStatusUi(isActive, message) {
    const badge = document.getElementById('route-map-gps-badge');
    const text = document.getElementById('route-map-gps-text');
    const dot = document.getElementById('route-map-gps-dot');
    if (badge && text) {
      text.textContent = message;
      if (isActive) {
        dot.style.background = '#10b981';
        dot.style.boxShadow = '0 0 8px #10b981';
      } else {
        dot.style.background = '#94a3b8';
        dot.style.boxShadow = 'none';
      }
    }
  }

  /**
   * Recalculates distance and ETA from current GPS coordinates to the next stop.
   */
  updateLiveNextStopHud() {
    const hudEl = document.getElementById('route-map-next-stop-hud');
    if (!hudEl) return;

    if (!this.userPosition) {
      hudEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted); padding: 4px 0;">
          <span>🚗</span> <span>GPS active — tracking position along route...</span>
        </div>
      `;
      return;
    }

    const routeData = this.collectRouteDataForDate(this.activeDateKey);
    if (!routeData || routeData.stops.length === 0) {
      hudEl.innerHTML = `
        <div style="font-size: 11px; color: var(--text-muted); padding: 4px 0;">
          ⚪ No destinations scheduled for ${this.activeDateKey}
        </div>
      `;
      return;
    }

    // Find nearest stop or next stop in sequence
    let nearestStop = null;
    let minDistance = Infinity;

    routeData.stops.forEach((stop, idx) => {
      const dist = this.calculateDistanceMiles(
        this.userPosition.lat, this.userPosition.lng,
        stop.coords.lat, stop.coords.lng
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearestStop = { ...stop, distanceMiles: dist, index: idx + 1 };
      }
    });

    if (!nearestStop) return;

    const timeEstimate = this.estimateDriveTime(nearestStop.distanceMiles);

    // If within 0.5 miles: Arrived at stop!
    if (nearestStop.distanceMiles <= 0.5) {
      hudEl.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 6px; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 14px;">📍</span>
            <span style="font-size: 11.5px; font-weight: 800; color: #4ade80;">
              Arrived at Stop ${nearestStop.index}: ${nearestStop.location}
            </span>
          </div>
          <button class="btn btn-primary" style="padding: 2px 8px; font-size: 10.5px; background: #10b981; border: none;" onclick="window.tripRouteMap.quickCheckIn('${nearestStop.location}')">
            Check In
          </button>
        </div>
      `;
    } else {
      hudEl.innerHTML = `
        <div style="background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 13px;">🚗</span>
            <span style="font-size: 11.5px; color: #93c5fd; font-weight: 700;">
              En Route to Stop ${nearestStop.index}: <strong style="color: #fff;">${nearestStop.location}</strong>
            </span>
          </div>
          <span style="font-size: 11.5px; font-weight: 800; color: #facc15;">
            ${nearestStop.distanceMiles} mi (~${timeEstimate})
          </span>
        </div>
      `;
    }
  }

  quickCheckIn(locationName) {
    if (window.performGpsCheckIn) {
      window.performGpsCheckIn();
    } else {
      alert(`📍 Check-in recorded for ${locationName}!`);
    }
  }

  /**
   * Collects all route waypoints, tasks, swaps, and trainings for a single date.
   * Recognizes scheduled trips, manual tasks with field destinations (e.g. Billings Rubber Run),
   * and drug testing clinic appointments.
   */
  collectRouteDataForDate(dateKey) {
    if (!this.tripPlanner) return null;

    const trips = this.tripPlanner.getTripsForDate(dateKey);
    const drugTests = this.tripPlanner.getDrugTestsForDate(dateKey);
    const manualTasks = this.tripPlanner.getManualTasksForDate(dateKey);
    const isHoliday = this.tripPlanner.isDayHoliday(dateKey);
    const holidayName = this.tripPlanner.getHolidayName(dateKey);

    // Picked equipment swaps
    const pickedData = this.tripPlanner.getPickedSwapsData();
    const allPicked = (pickedData && pickedData.items) ? pickedData.items : [];
    const scheduledSwaps = this.tripPlanner.scheduledSwaps || {};

    // Base origin: Helena HQ
    const hq = this.montanaCoordinates['helena'];
    const stops = [];

    // 1. Gather all stop locations for this date
    const stopLocationItems = [];

    // Trips from Schedule Board
    trips.forEach(t => {
      const loc = String(t.location || '').trim();
      if (loc && !stopLocationItems.some(item => item.location.toLowerCase() === loc.toLowerCase())) {
        stopLocationItems.push({
          location: loc,
          source: 'trip',
          crewId: t.crew || ''
        });
      }
    });

    // Additional field locations from Manual Tasks (e.g. JM - Rubber Pick-Up/Drop-Off in Billings)
    manualTasks.forEach(m => {
      const loc = String(m.location || '').trim();
      if (!loc) return;
      const lCase = loc.toLowerCase();
      // Exclude Helena office/base since that is origin/destination
      if (lCase === 'helena' || lCase === 'helena office' || lCase === 'helena base' || lCase === 'office' || lCase.includes('office')) {
        return;
      }
      if (!stopLocationItems.some(item => item.location.toLowerCase() === lCase)) {
        stopLocationItems.push({
          location: loc,
          source: 'manual_task',
          crewId: m.crewId || ''
        });
      }
    });

    // Additional field locations from Drug Tests
    drugTests.forEach(d => {
      const loc = String(d.clinicCity || d.city || d.location || '').trim();
      if (!loc) return;
      const lCase = loc.toLowerCase();
      if (lCase === 'helena' || lCase === 'helena office' || lCase === 'helena base' || lCase === 'office') {
        return;
      }
      if (!stopLocationItems.some(item => item.location.toLowerCase() === lCase)) {
        stopLocationItems.push({
          location: loc,
          source: 'drug_test',
          crewId: ''
        });
      }
    });

    // Apply custom order if saved by user for this date
    if (this.customStopOrder && Array.isArray(this.customStopOrder[dateKey])) {
      const customOrder = this.customStopOrder[dateKey];
      stopLocationItems.sort((a, b) => {
        const idxA = customOrder.indexOf(a.location);
        const idxB = customOrder.indexOf(b.location);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return 0;
      });
    }

    // Map to stop objects
    stopLocationItems.forEach((item) => {
      const locName = item.location;
      const coords = this.getCoords(locName);

      // Swaps matching this location
      const locSwaps = allPicked.filter(sItem => {
        const sKey = this.tripPlanner.getSwapKey(sItem);
        const sched = scheduledSwaps[sKey];
        if (sched && sched.dateKey === dateKey) return true;
        return (sItem.location || '').toLowerCase() === locName.toLowerCase();
      });

      // Drug tests matching this location
      const locDrugTests = drugTests.filter(d => 
        (d.clinicCity || d.city || '').toLowerCase() === locName.toLowerCase() ||
        (d.location || '').toLowerCase() === locName.toLowerCase()
      );

      // Manual tasks matching this location
      const locManualTasks = manualTasks.filter(m => {
        const mLoc = (m.location || '').toLowerCase();
        return mLoc.includes(locName.toLowerCase()) || locName.toLowerCase().includes(mLoc);
      });

      // Crews in this location
      const crews = [];
      const jobTable = this.db.getTable('job_tracking') || this.db.getTable('Job Tracking');
      if (jobTable && jobTable.rows) {
        jobTable.rows.forEach(r => {
          const rLoc = String(r['Location'] || '').trim().toLowerCase();
          if (rLoc.includes(locName.toLowerCase()) || locName.toLowerCase().includes(rLoc)) {
            const cId = this.tripPlanner.getSignificantJobNumber(r['Job Number'] || r['Crew'] || '');
            if (cId && !crews.some(c => c.crewId === cId)) {
              crews.push({
                crewId: cId,
                lead: String(r['Foreman'] || r['Crew Lead'] || r['Lead'] || 'Unknown').trim(),
                vehicle: String(r['Vehicle'] || r['Unit #'] || r['Truck'] || '').trim(),
                jobName: String(r['Job Name'] || '').trim()
              });
            }
          }
        });
      }

      stops.push({
        location: locName,
        coords: coords,
        crews: crews,
        swaps: locSwaps,
        drugTests: locDrugTests,
        manualTasks: locManualTasks,
        crewId: item.crewId || (crews[0] ? crews[0].crewId : ''),
        source: item.source
      });
    });

    // Calculate leg distances & cumulative time
    let totalMiles = 0;
    let prevCoords = hq;

    stops.forEach((stop) => {
      const legMiles = this.calculateDistanceMiles(prevCoords.lat, prevCoords.lng, stop.coords.lat, stop.coords.lng);
      stop.legMiles = legMiles;
      stop.legTime = this.estimateDriveTime(legMiles);
      totalMiles += legMiles;
      prevCoords = stop.coords;
    });

    // Return leg to Helena HQ
    let returnMiles = 0;
    let returnTime = '0m';
    if (stops.length > 0) {
      returnMiles = this.calculateDistanceMiles(prevCoords.lat, prevCoords.lng, hq.lat, hq.lng);
      returnTime = this.estimateDriveTime(returnMiles);
      totalMiles += returnMiles;
    }

    return {
      dateKey: dateKey,
      isHoliday: isHoliday,
      holidayName: holidayName,
      origin: hq,
      stops: stops,
      returnLeg: { coords: hq, miles: returnMiles, time: returnTime },
      totalMiles: Math.round(totalMiles),
      totalDriveTime: this.estimateDriveTime(totalMiles)
    };
  }

  /**
   * Day & Trip Navigation Controls
   */
  prevDay() {
    const d = this.parseDateKey(this.activeDateKey);
    d.setDate(d.getDate() - 1);
    this.jumpToDate(this.formatDateToKey(d));
  }

  nextDay() {
    const d = this.parseDateKey(this.activeDateKey);
    d.setDate(d.getDate() + 1);
    this.jumpToDate(this.formatDateToKey(d));
  }

  jumpToDate(dateKey) {
    if (!dateKey) return;
    this.activeDateKey = dateKey;
    this.activeMode = 'single-day';
    const d = this.parseDateKey(dateKey);
    if (this.tripPlanner) {
      this.activeWeekMonday = this.tripPlanner.getMondayForDate(d);
      this.tripPlanner.currentDate = d;
    }
    this.render();
  }

  jumpToToday() {
    this.jumpToDate(this.formatDateToKey(new Date()));
  }

  prevWeek() {
    const d = this.parseDateKey(this.activeDateKey);
    d.setDate(d.getDate() - 7);
    this.jumpToDate(this.formatDateToKey(d));
  }

  nextWeek() {
    const d = this.parseDateKey(this.activeDateKey);
    d.setDate(d.getDate() + 7);
    this.jumpToDate(this.formatDateToKey(d));
  }

  getAllScheduledTripDates() {
    if (!this.tripPlanner) return [];
    const scheduledDatesSet = new Set();

    // 1. Scheduled trips from board
    const schedTrips = this.tripPlanner.scheduledTrips || {};
    Object.keys(schedTrips).forEach(dKey => {
      if (Array.isArray(schedTrips[dKey]) && schedTrips[dKey].length > 0) {
        scheduledDatesSet.add(dKey);
      }
    });

    // 2. Manual tasks with field locations
    const manual = (typeof this.tripPlanner.loadManualTasks === 'function')
      ? this.tripPlanner.loadManualTasks()
      : (this.tripPlanner.manualTasks || []);

    manual.forEach(m => {
      const loc = String(m.location || '').trim().toLowerCase();
      if (loc && loc !== 'helena' && loc !== 'helena office' && loc !== 'helena base' && loc !== 'office' && !loc.includes('office')) {
        const dKey = m.dateKey || m.date;
        if (dKey) scheduledDatesSet.add(dKey);
      }
    });

    // 3. Picked swaps
    const swaps = this.tripPlanner.scheduledSwaps || {};
    Object.values(swaps).forEach(s => {
      if (s.dateKey) scheduledDatesSet.add(s.dateKey);
    });

    // Build sorted array
    const list = [];
    scheduledDatesSet.forEach(dKey => {
      const routeData = this.collectRouteDataForDate(dKey);
      if (routeData && routeData.stops.length > 0) {
        const d = this.parseDateKey(dKey);
        const dayStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const stopsStr = routeData.stops.map(s => s.location).join(', ');
        list.push({
          dateKey: dKey,
          dayStr: dayStr,
          stopsStr: stopsStr,
          stopCount: routeData.stops.length,
          miles: routeData.totalMiles
        });
      }
    });

    list.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    return list;
  }

  moveStopUp(index) {
    if (index <= 0) return;
    this.customStopOrder = this.customStopOrder || {};
    const routeData = this.collectRouteDataForDate(this.activeDateKey);
    if (!routeData || !routeData.stops) return;
    const order = routeData.stops.map(s => s.location);
    const temp = order[index - 1];
    order[index - 1] = order[index];
    order[index] = temp;
    this.customStopOrder[this.activeDateKey] = order;
    this.render();
  }

  moveStopDown(index) {
    this.customStopOrder = this.customStopOrder || {};
    const routeData = this.collectRouteDataForDate(this.activeDateKey);
    if (!routeData || !routeData.stops || index >= routeData.stops.length - 1) return;
    const order = routeData.stops.map(s => s.location);
    const temp = order[index + 1];
    order[index + 1] = order[index];
    order[index] = temp;
    this.customStopOrder[this.activeDateKey] = order;
    this.render();
  }

  /**
   * Collects all route data across all days of the selected week.
   */
  collectWeekData(weekMonday) {
    if (!this.tripPlanner) return [];
    const workSchedule = this.tripPlanner.activeSchedule || 'Mon-Thu';
    const weekDays = this.tripPlanner.getDaysForWeek(weekMonday, workSchedule);

    return weekDays.map((d, index) => {
      const data = this.collectRouteDataForDate(d.dateKey);
      return {
        ...data,
        dayIndex: index,
        dayName: d.dayName,
        dateFormatted: d.formattedDate,
        color: this.dayColors[index] || this.dayColors[0]
      };
    });
  }

  /**
   * Switches the active date and re-renders.
   */
  setDate(dateKey) {
    this.activeDateKey = dateKey;
    this.activeMode = 'single-day';
    this.render();
  }

  /**
   * Switches view to All-Week Overview mode.
   */
  setAllWeekMode() {
    this.activeMode = 'all-week';
    this.render();
  }

  /**
   * Main render method for the Route Map view.
   */
  render() {
    if (this.mapViewMode === 'google-maps') {
      this.updateGoogleMapsEmbed();
    } else {
      this.ensureMap();
      this.renderMap();
    }
    this.renderStopsPanel();
    this.updateLiveNextStopHud();
  }

  /**
   * Renders the left itinerary panel with Day Navigation Bar, Day Pills, Route Summary, and Stops Timeline.
   */
  renderStopsPanel() {
    const panel = document.getElementById('trip-route-stops-panel');
    if (!panel) return;

    const mon = this.activeWeekMonday || (this.tripPlanner ? this.tripPlanner.getMondayForDate(this.tripPlanner.currentDate) : new Date());
    const workSchedule = this.tripPlanner ? this.tripPlanner.activeSchedule || 'Mon-Thu' : 'Mon-Thu';
    const weekDays = this.tripPlanner ? this.tripPlanner.getDaysForWeek(mon, workSchedule) : [];

    // All scheduled trips across Montana for dropdown
    const scheduledTrips = this.getAllScheduledTripDates();

    const navHeaderHtml = `
      <div class="route-nav-header">
        <div class="route-day-nav-bar">
          <button class="btn btn-secondary" onclick="window.tripRouteMap.prevDay()" style="padding: 4px 8px; font-size: 11px;" title="Go to Previous Day">
            ◀ Prev Day
          </button>

          <input type="date" value="${this.activeDateKey}" class="route-date-input" onchange="window.tripRouteMap.jumpToDate(this.value)" title="Choose any calendar date to view route">

          <button class="btn btn-secondary" onclick="window.tripRouteMap.nextDay()" style="padding: 4px 8px; font-size: 11px;" title="Go to Next Day">
            Next Day ▶
          </button>

          <button class="btn btn-secondary" onclick="window.tripRouteMap.jumpToToday()" style="padding: 4px 10px; font-size: 11px; font-weight: 700; color: #93c5fd; border-color: rgba(59, 130, 246, 0.4);" title="Jump to Current Date">
            Today
          </button>
        </div>

        <select class="route-trip-select" onchange="if(this.value) window.tripRouteMap.jumpToDate(this.value)" title="Quick-jump directly to any date with scheduled field visits">
          <option value="">📍 Jump to Scheduled Route (${scheduledTrips.length} active trips)...</option>
          ${scheduledTrips.map(t => `
            <option value="${t.dateKey}" ${t.dateKey === this.activeDateKey ? 'selected' : ''}>
              ${t.dayStr} — ${t.stopsStr} (${t.stopCount} stop${t.stopCount > 1 ? 's' : ''} • ${t.miles} mi)
            </option>
          `).join('')}
        </select>
      </div>
    `;

    // 1. Day Selector Pills
    let dayPillsHtml = weekDays.map((d) => {
      const isSelected = (this.activeMode === 'single-day' && this.activeDateKey === d.dateKey);
      const dayRoute = this.collectRouteDataForDate(d.dateKey);
      const stopCount = dayRoute && dayRoute.stops ? dayRoute.stops.length : 0;
      const isHol = this.tripPlanner ? this.tripPlanner.isDayHoliday(d.dateKey) : false;

      return `
        <button class="route-day-pill ${isSelected ? 'active' : ''}" onclick="window.tripRouteMap.setDate('${d.dateKey}')" title="${d.dayName} ${d.formattedDate}">
          <span style="font-weight: 800; font-size: 11px;">${d.dayName.substring(0, 3)}</span>
          <span style="font-size: 10px; opacity: 0.85;">${d.formattedDate.split(',')[0]}</span>
          ${isHol ? `
            <span class="badge" style="background: rgba(234, 179, 8, 0.25); color: #fde047; font-size: 8.5px; padding: 0 4px; border-radius: 6px;">🏖️</span>
          ` : stopCount > 0 ? `
            <span class="badge" style="background: rgba(59, 130, 246, 0.3); color: #93c5fd; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 8px;">
              ${stopCount} ${stopCount === 1 ? 'stop' : 'stops'}
            </span>
          ` : `
            <span style="font-size: 9px; opacity: 0.4;">—</span>
          `}
        </button>
      `;
    }).join('');

    // All-Week Overview Pill
    const isAllWeek = (this.activeMode === 'all-week');
    dayPillsHtml += `
      <button class="route-day-pill ${isAllWeek ? 'active' : ''}" onclick="window.tripRouteMap.setAllWeekMode()" style="background: ${isAllWeek ? 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' : 'rgba(255,255,255,0.05)'}; color: ${isAllWeek ? '#fff' : '#c084fc'}; border-color: rgba(168, 85, 247, 0.4);" title="View all routes for the entire week">
        <span style="font-weight: 800; font-size: 11px;">🌐 All Week</span>
        <span style="font-size: 10px; opacity: 0.85;">Overview</span>
      </button>
    `;

    const dayPillsBarHtml = `
      <div class="route-day-pills-bar">
        <button class="btn btn-secondary" onclick="window.tripRouteMap.prevWeek()" style="padding: 2px 6px; font-size: 11px; align-self: center;" title="Jump to Previous Week">◀</button>
        ${dayPillsHtml}
        <button class="btn btn-secondary" onclick="window.tripRouteMap.nextWeek()" style="padding: 2px 6px; font-size: 11px; align-self: center;" title="Jump to Next Week">▶</button>
      </div>
    `;

    // 2. Body based on mode (single-day vs all-week)
    if (this.activeMode === 'all-week') {
      panel.innerHTML = navHeaderHtml + dayPillsBarHtml + this.renderAllWeekPanelHtml(mon);
    } else {
      const routeData = this.collectRouteDataForDate(this.activeDateKey);
      panel.innerHTML = navHeaderHtml + dayPillsBarHtml + this.renderSingleDayPanelHtml(routeData);
    }
  }

  /**
   * HTML for single day stops timeline.
   */
  renderSingleDayPanelHtml(routeData) {
    if (!routeData) return '<div style="padding: 16px; color: var(--text-muted);">No date selected.</div>';

    const d = this.parseDateKey(routeData.dateKey);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
    const fullDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    let stopsTimelineHtml = '';

    if (routeData.isHoliday) {
      stopsTimelineHtml = `
        <div style="background: rgba(234, 179, 8, 0.12); border: 1px solid rgba(234, 179, 8, 0.35); border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
          <div style="font-size: 28px; margin-bottom: 6px;">🏖️</div>
          <div style="font-size: 14px; font-weight: 800; color: #fde047; margin-bottom: 4px;">Company Holiday / Blackout Day</div>
          <div style="font-size: 12px; color: #cbd5e1;">${routeData.holidayName || 'Holiday'}</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">Field crew visits and trips are excused for this date.</div>
        </div>
      `;
    } else if (routeData.stops.length === 0) {
      stopsTimelineHtml = `
        <div style="background: rgba(255,255,255,0.03); border: 1px dashed var(--border-color); border-radius: 8px; padding: 24px 16px; text-align: center; margin: 16px 0;">
          <div style="font-size: 30px; margin-bottom: 8px; opacity: 0.7;">🗺️</div>
          <div style="font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 4px;">No Destinations Scheduled</div>
          <div style="font-size: 11.5px; color: var(--text-muted); line-height: 1.5; margin-bottom: 14px;">
            Switch to the <strong>📅 Schedule Board</strong> tab to drag and drop service cities, crew swaps, or trainings onto this day.
          </div>
          <button class="btn btn-secondary" onclick="window.tripPlanner.switchTab('board')" style="font-size: 11px; font-weight: 700; color: #93c5fd; border-color: rgba(59, 130, 246, 0.4);">
            ◀ Open Schedule Board
          </button>
        </div>
      `;
    } else {
      // Build chronological stops timeline: start from Current Location if GPS active, else Helena HQ
      const hasUserPos = !!(this.userPosition && this.userPosition.lat && this.userPosition.lng);
      const startTitle = hasUserPos ? 'Current Location' : 'Helena Base HQ';
      const startSubtitle = hasUserPos
        ? `${this.userPosition.city || 'Montana City / Helena Area'} (GPS Navigation Origin)`
        : 'Trip Starting Point (Montana Safety Base)';
      const startBadge = hasUserPos ? '🧭' : 'HQ';
      const departTime = hasUserPos ? 'DEPART NOW' : 'DEPART ~7:00 AM';

      stopsTimelineHtml = `
        <div class="stops-timeline" style="margin-top: 14px;">
          <!-- Origin: Current Location or Helena HQ -->
          <div class="stop-item origin">
            <div class="stop-marker-badge origin" style="${hasUserPos ? 'background: #2563eb; color: white; font-size: 13px;' : ''}">${startBadge}</div>
            <div class="stop-content">
              <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <span class="stop-title">${startTitle}</span>
                <span style="font-size: 10px; color: ${hasUserPos ? '#60a5fa' : 'var(--text-muted)'}; font-weight: 700;">${departTime}</span>
              </div>
              <div style="font-size: 11px; color: var(--text-muted);">${startSubtitle}</div>
            </div>
          </div>
      `;

      routeData.stops.forEach((stop, idx) => {
        const stopNum = idx + 1;
        const totalStops = routeData.stops.length;

        // Calculate live leg distance for stop 1 from current position if available
        let legMiles = stop.legMiles;
        let legTime = stop.legTime;
        if (hasUserPos && idx === 0) {
          const liveMiles = this.calculateDistance(this.userPosition.lat, this.userPosition.lng, stop.coords.lat, stop.coords.lng);
          legMiles = Math.round(liveMiles);
          legTime = this.formatMinutes(Math.round((liveMiles / 55) * 60));
        }

        stopsTimelineHtml += `
          <!-- Travel Leg Connector -->
          <div class="stop-travel-leg">
            <div class="travel-leg-line"></div>
            <div class="travel-leg-info">
              🚗 ${legMiles} mi • ~${legTime}
            </div>
          </div>

          <!-- Stop ${stopNum} -->
          <div class="stop-item stop-waypoint" id="stop-card-${stopNum}" onclick="window.tripRouteMap.focusStop(${idx})">
            <div class="stop-marker-badge waypoint">${stopNum}</div>
            <div class="stop-content">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                <div>
                  <span class="stop-title">${stop.location}</span>
                  <span class="badge" style="background: rgba(255,255,255,0.08); font-size: 9.5px; padding: 1px 6px; margin-left: 5px;">
                    ${stop.source === 'manual_task' ? 'Field Task' : (stop.coords.type || 'Field Site')}
                  </span>
                </div>
                <div style="display: flex; align-items: center; gap: 4px;">
                  ${totalStops > 1 ? `
                    <div style="display: flex; gap: 2px;">
                      <button class="btn btn-secondary" style="padding: 1px 5px; font-size: 9px; ${idx === 0 ? 'opacity: 0.35; pointer-events: none;' : ''}" onclick="event.stopPropagation(); window.tripRouteMap.moveStopUp(${idx})" title="Move Stop Up">▲</button>
                      <button class="btn btn-secondary" style="padding: 1px 5px; font-size: 9px; ${idx === totalStops - 1 ? 'opacity: 0.35; pointer-events: none;' : ''}" onclick="event.stopPropagation(); window.tripRouteMap.moveStopDown(${idx})" title="Move Stop Down">▼</button>
                    </div>
                  ` : ''}
                  <button class="btn btn-secondary" style="padding: 1px 6px; font-size: 9.5px; color: #4ade80; border-color: rgba(34, 197, 94, 0.4);" onclick="event.stopPropagation(); window.tripRouteMap.quickCheckIn('${stop.location}')" title="Check in current GPS location at this stop">
                    📍 Check In
                  </button>
                </div>
              </div>

              <!-- Manual Field Tasks (e.g. JM - Rubber Pick-Up/Drop-Off in Billings) -->
              ${stop.manualTasks && stop.manualTasks.length > 0 ? `
                <div style="margin-top: 6px; margin-bottom: 6px; padding: 6px 8px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 6px;">
                  ${stop.manualTasks.map(m => `
                    <div style="font-size: 11.5px; font-weight: 700; color: #6ee7b7; display: flex; align-items: center; justify-content: space-between;">
                      <span>📦 ${m.title || 'Field Task'}</span>
                      ${m.time ? `<span style="font-size: 10px; color: #a7f3d0;">⏰ ${m.time}</span>` : ''}
                    </div>
                    <div style="font-size: 10.5px; color: #cbd5e1; margin-top: 2px;">
                      ${m.assignedTo ? `Assigned: ${m.assignedTo}` : ''} ${m.notes ? `• ${m.notes}` : ''}
                    </div>
                  `).join('')}
                </div>
              ` : ''}

              <!-- Crew Details -->
              ${stop.crews && stop.crews.length > 0 ? `
                <div style="margin-bottom: 6px;">
                  ${stop.crews.map(c => `
                    <div style="font-size: 11px; color: #cbd5e1; display: flex; align-items: center; gap: 6px;">
                      <span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; font-weight: 800; font-size: 9.5px;">Crew ${c.crewId}</span>
                      <span style="font-weight: 600;">${c.lead || 'Lead N/A'}</span>
                      ${c.vehicle ? `<span style="color: #a7f3d0; font-size: 10px;">(${c.vehicle})</span>` : ''}
                    </div>
                  `).join('')}
                </div>
              ` : ''}

              <!-- Work Checklist Pills -->
              <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;">
                ${stop.swaps && stop.swaps.length > 0 ? `
                  <span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.35); font-size: 10px; font-weight: 700;">
                    🧤 ${stop.swaps.length} Swap${stop.swaps.length > 1 ? 's' : ''}
                  </span>
                ` : ''}
                ${stop.drugTests && stop.drugTests.length > 0 ? `
                  <span class="badge" style="background: rgba(168, 85, 247, 0.2); color: #d8b4fe; border: 1px solid rgba(168, 85, 247, 0.35); font-size: 10px; font-weight: 700;">
                    🧪 ${stop.drugTests.length} Drug Test${stop.drugTests.length > 1 ? 's' : ''}
                  </span>
                ` : ''}
              </div>

              <!-- Detailed Swaps list snippet -->
              ${stop.swaps && stop.swaps.length > 0 ? `
                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.08); font-size: 10.5px; color: var(--text-muted);">
                  ${stop.swaps.slice(0, 3).map(s => `
                    <div style="display: flex; justify-content: space-between; padding: 1px 0;">
                      <span>• ${s.employeeName || s.employee || 'Worker'}: ${s.type || 'Glove'} #${s.pickItem || s.currentItem || ''}</span>
                      <span style="color: #4ade80;">Picked</span>
                    </div>
                  `).join('')}
                  ${stop.swaps.length > 3 ? `<div style="font-size: 9.5px; color: #93c5fd;">+ ${stop.swaps.length - 3} more items...</div>` : ''}
                </div>
              ` : ''}
            </div>
          </div>
        `;
      });

      // Return leg to Helena HQ
      stopsTimelineHtml += `
          <!-- Return Leg -->
          <div class="stop-travel-leg">
            <div class="travel-leg-line"></div>
            <div class="travel-leg-info">
              🚗 ${routeData.returnLeg.miles} mi • ~${routeData.returnLeg.time}
            </div>
          </div>

          <!-- Return to Helena HQ -->
          <div class="stop-item destination">
            <div class="stop-marker-badge destination">🏁</div>
            <div class="stop-content">
              <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <span class="stop-title">Return to Helena HQ</span>
                <span style="font-size: 10px; color: #4ade80; font-weight: 700;">RETURN ~4:30 PM</span>
              </div>
              <div style="font-size: 11px; color: var(--text-muted);">Base HQ Finish • Day Complete</div>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div style="padding: 14px 16px; overflow-y: auto; flex: 1;">
        <!-- Day Title & Summary Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div>
            <h3 style="margin: 0; font-size: 15px; font-weight: 800; color: #fff;">
              ${dayName} Itinerary
            </h3>
            <span style="font-size: 11.5px; color: var(--text-muted);">${fullDate}</span>
          </div>

          <div style="text-align: right;">
            <div style="font-size: 13px; font-weight: 800; color: #60a5fa;">
              🚗 ${routeData.totalMiles} miles
            </div>
            <span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">
              Total: ${routeData.totalDriveTime} drive
            </span>
          </div>
        </div>

        <!-- Live Next Stop Banner -->
        <div id="route-map-next-stop-hud" style="margin-bottom: 12px;"></div>

        <!-- Integrated Route Status Banner -->
        ${routeData.stops.length > 0 ? `
          <div style="background: rgba(37, 99, 235, 0.12); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px; padding: 7px 10px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 7px;">
              <span style="font-size: 14px;">🗺️</span>
              <span style="font-size: 11.5px; font-weight: 700; color: #93c5fd;">
                Integrated Google Maps (${routeData.stops.length} Stops)
              </span>
            </div>
            <div style="display: flex; gap: 4px;">
              <button class="btn btn-secondary" onclick="window.tripRouteMap.reloadCurrentMap()" style="padding: 2px 6px; font-size: 10.5px;" title="Reload map frame">
                🔄 Reload
              </button>
              <button class="btn btn-secondary" onclick="window.tripRouteMap.openInGoogleMaps()" style="padding: 2px 6px; font-size: 10.5px; color: #93c5fd;" title="Open in external browser window">
                ↗️ External
              </button>
            </div>
          </div>
        ` : ''}

        <!-- Timeline of Stops -->
        ${stopsTimelineHtml}
      </div>
    `;
  }

  /**
   * HTML for All-Week route overview panel.
   */
  renderAllWeekPanelHtml(mon) {
    const weekData = this.collectWeekData(mon);
    const totalWeeklyMiles = weekData.reduce((sum, d) => sum + (d.totalMiles || 0), 0);
    const totalWeeklyStops = weekData.reduce((sum, d) => sum + (d.stops ? d.stops.length : 0), 0);

    return `
      <div style="padding: 14px 16px; overflow-y: auto; flex: 1;">
        <div style="margin-bottom: 14px;">
          <h3 style="margin: 0; font-size: 15px; font-weight: 800; color: #c084fc;">
            🌐 All-Week Multi-Route Overview
          </h3>
          <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">
            Viewing all daily travel corridors across Montana simultaneously
          </div>
        </div>

        <!-- Weekly Summary Stats -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px;">
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; text-align: center;">
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Total Weekly Distance</div>
            <div style="font-size: 16px; font-weight: 800; color: #93c5fd; margin-top: 2px;">🚗 ${totalWeeklyMiles} mi</div>
          </div>
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; text-align: center;">
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Total Destinations</div>
            <div style="font-size: 16px; font-weight: 800; color: #4ade80; margin-top: 2px;">📍 ${totalWeeklyStops} Stops</div>
          </div>
        </div>

        <!-- Daily Route Cards -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${weekData.map((d) => `
            <div style="background: ${d.color.bg}; border: 1px solid ${d.color.border}; border-radius: 8px; padding: 10px 12px; cursor: pointer; transition: transform 0.15s ease;" onclick="window.tripRouteMap.setDate('${d.dateKey}')" onmouseover="this.style.transform='translateX(3px)'" onmouseout="this.style.transform='translateX(0)'">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-weight: 800; font-size: 12.5px; color: ${d.color.hex};">
                  ● ${d.dayName} (${d.dateFormatted.split(',')[0]})
                </span>
                <span style="font-size: 11px; font-weight: 700; color: #fff;">
                  ${d.totalMiles > 0 ? `${d.totalMiles} mi • ${d.totalDriveTime}` : '0 mi'}
                </span>
              </div>

              <div style="font-size: 11.5px; color: #cbd5e1;">
                ${d.isHoliday ? `
                  <span style="color: #fde047;">🏖️ Holiday (${d.holidayName || 'Excused'})</span>
                ` : d.stops.length > 0 ? `
                  <span>Helena ➔ ${d.stops.map(s => `<strong>${s.location}</strong>`).join(' ➔ ')} ➔ Helena</span>
                ` : `
                  <span style="color: var(--text-muted);">No field visits scheduled</span>
                `}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Renders the interactive Leaflet map markers, connecting route polylines, and popups.
   */
  renderMap() {
    if (!this.map || typeof L === 'undefined') return;

    // Clear existing route layers
    this.routeMarkers.forEach(m => this.map.removeLayer(m));
    this.routeMarkers = [];
    this.routePolylines.forEach(p => this.map.removeLayer(p));
    this.routePolylines = [];

    const bounds = L.latLngBounds();

    // Helena HQ always included in bounds
    const hq = this.montanaCoordinates['helena'];
    bounds.extend([hq.lat, hq.lng]);

    if (this.activeMode === 'all-week') {
      // Render all days of the week with distinct colors
      const mon = this.activeWeekMonday || (this.tripPlanner ? this.tripPlanner.getMondayForDate(this.tripPlanner.currentDate) : new Date());
      const weekData = this.collectWeekData(mon);

      weekData.forEach((dayData) => {
        if (dayData.stops && dayData.stops.length > 0) {
          const latLngs = [[hq.lat, hq.lng]];

          dayData.stops.forEach((stop, sIdx) => {
            latLngs.push([stop.coords.lat, stop.coords.lng]);
            bounds.extend([stop.coords.lat, stop.coords.lng]);

            // Add stop marker
            const marker = this.createStopMarker(stop, sIdx + 1, dayData.color.hex, dayData.dayName);
            marker.addTo(this.map);
            this.routeMarkers.push(marker);
          });

          // Return to Helena
          latLngs.push([hq.lat, hq.lng]);

          // Draw route polyline with day color
          const polyline = L.polyline(latLngs, {
            color: dayData.color.hex,
            weight: 4,
            opacity: 0.85,
            dashArray: '8, 6',
            lineJoin: 'round'
          }).addTo(this.map);

          polyline.bindPopup(`
            <div style="font-weight: 700; color: ${dayData.color.hex}; font-size: 12px;">
              ● ${dayData.dayName} Route (${dayData.totalMiles} mi)
            </div>
          `);

          this.routePolylines.push(polyline);
          this.applyRoadRouteGeometry(latLngs, polyline);
        }
      });
    } else {
      // Single-day mode: plan route from live current position if available, else Helena Base HQ
      const routeData = this.collectRouteDataForDate(this.activeDateKey);
      if (routeData && routeData.stops.length > 0) {
        const hasUserPos = !!(this.userPosition && this.userPosition.lat && this.userPosition.lng);
        const startPoint = hasUserPos
          ? [this.userPosition.lat, this.userPosition.lng]
          : [hq.lat, hq.lng];

        const latLngs = [startPoint];
        bounds.extend(startPoint);

        // Add Helena Base HQ marker as return anchor
        const hqMarker = this.createHqMarker();
        hqMarker.addTo(this.map);
        this.routeMarkers.push(hqMarker);

        routeData.stops.forEach((stop, idx) => {
          latLngs.push([stop.coords.lat, stop.coords.lng]);
          bounds.extend([stop.coords.lat, stop.coords.lng]);

          const stopMarker = this.createStopMarker(stop, idx + 1, '#3b82f6', routeData.dateKey);
          stopMarker.addTo(this.map);
          this.routeMarkers.push(stopMarker);
        });

        // Return leg to Helena HQ
        latLngs.push([hq.lat, hq.lng]);
        bounds.extend([hq.lat, hq.lng]);

        // Main Route Polyline (Google Maps style solid blue with subtle shadow)
        const polyShadow = L.polyline(latLngs, {
          color: '#1e3a8a',
          weight: 7,
          opacity: 0.45,
          lineJoin: 'round'
        }).addTo(this.map);
        this.routePolylines.push(polyShadow);

        const polyline = L.polyline(latLngs, {
          color: '#3b82f6',
          weight: 4.5,
          opacity: 0.95,
          lineJoin: 'round'
        }).addTo(this.map);
        this.routePolylines.push(polyline);

        // Fetch real highway road geometry (OSRM) to replace straight lines!
        this.applyRoadRouteGeometry(latLngs, polyline, polyShadow);
      } else {
        // No stops on this date: show HQ marker
        const hqMarker = this.createHqMarker();
        hqMarker.addTo(this.map);
        this.routeMarkers.push(hqMarker);
      }
    }

    // Auto-fit map to route bounds
    if (bounds.isValid() && !this.followMe) {
      this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }

  /**
   * Fetches real highway road driving geometry via OSRM to curve along actual roads.
   */
  async applyRoadRouteGeometry(latLngs, polyline, polyShadow) {
    if (!latLngs || latLngs.length < 2) return;
    try {
      const roadCoords = await this.fetchRoadGeometry(latLngs);
      if (roadCoords && roadCoords.length > 1) {
        if (polyline && this.map && this.map.hasLayer(polyline)) {
          polyline.setLatLngs(roadCoords);
        }
        if (polyShadow && this.map && this.map.hasLayer(polyShadow)) {
          polyShadow.setLatLngs(roadCoords);
        }
      }
    } catch (err) {
      console.warn('Road routing geometry error:', err);
    }
  }

  async fetchRoadGeometry(latLngPoints) {
    if (!this.roadGeometryCache) this.roadGeometryCache = {};
    const cacheKey = latLngPoints.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(';');
    if (this.roadGeometryCache[cacheKey]) {
      return this.roadGeometryCache[cacheKey];
    }

    try {
      const coordsStr = latLngPoints.map(p => `${p[1].toFixed(5)},${p[0].toFixed(5)}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.routes && data.routes[0] && data.routes[0].geometry && data.routes[0].geometry.coordinates) {
          const roadLatLngs = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
          this.roadGeometryCache[cacheKey] = roadLatLngs;
          return roadLatLngs;
        }
      }
    } catch (e) {
      console.warn('OSRM routing fetch warning (using straight line fallback):', e);
    }
    return latLngPoints;
  }

  createHqMarker() {
    const hq = this.montanaCoordinates['helena'];
    const icon = L.divIcon({
      className: 'route-map-pin-container',
      html: `
        <div class="route-map-pin hq">
          <span>🏢</span>
        </div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    const m = L.marker([hq.lat, hq.lng], { icon });
    m.bindPopup(`
      <div style="font-size: 12px; font-weight: 700; color: #1e293b; padding: 2px;">
        🏢 Helena Base HQ (Origin & Return Base)<br>
        <span style="font-size: 11px; font-weight: 400; color: #64748b;">
          Scheduled Route Starting Point<br>
          <i>(Note: This is the trip base, not your current vehicle location)</i>
        </span>
      </div>
    `);
    return m;
  }

  createStopMarker(stop, index, colorHex = '#3b82f6', subtitle = '') {
    const icon = L.divIcon({
      className: 'route-map-pin-container',
      html: `
        <div class="route-map-pin stop" style="background: ${colorHex}; border-color: #ffffff;">
          <span>${index}</span>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const m = L.marker([stop.coords.lat, stop.coords.lng], { icon });
    m.bindPopup(`
      <div style="font-size: 12px; color: #1e293b; min-width: 170px; padding: 2px;">
        <div style="font-weight: 800; font-size: 13px; color: ${colorHex}; margin-bottom: 2px;">
          Stop ${index}: ${stop.location}
        </div>
        <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">
          ${subtitle ? subtitle + ' • ' : ''}${stop.legMiles ? stop.legMiles + ' mi from prev leg' : ''}
        </div>

        ${stop.crews.length > 0 ? `
          <div style="font-size: 11px; margin-bottom: 6px;">
            <strong>Crew:</strong> ${stop.crews.map(c => `${c.crewId} (${c.lead})`).join(', ')}
          </div>
        ` : ''}

        <div style="font-size: 11px; line-height: 1.5;">
          ${stop.swaps.length > 0 ? `🧤 <strong>${stop.swaps.length}</strong> Equipment Swaps<br>` : ''}
          ${stop.drugTests.length > 0 ? `🧪 <strong>${stop.drugTests.length}</strong> Drug Tests<br>` : ''}
          ${stop.manualTasks.length > 0 ? `📋 <strong>${stop.manualTasks.length}</strong> Tasks<br>` : ''}
        </div>

        <button style="margin-top: 8px; width: 100%; background: #2563eb; color: #fff; border: none; border-radius: 4px; padding: 4px; font-size: 10.5px; font-weight: 700; cursor: pointer;" onclick="window.tripRouteMap.focusStop(${index - 1})">
          View in Itinerary
        </button>
      </div>
    `);

    return m;
  }

  focusStop(index) {
    const routeData = this.collectRouteDataForDate(this.activeDateKey);
    if (!routeData || !routeData.stops[index]) return;
    const stop = routeData.stops[index];

    if (this.map) {
      this.map.setView([stop.coords.lat, stop.coords.lng], 12, { animate: true });
    }

    const card = document.getElementById(`stop-card-${index + 1}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.borderColor = '#3b82f6';
      card.style.boxShadow = '0 0 12px rgba(59, 130, 246, 0.4)';
      setTimeout(() => {
        card.style.borderColor = 'var(--border-color)';
        card.style.boxShadow = 'none';
      }, 2000);
    }
  }

  /**
   * Generates Google Maps multi-stop directions URL.
   */
  generateGoogleMapsUrl(routeData) {
    if (!routeData || routeData.stops.length === 0) return '';
    const origin = (this.userPosition && this.userPosition.lat && this.userPosition.lng)
      ? `${this.userPosition.lat},${this.userPosition.lng}`
      : 'Helena,+MT';
    const destination = 'Helena,+MT';
    const waypoints = routeData.stops.map(s => {
      return encodeURIComponent(s.location + ', MT');
    }).join('/');

    return `https://www.google.com/maps/dir/${origin}/${waypoints}/${destination}`;
  }

  /**
   * Opens Google Maps navigation in default browser / native app.
   */
  openInGoogleMaps() {
    const routeData = this.collectRouteDataForDate(this.activeDateKey);
    if (!routeData) return;
    const url = this.generateGoogleMapsUrl(routeData);
    if (!url) return;

    if (window.desktopAPI && typeof window.desktopAPI.openExternal === 'function') {
      window.desktopAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  }

  /**
   * Fits map to route bounds.
   */
  fitRoute() {
    if (!this.map) return;
    const bounds = L.latLngBounds();
    const hq = this.montanaCoordinates['helena'];
    bounds.extend([hq.lat, hq.lng]);

    if (this.activeMode === 'all-week') {
      const mon = this.activeWeekMonday || (this.tripPlanner ? this.tripPlanner.getMondayForDate(this.tripPlanner.currentDate) : new Date());
      const weekData = this.collectWeekData(mon);
      weekData.forEach(d => {
        (d.stops || []).forEach(s => bounds.extend([s.coords.lat, s.coords.lng]));
      });
    } else {
      const routeData = this.collectRouteDataForDate(this.activeDateKey);
      if (routeData) {
        routeData.stops.forEach(s => bounds.extend([s.coords.lat, s.coords.lng]));
      }
    }

    if (bounds.isValid()) {
      this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }
}

// Global instance attached to window
if (typeof window !== 'undefined') {
  window.TripRouteMap = TripRouteMap;
  window.tripRouteMap = null;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TripRouteMap;
}
