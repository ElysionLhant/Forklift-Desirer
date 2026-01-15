
import React, { useState, useEffect, useRef } from 'react';
import { Ship, BrainCircuit, RotateCcw, Send, ChevronLeft, ChevronRight, Layers, LayoutGrid, Sparkles, Box, Settings, Paperclip, X, Trash2, FastForward, PieChart, Copy, FileJson, History, Plus } from 'lucide-react';
import { CargoForm } from './components/CargoForm';
import { Container3D } from './components/Container3D';
import { CONTAINERS, MOCK_CARGO_COLORS } from './constants';
import { CargoItem, PackingResult, ChatMsg, AIConfig, DEFAULT_AI_CONFIG, ChatSession } from './types';
import { calculateShipmentAsync } from './services/packer';
import { AIService, extractCargoJSON, DATA_EXTRACTION_PROMPT, ADVISOR_PROMPT } from './services/aiService';

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
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');

  const [aiConfig, setAiConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);

  const [showSettings, setShowSettings] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [attachments, setAttachments] = useState<{url: string, base64: string, type: 'image'|'file'}[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isPacking, setIsPacking] = useState(false);
  const [packingProgress, setPackingProgress] = useState('');
  const [pendingCargoUpdate, setPendingCargoUpdate] = useState<any[] | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
     // Auto-save session
     if (currentSessionId && chatHistory.length > 0) {
         setChatSessions(prev => {
             const existing = prev.findIndex(s => s.id === currentSessionId);
             if (existing >= 0) {
                 const updated = [...prev];
                 updated[existing] = { ...updated[existing], messages: chatHistory };
                 return updated;
             }
             return prev;
         });
     }
  }, [chatHistory, currentSessionId]);

  useEffect(() => {
    const savedConfig = localStorage.getItem('forklift_desirer_config');
    if (savedConfig) {
        try { setAiConfig(JSON.parse(savedConfig)); } catch (e) {}
    }
  }, []);

  useEffect(() => {
     if (aiConfig.provider === 'ollama') {
         AIService.getOllamaModels(aiConfig.baseUrl).then(models => {
             if (models.length > 0) setOllamaModels(models);
         });
     }
  }, [aiConfig.provider, aiConfig.baseUrl]);

  useEffect(() => {
     localStorage.setItem('forklift_desirer_config', JSON.stringify(aiConfig));
  }, [aiConfig]);

  const handleLoadDemo = () => {
    setCargoItems([
      { id: '1', name: 'Industrial Machine Unit A', dimensions: { length: 210, width: 130, height: 140 }, weight: 1200, quantity: 12, color: '#2563eb' },
      { id: '2', name: 'Power Supply Cabinet', dimensions: { length: 110, width: 90, height: 180 }, weight: 450, quantity: 24, color: '#dc2626' },
      { id: '3', name: 'Heavy Duty Compressor', dimensions: { length: 150, width: 100, height: 110 }, weight: 680, quantity: 16, color: '#d97706' },
      { id: '4', name: 'Spare Parts Crate', dimensions: { length: 120, width: 80, height: 80 }, weight: 180, quantity: 30, color: '#16a34a' },
    ]);
  };

  useEffect(() => {
    const runPacking = async () => {
        if (cargoItems.length === 0) {
            setStrategySummaries({});
            setShipmentResults([]);
            return;
        }

        setIsPacking(true);
        setPackingProgress('Initializing...');

        // Wait a tick to let the UI show "Initializing"
        await new Promise(r => setTimeout(r, 10));

        try {
            const summaries: Record<string, { count: number; desc: string }> = {};
            const resultsCache: Record<string, PackingResult[]> = {};

            // 1. Calculate Smart Mix
            setPackingProgress('Optimizing Mix Strategy...');
            const mixRes = await calculateShipmentAsync('SMART_MIX', cargoItems, (msg) => setPackingProgress(`[Smart Mix] ${msg}`));
            resultsCache['SMART_MIX'] = mixRes;

            const mixCounts = mixRes.reduce((acc, curr) => { acc[curr.containerType] = (acc[curr.containerType] || 0) + 1; return acc; }, {} as Record<string, number>);
            const mixDesc = Object.entries(mixCounts).map(([t, c]) => `${c}x${t}`).join(', ');
            summaries['SMART_MIX'] = { count: mixRes.length, desc: mixDesc || "None" };

            // 2. Calculate Individual Container Options
            for (const c of CONTAINERS) {
                setPackingProgress(`Analyzing ${c.type} Option...`);
                // We use a small delay to ensure UI updates between heavy tasks
                await new Promise(r => setTimeout(r, 0)); 
                const res = await calculateShipmentAsync(c, cargoItems, (msg) => setPackingProgress(`[${c.type}] ${msg}`));
                resultsCache[c.type] = res;
                summaries[c.type] = { count: res.length, desc: `${res.length}x ${c.type}` };
            }

            setStrategySummaries(summaries);

            // 3. Determine Active Results based on Mode
            let activeRes: PackingResult[] = [];
            if (strategyMode === 'SMART_MIX') {
                activeRes = resultsCache['SMART_MIX'];
            } else if (strategyMode === 'SINGLE') {
                activeRes = resultsCache[singleStrategyType] || [];
            } else if (strategyMode === 'CUSTOM_PLAN') {
                if (customPlan.length > 0) {
                    setPackingProgress('Applying Custom Plan...');
                    const planSpecs = customPlan.map(type => CONTAINERS.find(c => c.type === type)!);
                    activeRes = await calculateShipmentAsync(planSpecs, cargoItems, (msg) => setPackingProgress(`[Plan] ${msg}`));
                }
            }
            
            setShipmentResults(activeRes);
            setCurrentContainerIndex(0);
            if (activeRes.length <= 1) setViewMode('single');
            handleRestartAnimation();
        } catch (error) {
            console.error("Packing failed:", error);
            setPackingProgress('Error: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            setIsPacking(false);
        }
    };

    runPacking();
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
    
    // Step 1: Check Intent
    const intent = await service.classifyIntent(userMsg);
    
    let responseText = "";
    if (intent === 'DATA') {
        // Step 2a: Data Extraction Mode (Internal specific prompt)
        const jsonResponse = await service.sendMessage([...chatHistory, userMsg], undefined, DATA_EXTRACTION_PROMPT);
        const extractedData = extractCargoJSON(jsonResponse);
        
        if (extractedData && Array.isArray(extractedData) && extractedData.length > 0) {
            setPendingCargoUpdate(extractedData);
            responseText = `I have identified ${extractedData.length} cargo items from your input. Please review the import panel above to apply them.`;
        } else {
             // Fallback if classification said YES but extraction failed
             responseText = "I detected cargo information but couldn't extract the data structures clearly. Could you check the format?";
        }
    } else {
        // Step 2b: Advisor Mode
        const context = shipmentResults.length > 0 ? {
            cargoItems,
            result: shipmentResults[0],
            containerName: strategyMode === 'SMART_MIX' ? 'Smart Mix' : strategyMode === 'CUSTOM_PLAN' ? 'Custom Plan' : singleStrategyType
        } : undefined;
        responseText = await service.sendMessage([...chatHistory, userMsg], context, ADVISOR_PROMPT);
    }

    setIsChatLoading(false);
    setChatHistory(prev => [...prev, { role: 'model', text: responseText }]);
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

  const handleCopySystemPrompt = () => {
      navigator.clipboard.writeText(DATA_EXTRACTION_PROMPT);
      setChatHistory(prev => [...prev, { role: 'model', text: "ℹ️ System prompt copied to clipboard. You can now use it with an external LLM." }]);
  };

  const handleManualImport = () => {
      setImportText('');
      setShowImportModal(true);
  };

  const handleImportSubmit = () => {
    let data = extractCargoJSON(importText);
    
    // Fallback: Logic in extractCargoJSON generally covers most cases now (code blocks, raw array, deep search).
    // But if it returns null, we can try a direct strict parsing one last time or detailed error feedback.
    if (!data) {
        try {
            data = JSON.parse(importText);
        } catch (e) {
            // Do not alert immediately, check if it might be an issue user can't see
            console.error("JSON Import Parse Error:", e);
            alert("Failed to parse JSON. Ensure it is a valid [Array] of objects.");
            return;
        }
    }

    if (data && Array.isArray(data)) {
        setPendingCargoUpdate(data);
        const successMsg: ChatMsg = { 
            role: 'model', 
            text: `📝 I've prepared the cargo manifest from your import (${data.length} items found). Please review and apply it above.` 
        };
        setChatHistory(prev => [...prev, successMsg]);
        setShowImportModal(false);
    } else {
        console.warn("Import data is not an array:", data);
        alert("Invalid data format. Expected a JSON Array '[ ... ]'.");
    }
  };

  const handleNewChat = () => {
      if (chatHistory.length > 0 && !currentSessionId) {
          // Verify if we should save the previous untitled/unsaved one?
          // For simplicity, just create a new session
          const newId = Date.now().toString();
          setChatSessions(prev => [...prev, { id: newId, title: `Session ${new Date().toLocaleString()}`, timestamp: Date.now(), messages: chatHistory }]);
      }
      
      const nextId = (Date.now() + 1).toString();
      const newSession: ChatSession = { id: nextId, title: "New Conversation", timestamp: Date.now(), messages: [] };
      setChatSessions(prev => [...prev, newSession]);
      setCurrentSessionId(nextId);
      setChatHistory([]);
  };

  const handleLoadSession = (session: ChatSession) => {
      setChatHistory(session.messages);
      setCurrentSessionId(session.id);
      setShowHistoryModal(false);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setChatSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
          setCurrentSessionId('');
          setChatHistory([]);
      }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          processFile(e.target.files[0]);
      }
  };

  const processFile = (file: File) => {
      if (!file.type.startsWith('image/')) {
          alert("Only image files are currently supported.");
          return;
      }
      const reader = new FileReader();
      reader.onload = (evt) => {
          const base64 = evt.target?.result as string;
          setAttachments(prev => [...prev, { type: 'image', url: URL.createObjectURL(file), base64 }]);
      };
      reader.readAsDataURL(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Ensure we don't flicker if dragging over child elements
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          Array.from(e.dataTransfer.files).forEach(file => processFile(file));
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
                          <option value="ollama">Ollama (Local)</option>
                          <option value="openai">OpenAI Compatible (Cloud/Local)</option>
                      </select>
                  </div>

                  {aiConfig.provider === 'ollama' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                            <input type="text" value={aiConfig.baseUrl || 'http://localhost:11434'} onChange={e => setAiConfig({...aiConfig, baseUrl: e.target.value})} className="w-full p-2 border rounded-md" placeholder="http://localhost:11434"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
                            {ollamaModels.length > 0 ? (
                                <select value={aiConfig.modelName} onChange={e => setAiConfig({...aiConfig, modelName: e.target.value})} className="w-full p-2 border rounded-md">
                                    <option value="" disabled>Select a model</option>
                                    {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            ): (
                                <input type="text" value={aiConfig.modelName} onChange={e => setAiConfig({...aiConfig, modelName: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. llama3"/>
                            )}
                            {ollamaModels.length === 0 && <p className="text-xs text-gray-500 mt-1">Could not detect models automatically.</p>}
                        </div>
                    </>
                  )}

                  {aiConfig.provider === 'openai' && (
                    <>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                          <input type="text" value={aiConfig.baseUrl || 'https://api.openai.com/v1'} onChange={e => setAiConfig({...aiConfig, baseUrl: e.target.value})} className="w-full p-2 border rounded-md" placeholder="https://api.openai.com/v1"/>
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                          <input type="password" value={aiConfig.apiKey || ''} onChange={e => setAiConfig({...aiConfig, apiKey: e.target.value})} className="w-full p-2 border rounded-md" placeholder="sk-..."/>
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
                          <input type="text" value={aiConfig.modelName} onChange={e => setAiConfig({...aiConfig, modelName: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. gpt-4o"/>
                      </div>
                    </>
                  )}
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
            <CargoForm 
                items={cargoItems} 
                onAdd={(i) => setCargoItems([...cargoItems, i])} 
                onRemove={(id) => setCargoItems(cargoItems.filter(i=>i.id !== id))} 
                onClear={() => setCargoItems([])}
                onLoadDemo={handleLoadDemo} 
            />
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
            <div 
                className={`flex flex-col bg-white rounded-xl shadow-lg border border-indigo-100 overflow-hidden flex-1 transition-colors relative ${isDragging ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400' : ''}`}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {/* Drag Overlay */}
                {isDragging && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm pointer-events-none">
                        <Paperclip className="w-12 h-12 text-indigo-600 mb-2 animate-bounce" />
                        <p className="text-lg font-bold text-indigo-700">Drop images here</p>
                    </div>
                )}

                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-3 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BrainCircuit className="w-4 h-4" />
                        <div>
                            <h3 className="font-semibold text-sm leading-tight">AI Advisor</h3>
                            <p className="text-[10px] text-indigo-100">{aiConfig.provider}</p>
                        </div>
                    </div>
                    <div className="flex gap-1">
                        <button onClick={handleCopySystemPrompt} title="Copy System Prompt" className="p-1.5 hover:bg-white/20 rounded-md transition-colors">
                            <Copy className="w-4 h-4" />
                        </button>
                        <button onClick={handleManualImport} title="Import JSON Manifest" className="p-1.5 hover:bg-white/20 rounded-md transition-colors">
                            <FileJson className="w-4 h-4" />
                        </button>
                        <div className="w-px h-4 bg-white/20 mx-1"></div>
                        <button onClick={() => setShowHistoryModal(true)} title="History" className="p-1.5 hover:bg-white/20 rounded-md transition-colors">
                            <History className="w-4 h-4" />
                        </button>
                        <button onClick={handleNewChat} title="New Chat" className="p-1.5 hover:bg-white/20 rounded-md transition-colors">
                            <Plus className="w-4 h-4" />
                        </button>
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

                {/* Attachment Preview Area */}
                {attachments.length > 0 && (
                    <div className="px-4 py-2 flex gap-2 overflow-x-auto bg-gray-50 border-t border-gray-200">
                        {attachments.map((att, i) => (
                            <div key={i} className="relative group shrink-0">
                                <img src={att.url} alt="attachment" className="h-16 w-16 object-cover rounded-md border border-gray-300 shadow-sm" />
                                <button 
                                    onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-md hover:bg-red-600 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

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

      {/* Import Modal */}
      {showImportModal && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4 animate-in fade-in zoom-in duration-200">
                  <div className="flex justify-between items-center">
                      <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                          <FileJson className="w-6 h-6 text-indigo-600" /> Import JSON Manifest
                      </h2>
                      <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
                  </div>
                  <p className="text-sm text-gray-500">Paste the JSON output obtained from an external LLM (e.g., ChatGPT, Claude) below.</p>
                  <textarea 
                    value={importText} 
                    onChange={e => setImportText(e.target.value)} 
                    placeholder='[ { "name": "Box A", "qty": 10 ... } ]'
                    className="w-full h-48 p-3 border rounded-lg font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                      <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancel</button>
                      <button onClick={handleImportSubmit} className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-sm font-medium flex items-center gap-2">
                          <Layers className="w-4 h-4" /> Parse & Update
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in duration-200 max-h-[80vh] flex flex-col">
                  <div className="flex justify-between items-center">
                      <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                          <History className="w-6 h-6 text-indigo-600" /> Chat History
                      </h2>
                      <button onClick={() => setShowHistoryModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                      {chatSessions.length === 0 ? (
                          <div className="text-center text-gray-400 py-10">No history available</div>
                      ) : (
                          chatSessions.sort((a,b) => b.timestamp - a.timestamp).map(session => (
                              <button 
                                key={session.id} 
                                onClick={() => handleLoadSession(session)}
                                className={`w-full text-left p-3 rounded-lg border transition-all flex justify-between items-center group ${currentSessionId === session.id ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-gray-50 border-gray-100'}`}
                              >
                                  <div>
                                      <div className="font-medium text-sm text-gray-800">{session.title}</div>
                                      <div className="text-xs text-gray-400">{new Date(session.timestamp).toLocaleString()} • {session.messages.length} msgs</div>
                                  </div>
                                  <div onClick={(e) => handleDeleteSession(session.id, e)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all">
                                      <Trash2 className="w-4 h-4" />
                                  </div>
                              </button>
                          ))
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Packing Progress Modal */}
      {isPacking && (
          <div className="fixed inset-0 bg-black/70 z-[120] flex items-center justify-center p-4 backdrop-blur-sm cursor-wait">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-6 animate-in fade-in zoom-in duration-300 text-center">
                  <div className="flex justify-center">
                      <div className="relative w-16 h-16">
                           <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
                           <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                           <Box className="absolute inset-0 m-auto text-indigo-600 w-6 h-6 animate-pulse" />
                      </div>
                  </div>
                  <div>
                      <h2 className="text-xl font-bold text-gray-800 mb-2">Packing Shipment</h2>
                      <p className="text-sm text-gray-500 font-medium animate-pulse">{packingProgress}</p>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-indigo-600 animate-pulse w-full"></div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
