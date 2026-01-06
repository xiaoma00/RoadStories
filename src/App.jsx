import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, MapPin, Navigation, Search, Loader2, SkipForward, SkipBack, Settings, X, AlertCircle, Map as MapIcon, LayoutDashboard, LocateFixed, Sparkles, PlusCircle, ArrowLeft, Ticket } from 'lucide-react';


// --- 工具函数：PCM 转 WAV ---
const pcmToWav = (pcmData, sampleRate = 24000) => {
 if (pcmData.byteLength % 2 !== 0) {
     pcmData = pcmData.slice(0, pcmData.byteLength - 1);
 }
 const numChannels = 1;
 const bitsPerSample = 16;
 const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
 const blockAlign = numChannels * (bitsPerSample / 8);
 const buffer = new ArrayBuffer(44 + pcmData.byteLength);
 const view = new DataView(buffer);
 writeString(view, 0, 'RIFF');
 view.setUint32(4, 36 + pcmData.byteLength, true);
 writeString(view, 8, 'WAVE');
 writeString(view, 12, 'fmt ');
 view.setUint32(16, 16, true);
 view.setUint16(20, 1, true);
 view.setUint16(22, numChannels, true);
 view.setUint32(24, sampleRate, true);
 view.setUint32(28, byteRate, true);
 view.setUint16(32, blockAlign, true);
 view.setUint16(34, bitsPerSample, true);
 writeString(view, 36, 'data');
 view.setUint32(40, pcmData.byteLength, true);
 const pcmBytes = new Uint8Array(pcmData);
 const wavBytes = new Uint8Array(buffer, 44);
 wavBytes.set(pcmBytes);
 return buffer;
};

const writeString = (view, offset, string) => {
 for (let i = 0; i < string.length; i++) {
   view.setUint8(offset + i, string.charCodeAt(i));
 }
};

// --- 工具函数：动态加载 Leaflet ---
let leafletLoadingPromise = null;
const loadLeaflet = () => {
 if (window.L && typeof window.L.map === 'function') return Promise.resolve();
 if (leafletLoadingPromise) return leafletLoadingPromise;
 leafletLoadingPromise = new Promise((resolve, reject) => {
   const link = document.createElement('link');
   link.rel = 'stylesheet';
   link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
   document.head.appendChild(link);
   const script = document.createElement('script');
   script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
   script.async = true;
   script.onload = () => { window.L ? resolve() : reject(); };
   script.onerror = reject;
   document.head.appendChild(script);
 });
 return leafletLoadingPromise;
};

