/**
 * gps.js - Offline GPS Location Check-in & Field Audit Engine (Phase 9)
 * 
 * Captures device geolocation, resolves the nearest Montana service town/dock,
 * and attaches GPS audit stamps to field swaps and check-in events.
 */

class GpsEngine {
  constructor(db) {
    this.db = db;
    this.lastKnownPosition = null;

    // Verified coordinates for Montana operational bases and service towns
    this.montanaBases = [
      { name: 'Helena', lat: 46.5958, lng: -112.0270, type: 'HQ Base' },
      { name: 'Belgrade', lat: 45.7760, lng: -111.1764, type: 'Service Dock' },
      { name: 'Bozeman', lat: 45.6770, lng: -111.0429, type: 'Town Center' },
      { name: 'Great Falls', lat: 47.5053, lng: -111.3008, type: 'Division Base' },
      { name: 'Butte', lat: 46.0038, lng: -112.5348, type: 'Division Base' },
      { name: 'Missoula', lat: 46.8721, lng: -113.9940, type: 'Division Base' },
      { name: 'Billings', lat: 45.7833, lng: -108.5007, type: 'Division Base' },
      { name: 'Big Sky', lat: 45.2638, lng: -111.3033, type: 'Service Area' },
      { name: 'Hamilton', lat: 46.2471, lng: -114.1557, type: 'Service Dock' },
      { name: 'Darby', lat: 45.9755, lng: -114.1782, type: 'Field Site' },
      { name: 'Livingston', lat: 45.6624, lng: -110.5613, type: 'Town Center' },
      { name: 'Three Forks', lat: 45.8927, lng: -111.5519, type: 'Town Center' },
      { name: 'Townsend', lat: 46.3208, lng: -111.5175, type: 'Field Site' },
      { name: 'Anaconda', lat: 46.1285, lng: -112.9423, type: 'Town Center' },
      { name: 'Ennis', lat: 45.3491, lng: -111.7297, type: 'Field Site' },
      { name: 'Melville', lat: 46.0355, lng: -110.0468, type: 'Field Site' },
      { name: 'Laurel', lat: 45.6708, lng: -108.7724, type: 'Service Dock' },
      { name: 'Kalispell', lat: 48.1958, lng: -114.3129, type: 'Division Base' },
      { name: 'Miles City', lat: 46.4083, lng: -105.8406, type: 'Service Dock' },
      { name: 'Glendive', lat: 47.1053, lng: -104.7125, type: 'Field Site' },
      { name: 'Sidney', lat: 47.7169, lng: -104.1561, type: 'Service Dock' },
      { name: 'Havre', lat: 48.5500, lng: -109.6841, type: 'Division Base' }
    ];
  }

  /**
   * Retrieves current GPS position with high accuracy.
   */
  async getCurrentPosition() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        console.warn('Geolocation is not supported by this browser.');
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMeters: Math.round(pos.coords.accuracy || 0),
            timestamp: new Date(pos.timestamp || Date.now()).toISOString()
          };
          this.lastKnownPosition = coords;
          resolve(coords);
        },
        (err) => {
          console.warn('Geolocation error:', err.message);
          resolve(this.lastKnownPosition || null);
        },
        {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 60000
        }
      );
    });
  }

  /**
   * Resolves nearest Montana town/service base using Haversine formula.
   */
  getNearestMontanaBase(lat, lng) {
    if (!lat || !lng) return null;

    let nearest = null;
    let minDistanceMiles = Infinity;

    this.montanaBases.forEach((base) => {
      const dist = this.calculateDistanceMiles(lat, lng, base.lat, base.lng);
      if (dist < minDistanceMiles) {
        minDistanceMiles = dist;
        nearest = { ...base, distanceMiles: Math.round(dist * 10) / 10 };
      }
    });

    return nearest;
  }

  /**
   * Haversine formula to compute great-circle distance between two GPS coordinates in miles.
   */
  calculateDistanceMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Earth radius in miles
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  /**
   * Captures GPS location and creates a Check-in stamp for field operations.
   */
  async checkInLocation(jobId = '', jobName = '') {
    const coords = await this.getCurrentPosition();
    let locationLabel = 'Helena Base';
    let gpsText = 'GPS Not Available';

    if (coords) {
      const nearest = this.getNearestMontanaBase(coords.latitude, coords.longitude);
      if (nearest) {
        locationLabel = nearest.distanceMiles <= 5 
          ? nearest.name 
          : `${nearest.name} (${nearest.distanceMiles} mi ${nearest.type})`;
      }
      gpsText = `${coords.latitude.toFixed(4)}° N, ${Math.abs(coords.longitude).toFixed(4)}° W (±${coords.accuracyMeters}m)`;
    }

    const checkInRecord = {
      timestamp: new Date().toISOString(),
      jobId: jobId,
      jobName: jobName,
      locationLabel: locationLabel,
      gpsCoordinates: gpsText,
      lat: coords ? coords.latitude : null,
      lng: coords ? coords.longitude : null
    };

    if (this.db && this.db.addMutation) {
      this.db.addMutation({
        action: 'FIELD_GPS_CHECK_IN',
        data: checkInRecord
      });
    }

    return checkInRecord;
  }

  /**
   * Formats a concise GPS audit stamp string for swap history and logs.
   */
  async formatSwapGpsStamp() {
    const coords = await this.getCurrentPosition();
    if (!coords) return '📍 Field (Offline)';

    const nearest = this.getNearestMontanaBase(coords.latitude, coords.longitude);
    const locName = nearest ? nearest.name : 'Montana';
    return `📍 ${locName} [${coords.latitude.toFixed(4)}°N, ${Math.abs(coords.longitude).toFixed(4)}°W]`;
  }
}

// Attach globally
window.GpsEngine = GpsEngine;
