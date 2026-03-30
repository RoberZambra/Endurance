import { XMLParser } from 'fast-xml-parser';

export interface TrackPoint {
  time: Date;
  lat: number;
  lon: number;
  ele?: number;
  hr?: number;
  dist: number; // cumulative distance in meters
  speed: number; // speed in m/s
}

export interface WorkoutData {
  id: string;
  name: string;
  points: TrackPoint[];
  summary: {
    totalDistance: number; // meters
    totalTime: number; // seconds
    avgHR: number;
    maxHR: number;
    avgSpeed: number;
    maxSpeed: number;
    totalElevationGain: number;
  };
}

const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

export const parseWorkoutFile = async (file: File): Promise<WorkoutData> => {
  const text = await file.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  const obj = parser.parse(text);

  let points: TrackPoint[] = [];

  if (obj.gpx) {
    // GPX Parsing
    const tracks = Array.isArray(obj.gpx.trk) ? obj.gpx.trk : [obj.gpx.trk];
    tracks.forEach((trk: any) => {
      const segments = Array.isArray(trk.trkseg) ? trk.trkseg : [trk.trkseg];
      segments.forEach((seg: any) => {
        const trkpts = Array.isArray(seg.trkpt) ? seg.trkpt : [seg.trkpt];
        trkpts.forEach((pt: any) => {
          const hr = pt.extensions?.['gpxtpx:TrackPointExtension']?.['gpxtpx:hr'] || 
                     pt.extensions?.TrackPointExtension?.hr || 
                     null;
          
          points.push({
            time: new Date(pt.time),
            lat: parseFloat(pt['@_lat']),
            lon: parseFloat(pt['@_lon']),
            ele: pt.ele ? parseFloat(pt.ele) : undefined,
            hr: hr ? parseInt(hr) : undefined,
            dist: 0,
            speed: 0,
          });
        });
      });
    });
  } else if (obj.TrainingCenterDatabase) {
    // TCX Parsing
    const activities = Array.isArray(obj.TrainingCenterDatabase.Activities.Activity)
      ? obj.TrainingCenterDatabase.Activities.Activity
      : [obj.TrainingCenterDatabase.Activities.Activity];
    
    activities.forEach((activity: any) => {
      const laps = Array.isArray(activity.Lap) ? activity.Lap : [activity.Lap];
      laps.forEach((lap: any) => {
        const track = lap.Track;
        if (!track) return;
        const trackpoints = Array.isArray(track.Trackpoint) ? track.Trackpoint : [track.Trackpoint];
        trackpoints.forEach((pt: any) => {
          if (!pt.Position) return;
          
          const hr = pt.HeartRateBpm?.Value;
          const dist = pt.DistanceMeters ? parseFloat(pt.DistanceMeters) : 0;

          points.push({
            time: new Date(pt.Time),
            lat: parseFloat(pt.Position.LatitudeDegrees),
            lon: parseFloat(pt.Position.LongitudeDegrees),
            ele: pt.AltitudeMeters ? parseFloat(pt.AltitudeMeters) : undefined,
            hr: hr ? parseInt(hr) : undefined,
            dist: dist,
            speed: 0,
          });
        });
      });
    });
  }

  // Sort by time
  points.sort((a, b) => a.time.getTime() - b.time.getTime());

  // Calculate distances and speeds if not present (GPX usually doesn't have distance)
  let totalDist = 0;
  let totalElevationGain = 0;
  let maxSpeed = 0;
  let hrSum = 0;
  let hrCount = 0;
  let maxHR = 0;

  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const p1 = points[i - 1];
      const p2 = points[i];
      
      const d = haversine(p1.lat, p1.lon, p2.lat, p2.lon);
      const dt = (p2.time.getTime() - p1.time.getTime()) / 1000; // seconds
      
      // If TCX already has distance, we use it, but for GPX we accumulate
      if (p2.dist === 0) {
        totalDist += d;
        p2.dist = totalDist;
      } else {
        totalDist = p2.dist;
      }

      if (dt > 0) {
        p2.speed = d / dt;
        if (p2.speed > maxSpeed && p2.speed < 20) { // Filter outliers (> 72km/h)
          maxSpeed = p2.speed;
        }
      }

      if (p2.ele !== undefined && p1.ele !== undefined) {
        const diff = p2.ele - p1.ele;
        if (diff > 0) totalElevationGain += diff;
      }
    }

    if (points[i].hr) {
      hrSum += points[i].hr!;
      hrCount++;
      if (points[i].hr! > maxHR) maxHR = points[i].hr!;
    }
  }

  const totalTime = points.length > 0 
    ? (points[points.length - 1].time.getTime() - points[0].time.getTime()) / 1000 
    : 0;

  return {
    id: Math.random().toString(36).substr(2, 9),
    name: file.name,
    points,
    summary: {
      totalDistance: totalDist,
      totalTime,
      avgHR: hrCount > 0 ? hrSum / hrCount : 0,
      maxHR,
      avgSpeed: totalTime > 0 ? totalDist / totalTime : 0,
      maxSpeed,
      totalElevationGain,
    },
  };
};