export default function RoadStoriesApp() {
 const [locationQuery, setLocationQuery] = useState('');
 const [isGenerating, setIsGenerating] = useState(false);
 const [tourPlan, setTourPlan] = useState(null);
 const [currentStopIndex, setCurrentStopIndex] = useState(0);
 const [audioUrl, setAudioUrl] = useState(null);
 const [isPlaying, setIsPlaying] = useState(false);
 const [loadingAudio, setLoadingAudio] = useState(false);
 const [stopImage, setStopImage] = useState(null);
 const [loadingImage, setLoadingImage] = useState(false);
 const [errorMessage, setErrorMessage] = useState(null);
 const [viewMode, setViewMode] = useState('dashboard');
 const [gpsMode, setGpsMode] = useState(false);
 
 const [isGeneratingDeepDive, setIsGeneratingDeepDive] = useState(false);
 const [deepDiveText, setDeepDiveText] = useState('');

 // --- 扩展状态 ---
 const [isExpanding, setIsExpanding] = useState(false);
 const [hasNoMoreStops, setHasNoMoreStops] = useState(false);
 const [searchRadiusTier, setSearchRadiusTier] = useState(1); 

 // --- 自动补齐状态 ---
 const [suggestions, setSuggestions] = useState([]);
 const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
 const [showSuggestions, setShowSuggestions] = useState(false);

 const shouldAutoPlayRef = useRef(false);
 const audioRef = useRef(null);
 const mapInstanceRef = useRef(null);
 const suggestionRef = useRef(null);

 const [showSettings, setShowSettings] = useState(false);
 const [userApiKey, setUserApiKey] = useState('');
 const apiKey = import.meta.env.VITE_GOOGLE_API_KEY || ""; 

 const getApiKey = useCallback(() => userApiKey.trim() || apiKey, [userApiKey]);

 // --- 自动补齐逻辑 ---
 useEffect(() => {
   const timer = setTimeout(async () => {
     if (locationQuery.trim().length > 1 && showSuggestions) {
       setIsLoadingSuggestions(true);
       const key = getApiKey();
       try {
         const prompt = `Based on the partial location input "${locationQuery}", suggest 5 real-world specific tourist destinations or cities. 
         Return only a JSON array of objects with keys "name" (short name) and "display" (detailed location in Chinese).
         Example: [{"name": "杭州西湖 West Lake", "display": "中国浙江省杭州市西湖风景名胜区"}]`;

         const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${key}`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             contents: [{ parts: [{ text: prompt }] }],
             generationConfig: { responseMimeType: "application/json" }
           })
         });
         
         if (!response.ok) throw new Error("AI Suggestions failed");
         const data = await response.json();
         const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
         const parsed = JSON.parse(text);
         setSuggestions(Array.isArray(parsed) ? parsed : []);
       } catch (err) {
         console.error("Autocomplete fetch error", err);
         setSuggestions([]);
       } finally {
         setIsLoadingSuggestions(false);
       }
     } else {
       setSuggestions([]);
     }
   }, 600);

   return () => clearTimeout(timer);
 }, [locationQuery, showSuggestions, getApiKey]);

 useEffect(() => {
   const handleClickOutside = (event) => {
     if (suggestionRef.current && !suggestionRef.current.contains(event.target)) {
       setShowSuggestions(false);
     }
   };
   document.addEventListener("mousedown", handleClickOutside);
   return () => document.removeEventListener("mousedown", handleClickOutside);
 }, []);

 // --- API: 生成行程 ---
 const handleGenerateTour = async (overrideQuery = null) => {
   const finalQuery = overrideQuery || locationQuery;
   if (!finalQuery.trim()) return;
   
   setShowSuggestions(false);
   const key = getApiKey();
   setIsGenerating(true);
   setErrorMessage(null);
   setTourPlan(null);
   setCurrentStopIndex(0);
   setStopImage(null);
   setAudioUrl(null);
   setDeepDiveText('');
   setGpsMode(false);
   setHasNoMoreStops(false);
   setSearchRadiusTier(1);
   shouldAutoPlayRef.current = false;

   try {
     const systemPrompt = `You are an expert travel guide narrator. Create a 3-5 stop tour for the location. 
     IMPORTANT: 
     1. For each stop, provide 'name' in '中文名 English Name' format.
     2. Identify if it needs a ticket. Add 'isPaid' (boolean) and 'feeInfo' (string, e.g., '免费', '约¥50', '需预约').
     Output valid JSON only. 
     JSON Structure: { "tourTitle": "...", "stops": [ { "name": "...", "script": "...", "isPaid": true, "feeInfo": "...", "visualPrompt": "...", "coordinates": { "lat": 0, "lng": 0 } } ] }`;
     
     const userPrompt = `Create a driving tour for: ${finalQuery}. Language: Chinese (Mandarin).`;
     const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${key}`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         contents: [{ parts: [{ text: userPrompt }] }],
         systemInstruction: { parts: [{ text: systemPrompt }] },
         tools: [{ google_search: {} }],
       })
     });
     if (!response.ok) throw new Error("API Error");
     const data = await response.json();
     let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
     text = text.replace(/```json/g, '').replace(/```/g, '').trim();
     const plan = JSON.parse(text);
     setTourPlan(plan);
     if (plan.stops.length > 0) {
       generateAudio(plan.stops[0].script, false);
       generateImage(plan.stops[0].visualPrompt);
     }
   } catch (error) {
     setErrorMessage("生成路线失败，请检查 API Key 或重试。");
   } finally {
     setIsGenerating(false);
   }
 };

 // --- API: 扩展行程 ---
 const handleExpandTour = async () => {
   if (!tourPlan || isExpanding || hasNoMoreStops) return;
   const key = getApiKey();
   setIsExpanding(true);
   setErrorMessage(null);

   let currentTier = searchRadiusTier;
   let success = false;
   let retryCount = 0;
   const maxTiers = 3;

   while (!success && retryCount < maxTiers) {
     const existingStopsNames = tourPlan.stops.map(s => s.name).join(', ');
     
     const tierDescriptions = [
       "在当前地点紧邻的周边范围内搜索。",
       "稍微扩大搜索范围，寻找同城或 20 公里内的有趣景点。",
       "大幅扩大搜索范围，寻找跨城、周边县市或 50-100 公里内的特色景点。"
     ];

     try {
       const systemPrompt = `You are an expert travel guide. Based on the user's destination, recommend 3-4 MORE unique landmarks. 
       Current Search Range Priority: ${tierDescriptions[currentTier - 1]}
       DO NOT recommend: [${existingStopsNames}]. 
       IMPORTANT: 
       1. 'name' in '中文名 English Name' format.
       2. Add 'isPaid' (boolean) and 'feeInfo' (string, e.g., '免费', '约¥100').
       Output valid JSON only. 
       JSON Structure: { "newStops": [ { "name": "...", "script": "...", "isPaid": false, "feeInfo": "...", "visualPrompt": "...", "coordinates": { "lat": 0, "lng": 0 } } ] }`;
       
       const userPrompt = `Find more stops for ${locationQuery} at search tier ${currentTier}. Language: Chinese (Mandarin).`;
       
       const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${key}`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           contents: [{ parts: [{ text: userPrompt }] }],
           systemInstruction: { parts: [{ text: systemPrompt }] },
           tools: [{ google_search: {} }],
         })
       });

       if (!response.ok) throw new Error("Expansion Error");
       const data = await response.json();
       let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
       text = text.replace(/```json/g, '').replace(/```/g, '').trim();
       const result = JSON.parse(text);
       const newStops = result.newStops || [];

       if (newStops.length > 0) {
         setTourPlan(prev => ({ ...prev, stops: [...prev.stops, ...newStops] }));
         setSearchRadiusTier(currentTier); 
         success = true;
       } else {
         currentTier++;
         retryCount++;
         if (currentTier > maxTiers) {
           setHasNoMoreStops(true);
           break;
         }
       }
     } catch (error) {
       setErrorMessage("加载更多景点时遇到错误。");
       break;
     }
   }
   setIsExpanding(false);
 };

 // --- API: 深度挖掘 ---
 const handleDeepDive = async () => {
   if (!tourPlan || isGeneratingDeepDive) return;
   const stop = tourPlan.stops[currentStopIndex];
   const key = getApiKey();
   setIsGeneratingDeepDive(true);
   try {
     const prompt = `作为一个深度旅游专家，请为景点 "${stop.name}" 提供更深度的背景、鲜为人知的历史细节或神秘传说。内容要有趣、吸引人，长度约200-300字。语言：中文。`;
     const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${key}`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] })
     });
     const data = await response.json();
     const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
     if (text) {
       setDeepDiveText(text);
       generateAudio(text, false);
     }
   } catch (error) { setErrorMessage("深度内容生成失败。"); } finally { setIsGeneratingDeepDive(false); }
 };

 // --- API: 生成音频 ---
 const generateAudio = useCallback(async (text, autoPlay = true) => {
   setLoadingAudio(true);
   if (audioUrl) URL.revokeObjectURL(audioUrl);
   setAudioUrl(null);
   setIsPlaying(false);
   shouldAutoPlayRef.current = autoPlay;
   try {
     const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${getApiKey()}`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         contents: [{ parts: [{ text: text }] }],
         generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Fenrir" } } } }
       })
     });
     const data = await response.json();
     const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
     if (inlineData?.data) {
       const bytes = new Uint8Array(atob(inlineData.data).split("").map(c => c.charCodeAt(0)));
       const wavBuffer = pcmToWav(bytes.buffer, 24000);
       setAudioUrl(URL.createObjectURL(new Blob([wavBuffer], { type: 'audio/wav' })));
     } else { setLoadingAudio(false); }
   } catch (error) { setLoadingAudio(false); }
 }, [getApiKey, audioUrl]);

 // --- API: 生成图像 ---
 const generateImage = useCallback(async (prompt) => {
   setLoadingImage(true); setStopImage(null);
   try {
     const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${getApiKey()}`, {
       method: 'POST', headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ instances: [{ prompt: `Travel concept art: ${prompt}` }], parameters: { sampleCount: 1 } })
     });
     const result = await response.json();
     const base64 = result.predictions?.[0]?.bytesBase64Encoded;
     if (base64) setStopImage(`data:image/png;base64,${base64}`);
   } catch (e) { console.error(e); } finally { setLoadingImage(false); }
 }, [getApiKey]);

 const goToStop = useCallback((index, autoPlay = false) => {
   if (!tourPlan || index < 0 || index >= tourPlan.stops.length) return;
   setCurrentStopIndex(index);
   setDeepDiveText('');
   generateAudio(tourPlan.stops[index].script, autoPlay);
   generateImage(tourPlan.stops[index].visualPrompt);
 }, [tourPlan, generateAudio, generateImage]);

 const handleNextStop = useCallback(() => goToStop(currentStopIndex + 1, isPlaying), [goToStop, currentStopIndex, isPlaying]);
 const handlePrevStop = useCallback(() => goToStop(currentStopIndex - 1, isPlaying), [goToStop, currentStopIndex, isPlaying]);
 const togglePlay = () => { setIsPlaying(!isPlaying); shouldAutoPlayRef.current = !isPlaying; };

 // --- 导航控制：返回搜索 ---
 const handleReturnToSearch = () => {
   if (audioRef.current) audioRef.current.pause();
   setTourPlan(null);
   setAudioUrl(null);
   setIsPlaying(false);
   setShowSuggestions(false);
 };

 useEffect(() => {
   const audio = audioRef.current;
   if (!audio) return;
   if (audioUrl) { audio.src = audioUrl; audio.load(); }
 }, [audioUrl]);

 useEffect(() => {
   const audio = audioRef.current;
   if (!audio) return;
   const handleCanPlay = () => { setLoadingAudio(false); if (shouldAutoPlayRef.current) audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false)); };
   const handleEnded = () => { setIsPlaying(false); if (gpsMode && currentStopIndex < tourPlan?.stops.length - 1) setTimeout(handleNextStop, 3000); };
   audio.addEventListener('canplay', handleCanPlay);
   audio.addEventListener('ended', handleEnded);
   return () => { audio.removeEventListener('canplay', handleCanPlay); audio.removeEventListener('ended', handleEnded); };
 }, [gpsMode, tourPlan, currentStopIndex, handleNextStop]);

 useEffect(() => {
   const audio = audioRef.current;
   if (!audio || !audioUrl) return;
   if (isPlaying && audio.paused) audio.play().catch(e => console.warn(e));
   else if (!isPlaying && !audio.paused) audio.pause();
 }, [isPlaying, audioUrl]);

 // --- Leaflet 地图初始化 ---
 useEffect(() => {
   if (viewMode !== 'map' || !tourPlan) return;
   
   let map;
   loadLeaflet().then(() => {
     const L = window.L;
     if (!L) return;

     if (mapInstanceRef.current) {
       mapInstanceRef.current.remove();
       mapInstanceRef.current = null;
     }

     const stops = tourPlan.stops;
     const center = stops[currentStopIndex] || stops[0];
     const container = document.getElementById('map');
     if (!container) return;

     map = L.map('map').setView([center.coordinates.lat, center.coordinates.lng], 13);
     L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
         attribution: '&copy; CARTO'
     }).addTo(map);

     stops.forEach((s, i) => {
       const isCurrent = i === currentStopIndex;
       const icon = L.divIcon({ 
         className: '', 
         html: `<div style="background-color: ${isCurrent ? '#f59e0b' : '#3b82f6'}; width: 1.8rem; height: 1.8rem; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; color: white;">${i + 1}</div>`, 
         iconSize: [28, 28],
         iconAnchor: [14, 14]
       });
       
       const marker = L.marker([s.coordinates.lat, s.coordinates.lng], { icon }).addTo(map);
       marker.on('click', () => {
         goToStop(i, false); 
         marker.openPopup();
       });

       marker.bindPopup(`
         <div style="color: #1e293b; text-align: center; padding: 5px; max-width: 150px;">
           <b style="font-size: 14px; display: block; margin-bottom: 2px;">${s.name}</b>
           <span style="font-size: 10px; color: ${s.isPaid ? '#ef4444' : '#10b981'}; font-weight: bold; display: block; margin-bottom: 6px;">${s.feeInfo || (s.isPaid ? '需门票' : '免费')}</span>
           <span style="font-size: 11px; color: #3b82f6;">点击下方播放导览</span>
         </div>
       `);
     });

     setTimeout(() => { map.invalidateSize(); }, 200);
     mapInstanceRef.current = map;
   });

   return () => {
     if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
     }
   };
 }, [viewMode, tourPlan, currentStopIndex, tourPlan?.stops.length, goToStop]);

 return (
   <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col relative">
     {showSettings && (
       <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold flex items-center gap-2"><Settings className="text-amber-500" /> API 设置</h3>
                <button onClick={() => setShowSettings(false)}><X /></button>
             </div>
             <input type="password" value={userApiKey} onChange={(e) => setUserApiKey(e.target.value)} placeholder="API Key (AIza...)" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white mb-4" />
             <button onClick={() => setShowSettings(false)} className="w-full bg-amber-500 text-slate-900 font-bold py-3 rounded-xl">保存</button>
          </div>
       </div>
     )}

     <header className="p-4 bg-slate-800/80 backdrop-blur-md border-b border-slate-700 z-20 flex items-center justify-between shadow-lg sticky top-0 shrink-0">
       <div className="flex items-center gap-2">
         {tourPlan && (
           <button onClick={handleReturnToSearch} className="p-2 mr-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors" title="返回搜索">
             <ArrowLeft className="w-5 h-5" />
           </button>
         )}
         <div className="bg-amber-500 p-2 rounded-lg"><Navigation className="w-5 h-5 text-slate-900" /></div>
         <div><h1 className="text-xl font-bold">RoadStories</h1><p className="text-xs text-slate-400">AI 智能伴游</p></div>
       </div>
       <div className="flex items-center gap-3">
           {tourPlan && (
               <div className="flex bg-slate-700 rounded-lg p-1">
                   <button onClick={() => setViewMode('dashboard')} className={`p-2 rounded-md ${viewMode === 'dashboard' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400'}`}><LayoutDashboard className="w-5 h-5" /></button>
                   <button onClick={() => setViewMode('map')} className={`p-2 rounded-md ${viewMode === 'map' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400'}`}><MapIcon className="w-5 h-5" /></button>
               </div>
           )}
           <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-white"><Settings className="w-5 h-5" /></button>
       </div>
     </header>

     <main className="flex-1 flex flex-col max-w-2xl mx-auto w-full p-4 gap-6 overflow-y-auto overflow-x-hidden">
       {errorMessage && <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 flex gap-3 text-red-200 shrink-0"><AlertCircle className="w-5 h-5" />{errorMessage}</div>}

       {!tourPlan && (
         <div className="flex flex-col gap-6 mt-12 text-center animate-in fade-in slide-in-from-bottom-4">
           <h2 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">你想去哪里听故事？</h2>
           <div className="relative" ref={suggestionRef}>
             <Search className="absolute left-4 top-6 -translate-y-1/2 text-slate-500 z-10" />
             <input type="text" placeholder="例如：杭州西湖、Tokyo Tower..." className="block w-full pl-12 pr-24 py-4 bg-slate-800 border border-slate-700 rounded-2xl text-lg focus:ring-2 focus:ring-amber-500 outline-none shadow-xl transition-all" value={locationQuery} onChange={(e) => { setLocationQuery(e.target.value); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} onKeyDown={(e) => e.key === 'Enter' && handleGenerateTour()} />
             <button onClick={() => handleGenerateTour()} disabled={isGenerating || !locationQuery} className="absolute right-2 top-2 bottom-2 bg-amber-500 text-slate-900 font-bold px-6 rounded-xl disabled:opacity-50 z-10">{isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : "出发"}</button>
             {showSuggestions && (suggestions.length > 0 || isLoadingSuggestions) && (
               <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl z-50 animate-in fade-in slide-in-from-top-2">
                 {isLoadingSuggestions ? <div className="p-4 flex items-center justify-center gap-2 text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">正在搜寻地点...</span></div> : (
                   <ul>
                     {suggestions.map((item, index) => (
                       <li key={index}><button onClick={() => { setLocationQuery(item.name); setShowSuggestions(false); handleGenerateTour(item.name); }} className="w-full text-left px-5 py-4 hover:bg-slate-700 transition-colors flex items-start gap-3 border-b border-slate-700/50 last:border-0"><MapPin className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" /><div><div className="font-bold text-slate-100">{item.name}</div><div className="text-xs text-slate-400 truncate max-w-[400px]">{item.display}</div></div></button></li>
                     ))}
                   </ul>
                 )}
               </div>
             )}
           </div>
         </div>
       )}

       {tourPlan && viewMode === 'dashboard' && (
         <div className="flex flex-col gap-4 animate-in zoom-in-95">
           <div className="relative w-full aspect-video bg-slate-800 rounded-3xl overflow-hidden shadow-2xl border border-slate-700 shrink-0">
             {loadingImage ? <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-8 h-8 text-amber-500 animate-spin" /></div> : stopImage && <img src={stopImage} className="w-full h-full object-cover" />}
             <div className="absolute inset-0 bg-gradient-to-t from-slate-950 p-6 flex flex-col justify-end">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-amber-500 text-slate-900 text-xs font-bold px-2 py-0.5 rounded">STOP {currentStopIndex + 1}</span>
                  {/* --- 门票状态标签 --- */}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${tourPlan.stops[currentStopIndex].isPaid ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-green-500/20 border-green-500/50 text-green-400'}`}>
                    {tourPlan.stops[currentStopIndex].feeInfo || (tourPlan.stops[currentStopIndex].isPaid ? '需门票' : '免费')}
                  </span>
                </div>
                <h2 className="text-2xl font-bold leading-tight">{tourPlan.stops[currentStopIndex].name}</h2>
             </div>
           </div>

           <div className="grid grid-cols-3 gap-4 h-24 shrink-0">
               <button onClick={handlePrevStop} disabled={currentStopIndex === 0} className="bg-slate-800 rounded-2xl flex flex-col items-center justify-center gap-1 border border-slate-700 disabled:opacity-30 active:scale-95 transition-transform"><SkipBack /><span className="text-[10px] font-bold">上一站</span></button>
               <button onClick={togglePlay} className={`rounded-2xl flex flex-col items-center justify-center gap-1 border transition-all active:scale-95 ${isPlaying ? 'bg-amber-500/10 border-amber-500 text-amber-400' : 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20'}`}>{loadingAudio ? <Loader2 className="animate-spin" /> : isPlaying ? <Pause /> : <Play />}<span className="text-[10px] font-bold">{isPlaying ? "暂停" : "播放讲解"}</span></button>
               <button onClick={handleNextStop} disabled={currentStopIndex === tourPlan.stops.length - 1} className="bg-slate-800 rounded-2xl flex flex-col items-center justify-center gap-1 border border-slate-700 disabled:opacity-30 active:scale-95 transition-transform"><SkipForward /><span className="text-[10px] font-bold">下一站</span></button>
           </div>

           <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50 mb-4">
              <div className="flex justify-between items-center mb-4">
                <div className="flex flex-col gap-1">
                   <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><MapPin className="w-4 h-4" /> 导游词脚本</h3>
                   {/* 脚本上方的收费详细说明 */}
                   <div className="flex items-center gap-1.5 text-[11px]">
                      <Ticket className={`w-3 h-3 ${tourPlan.stops[currentStopIndex].isPaid ? 'text-red-400' : 'text-green-400'}`} />
                      <span className={tourPlan.stops[currentStopIndex].isPaid ? 'text-red-400' : 'text-green-400'}>
                        {tourPlan.stops[currentStopIndex].isPaid ? `收费项目：${tourPlan.stops[currentStopIndex].feeInfo}` : '本景点免费游览'}
                      </span>
                   </div>
                </div>
                <button onClick={handleDeepDive} disabled={isGeneratingDeepDive} className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-all ${deepDiveText ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-slate-700 border-slate-600 text-slate-300 hover:text-white'}`}>{isGeneratingDeepDive ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}{deepDiveText ? "再次挖掘" : "深度挖掘"}</button>
              </div>
              <div className="space-y-6">
                <p className="text-lg leading-relaxed text-slate-200 font-serif whitespace-pre-wrap">{tourPlan.stops[currentStopIndex].script}</p>
                {deepDiveText && <div className="mt-6 pt-6 border-t border-slate-700 animate-in fade-in slide-in-from-top-2"><span className="text-xs font-bold text-amber-500 uppercase block mb-3">深度解密内容：</span><div className="text-base text-slate-300 italic bg-amber-500/5 p-5 rounded-xl border border-amber-500/10 leading-relaxed shadow-inner">{deepDiveText}</div></div>}
              </div>
           </div>

           <div className="flex flex-col gap-3 mb-8">
              <button onClick={handleExpandTour} disabled={isExpanding || hasNoMoreStops} className={`w-full py-4 rounded-2xl border-2 flex items-center justify-center gap-3 font-bold transition-all ${hasNoMoreStops ? 'border-slate-800 text-slate-600 cursor-not-allowed' : 'border-amber-500/30 text-amber-500 hover:bg-amber-500/5 active:scale-95'}`}>{isExpanding ? (<div className="flex flex-col items-center"><div className="flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> {searchRadiusTier === 1 ? "正在搜寻周边景点..." : "正在扩大搜索范围..."}</div></div>) : hasNoMoreStops ? <>没有更多建议了</> : <><PlusCircle className="w-5 h-5" /> 探索周边更多景点</>}</button>
              <button onClick={handleReturnToSearch} className="w-full py-3 text-slate-500 hover:text-slate-300 text-sm font-medium transition-colors border border-transparent hover:border-slate-700 rounded-xl">结束当前行程，搜索新目的地</button>
           </div>
         </div>
       )}

       {tourPlan && viewMode === 'map' && (
          <div className="flex flex-col h-full animate-in fade-in min-h-[500px]">
             <div className="bg-slate-800 rounded-xl p-4 mb-4 border border-slate-700 flex items-center justify-between shrink-0">
                 <div className="flex items-center gap-3">
                     <div className="p-2 rounded-full bg-blue-500/20 text-blue-400"><LocateFixed /></div>
                     <div><h3 className="font-bold text-white">导航地图</h3><p className="text-xs text-slate-400">点击景点图标切换景点</p></div>
                 </div>
                 <button onClick={handleExpandTour} disabled={isExpanding || hasNoMoreStops} className="flex flex-col items-center gap-0.5 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold text-amber-400 transition-colors disabled:opacity-50"><PlusCircle className="w-3 h-3" /><span className="text-[10px]">{isExpanding && searchRadiusTier > 1 ? "扩大搜索" : hasNoMoreStops ? "已全加载" : "扩展景点"}</span></button>
             </div>
             
             <div className="flex-1 bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden relative min-h-[400px] shadow-inner">
                 <div id="map" className="absolute inset-0 z-10 w-full h-full"></div>
                 <div className="absolute bottom-4 left-4 right-4 z-[1000] bg-slate-900/95 p-4 rounded-xl border border-amber-500/30 flex justify-between items-center shadow-2xl">
                     <div className="max-w-[70%]">
                        <div className="flex items-center gap-2 mb-0.5">
                           <div className="text-[10px] text-amber-500 font-bold uppercase">STOP {currentStopIndex + 1} / {tourPlan.stops.length}</div>
                           {/* 地图底部的门票提示 */}
                           <div className={`text-[9px] px-1 rounded-sm border ${tourPlan.stops[currentStopIndex].isPaid ? 'border-red-500/50 text-red-400' : 'border-green-500/50 text-green-400'}`}>
                             {tourPlan.stops[currentStopIndex].isPaid ? '需门票' : '免费'}
                           </div>
                        </div>
                        <h4 className="text-white font-bold truncate leading-snug">{tourPlan.stops[currentStopIndex].name}</h4>
                     </div>
                     <button onClick={togglePlay} className={`w-12 h-12 rounded-full flex items-center justify-center shadow-xl transition-all active:scale-90 ${isPlaying ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-white hover:bg-slate-600'}`}>{loadingAudio ? <Loader2 className="w-6 h-6 animate-spin" /> : isPlaying ? <Pause /> : <Play className="ml-1" />}</button>
                 </div>
             </div>
          </div>
       )}
     </main>
     <audio ref={audioRef} className="hidden" />
   </div>
 );
}