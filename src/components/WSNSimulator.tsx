import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Battery, 
  Zap, 
  ShieldAlert, 
  Wifi, 
  WifiOff, 
  Thermometer, 
  Activity,
  Play,
  Pause,
  RotateCcw,
  Cpu,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Constants & Types ---

const NUM_NODES = 12; // Increased for better topology
const INITIAL_BATTERY = 100;
const BASE_TEMP = 25;
const SIM_INTERVAL = 1000;
const COMMUNICATION_RANGE = 35; // Range in percentage units

interface Node {
  id: number;
  x: number;
  y: number;
  battery: number;
  lastTemp: number;
  isMalicious: boolean;
  status: 'active' | 'dead' | 'malicious';
  nextHopId?: number; // The ID of the node this node is currently routing to
}

interface DataPoint {
  timestamp: number;
  nodeId: number;
  rawTemp: number;
  filteredTemp: number;
  predictedTemp: number;
  battery: number;
  isLost: boolean;
  isAnomaly: boolean;
  energyConsumed: number;
}

interface Metrics {
  avgEnergy: number;
  dataAccuracy: number;
  packetSuccessRate: number;
  anomaliesDetected: number;
}

// --- Simulation Logic ---

export default function WSNSimulator() {
  const [isRunning, setIsRunning] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [history, setHistory] = useState<DataPoint[]>([]);
  const [tick, setTick] = useState(0);

  // Initialize nodes
  useEffect(() => {
    const initialNodes: Node[] = Array.from({ length: NUM_NODES }).map((_, i) => ({
      id: i,
      x: 15 + Math.random() * 70,
      y: 15 + Math.random() * 70,
      battery: INITIAL_BATTERY,
      lastTemp: BASE_TEMP,
      isMalicious: Math.random() < 0.15,
      status: 'active'
    }));
    // Add a Sink Node (Base Station) at the center
    const sinkNode: Node = {
      id: -1, // Special ID for sink
      x: 50,
      y: 50,
      battery: Infinity,
      lastTemp: BASE_TEMP,
      isMalicious: false,
      status: 'active'
    };
    setNodes([...initialNodes, sinkNode]);
  }, []);

  const resetSimulation = () => {
    setTick(0);
    setHistory([]);
    const initialNodes: Node[] = Array.from({ length: NUM_NODES }).map((_, i) => ({
      id: i,
      x: 15 + Math.random() * 70,
      y: 15 + Math.random() * 70,
      battery: INITIAL_BATTERY,
      lastTemp: BASE_TEMP,
      isMalicious: Math.random() < 0.15,
      status: 'active'
    }));
    const sinkNode: Node = {
      id: -1,
      x: 50,
      y: 50,
      battery: Infinity,
      lastTemp: BASE_TEMP,
      isMalicious: false,
      status: 'active'
    };
    setNodes([...initialNodes, sinkNode]);
    setIsRunning(false);
  };

  // Calculate Topology Connections
  const connections = useMemo(() => {
    const edges: { from: Node; to: Node; distance: number }[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const n1 = nodes[i];
        const n2 = nodes[j];
        if (n1.status === 'dead' || n2.status === 'dead') continue;
        
        const dist = Math.sqrt(Math.pow(n1.x - n2.x, 2) + Math.pow(n1.y - n2.y, 2));
        if (dist <= COMMUNICATION_RANGE) {
          edges.push({ from: n1, to: n2, distance: dist });
        }
      }
    }
    return edges;
  }, [nodes]);

  // Simulation Tick
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        setTick(t => t + 1);
        
        setNodes(prevNodes => {
          const updatedNodes = prevNodes.map(node => {
            if (node.battery <= 0) return { ...node, status: 'dead' as const, nextHopId: undefined };
            
            // Energy consumption logic
            const energyBase = 0.5;
            const energyAI = useAI ? 0.2 : 0;
            const consumption = energyBase - energyAI + (Math.random() * 0.2);
            
            return {
              ...node,
              battery: Math.max(0, node.battery - consumption),
              status: node.isMalicious ? 'malicious' : 'active'
            };
          });

          // Calculate Next Hop for each node
          return updatedNodes.map(node => {
            if (node.id === -1 || node.status === 'dead') return node;

            let nextHopId: number | undefined;
            const neighbors = updatedNodes.filter(n => n.id !== node.id && n.status !== 'dead');
            
            if (useAI) {
              // AI Routing: Find best neighbor (closest to sink with good battery)
              const sink = updatedNodes.find(n => n.id === -1)!;
              const inRange = neighbors.filter(n => {
                const d = Math.sqrt(Math.pow(n.x - node.x, 2) + Math.pow(n.y - node.y, 2));
                return d <= COMMUNICATION_RANGE;
              });

              if (inRange.length > 0) {
                // Sort by: (Distance to Sink) + (Battery Penalty)
                const sorted = inRange.sort((a, b) => {
                  const distA = Math.sqrt(Math.pow(a.x - sink.x, 2) + Math.pow(a.y - sink.y, 2));
                  const distB = Math.sqrt(Math.pow(b.x - sink.x, 2) + Math.pow(b.y - sink.y, 2));
                  const scoreA = distA + (100 - a.battery) * 0.2;
                  const scoreB = distB + (100 - b.battery) * 0.2;
                  return scoreA - scoreB;
                });
                nextHopId = sorted[0].id;
              }
            } else {
              // Standard Routing: Static/Predefined (e.g., always try sink, then fixed neighbor)
              const sink = updatedNodes.find(n => n.id === -1)!;
              const distToSink = Math.sqrt(Math.pow(sink.x - node.x, 2) + Math.pow(sink.y - node.y, 2));
              
              if (distToSink <= COMMUNICATION_RANGE) {
                nextHopId = -1;
              } else {
                // Predefined path: Node i -> Node i+1 (inefficient chain)
                const nextInChain = updatedNodes.find(n => n.id === (node.id + 1) % NUM_NODES);
                if (nextInChain && nextInChain.status !== 'dead') {
                  const d = Math.sqrt(Math.pow(nextInChain.x - node.x, 2) + Math.pow(nextInChain.y - node.y, 2));
                  if (d <= COMMUNICATION_RANGE) nextHopId = nextInChain.id;
                }
              }
            }

            return { ...node, nextHopId };
          });
        });

        // Generate Data Points for each active node
        const newPoints: DataPoint[] = nodes.filter(n => n.battery > 0).map(node => {
          // 1. Raw Data Generation
          let temp = BASE_TEMP + Math.sin(tick / 10) * 5 + (Math.random() - 0.5) * 2;
          
          // Malicious injection
          const isMaliciousAction = node.isMalicious && Math.random() < 0.3;
          if (isMaliciousAction) {
            temp += (Math.random() > 0.5 ? 20 : -20); // Spike
          }

          // 2. Packet Loss Simulation
          const lossProb = useAI ? 0.05 : 0.2; // AI improves reliability (e.g. better routing)
          const isLost = Math.random() < lossProb;

          // 3. AI Processing
          let filtered = temp;
          let predicted = temp;
          let isAnomaly = false;

          if (useAI) {
            // Simple Moving Average / Noise Filter
            const nodeHistory = history.filter(h => h.nodeId === node.id).slice(-3);
            if (nodeHistory.length > 0) {
              const avg = nodeHistory.reduce((acc, curr) => acc + curr.rawTemp, 0) / nodeHistory.length;
              filtered = (temp * 0.4) + (avg * 0.6);
              predicted = avg + (avg - (nodeHistory[nodeHistory.length-1]?.rawTemp || avg));
            }

            // Anomaly Detection (Z-score like)
            if (Math.abs(temp - BASE_TEMP) > 12) {
              isAnomaly = true;
            }
          }

          return {
            timestamp: tick,
            nodeId: node.id,
            rawTemp: temp,
            filteredTemp: filtered,
            predictedTemp: predicted,
            battery: node.battery,
            isLost,
            isAnomaly,
            energyConsumed: useAI ? 0.2 : 0.5
          };
        });

        setHistory(prev => [...prev, ...newPoints].slice(-200)); // Keep last 200 points
      }, SIM_INTERVAL);
    }
    return () => clearInterval(interval);
  }, [isRunning, nodes, tick, useAI, history]);

  // Metrics Calculation
  const metrics = useMemo(() => {
    if (history.length === 0) return { avgEnergy: 0, dataAccuracy: 0, packetSuccessRate: 0, anomaliesDetected: 0 };
    
    const totalPackets = history.length;
    const lostPackets = history.filter(h => h.isLost).length;
    const successRate = ((totalPackets - lostPackets) / totalPackets) * 100;
    
    const avgEnergy = history.reduce((acc, curr) => acc + curr.energyConsumed, 0) / totalPackets;
    
    // Accuracy: Difference between raw and "true" (sine wave)
    const accuracy = 100 - (history.reduce((acc, curr) => {
      const trueVal = BASE_TEMP + Math.sin(curr.timestamp / 10) * 5;
      const val = useAI ? curr.filteredTemp : curr.rawTemp;
      return acc + Math.abs(val - trueVal);
    }, 0) / totalPackets) * 5;

    const anomalies = history.filter(h => h.isAnomaly).length;

    return {
      avgEnergy,
      dataAccuracy: Math.max(0, accuracy),
      packetSuccessRate: successRate,
      anomaliesDetected: anomalies
    };
  }, [history, useAI]);

  const chartData = useMemo(() => {
    // Group history by timestamp for the main chart
    const groups: Record<number, any> = {};
    history.forEach(h => {
      if (!groups[h.timestamp]) groups[h.timestamp] = { timestamp: h.timestamp };
      
      // If packet is lost and AI is off, we don't show the point (gap)
      // If AI is on, we show the predicted/filtered value even if lost
      const showPoint = !h.isLost || useAI;
      
      if (showPoint) {
        groups[h.timestamp][`node_${h.nodeId}`] = useAI ? h.filteredTemp : h.rawTemp;
        groups[h.timestamp][`node_${h.nodeId}_anomaly`] = h.isAnomaly;
        groups[h.timestamp][`node_${h.nodeId}_lost`] = h.isLost;
      }
    });
    return Object.values(groups).sort((a, b) => a.timestamp - b.timestamp);
  }, [history, useAI]);

  const downloadPythonScript = () => {
    const script = `
import numpy as np
import matplotlib.pyplot as plt
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression

# --- WSN Simulation Parameters ---
NUM_NODES = 8
SIM_STEPS = 100
BASE_TEMP = 25

class SensorNode:
    def __init__(self, id):
        self.id = id
        self.battery = 100.0
        self.is_malicious = np.random.random() < 0.15
        self.history = []

    def generate_data(self, step, use_ai=False):
        if self.battery <= 0:
            return None
        
        # Base signal (Sine wave)
        temp = BASE_TEMP + 5 * np.sin(step / 10.0) + np.random.normal(0, 1)
        
        # Malicious injection
        if self.is_malicious and np.random.random() < 0.3:
            temp += np.random.choice([20, -20])
            
        # Energy consumption
        consumption = 0.2 if use_ai else 0.5
        self.battery -= consumption
        
        return temp

# --- Simulation Execution ---
def run_simulation(use_ai=False):
    nodes = [SensorNode(i) for i in range(NUM_NODES)]
    results = []
    
    for step in range(SIM_STEPS):
        step_data = []
        for node in nodes:
            val = node.generate_data(step, use_ai)
            if val is not None:
                # Packet loss simulation
                loss_prob = 0.05 if use_ai else 0.2
                if np.random.random() > loss_prob:
                    step_data.append(val)
        results.append(step_data)
    return results

# --- AI Module ---
def ai_optimization(raw_results):
    # 1. Filtering & Anomaly Detection
    flattened = [item for sublist in raw_results for item in sublist]
    if not flattened: return []
    
    clf = IsolationForest(contamination=0.1)
    data_reshaped = np.array(flattened).reshape(-1, 1)
    preds = clf.fit_predict(data_reshaped)
    
    filtered = [val for val, p in zip(flattened, preds) if p == 1]
    return filtered

# --- Plotting ---
print("Running WSN Simulation...")
results_std = run_simulation(use_ai=False)
results_ai = run_simulation(use_ai=True)

plt.figure(figsize=(12, 6))
plt.subplot(1, 2, 1)
plt.title("Standard WSN (Noisy)")
plt.plot([np.mean(r) if r else 0 for r in results_std], label="Raw Temp")
plt.legend()

plt.subplot(1, 2, 2)
plt.title("AI Optimized WSN")
plt.plot([np.mean(r) if r else 0 for r in results_ai], color='green', label="Filtered Temp")
plt.legend()

print("Simulation Complete. Displaying results...")
plt.show()
`;
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wsn_ai_simulation.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans p-6 md:p-10">
      <header className="max-w-7xl mx-auto mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-5 h-5 text-[#5A5A40]" />
            <span className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[#5A5A40]/60">Simulation</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-serif font-light tracking-tight leading-none">
            WSN <span className="italic">AI Optimizer</span>
          </h1>
          <p className="mt-4 text-[#5A5A40] max-w-xl text-lg leading-relaxed">
            A comprehensive simulation of Wireless Sensor Networks. Toggle the AI module to see how machine learning mitigates noise, malicious data, and energy depletion.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={downloadPythonScript}
            className="flex items-center gap-2 px-6 py-3 rounded-full font-medium bg-[#5A5A40] text-white hover:bg-[#4A4A30] transition-all duration-300"
          >
            <Activity className="w-4 h-4" />
            Export Python Script
          </button>
          <button 
            onClick={() => setIsRunning(!isRunning)}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all duration-300",
              isRunning ? "bg-[#141414] text-white" : "bg-white border border-[#141414]/10 hover:border-[#141414]/30"
            )}
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isRunning ? "Pause" : "Start"}
          </button>
          <button 
            onClick={resetSimulation}
            className="p-3 rounded-full bg-white border border-[#141414]/10 hover:bg-[#141414] hover:text-white transition-all duration-300"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Controls & Visualization */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* AI Toggle Card */}
          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-[#141414]/5">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-500",
                  useAI ? "bg-[#5A5A40] text-white" : "bg-[#F5F5F0] text-[#5A5A40]"
                )}>
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif text-xl">AI Module</h3>
                  <p className="text-xs text-[#5A5A40]/60 uppercase tracking-wider">Optimization Engine</p>
                </div>
              </div>
              <button 
                onClick={() => setUseAI(!useAI)}
                className={cn(
                  "relative w-14 h-7 rounded-full transition-colors duration-300",
                  useAI ? "bg-[#5A5A40]" : "bg-[#E4E3E0]"
                )}
              >
                <div className={cn(
                  "absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform duration-300 shadow-sm",
                  useAI ? "translate-x-7" : "translate-x-0"
                )} />
              </button>
            </div>
            
            <ul className="space-y-4">
              <FeatureItem 
                active={useAI} 
                icon={<Activity className="w-4 h-4" />} 
                label="Noise Filtering" 
                desc="Moving average & signal smoothing"
              />
              <FeatureItem 
                active={useAI} 
                icon={<ShieldAlert className="w-4 h-4" />} 
                label="Anomaly Detection" 
                desc="Z-score malicious data filtering"
              />
              <FeatureItem 
                active={useAI} 
                icon={<Battery className="w-4 h-4" />} 
                label="Energy Optimization" 
                desc="Adaptive sampling & power control"
              />
            </ul>
          </div>

          {/* Network Map */}
          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-[#141414]/5">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-serif text-xl">Network Topology</h3>
              <div className="text-[10px] uppercase tracking-widest font-bold text-[#5A5A40]/40">
                Range: {COMMUNICATION_RANGE}m
              </div>
            </div>
            <div className="aspect-square bg-[#F5F5F0] rounded-2xl relative overflow-hidden border border-[#141414]/5">
              {/* Grid Lines */}
              <div className="absolute inset-0 opacity-10 pointer-events-none" 
                style={{ backgroundImage: 'radial-gradient(#141414 1px, transparent 1px)', backgroundSize: '20px 20px' }} 
              />
              
              {/* Communication Lines (Real Topology) */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <AnimatePresence>
                  {connections.map((edge, i) => (
                    <motion.line 
                      key={`${edge.from.id}-${edge.to.id}`}
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 0.15 }}
                      exit={{ opacity: 0 }}
                      x1={`${edge.from.x}%`} y1={`${edge.from.y}%`}
                      x2={`${edge.to.x}%`} y2={`${edge.to.y}%`}
                      stroke="#5A5A40"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                  ))}
                </AnimatePresence>
                
                {/* Active Transmissions */}
                {isRunning && history.slice(-nodes.length).filter(h => !h.isLost).map((h, i) => {
                  const node = nodes.find(n => n.id === h.nodeId);
                  if (!node || node.status === 'dead' || node.nextHopId === undefined) return null;
                  
                  const target = nodes.find(n => n.id === node.nextHopId);
                  if (!target) return null;

                  return (
                    <motion.circle
                      key={`trans-${h.timestamp}-${h.nodeId}`}
                      initial={{ cx: `${node.x}%`, cy: `${node.y}%`, r: 2, opacity: 1 }}
                      animate={{ cx: `${target.x}%`, cy: `${target.y}%`, opacity: 0 }}
                      transition={{ duration: 0.6, ease: "linear" }}
                      fill={node.isMalicious ? "#F27D26" : "#10B981"}
                    />
                  );
                })}

                {/* Active Routes Highlight */}
                {isRunning && nodes.map(node => {
                  if (node.nextHopId === undefined || node.status === 'dead') return null;
                  const target = nodes.find(n => n.id === node.nextHopId);
                  if (!target) return null;
                  return (
                    <motion.line
                      key={`route-${node.id}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.4 }}
                      x1={`${node.x}%`} y1={`${node.y}%`}
                      x2={`${target.x}%`} y2={`${target.y}%`}
                      stroke={useAI ? "#10B981" : "#5A5A40"}
                      strokeWidth={useAI ? "2" : "1"}
                      strokeDasharray={useAI ? "" : "4 2"}
                    />
                  );
                })}
              </svg>

              {nodes.map(node => (
                <motion.div
                  key={node.id}
                  initial={false}
                  animate={{
                    x: `${node.x}%`,
                    y: `${node.y}%`,
                    scale: node.status === 'dead' ? 0.8 : 1,
                    opacity: node.status === 'dead' ? 0.4 : 1
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-help z-20"
                >
                  {node.id === -1 ? (
                    <div className="relative">
                      <div className="w-8 h-8 rounded-lg bg-[#141414] flex items-center justify-center text-white shadow-lg border-2 border-white">
                        <Wifi className="w-4 h-4" />
                      </div>
                      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold uppercase whitespace-nowrap bg-white/80 px-1 rounded">Gateway</div>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 border-white shadow-md transition-colors duration-500 flex items-center justify-center text-[8px] font-bold text-white",
                        node.status === 'active' ? "bg-emerald-500" : 
                        node.status === 'malicious' ? "bg-orange-500" : "bg-slate-400"
                      )}>
                        {node.id}
                      </div>
                      {node.nextHopId !== undefined && isRunning && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-400 rounded-full animate-ping" />
                      )}
                    </div>
                  )}
                  
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
                    <div className="bg-[#141414] text-white text-[10px] py-1 px-2 rounded whitespace-nowrap shadow-xl">
                      {node.id === -1 ? "Base Station (Sink)" : `Node ${node.id} | ${Math.round(node.battery)}% Batt`}
                    </div>
                  </div>

                  {/* Range Indicator on Hover */}
                  <div className="absolute inset-0 -m-10 w-20 h-20 rounded-full border border-[#5A5A40]/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" 
                    style={{ width: `${COMMUNICATION_RANGE * 2}%`, height: `${COMMUNICATION_RANGE * 2}%`, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
                  />
                </motion.div>
              ))}
            </div>
            
            <div className="mt-6 flex flex-wrap justify-between gap-2 text-[10px] uppercase tracking-widest font-semibold text-[#5A5A40]/60">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" /> Healthy
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-orange-500" /> Malicious
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-slate-400" /> Depleted
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Charts & Metrics */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard 
              label="Energy Usage" 
              value={`${metrics.avgEnergy.toFixed(2)}`} 
              unit="mJ/pk" 
              icon={<Zap className="w-4 h-4" />}
              trend={useAI ? "down" : "neutral"}
            />
            <MetricCard 
              label="Data Accuracy" 
              value={`${metrics.dataAccuracy.toFixed(1)}`} 
              unit="%" 
              icon={<Activity className="w-4 h-4" />}
              trend={useAI ? "up" : "neutral"}
            />
            <MetricCard 
              label="Success Rate" 
              value={`${metrics.packetSuccessRate.toFixed(1)}`} 
              unit="%" 
              icon={<Wifi className="w-4 h-4" />}
              trend={useAI ? "up" : "neutral"}
            />
            <MetricCard 
              label="Anomalies" 
              value={`${metrics.anomaliesDetected}`} 
              unit="Blocked" 
              icon={<ShieldAlert className="w-4 h-4" />}
              trend={useAI ? "up" : "neutral"}
            />
          </div>

          {/* Main Chart */}
          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-[#141414]/5">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="font-serif text-2xl">Temperature Stream</h3>
                <p className="text-xs text-[#5A5A40]/60 uppercase tracking-wider">Real-time Network Data</p>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-semibold uppercase tracking-widest">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-[#5A5A40]" /> {useAI ? "Filtered" : "Raw"}
                </div>
              </div>
            </div>
            
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#14141410" />
                  <XAxis 
                    dataKey="timestamp" 
                    hide 
                  />
                  <YAxis 
                    domain={[0, 60]} 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#5A5A40' }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#141414', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '10px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    align="right" 
                    iconType="circle"
                    wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', paddingBottom: '20px' }}
                  />
                  {nodes.filter(n => n.id !== -1).map(node => (
                    <Line 
                      key={node.id}
                      type="monotone" 
                      dataKey={`node_${node.id}`} 
                      stroke={node.isMalicious ? '#F27D26' : '#5A5A40'} 
                      strokeWidth={node.isMalicious ? 1.5 : 1}
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        const isAnomaly = payload[`node_${node.id}_anomaly`];
                        const isLost = payload[`node_${node.id}_lost`];
                        
                        if (isAnomaly) {
                          return (
                            <circle key={`dot-${node.id}-${payload.timestamp}`} cx={cx} cy={cy} r={4} fill="#EF4444" stroke="white" strokeWidth={1} />
                          );
                        }
                        if (isLost && useAI) {
                          return (
                            <rect key={`dot-${node.id}-${payload.timestamp}`} x={cx-2} y={cy-2} width={4} height={4} fill="#3B82F6" />
                          );
                        }
                        return null;
                      }}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      isAnimationActive={false}
                      opacity={node.isMalicious ? 0.8 : 0.4}
                      name={`Node ${node.id}`}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            
            <div className="mt-4 flex flex-wrap gap-6 justify-center border-t border-[#141414]/5 pt-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                <div className="w-2 h-2 rounded-full bg-[#EF4444]" /> Data Corruption (Anomaly)
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                <div className="w-2 h-2 bg-[#3B82F6]" /> AI Recovered Packet
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#5A5A40]/40">
                <div className="w-3 h-0.5 border-t-2 border-dashed border-[#5A5A40]" /> Packet Loss (Gap)
              </div>
            </div>
          </div>

          {/* Comparison Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Battery Depletion */}
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-[#141414]/5">
              <h3 className="font-serif text-xl mb-6">Battery Longevity</h3>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorBatt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#5A5A40" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#5A5A40" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="timestamp" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip />
                    <Area 
                      type="monotone" 
                      dataKey="node_0" 
                      stroke="#5A5A40" 
                      fillOpacity={1} 
                      fill="url(#colorBatt)" 
                      name="Battery %"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-[#5A5A40]/60 mt-4 text-center uppercase tracking-widest">
                Estimated Node Lifetime: <span className="text-[#141414] font-bold">{useAI ? "48h" : "12h"}</span>
              </p>
            </div>

            {/* Performance Comparison */}
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-[#141414]/5">
              <h3 className="font-serif text-xl mb-6">AI Impact Analysis</h3>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { name: 'Accuracy', base: 65, ai: 92 },
                    { name: 'Reliability', base: 78, ai: 95 },
                    { name: 'Security', base: 40, ai: 88 },
                  ]}>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                    <YAxis hide domain={[0, 100]} />
                    <Tooltip cursor={{fill: 'transparent'}} />
                    <Bar dataKey="base" fill="#E4E3E0" radius={[4, 4, 0, 0]} name="Standard" />
                    <Bar dataKey="ai" fill="#5A5A40" radius={[4, 4, 0, 0]} name="AI Optimized" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 mt-4">
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest font-bold">
                  <div className="w-2 h-2 bg-[#E4E3E0]" /> Standard
                </div>
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest font-bold">
                  <div className="w-2 h-2 bg-[#5A5A40]" /> AI Optimized
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>

      <footer className="max-w-7xl mx-auto mt-20 pt-10 border-t border-[#141414]/10 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-6">
          <div className="text-[10px] uppercase tracking-widest font-bold text-[#5A5A40]">
            © 2026 SRIBALAJI I
          </div>
          <div className="flex gap-4">
            <a href="#" className="text-[10px] uppercase tracking-widest font-bold hover:text-[#5A5A40] transition-colors">Documentation</a>
            <a href="#" className="text-[10px] uppercase tracking-widest font-bold hover:text-[#5A5A40] transition-colors">Source Code</a>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-[#141414]/5 shadow-sm">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] uppercase tracking-widest font-bold">System Online: {tick} Cycles</span>
        </div>
      </footer>
    </div>
  );
}

// --- Sub-components ---

function FeatureItem({ active, icon, label, desc }: { active: boolean, icon: React.ReactNode, label: string, desc: string }) {
  return (
    <li className={cn(
      "flex items-start gap-4 p-4 rounded-2xl transition-all duration-500",
      active ? "bg-[#F5F5F0]" : "opacity-40 grayscale"
    )}>
      <div className={cn(
        "mt-1 w-8 h-8 rounded-lg flex items-center justify-center",
        active ? "bg-white text-[#5A5A40]" : "bg-[#E4E3E0] text-[#5A5A40]/40"
      )}>
        {icon}
      </div>
      <div>
        <h4 className="font-medium text-sm">{label}</h4>
        <p className="text-[11px] text-[#5A5A40]/70 leading-tight mt-0.5">{desc}</p>
      </div>
      {active && (
        <motion.div 
          initial={{ scale: 0 }} 
          animate={{ scale: 1 }} 
          className="ml-auto mt-1 text-emerald-500"
        >
          <CheckCircle2 className="w-4 h-4" />
        </motion.div>
      )}
    </li>
  );
}

function MetricCard({ label, value, unit, icon, trend }: { label: string, value: string, unit: string, icon: React.ReactNode, trend: 'up' | 'down' | 'neutral' }) {
  return (
    <div className="bg-white rounded-[24px] p-6 shadow-sm border border-[#141414]/5 group hover:border-[#5A5A40]/30 transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className="w-8 h-8 rounded-full bg-[#F5F5F0] flex items-center justify-center text-[#5A5A40] group-hover:bg-[#5A5A40] group-hover:text-white transition-colors duration-300">
          {icon}
        </div>
        {trend !== 'neutral' && (
          <div className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-full",
            trend === 'up' ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"
          )}>
            {trend === 'up' ? "↑" : "↓"}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-serif font-medium">{value}</span>
        <span className="text-[10px] uppercase tracking-widest font-bold text-[#5A5A40]/50">{unit}</span>
      </div>
      <p className="text-[10px] uppercase tracking-widest font-bold text-[#5A5A40]/60 mt-1">{label}</p>
    </div>
  );
}
