/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { 
  Upload, 
  Activity, 
  Timer, 
  TrendingUp, 
  Zap, 
  Heart, 
  ChevronRight,
  FileText,
  X,
  Info,
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Navigation,
  Mountain,
  Maximize2,
  Minimize2,
  Box
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { parseWorkoutFile, type WorkoutData, type TrackPoint } from './lib/parser';
import { cn } from './lib/utils';

// Fix Leaflet marker icon issue
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MetricCard = ({ 
  label, 
  value, 
  unit, 
  icon: Icon, 
  colorClass = "text-zinc-400" 
}: { 
  label: string; 
  value: string | number; 
  unit: string; 
  icon: any;
  colorClass?: string;
}) => (
  <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex flex-col gap-2">
    <div className="flex items-center gap-2">
      <Icon size={14} className={colorClass} />
      <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">{label}</span>
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-mono tracking-tight text-white">{value}</span>
      <span className="text-xs text-zinc-500 font-medium">{unit}</span>
    </div>
  </div>
);

const ComparisonRow = ({ 
  label, 
  val1, 
  val2, 
  unit, 
  better = 'higher' 
}: { 
  label: string; 
  val1: number; 
  val2: number; 
  unit: string; 
  better?: 'higher' | 'lower' | 'none' 
}) => {
  const diff = val1 - val2;
  const isBetter1 = better === 'higher' ? val1 > val2 : better === 'lower' ? val1 < val2 : false;
  const isBetter2 = better === 'higher' ? val2 > val1 : better === 'lower' ? val2 < val1 : false;

  const formatVal = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });

  return (
    <div className="grid grid-cols-3 py-3 border-b border-zinc-800 items-center">
      <div className="text-xs font-medium text-zinc-400 italic serif">{label}</div>
      <div className={cn(
        "text-sm font-mono text-center",
        isBetter1 ? "text-emerald-400" : isBetter2 ? "text-zinc-500" : "text-white"
      )}>
        {formatVal(val1)} <span className="text-[10px] opacity-50">{unit}</span>
      </div>
      <div className={cn(
        "text-sm font-mono text-center",
        isBetter2 ? "text-emerald-400" : isBetter1 ? "text-zinc-500" : "text-white"
      )}>
        {formatVal(val2)} <span className="text-[10px] opacity-50">{unit}</span>
      </div>
    </div>
  );
};

const Speedometer = ({ speed, label, color }: { speed: number; label: string; color: string; key?: any }) => {
  const maxSpeed = 40; // km/h
  const percentage = Math.min((speed / maxSpeed) * 100, 100);
  const rotation = (percentage / 100) * 180 - 90;

  return (
    <div className="flex flex-col items-center gap-1 scale-75 origin-top-right">
      <div className="relative w-24 h-12 overflow-hidden">
        <div className="absolute top-0 left-0 w-24 h-24 border-[4px] border-zinc-800 rounded-full" />
        <div 
          className="absolute top-0 left-0 w-24 h-24 border-[4px] rounded-full transition-all duration-300"
          style={{ 
            borderColor: color, 
            clipPath: `polygon(0 50%, 100% 50%, 100% 0, 0 0)`,
            transform: `rotate(${rotation + 90}deg)`,
            transformOrigin: 'center'
          }}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
          <div className="text-lg font-mono font-bold text-white leading-none">{(speed).toFixed(1)}</div>
          <div className="text-[7px] uppercase tracking-widest text-zinc-500">km/h</div>
        </div>
      </div>
      <div className="text-[8px] uppercase tracking-widest font-bold text-zinc-500 truncate max-w-[80px]">{label}</div>
    </div>
  );
};

const MapBounds = ({ points }: { points: [number, number][] }) => {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [points, map]);
  return null;
};

const MapResizer = ({ trigger }: { trigger: any }) => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 500);
    return () => clearTimeout(timer);
  }, [trigger, map]);
  return null;
};

