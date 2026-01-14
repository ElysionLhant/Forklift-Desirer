
import React, { useState, useEffect, useRef } from 'react';
import { Ship, BrainCircuit, RotateCcw, Send, ChevronLeft, ChevronRight, Layers, LayoutGrid, Sparkles, Box, Settings, Paperclip, X, Trash2, FastForward, PieChart } from 'lucide-react';
import { CargoForm } from './components/CargoForm';
import { Container3D } from './components/Container3D';
import { CONTAINERS, MOCK_CARGO_COLORS } from './constants';
import { CargoItem, PackingResult, ChatMsg, AIConfig, DEFAULT_AI_CONFIG } from './types';
import { calculateShipment } from './services/packer';
import { AIService, extractCargoJSON } from './services/geminiService';

type StrategyMode = 'SMART_MIX' | 'CUSTOM_PLAN' | 'SINGLE';

export default function App() {
  const [cargoItems, setCargoItems] = useState<CargoItem[]>([]);
  const [strategyMode, setStrategyMode] = useState<StrategyMode>('SMART_MIX');
  const [singleStrategyType, setSingleStrategyType] = useState<string>('40HQ');
  const [customPlan, setCustomPlan] = useState<string[]>([]);
  const [shipmentResults, setShipmentResults] = useState<PackingResult[]>([]);
  const [strategySummaries, setStrategySummaries] = useState<Record<string, { count: number; desc: string }>>({});
  const [currentContainerIndex, setCurrentContainerIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
  const [showAnimation, setShowAnimation] = useState(true);
  const [skipAnimation, setSkipAnimation] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
  const [showSettings, setShowSettings] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [attachments, setAttachments] = useState<{url: string, base64: string, type: 'image'|'file'}[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [pendingCargoUpdate, setPendingCargoUpdate] = useState<any[] | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedConfig = localStorage.getItem('forklift_desirer_config');
    if (savedConfig) {
        try { setAiConfig(JSON.parse(savedConfig)); } catch (e) {}
    }
  }, []);

  useEffect(() => {
     localStorage.setItem('forklift_desirer_config', JSON.stringify(aiConfig));
  }, [aiConfig]);

  const handleLoadDemo = () => {
    setCargoItems([
      { id: '1', name: 'Std. Machinery Pallet', dimensions: { length: 120, width: 100, height: 210 }, weight: 800, quantity: 24, color: '#3b82f6' },
      { id: '2', name: 'Electronic Components', dimensions: { length: 80, width: 60, height: 80 }, weight: 150, quantity: 40, color: '#ef4444' },
      { id: '3', name: 'Tall Crate', dimensions: { length: 100, width: 100, height: 220 }, weight: 300, quantity: 5, color: '#eab308' }
    ]);
  };

  useEffect(() => {
    if (cargoItems.length === 0) {
        setStrategySummaries({});
        setShipmentResults([]);
        return;
    }

    const summaries: Record<string, { count: number; desc: string }> = {};
    const mixRes = calculateShipment('SMART_MIX', cargoItems);
    const mixCounts = mixRes.reduce((acc, curr) => { acc[curr.containerType] = (acc[curr.containerType] || 0) + 1; return acc; }, {} as Record<string, number>);
    const mixDesc = Object.entries(mixCounts).map(([t, c]) => `${c}x${t}`).join(', ');
    summaries['SMART_MIX'] = { count: mixRes.length, desc: mixDesc || "None" };

    CONTAINERS.forEach(c => {
        const res = calculateShipment(c, cargoItems);
        summaries[c.type] = { count: res.length, desc: `${res.length}x ${c.type}` };
    });

    setStrategySummaries(summaries);

    let activeRes: PackingResult[] = [];
    if (strategyMode === 'SMART_MIX') {
        activeRes = mixRes;
    } else if (strategyMode === 'SINGLE') {
        const spec = CONTAINERS.find(c => c.type === singleStrategyType)!;
        activeRes = calculateShipment(spec, cargoItems);
    } else if (strategyMode === 'CUSTOM_PLAN') {
        if (customPlan.length > 0) {
            const planSpecs = customPlan.map(type => CONTAINERS.find(c => c.type === type)!);
            activeRes = calculateShipment(planSpecs, cargoItems);
        }
    }
    
    setShipmentResults(activeRes);
    setCurrentContainerIndex(0);
    if (activeRes.length <= 1) setViewMode('single');
    handleRestartAnimation();
  }, [cargoItems, strategyMode, singleStrategyType, customPlan]);

  const handleRestartAnimation = () => {
      setSkipAnimation(false);
      setShowAnimation(false);
      setTimeout(() => setShowAnimation(true), 50);
  };

  const handleSwitchContainer = (newIndex: number) => {
      setCurrentContainerIndex(newIndex);
      setViewMode('single');
      handleRestartAnimation();
  };

  const handleToggleViewMode = () => {
      setViewMode(prev => prev === 'all' ? 'single' : 'all');
      handleRestartAnimation();
  };

  const handleSendMessage = async () => {
    if ((!chatInput.trim() && attachments.length === 0) || isChatLoading) return;
    const userMsg: ChatMsg = { role: 'user', text: chatInput, attachments };
    setChatHistory(prev => [...prev, userMsg]);
    setChatInput('');
    setAttachments([]);
    setIsChatLoading(true);

    const service = new AIService(aiConfig);
    const context = shipmentResults.length > 0 ? {
        cargoItems,
        result: shipmentResults[0],
        containerName: strategyMode === 'SMART_MIX' ? 'Smart Mix' : strategyMode === 'CUSTOM_PLAN' ? 'Custom Plan' : singleStrategyType
    } : undefined;

    const responseText = await service.sendMessage([...chatHistory, userMsg], context);
    setIsChatLoading(false);
    setChatHistory(prev => [...prev, { role: 'model', text: responseText }]);

    const extractedData = extractCargoJSON(responseText);
    if (extractedData && Array.isArray(extractedData)) {
        setPendingCargoUpdate(extractedData);
    }
  };

  const handleApplyCargoUpdate = () => {
      if (!pendingCargoUpdate) return;
      const newItems: CargoItem[] = pendingCargoUpdate.map((item: any, idx) => ({
          id: Math.random().toString(36).substr(2, 9),
          name: item.name || `Item ${idx+1}`,
          quantity: Number(item.qty) || 1,
          weight: Number(item.weight) || 10,
          dimensions: { length: Number(item.l) || 100, width: Number(item.w) || 100, height: Number(item.h) || 100 },
          unstackable: !!item.unstackable,
          color: MOCK_CARGO_COLORS[idx % MOCK_CARGO_COLORS.length]
      }));
      setCargoItems(newItems);
      setPendingCargoUpdate(null);
      setChatHistory(prev => [...prev, { role: 'model', text: "✅ Manifest updated. Calculations refreshed." }]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = (evt) => {
              const base64 = evt.target?.result as string;
              setAttachments(prev => [...prev, { type: 'image', url: URL.createObjectURL(file), base64 }]);
          };
          reader.readAsDataURL(file);
      }
  };

  const currentContainerSpec = shipmentResults.length > 0 && shipmentResults[currentContainerIndex]
    ? CONTAINERS.find(c => c.type === shipmentResults[currentContainerIndex].containerType) || CONTAINERS[0]
    : CONTAINERS[0];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-slate-900">
      {showSettings && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in duration-200">
                  <div className="flex justify-between items-center">
                      <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                          <BrainCircuit className="w-6 h-6 text-indigo-600" /> AI Settings
                      </h2>
                      <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                      <select value={aiConfig.provider} onChange={e => setAiConfig({...aiConfig, provider: e.target.value as any})} className="w-full p-2 border rounded-md">
                          <option value="gemini">Google Gemini (Cloud)</option>
                          <option value="openai">OpenAI Compatible</option>
                          <option value="ollama">Ollama (Local)</option>
                      </select>
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
                      <input type="text" value={aiConfig.modelName} onChange={e => setAiConfig({...aiConfig, modelName: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. gemini-3-flash-preview"/>
                  </div>
                  {/* Removed API Key input field as per guidelines - API key is strictly sourced from process.env.API_KEY */}
                  <div className="pt-2">
                      <button onClick={() => setShowSettings(false)} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700">Save Configuration</button>
                  </div>
              </div>
          </div>
      )}

      <header className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="bg-indigo-500 p-2 rounded-lg shadow-indigo-500/20 shadow-lg">
                    <Ship className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-xl font-bold tracking-tight">Forklift Desirer</h1>
                    <p className="text-xs text-slate-400">Loading Rate Optimization</p>
                </div>
            </div>
            <div className="flex gap-4 items-center">
                <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-md border border-slate-700 transition-colors">
                     <Settings className="w-4 h-4" />
                     <span className="text-sm">AI Config</span>
                </button>
            </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3 space-y-6 flex flex-col h-[calc(100vh-100px)] overflow-y-auto pb-10 hide-scrollbar">
            <CargoForm items={cargoItems} onAdd={(i) => setCargoItems([...cargoItems, i])} onRemove={(id) => setCargoItems(cargoItems.filter(i=>i.id !== id))} onLoadDemo={handleLoadDemo} />
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center">
                    <Layers className="w-4 h-4 mr-1 text-indigo-600" /> Optimization Plan
                </h3>
                <div className="space-y-2">
                    <button onClick={() => setStrategyMode('SMART_MIX')} className={`w-full text-left p-3 rounded-lg border transition-all relative overflow-hidden ${strategyMode === 'SMART_MIX' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-300' : 'bg-gradient-to-r from-indigo-50 to-white text-gray-700 border-indigo-100'}`}>
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2 mb-1">
                                <Sparkles className={`w-4 h-4 ${strategyMode === 'SMART_MIX' ? 'text-yellow-300' : 'text-indigo-500'}`} />
                                <span className="font-bold text-sm">Smart Optimized Mix</span>
                            </div>
                        </div>
                        <div className={`text-xs mt-1 ${strategyMode === 'SMART_MIX' ? 'text-indigo-100' : 'text-gray-500'}`}>
                            {strategySummaries['SMART_MIX']?.desc || 'Calculating...'}
                        </div>
                    </button>
                    <div className="pt-2 border-t border-gray-100">
                        <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-2">Uniform Containers</div>
                        {CONTAINERS.map(c => (
                            <button key={c.type} onClick={() => { setStrategyMode('SINGLE'); setSingleStrategyType(c.type); }} className={`w-full flex items-center justify-between p-2 mb-1 rounded text-xs transition-colors ${strategyMode === 'SINGLE' && singleStrategyType === c.type ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200' : 'text-gray-600 hover:bg-gray-100'}`}>
                                <span className="flex items-center gap-2"><Box className="w-3 h-3" /> {c.type}</span>
                                <div className="bg-gray-100 px-1.5 rounded text-[10px] text-gray-500 inline-block">x{strategySummaries[c.type]?.count || 0}</div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        <div className="lg:col-span-6 flex flex-col h-[600px] lg:h-[calc(100vh-100px)]">
             <div className="bg-white rounded-t-xl border border-b-0 border-gray-200 p-3 flex justify-between items-center shadow-sm z-10">
                 <div className="flex items-center gap-4">
                     <div className="flex flex-col">
                         <div className="flex items-center gap-2">
                             <span className="text-sm font-bold text-gray-700">{currentContainerSpec?.type}</span>
                             <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Unit #{currentContainerIndex + 1}</span>
                         </div>
                         {shipmentResults[currentContainerIndex] && (
                             <div className="text-[10px] text-indigo-600 font-medium mt-0.5 flex items-center gap-1">
                                 <PieChart className="w-3 h-3" />
                                 {shipmentResults[currentContainerIndex].volumeUtilization.toFixed(1)}% Vol | 
                                 {shipmentResults[currentContainerIndex].weightUtilization.toFixed(1)}% Weight
                             </div>
                         )}
                     </div>
                     {shipmentResults.length > 0 && (
                         <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                             <button onClick={() => handleSwitchContainer(Math.max(0, currentContainerIndex - 1))} disabled={viewMode === 'all' || currentContainerIndex === 0} className="p-1 hover:bg-white rounded-md disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                             <button onClick={handleToggleViewMode} className={`px-3 py-1 text-xs font-bold rounded-md flex items-center gap-2 ${viewMode === 'all' ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-white'}`}>{viewMode === 'all' ? <><LayoutGrid className="w-3 h-3" /> All</> : <span>{currentContainerIndex + 1}/{shipmentResults.length}</span>}</button>
                             <button onClick={() => handleSwitchContainer(Math.min(shipmentResults.length - 1, currentContainerIndex + 1))} disabled={viewMode === 'all' || currentContainerIndex === shipmentResults.length - 1} className="p-1 hover:bg-white rounded-md disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                         </div>
                     )}
                 </div>
                 <div className="flex items-center gap-2">
                     <button onClick={() => setSkipAnimation(true)} className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"><FastForward className="w-3.5 h-3.5" /></button>
                     <button onClick={handleRestartAnimation} className="flex items-center gap-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"><RotateCcw className="w-3.5 h-3.5" /></button>
                 </div>
             </div>
             <div className="flex-1 bg-gradient-to-b from-slate-100 to-slate-200 rounded-b-xl shadow-lg border border-gray-200 relative overflow-hidden">
                {shipmentResults[currentContainerIndex] && showAnimation ? (
                    <Container3D key={`${strategyMode}-${currentContainerIndex}-${viewMode}`} container={currentContainerSpec} results={shipmentResults} viewMode={viewMode} currentIndex={currentContainerIndex} skipAnimation={skipAnimation} />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 text-center px-4">
                        {cargoItems.length > 0 ? <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin"></div> : <span>Enter cargo details to calculate optimal loading plan.</span>}
                    </div>
                )}
             </div>
        </div>

        <div className="lg:col-span-3 space-y-6 flex flex-col h-[calc(100vh-100px)]">
            <div className="flex flex-col bg-white rounded-xl shadow-lg border border-indigo-100 overflow-hidden flex-1">
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-3 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BrainCircuit className="w-4 h-4" />
                        <div>
                            <h3 className="font-semibold text-sm leading-tight">AI Advisor</h3>
                            <p className="text-[10px] text-indigo-100">{aiConfig.provider}</p>
                        </div>
                    </div>
                </div>
                <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-slate-50">
                    {chatHistory.map((msg, idx) => (
                        <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-700'}`}>
                                <div className="whitespace-pre-wrap">{msg.text}</div>
                            </div>
                        </div>
                    ))}
                    {pendingCargoUpdate && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mx-2 animate-in slide-in-from-bottom-2">
                            <div className="flex items-center gap-2 text-green-800 font-bold text-sm mb-2"><Sparkles className="w-4 h-4" /> Import Identified Cargo?</div>
                            <div className="flex gap-2">
                                <button onClick={handleApplyCargoUpdate} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded text-xs font-bold transition-colors">Apply</button>
                                <button onClick={() => setPendingCargoUpdate(null)} className="px-3 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded text-xs">Cancel</button>
                            </div>
                        </div>
                    )}
                    {isChatLoading && <div className="animate-pulse text-xs text-gray-400 p-2 text-center">AI is analyzing...</div>}
                    <div ref={chatEndRef} />
                </div>
                <div className="p-3 bg-white border-t border-gray-100">
                    <div className="relative flex items-center gap-2">
                        <button onClick={() => fileInputRef.current?.click()} className="text-gray-400 hover:text-indigo-600"><Paperclip className="w-5 h-5" /></button>
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
                        <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Ask about efficiency..." className="w-full bg-gray-100 text-sm rounded-full pl-4 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 border-none" />
                        <button onClick={handleSendMessage} className="absolute right-1.5 bg-indigo-600 text-white p-1.5 rounded-full"><Send className="w-3.5 h-3.5" /></button>
                    </div>
                </div>
            </div>
        </div>
      </main>
    </div>
  );
}