export default function App() {
  const [workouts, setWorkouts] = useState<WorkoutData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Playback state
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [is3D, setIs3D] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [xAxisMode, setXAxisMode] = useState<'distance' | 'time'>('distance');
  const animationRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setIsLoading(true);
    setError(null);

    try {
      const newWorkouts: WorkoutData[] = [];
      for (let i = 0; i < files.length; i++) {
        if (workouts.length + newWorkouts.length >= 2) break;
        const workout = await parseWorkoutFile(files[i]);
        newWorkouts.push(workout);
      }
      setWorkouts(prev => [...prev, ...newWorkouts].slice(0, 2));
    } catch (err) {
      console.error(err);
      setError("Falha ao processar arquivo. Verifique se é um GPX ou TCX válido.");
    } finally {
      setIsLoading(false);
    }
  }, [workouts]);

  const removeWorkout = (id: string) => {
    setWorkouts(prev => prev.filter(w => w.id !== id));
    setPlaybackIndex(0);
    setIsPlaying(false);
  };

  const chartData = useMemo(() => {
    if (workouts.length === 0) return [];
    const samples = 100;
    const data = [];
    
    const maxDistance = Math.max(...workouts.map(w => w.summary.totalDistance || 0));
    const maxTime = Math.max(...workouts.map(w => w.summary.totalTime || 0));

    for (let i = 0; i <= samples; i++) {
      const entry: any = { sample: i };
      workouts.forEach((w, idx) => {
        if (!w.points || w.points.length === 0) return;

        if (xAxisMode === 'distance') {
          const targetDist = (i / samples) * w.summary.totalDistance;
          const point = w.points.reduce((prev, curr) => 
            Math.abs(curr.dist - targetDist) < Math.abs(prev.dist - targetDist) ? curr : prev
          );
          entry[`hr${idx}`] = point.hr;
          entry[`speed${idx}`] = point.speed * 3.6;
          entry[`ele${idx}`] = point.ele;
          entry[`dist${idx}`] = point.dist / 1000;
          entry.xValue = (i / samples) * maxDistance / 1000;
        } else {
          const targetTime = (i / samples) * w.summary.totalTime;
          const startTime = w.points[0].time.getTime();
          const point = w.points.reduce((prev, curr) => {
            const prevRel = (prev.time.getTime() - startTime) / 1000;
            const currRel = (curr.time.getTime() - startTime) / 1000;
            return Math.abs(currRel - targetTime) < Math.abs(prevRel - targetTime) ? curr : prev;
          });
          entry[`hr${idx}`] = point.hr;
          entry[`speed${idx}`] = point.speed * 3.6;
          entry[`ele${idx}`] = point.ele;
          entry[`dist${idx}`] = point.dist / 1000;
          entry.xValue = (i / samples) * maxTime;
        }
      });
      data.push(entry);
    }
    return data;
  }, [workouts, xAxisMode]);

  // Animation Loop
  useEffect(() => {
    if (isPlaying && workouts.length > 0) {
      const animate = (time: number) => {
        if (lastUpdateRef.current === 0) lastUpdateRef.current = time;
        const deltaTime = time - lastUpdateRef.current;
        
        if (deltaTime > 50 / playbackSpeed) {
          setPlaybackIndex(prev => {
            const next = prev + 1;
            if (next >= 100) {
              setIsPlaying(false);
              return 100;
            }
            return next;
          });
          lastUpdateRef.current = time;
        }
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      lastUpdateRef.current = 0;
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, playbackSpeed, workouts.length]);

  const currentPoints = useMemo(() => {
    return workouts.map(w => {
      if (!w.points || w.points.length === 0) return null;
      const targetDist = (playbackIndex / 100) * w.summary.totalDistance;
      return w.points.reduce((prev, curr) => 
        Math.abs(curr.dist - targetDist) < Math.abs(prev.dist - targetDist) ? curr : prev
      );
    });
  }, [workouts, playbackIndex]);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const allMapPoints = useMemo(() => {
    return workouts.flatMap(w => w.points.map(p => [p.lat, p.lon] as [number, number]));
  }, [workouts]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/30 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <Activity size={18} className="text-black" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">Workout Comparator</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 rounded-full border border-zinc-700">
              <div className={cn("w-2 h-2 rounded-full", workouts.length === 2 ? "bg-emerald-500" : "bg-zinc-600")} />
              <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">
                {workouts.length}/2 Atividades
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Upload Section */}
        {workouts.length < 2 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12"
          >
            <div className="relative group">
              <input 
                type="file" 
                multiple 
                accept=".gpx,.tcx"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="border-2 border-dashed border-zinc-800 group-hover:border-emerald-500/50 bg-zinc-900/20 rounded-2xl p-12 transition-all flex flex-col items-center justify-center text-center gap-4">
                <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Upload size={24} className="text-zinc-400 group-hover:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-xl font-medium text-white mb-1">Carregar Treinos</h3>
                  <p className="text-sm text-zinc-500 max-w-xs mx-auto">
                    Arraste ou clique para selecionar até dois arquivos <span className="text-zinc-300">.gpx</span> ou <span className="text-zinc-300">.tcx</span>
                  </p>
                </div>
              </div>
            </div>
            
            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm">
                <Info size={14} />
                {error}
              </div>
            )}
          </motion.div>
        )}

        {/* Selected Files List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <AnimatePresence mode="popLayout">
            {workouts.map((w, idx) => (
              <motion.div 
                key={w.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden group"
              >
                <div className={cn(
                  "absolute top-0 left-0 w-1 h-full",
                  idx === 0 ? "bg-emerald-500" : "bg-blue-500"
                )} />
                
                <button 
                  onClick={() => removeWorkout(w.id)}
                  className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <X size={16} />
                </button>

                <div className="flex items-start gap-4 mb-6">
                  <div className="p-3 bg-zinc-800 rounded-xl">
                    <FileText size={20} className="text-zinc-400" />
                  </div>
                  <div>
                    <h4 className="font-medium text-white truncate max-w-[200px]">{w.name}</h4>
                    <p className="text-xs text-zinc-500">
                      {format(w.points[0].time, 'dd MMM yyyy, HH:mm')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <MetricCard 
                    label="Distância" 
                    value={(w.summary.totalDistance / 1000).toFixed(2)} 
                    unit="km" 
                    icon={TrendingUp} 
                    colorClass="text-emerald-400"
                  />
                  <MetricCard 
                    label="Tempo" 
                    value={formatDuration(w.summary.totalTime)} 
                    unit="" 
                    icon={Timer} 
                    colorClass="text-blue-400"
                  />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Comparison Dashboard */}
        {workouts.length === 2 && (
          <div className="space-y-12">
            {/* Summary Table */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <Zap size={14} /> Comparação Direta
                </h2>
              </div>
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6">
                <div className="grid grid-cols-3 pb-4 border-b border-zinc-800">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-600">Métrica</div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-500 text-center">Atividade A</div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-blue-500 text-center">Atividade B</div>
                </div>
                <div className="divide-y divide-zinc-800/50">
                  <ComparisonRow label="Distância Total" val1={workouts[0].summary.totalDistance / 1000} val2={workouts[1].summary.totalDistance / 1000} unit="km" />
                  <ComparisonRow label="Tempo Total" val1={workouts[0].summary.totalTime / 60} val2={workouts[1].summary.totalTime / 60} unit="min" better="lower" />
                  <ComparisonRow label="Velocidade Média" val1={workouts[0].summary.avgSpeed * 3.6} val2={workouts[1].summary.avgSpeed * 3.6} unit="km/h" />
                  <ComparisonRow label="Velocidade Máxima" val1={workouts[0].summary.maxSpeed * 3.6} val2={workouts[1].summary.maxSpeed * 3.6} unit="km/h" />
                  <ComparisonRow label="FC Média" val1={workouts[0].summary.avgHR} val2={workouts[1].summary.avgHR} unit="bpm" better="lower" />
                  <ComparisonRow label="FC Máxima" val1={workouts[0].summary.maxHR} val2={workouts[1].summary.maxHR} unit="bpm" better="lower" />
                  <ComparisonRow label="Ganho de Elevação" val1={workouts[0].summary.totalElevationGain} val2={workouts[1].summary.totalElevationGain} unit="m" />
                </div>
              </div>
            </section>

            {/* Charts */}
            <section className="grid grid-cols-1 gap-8">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white italic serif">Análise Gráfica</h2>
                <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-1">
                  <button 
                    onClick={() => setXAxisMode('distance')}
                    className={cn(
                      "px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all",
                      xAxisMode === 'distance' ? "bg-emerald-500 text-white" : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    Distância
                  </button>
                  <button 
                    onClick={() => setXAxisMode('time')}
                    className={cn(
                      "px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all",
                      xAxisMode === 'time' ? "bg-emerald-500 text-white" : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    Tempo
                  </button>
                </div>
              </div>

              {/* Heart Rate Chart */}
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-8">
                  <Heart size={16} className="text-rose-500" />
                  <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Frequência Cardíaca</h3>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                      <XAxis 
                        dataKey="xValue" 
                        stroke="#52525b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(val) => {
                          if (xAxisMode === 'distance') return `${val.toFixed(1)} km`;
                          const h = Math.floor(val / 3600);
                          const m = Math.floor((val % 3600) / 60);
                          const s = Math.floor(val % 60);
                          return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
                        }}
                      />
                      <YAxis 
                        stroke="#52525b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        domain={['dataMin - 10', 'dataMax + 10']}
                        unit=" bpm"
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                        itemStyle={{ fontSize: '12px' }}
                        labelStyle={{ fontSize: '10px', color: '#71717a', marginBottom: '4px' }}
                        labelFormatter={(val) => {
                          if (xAxisMode === 'distance') return `${val.toFixed(2)} km`;
                          const h = Math.floor(val / 3600);
                          const m = Math.floor((val % 3600) / 60);
                          const s = Math.floor(val % 60);
                          return h > 0 ? `Tempo: ${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `Tempo: ${m}:${s.toString().padStart(2, '0')}`;
                        }}
                      />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', paddingBottom: '20px' }} />
                      <Line 
                        name="Atividade A" 
                        type="monotone" 
                        dataKey="hr0" 
                        stroke="#10b981" 
                        strokeWidth={2} 
                        dot={false} 
                        activeDot={{ r: 4, strokeWidth: 0 }}
                      />
                      <Line 
                        name="Atividade B" 
                        type="monotone" 
                        dataKey="hr1" 
                        stroke="#3b82f6" 
                        strokeWidth={2} 
                        dot={false} 
                        activeDot={{ r: 4, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Speed Chart */}
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-8">
                  <TrendingUp size={16} className="text-emerald-500" />
                  <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Velocidade (km/h)</h3>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorA" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorB" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                      <XAxis 
                        dataKey="xValue" 
                        stroke="#52525b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(val) => {
                          if (xAxisMode === 'distance') return `${val.toFixed(1)} km`;
                          const h = Math.floor(val / 3600);
                          const m = Math.floor((val % 3600) / 60);
                          const s = Math.floor(val % 60);
                          return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
                        }}
                      />
                      <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} unit=" km/h" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                        itemStyle={{ fontSize: '12px' }}
                        labelStyle={{ fontSize: '10px', color: '#71717a', marginBottom: '4px' }}
                        labelFormatter={(val) => {
                          if (xAxisMode === 'distance') return `${val.toFixed(2)} km`;
                          const h = Math.floor(val / 3600);
                          const m = Math.floor((val % 3600) / 60);
                          const s = Math.floor(val % 60);
                          return h > 0 ? `Tempo: ${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `Tempo: ${m}:${s.toString().padStart(2, '0')}`;
                        }}
                      />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', paddingBottom: '20px' }} />
                      <Area 
                        name="Atividade A" 
                        type="monotone" 
                        dataKey="speed0" 
                        stroke="#10b981" 
                        fillOpacity={1} 
                        fill="url(#colorA)" 
                        strokeWidth={2}
                      />
                      <Area 
                        name="Atividade B" 
                        type="monotone" 
                        dataKey="speed1" 
                        stroke="#3b82f6" 
                        fillOpacity={1} 
                        fill="url(#colorB)" 
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Elevation Chart */}
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-8">
                  <Mountain size={16} className="text-amber-500" />
                  <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Elevação (m)</h3>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorEleA" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorEleB" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                      <XAxis 
                        dataKey="xValue" 
                        stroke="#52525b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(val) => {
                          if (xAxisMode === 'distance') return `${val.toFixed(1)} km`;
                          const h = Math.floor(val / 3600);
                          const m = Math.floor((val % 3600) / 60);
                          const s = Math.floor(val % 60);
                          return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
                        }}
                      />
                      <YAxis 
                        stroke="#52525b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false} 
                        unit=" m"
                        domain={['dataMin - 5', 'dataMax + 5']}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                        itemStyle={{ fontSize: '12px' }}
                        labelStyle={{ fontSize: '10px', color: '#71717a', marginBottom: '4px' }}
                        labelFormatter={(val) => {
                          if (xAxisMode === 'distance') return `${val.toFixed(2)} km`;
                          const h = Math.floor(val / 3600);
                          const m = Math.floor((val % 3600) / 60);
                          const s = Math.floor(val % 60);
                          return h > 0 ? `Tempo: ${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `Tempo: ${m}:${s.toString().padStart(2, '0')}`;
                        }}
                      />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', paddingBottom: '20px' }} />
                      <Area 
                        name="Atividade A" 
                        type="monotone" 
                        dataKey="ele0" 
                        stroke="#10b981" 
                        fillOpacity={1} 
                        fill="url(#colorEleA)" 
                        strokeWidth={2}
                      />
                      <Area 
                        name="Atividade B" 
                        type="monotone" 
                        dataKey="ele1" 
                        stroke="#3b82f6" 
                        fillOpacity={1} 
                        fill="url(#colorEleB)" 
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Map & Playback Section */}
        {workouts.length > 0 && (
          <section className="mt-12 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                <Navigation size={14} /> Mapa do Trajeto
              </h2>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                  <button 
                    onClick={() => setIs3D(!is3D)}
                    className={cn(
                      "p-2 hover:bg-zinc-800 transition-colors border-r border-zinc-800 flex items-center gap-1",
                      is3D ? "text-emerald-400" : "text-zinc-400"
                    )}
                    title="Alternar Visão 3D"
                  >
                    <Box size={16} />
                    <span className="text-[10px] font-bold">3D</span>
                  </button>
                  <button 
                    onClick={() => setIsFullScreen(!isFullScreen)}
                    className={cn(
                      "p-2 hover:bg-zinc-800 transition-colors border-r border-zinc-800 flex items-center gap-1",
                      isFullScreen ? "text-emerald-400" : "text-zinc-400"
                    )}
                    title="Tela Cheia"
                  >
                    {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                  <button 
                    onClick={() => setPlaybackIndex(0)}
                    className="p-2 hover:bg-zinc-800 text-zinc-400 transition-colors"
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button 
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-2 px-4 hover:bg-zinc-800 text-white transition-colors border-x border-zinc-800 flex items-center gap-2"
                  >
                    {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                    <span className="text-[10px] font-bold uppercase tracking-widest">{isPlaying ? 'Pausar' : 'Play'}</span>
                  </button>
                  <button 
                    onClick={() => setPlaybackSpeed(prev => prev === 1 ? 2 : prev === 2 ? 4 : 1)}
                    className="p-2 px-3 hover:bg-zinc-800 text-zinc-400 transition-colors flex items-center gap-1"
                  >
                    <FastForward size={14} />
                    <span className="text-[10px] font-bold">{playbackSpeed}x</span>
                  </button>
                </div>
              </div>
            </div>

            <div className={cn(
              "bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden relative transition-all duration-500 ease-in-out",
              isFullScreen ? "fixed inset-0 z-[100] rounded-none h-screen w-screen" : "h-[500px] w-full",
              is3D && !isFullScreen ? "[perspective:1000px]" : ""
            )}>
              <div className={cn(
                "w-full h-full transition-transform duration-700",
                is3D && !isFullScreen ? "[transform:rotateX(35deg)_scale(1.1)_translateY(-20px)]" : ""
              )}>
                <MapContainer 
                  center={[0, 0]} 
                  zoom={13} 
                  scrollWheelZoom={false}
                  className="z-0"
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  {workouts.map((w, idx) => (
                    <Polyline 
                      key={w.id}
                      positions={w.points.map(p => [p.lat, p.lon])}
                      color={idx === 0 ? '#10b981' : '#3b82f6'}
                      weight={4}
                      opacity={0.6}
                    />
                  ))}
                  {currentPoints.map((p, idx) => {
                    if (!p) return null;
                    return (
                      <Marker 
                        key={idx} 
                        position={[p.lat, p.lon]} 
                        icon={L.divIcon({
                          className: 'custom-marker',
                          html: `<div style="background-color: ${idx === 0 ? '#10b981' : '#3b82f6'}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`,
                          iconSize: [12, 12],
                          iconAnchor: [6, 6]
                        })}
                      />
                    );
                  })}
                  <MapBounds points={allMapPoints} />
                  <MapResizer trigger={isFullScreen || is3D} />
                </MapContainer>
              </div>

              {/* Speedometers Overlay */}
              <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-zinc-900/60 backdrop-blur-md border border-zinc-800/50 p-2 rounded-xl">
                {workouts.map((w, idx) => {
                  const p = currentPoints[idx];
                  if (!p) return null;
                  return (
                    <Speedometer 
                      key={w.id}
                      speed={p.speed * 3.6}
                      label={w.name}
                      color={idx === 0 ? '#10b981' : '#3b82f6'}
                    />
                  );
                })}
              </div>

              {/* Playback Slider Overlay */}
              <div className="absolute bottom-6 left-6 right-6 z-10">
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={playbackIndex} 
                  onChange={(e) => setPlaybackIndex(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
            </div>
          </section>
        )}
        {workouts.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
            <Activity size={48} strokeWidth={1} className="mb-4 opacity-20" />
            <p className="text-sm italic serif">Aguardando dados para análise...</p>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-4" />
            <p className="text-xs uppercase tracking-widest font-bold text-zinc-500">Processando arquivos...</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-zinc-900 text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-700">
          Workout Analytics Engine &copy; 2026
        </p>
      </footer>
    </div>
  );
}
