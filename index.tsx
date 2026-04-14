import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://fejghsqkpqwduhukolgu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_o7BfDUhHMocfsj_cIJkveg_FFaffRIm';

// Inicialização segura do Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Types ---

type UserAccount = {
  id: string;
  name: string;
  email: string;
  congregation: string;
  phone: string;
  role: string;
  password: string;
  status: 'pending' | 'authorized' | 'denied';
  isAdminUser?: boolean;
  canViewOthers?: boolean;
  canRegister?: boolean;
  canApprove?: boolean;
  canDeleteUser?: boolean;
};

type Country = {
  id: string; // "01", "02", etc.
  name: string;
};

type City = {
  id: string;
  name: string;
  cep: string;
};

type CongregationRecord = {
  id: string; // "0001", "0002", etc.
  name: string;
  country_id: string;
  city_id: string;
  address: string;
  address_number: string;
  cep: string;
};

type Conductor = {
  id: string;
  name: string;
  country_id: string;
  city_id: string;
  congregation_id: string;
  birth_date: string;
  phone: string;
  email: string;
  role_code: 'S' | 'I' | 'R' | 'T' | 'TG';
  registry_number: string;
  created_at?: string;
  owner_email?: string;
};

type Instrument = {
  id: string;
  name: string;
  modality: 'Metal' | 'Palheta' | 'Cordas' | 'Outro';
  timbre: 'Sol' | 'Fá' | 'Dó';
  tuning: string;
  owner_email?: string;
};

type Musician = {
  id: string;
  name: string;
  voices: string[]; 
  instruments: string[]; 
  owner_email?: string;
};

type AttendanceRecord = {
  id: string;
  date: string;
  presentMusicianIds: string[];
  justifications?: Record<string, string>; // { musicianId: text }
  owner_email?: string;
};

type HymnEntry = {
  notebook: string;
  number: string;
  title: string;
  execution?: string;
  duration?: string; // Tempo no formato flexível
  conductor?: string;
  soloist?: string;
  keyboardist?: string;
  guitarist?: string;
};

type MasterHymn = {
  id: string;
  notebook: string;
  number: string;
  title: string;
  owner_email?: string;
};

type HymnListType = 'Normal130' | 'Normal200' | 'Oracao' | 'Especial200' | 'Festiva200' | 'Comunhao200' | 'NatalAnoNovo';

type HymnList = {
  id: string;
  date: string;
  congregation: string;
  type: HymnListType;
  startTime?: string; // Horário de início (HH:MM)
  isDetailed?: boolean;
  owner_email?: string;
  sections: {
    hymnal: HymnEntry[];
    choir: HymnEntry[];
    contributions: HymnEntry[];
    communion?: HymnEntry[]; 
    message: HymnEntry[];
    finalization?: HymnEntry[];
    afterInitialPrayer?: HymnEntry[];
    choirAfterContributions?: HymnEntry[];
    afterIndividualPrayer?: HymnEntry[];
    [key: string]: HymnEntry[] | undefined;
  };
  sectionDurations?: {
    contributions?: string;
    message?: string;
  };
};

// --- Helpers de Persistência ---

const fetchData = async (table: string, localKey: string, ownerEmail?: string) => {
  const cacheKey = `${localKey}_${ownerEmail || 'all'}`;
  try {
    let query = supabase.from(table).select('*');
    if (ownerEmail && !['countries', 'cities', 'congregations_admin', 'conductors'].includes(table)) {
      query = query.eq('owner_email', ownerEmail);
    }
    const { data, error } = await query;
    if (error) throw error;
    
    if (data && data.length > 0) {
      localStorage.setItem(cacheKey, JSON.stringify(data));
      return data;
    }
    
    const local = localStorage.getItem(cacheKey);
    if (local) {
      const parsedLocal = JSON.parse(local);
      if (parsedLocal && parsedLocal.length > 0) {
        return parsedLocal;
      }
    }
  } catch (err) {
    console.warn(`Fallback para LocalStorage em ${table}:`, err);
  }
  
  const localFallback = localStorage.getItem(cacheKey);
  return localFallback ? JSON.parse(localFallback) : [];
};

const saveData = async (table: string, localKey: string, data: any, ownerEmail?: string) => {
  const cacheKey = `${localKey}_${ownerEmail || 'all'}`;
  const dataToStore = Array.isArray(data) ? data : [data];
  
  let dataToUpsert = dataToStore;
  if (ownerEmail && !['countries', 'cities', 'congregations_admin', 'conductors'].includes(table)) {
    dataToUpsert = dataToStore.map(item => ({ ...item, owner_email: ownerEmail }));
  }
    
  localStorage.setItem(cacheKey, JSON.stringify(dataToStore));
  
  try {
    const { error } = await supabase.from(table).upsert(dataToUpsert);
    if (error) {
       console.error(`Erro Supabase em ${table}:`, error.message);
    }
  } catch (err) {
    console.error(`Erro crítico ao sincronizar ${table}:`, err);
  }
};

const deleteRow = async (table: string, localKey: string, id: string, updatedLocalData: any, ownerEmail?: string) => {
  const cacheKey = `${localKey}_${ownerEmail || 'all'}`;
  localStorage.setItem(cacheKey, JSON.stringify(updatedLocalData));
  try {
    await supabase.from(table).delete().eq('id', id);
  } catch (err) {
    console.error(`Erro ao deletar no Supabase em ${table}:`, err);
  }
};

const generateId = () => Math.random().toString(36).substr(2, 9);
const generateNumericPassword = () => Math.floor(100000 + Math.random() * 900000).toString();

const calculateAge = (birthDate: string) => {
  if (!birthDate) return 0;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

const MEETING_TYPES: Record<string, string> = {
  Normal130: 'Reunião Normal (Até 1h30min)',
  Normal200: 'Reunião Normal (Até 2h)',
  Oracao: 'Reunião de Oração',
  Especial200: 'Reunião Especial (Até 2h)',
  Festiva200: 'Reunião Festiva (Até 2h)',
  Comunhao200: 'Reunião de Santa Comunhão',
  NatalAnoNovo: 'Natal / Ano Novo',
};

const ROLE_LABELS: Record<string, string> = {
  S: 'Regente da Sede',
  I: 'Regente Itinerante',
  R: 'Regente Regional',
  T: 'Regente Titular',
  TG: 'Regente Titular de Gênero'
};

const NOTEBOOKS: Record<string, string> = {
  "CS": "Coro da Sede", "GC": "Grande Coral", "SOLOS": "Caderno de Solos", 
  "S. ESP.": "Solos Especiais", "C. CAM.": "Coral de Câmara", "CJ": "Coral Jovem", 
  "CIJ": "Coral Infanto Juvenil", "CF": "Coral Feminino", "CM": "Coral Masculino", 
  "MÃES": "Especial Dia das Mães", "HC": "Hinos de Casamento", "H": "Hinos do Hinário", 
  "INST": "Instrumental", "O. CAM": "Orquestra de Câmara", "OV": "Orquestra de Violões", 
  "OC": "Orquestra do Coral", "OH": "Orquestra do Hinário", "OIJA": "Orquestra Infanto Juvenil", 
  "OJ": "Orquestra Jovem", "SC": "Solos Coral", "SE": "Solos Esp. + Orq.", "SEC": "Solos Esp. + Coral"
};

const downloadPDF = (elementId: string, filename: string, orientation: 'portrait' | 'landscape' = 'portrait') => {
  const element = document.getElementById(elementId);
  if (!element) return;
  // @ts-ignore
  if (typeof html2pdf === 'undefined') { window.print(); return; }
  const opt = {
    margin: 5, filename: filename, image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 3, useCORS: true, letterRendering: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: orientation }
  };
  // @ts-ignore
  window.html2pdf().set(opt).from(element).save();
};

const parseTimeToSeconds = (timeStr: string = ''): number => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const cleanStr = timeStr.trim();
  if (!cleanStr) return 0;
  
  const parts = cleanStr.split(':');
  if (parts.length === 1) {
    return (parseInt(parts[0]) || 0) * 60;
  } else if (parts.length === 2) {
    return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
  } else if (parts.length >= 3) {
    return (parseInt(parts[0]) || 0) * 3600 + (parseInt(parts[1]) || 0) * 60 + (parseInt(parts[2]) || 0);
  }
  return 0;
};

const formatSecondsToClockTime = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatSecondsToDurationString = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}min ${String(seconds).padStart(2, '0')}seg`;
};

// --- Componentes de Interface ---

const Layout = ({ children, title, onBack, onLogout, isReadOnly, onProfileClick, onExitImpersonation, widthClass = "max-w-5xl" }: { children?: React.ReactNode, title: string, onBack?: () => void, onLogout?: () => void, isReadOnly?: boolean, onProfileClick?: () => void, onExitImpersonation?: () => void, widthClass?: string }) => (
  <div className="min-h-screen bg-gray-50 flex flex-col">
    {onExitImpersonation && (
      <div className="bg-amber-600 text-white p-2 text-center no-print shadow-inner animate-fade-in">
        <div className={`mx-auto flex items-center justify-center gap-4 text-[10px] sm:text-xs font-black uppercase tracking-widest ${widthClass}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          Ambiente de Visualização (Modo Leitura)
          <button 
            onClick={onExitImpersonation}
            className="bg-white text-amber-700 px-4 py-1.5 rounded-full font-black hover:bg-amber-50 transition-all shadow-md active:scale-95"
          >
            Sair e Voltar ao Admin
          </button>
        </div>
      </div>
    )}
    <header className="bg-indigo-700 text-white p-4 shadow-md no-print">
      <div className={`mx-auto flex items-center justify-between ${widthClass}`}>
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-1 hover:bg-indigo-600 rounded">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
          )}
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
        <div className="flex items-center gap-4">
          {isReadOnly && <span className="bg-yellow-400 text-indigo-900 text-[10px] font-black px-2 py-0.5 rounded uppercase">Somente Leitura</span>}
          <div className="text-sm opacity-80 hidden sm:block">CORUS - Gestor de Corais Apostólicos</div>
          <div className="flex items-center gap-2">
            {onProfileClick && (
              <button onClick={onProfileClick} className="p-1 hover:bg-indigo-600 rounded" title="Meu Perfil">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </button>
            )}
            {onLogout && (
              <button onClick={onLogout} className="p-1 hover:bg-red-600 rounded" title="Sair">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
    <main className={`flex-1 mx-auto w-full p-4 ${widthClass}`}>
      {children}
    </main>
  </div>
);

const MenuCard = ({ title, desc, icon, onClick }: any) => (
  <button onClick={onClick} className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 flex flex-col items-center text-center gap-4 w-full h-full">
    <div className="text-indigo-600 bg-indigo-50 p-4 rounded-full">{icon}</div>
    <div>
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="text-gray-500 text-sm mt-1">{desc}</p>
    </div>
  </button>
);

const ConfirmationModal = ({ title, message, onConfirm, onCancel, confirmText = "Confirmar", confirmColor = "bg-indigo-600" }: any) => (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[200] backdrop-blur-sm animate-fade-in">
    <div className="bg-white rounded-2xl p-8 w-full max-sm shadow-2xl text-center">
      <h3 className="text-xl font-black text-gray-900 uppercase mb-4 leading-tight">{title}</h3>
      <p className="text-gray-500 text-sm mb-8">{message}</p>
      <div className="flex gap-4">
        <button onClick={onConfirm} className={`flex-1 ${confirmColor} text-white py-3 rounded-xl font-black uppercase shadow-lg transition-all active:scale-95`}>{confirmText}</button>
        <button onClick={onCancel} className="flex-1 bg-gray-100 text-gray-500 py-3 rounded-xl font-black uppercase hover:bg-gray-200 transition-all">Cancelar</button>
      </div>
    </div>
  </div>
);

// --- Componentes Funcionais ---

const HomeScreen = ({ navigate, onLogout, isReadOnly, isAdmin, onProfileClick, onExitImpersonation }: any) => (
  <Layout title="Menu Principal" onLogout={onLogout} isReadOnly={isReadOnly} onProfileClick={onProfileClick} onExitImpersonation={onExitImpersonation}>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
      {isAdmin && !onExitImpersonation && <MenuCard title="Painel Admin" desc="Gerenciar Usuários e Acessos" icon={<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>} onClick={() => navigate('admin_menu')} />}
      <MenuCard title="Componentes" desc="Músicos e Instrumentos" icon={<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>} onClick={() => navigate('components')} />
      <MenuCard title="Presença" desc="Chamadas e Histórico" icon={<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/></svg>} onClick={() => navigate('attendance')} />
      <MenuCard title="Biblioteca de Hinos" desc="Cadastro por Caderno" icon={<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>} onClick={() => navigate('hymns_library')} />
      <MenuCard title="Programações" desc="Geração de Listas" icon={<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>} onClick={() => navigate('programs')} />
    </div>
  </Layout>
);

const ComponentsScreen = ({ navigate, goBack, onExitImpersonation }: any) => (
  <Layout title="Componentes" onBack={goBack} onExitImpersonation={onExitImpersonation}>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
      <MenuCard title="Instrumentos" desc="Cadastro e consulta" icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>} onClick={() => navigate('instruments')} />
      <MenuCard title="Músicos" desc="Cadastro de integrantes" icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>} onClick={() => navigate('musicians')} />
      <MenuCard title="Relatório" desc="Lista de integrantes (PDF)" icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>} onClick={() => navigate('musician_report_selection')} />
    </div>
  </Layout>
);

const MusicianReportSelectionScreen = ({ navigate, goBack, onExitImpersonation }: any) => {
  const [type, setType] = useState('Geral em Ordem Alfabética');
  const handleGenerate = () => {
    if (type === 'Geral em Ordem Alfabética') navigate('musicians_report');
    if (type === 'Por Voz') navigate('musicians_voice_report');
    if (type === 'Por Instrumento') navigate('musicians_instrument_report');
  };
  return (
    <Layout title="Opções de Relatório" onBack={goBack} onExitImpersonation={onExitImpersonation}>
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 max-md mx-auto mt-12 space-y-6">
        <div>
          <label className="block text-sm font-black text-gray-700 uppercase tracking-widest mb-4">Tipo de Relatório</label>
          <select className="w-full border-2 border-gray-100 rounded-lg p-3 text-lg font-medium focus:border-indigo-500 outline-none transition-colors" value={type} onChange={e => setType(e.target.value)}>
            <option value="Geral em Ordem Alfabética">Geral em Ordem Alfabética</option>
            <option value="Por Voz">Por Voz</option>
            <option value="Por Instrumento">Por Instrumento</option>
          </select>
        </div>
        <button onClick={handleGenerate} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">Visualizar Relatório</button>
      </div>
    </Layout>
  );
};

// --- Relatórios de Componentes ---

const MusiciansReportScreen = ({ goBack, ownerEmail }: any) => {
  const [musicians, setMusicians] = useState<Musician[]>([]);
  useEffect(() => { fetchData('musicians', 'gca_musicians', ownerEmail).then(setMusicians); }, [ownerEmail]);
  const sorted = [...musicians].sort((a, b) => a.name.localeCompare(b.name));
  
  return (
    <div className="bg-gray-100 p-8 min-h-screen">
      <div className="max-w-[800px] mx-auto mb-4 flex justify-between no-print">
        <button onClick={goBack} className="bg-gray-600 text-white px-4 py-2 rounded">Voltar</button>
        <button onClick={() => downloadPDF('musician-report-alpha', `musicos-alfabetico.pdf`)} className="bg-indigo-600 text-white px-4 py-2 rounded font-bold">Gerar PDF</button>
      </div>
      <div id="musician-report-alpha" className="bg-white p-12 shadow-2xl mx-auto max-w-[210mm] min-h-[297mm]">
        <div className="text-center border-b-4 border-double border-black pb-6 mb-8">
          <h1 className="text-3xl font-black uppercase tracking-tighter">Igreja Apostólica</h1>
          <h2 className="text-xl font-bold mt-2 border border-black inline-block px-4 py-1 uppercase">Relatório Geral de Componentes</h2>
          <div className="mt-4 text-sm font-bold uppercase italic border-black border-t-2 pt-2">Ordem Alfabética • Total: {musicians.length}</div>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-black text-left uppercase font-black text-xs">
              <th className="px-2 py-2">Nome</th>
              <th className="px-2 py-2">Voz(es)</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(m => (
              <tr key={m.id} className="border-b border-gray-100">
                <td className="px-2 py-3 font-bold text-gray-800">{m.name}</td>
                <td className="px-2 py-3 text-sm text-gray-600">{m.voices.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const MusiciansVoiceReportScreen = ({ goBack, ownerEmail }: any) => {
  const [musicians, setMusicians] = useState<Musician[]>([]);
  useEffect(() => { fetchData('musicians', 'gca_musicians', ownerEmail).then(setMusicians); }, [ownerEmail]);
  const voices = ['Melodia', 'Contralto', 'Tenor', 'Baixo'];
  
  return (
    <div className="bg-gray-100 p-8 min-h-screen">
      <div className="max-w-[800px] mx-auto mb-4 flex justify-between no-print">
        <button onClick={goBack} className="bg-gray-600 text-white px-4 py-2 rounded">Voltar</button>
        <button onClick={() => downloadPDF('musician-report-voice', `musicos-por-voz.pdf`)} className="bg-indigo-600 text-white px-4 py-2 rounded font-bold">Gerar PDF</button>
      </div>
      <div id="musician-report-voice" className="bg-white p-12 shadow-2xl mx-auto max-w-[210mm] min-h-[297mm]">
        <div className="text-center border-b-4 border-double border-black pb-6 mb-8">
          <h1 className="text-3xl font-black uppercase tracking-tighter">Igreja Apostólica</h1>
          <h2 className="text-xl font-bold mt-2 border border-black inline-block px-4 py-1 uppercase">Relatório de Componentes por Voz</h2>
          <div className="mt-4 text-sm font-bold uppercase italic border-black border-t-2 pt-2">Total: {musicians.length}</div>
        </div>
        {voices.map(voice => {
          const members = musicians.filter(m => m.voices.includes(voice)).sort((a,b) => a.name.localeCompare(b.name));
          if (members.length === 0) return null;
          return (
            <div key={voice} className="mb-8">
              <h3 className="bg-gray-100 px-2 py-1 font-black uppercase text-indigo-800 border-l-4 border-indigo-800 mb-2">{voice} ({members.length})</h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                {members.map(m => <div key={m.id} className="text-sm border-b border-gray-50 py-1">{m.name}</div>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MusiciansInstrumentReportScreen = ({ goBack, ownerEmail }: any) => {
  const [musicians, setMusicians] = useState<Musician[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  useEffect(() => { 
    fetchData('musicians', 'gca_musicians', ownerEmail).then(setMusicians);
    fetchData('instruments', 'gca_instruments', ownerEmail).then(setInstruments);
  }, [ownerEmail]);

  return (
    <div className="bg-gray-100 p-8 min-h-screen">
      <div className="max-w-[800px] mx-auto mb-4 flex justify-between no-print">
        <button onClick={goBack} className="bg-gray-600 text-white px-4 py-2 rounded">Voltar</button>
        <button onClick={() => downloadPDF('musician-report-instrument', `musicos-por-instrumento.pdf`)} className="bg-indigo-600 text-white px-4 py-2 rounded font-bold">Gerar PDF</button>
      </div>
      <div id="musician-report-instrument" className="bg-white p-12 shadow-2xl mx-auto max-w-[210mm] min-h-[297mm]">
        <div className="text-center border-b-4 border-double border-black pb-6 mb-8">
          <h1 className="text-3xl font-black uppercase tracking-tighter">Igreja Apostólica</h1>
          <h2 className="text-xl font-bold mt-2 border border-black inline-block px-4 py-1 uppercase">Relatório de Componentes por Instrumento</h2>
          <div className="mt-4 text-sm font-bold uppercase italic border-black border-t-2 pt-2">Total: {musicians.length}</div>
        </div>
        {instruments.sort((a,b) => a.name.localeCompare(b.name)).map(inst => {
          const members = musicians.filter(m => m.instruments.includes(inst.id)).sort((a,b) => a.name.localeCompare(b.name));
          if (members.length === 0) return null;
          return (
            <div key={inst.id} className="mb-8">
              <h3 className="bg-gray-100 px-2 py-1 font-black uppercase text-indigo-800 border-l-4 border-indigo-800 mb-2">{inst.name} ({members.length})</h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                {members.map(m => <div key={m.id} className="text-sm border-b border-gray-50 py-1">{m.name}</div>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- Relatório de Presença ---

const AttendanceReportScreen = ({ goBack, ownerEmail, reportData }: any) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [musicians, setMusicians] = useState<Musician[]>([]);
  
  useEffect(() => {
    const load = async () => {
      const recs = await fetchData('attendance', 'gca_attendance', ownerEmail);
      const musics = await fetchData('musicians', 'gca_musicians', ownerEmail);
      
      const filtered = recs.filter((r: AttendanceRecord) => 
        r.date >= reportData.s && r.date <= reportData.e
      ).sort((a: any, b: any) => a.date.localeCompare(b.date));
      
      setRecords(filtered);
      setMusicians(musics);
    };
    load();
  }, [ownerEmail, reportData.s, reportData.e]);

  const sortedMusicians = [...musicians].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="bg-gray-100 p-8 min-h-screen">
      <div className="max-w-[800px] mx-auto mb-4 flex justify-between no-print">
        <button onClick={goBack} className="bg-gray-600 text-white px-4 py-2 rounded">Voltar</button>
        <button onClick={() => downloadPDF('attendance-report-view', `relatorio-presenca.pdf`, 'landscape')} className="bg-indigo-600 text-white px-4 py-2 rounded font-bold">Gerar PDF</button>
      </div>
      <div id="attendance-report-view" className="bg-white p-12 shadow-2xl mx-auto max-w-[297mm] min-h-[210mm]">
        <div className="text-center border-b-4 border-double border-black pb-6 mb-8">
          <h1 className="text-3xl font-black uppercase tracking-tighter">Igreja Apostólica</h1>
          <h2 className="text-xl font-bold mt-2 border border-black inline-block px-4 py-1 uppercase">Relatório de Presença</h2>
          <div className="mt-4 text-sm font-bold uppercase italic text-indigo-700">
            Filtro: {reportData.t} • Período: {new Date(reportData.s + 'T00:00:00').toLocaleDateString('pt-BR')} até {new Date(reportData.e + 'T00:00:00').toLocaleDateString('pt-BR')}
          </div>
        </div>

        {records.length === 0 ? (
          <p className="text-center text-gray-400 py-12 italic">Nenhum registro encontrado neste período.</p>
        ) : (
          <div className="space-y-12">
            {records.map(r => {
              const presentIds = new Set(r.presentMusicianIds);
              const justifiedMap = r.justifications || {};
              const justifiedIds = new Set(Object.keys(justifiedMap));
              
              let filteredList: Musician[] = [];
              if (reportData.t === 'Todos') {
                filteredList = sortedMusicians;
              } else if (reportData.t === 'Somente Presentes') {
                filteredList = sortedMusicians.filter(m => presentIds.has(m.id));
              } else if (reportData.t === 'Somente Ausentes') {
                filteredList = sortedMusicians.filter(m => !presentIds.has(m.id) && !justifiedIds.has(m.id));
              } else if (reportData.t === 'Somente Justificadas') {
                filteredList = sortedMusicians.filter(m => justifiedIds.has(m.id) && !presentIds.has(m.id));
              }

              return (
                <div key={r.id} className="break-inside-avoid">
                  <h3 className="bg-indigo-900 text-white px-4 py-1.5 font-black uppercase text-xs mb-4 inline-block rounded shadow-sm">
                    {new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </h3>
                  
                  <table className="w-full border-collapse border border-gray-200">
                    <thead>
                      <tr className="bg-gray-50 text-[10px] font-black uppercase tracking-widest text-indigo-900 text-left">
                        <th className="px-4 py-2 border border-gray-200 w-1/3">Nome</th>
                        <th className="px-4 py-2 border border-gray-200 w-32">Status</th>
                        <th className="px-4 py-2 border border-gray-200">Justificativa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredList.map(m => {
                        const isPresent = presentIds.has(m.id);
                        const isJustified = justifiedIds.has(m.id);
                        const statusText = isPresent ? 'Presente' : isJustified ? 'Justificado' : 'Ausente';
                        const statusColor = isPresent ? 'text-green-600' : isJustified ? 'text-blue-600' : 'text-red-500';
                        const justificationText = isJustified ? justifiedMap[m.id] : '-';

                        return (
                          <tr key={m.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 border border-gray-200 text-xs font-bold text-gray-800">{m.name}</td>
                            <td className={`px-4 py-2 border border-gray-200 text-xs font-black uppercase ${statusColor}`}>{statusText}</td>
                            <td className="px-4 py-2 border border-gray-200 text-xs text-gray-600 italic whitespace-normal break-words leading-relaxed">
                                {justificationText}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredList.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-gray-400 italic text-sm">Nenhum músico encontrado para este filtro nesta data.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Relatório de Participação (%) ---

const AttendancePercentageReportScreen = ({ goBack, ownerEmail, reportData }: any) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [musicians, setMusicians] = useState<Musician[]>([]);
  
  useEffect(() => {
    const load = async () => {
      const recs = await fetchData('attendance', 'gca_attendance', ownerEmail);
      const musics = await fetchData('musicians', 'gca_musicians', ownerEmail);
      
      const filtered = recs.filter((r: AttendanceRecord) => 
        r.date >= reportData.s && r.date <= reportData.e
      );
      
      setRecords(filtered);
      setMusicians(musics);
    };
    load();
  }, [ownerEmail, reportData.s, reportData.e]);

  const sortedMusicians = [...musicians].sort((a, b) => a.name.localeCompare(b.name));
  const totalCallsInPeriod = records.length;

  return (
    <div className="bg-gray-100 p-8 min-h-screen">
      <div className="max-w-[800px] mx-auto mb-4 flex justify-between no-print">
        <button onClick={goBack} className="bg-gray-600 text-white px-4 py-2 rounded">Voltar</button>
        <button onClick={() => downloadPDF('attendance-perc-view', `percentual-participacao.pdf`)} className="bg-indigo-600 text-white px-4 py-2 rounded font-bold">Gerar PDF</button>
      </div>
      <div id="attendance-perc-view" className="bg-white p-12 shadow-2xl mx-auto max-w-[210mm] min-h-[297mm]">
        <div className="text-center border-b-4 border-double border-black pb-6 mb-8">
          <h1 className="text-3xl font-black uppercase tracking-tighter">Igreja Apostólica</h1>
          <h2 className="text-xl font-bold mt-2 border border-black inline-block px-4 py-1 uppercase">Percentual de Participação</h2>
          <div className="mt-4 text-sm font-bold uppercase italic border-black border-t-2 pt-2">
            Período: {new Date(reportData.s + 'T00:00:00').toLocaleDateString('pt-BR')} até {new Date(reportData.e + 'T00:00:00').toLocaleDateString('pt-BR')}
            <br />
            Total de Chamadas no Período: {totalCallsInPeriod}
          </div>
        </div>

        <table className="w-full border-collapse">
            <thead>
                <tr className="border-b-2 border-black text-left uppercase font-black text-[10px]">
                    <th className="px-2 py-2">Músico</th>
                    <th className="px-2 py-2 text-center">Presenças</th>
                    <th className="px-2 py-2 text-center">Justificadas</th>
                    <th className="px-2 py-2 text-center">Válidas</th>
                    <th className="px-2 py-2 text-right">Percentual</th>
                </tr>
            </thead>
            <tbody>
                {sortedMusicians.map(m => {
                    let presents = 0;
                    let justified = 0;
                    records.forEach(r => {
                        if (r.presentMusicianIds.includes(m.id)) presents++;
                        else if (r.justifications && r.justifications[m.id]) justified++;
                    });
                    
                    const validSessions = totalCallsInPeriod - justified;
                    const percentage = validSessions > 0 ? (presents / validSessions) * 100 : 0;
                    const isBelowThreshold = percentage < 50;

                    return (
                        <tr key={m.id} className="border-b border-gray-100 group hover:bg-gray-50">
                            <td className={`px-2 py-3 font-bold text-xs ${isBelowThreshold ? 'text-red-600' : 'text-gray-800'}`}>{m.name}</td>
                            <td className="px-2 py-3 text-center text-xs text-gray-600">{presents}</td>
                            <td className="px-2 py-3 text-center text-xs text-blue-600 font-medium">{justified}</td>
                            <td className="px-2 py-3 text-center text-xs text-gray-400 italic">{validSessions}</td>
                            <td className={`px-2 py-3 text-right font-black text-sm ${isBelowThreshold ? 'text-red-600' : 'text-indigo-700'}`}>
                                {percentage.toFixed(1)}%
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
        
        {totalCallsInPeriod === 0 && (
            <p className="text-center text-gray-400 py-12 italic">Nenhuma chamada registrada no período selecionado.</p>
        )}

        <div className="mt-12 text-[9px] text-gray-400 uppercase font-bold italic border-t pt-4">
            * Justificativas são desconsideradas do cálculo (não contam como presença nem ausência).
            <br />
            * O percentual é calculado sobre as chamadas restantes (Chamadas Totais - Justificativas).
        </div>
      </div>
    </div>
  );
};

// --- Relatório de Caderno ---

const HymnNotebookReportScreen = ({ notebook, goBack, ownerEmail }: any) => {
  const [hymns, setHymns] = useState<MasterHymn[]>([]);
  useEffect(() => {
    fetchData('hymns_library', 'gca_hymns_library', ownerEmail).then(all => {
      setHymns(all.filter((h: any) => h.notebook === notebook.code));
    });
  }, [notebook.code, ownerEmail]);

  const sorted = [...hymns].sort((a, b) => {
    const n1 = parseInt(a.number);
    const n2 = parseInt(b.number);
    if (isNaN(n1) || isNaN(n2)) return a.number.localeCompare(b.number);
    return n1 - n2;
  });

  return (
    <div className="bg-gray-100 p-8 min-h-screen">
      <div className="max-w-[800px] mx-auto mb-4 flex justify-between no-print">
        <button onClick={goBack} className="bg-gray-600 text-white px-4 py-2 rounded">Voltar</button>
        <button onClick={() => downloadPDF('hymn-notebook-report-view', `hinos-${notebook.code}.pdf`)} className="bg-indigo-600 text-white px-4 py-2 rounded font-bold">Gerar PDF</button>
      </div>
      <div id="hymn-notebook-report-view" className="bg-white p-12 shadow-2xl mx-auto max-w-[210mm] min-h-[297mm]">
        <div className="text-center border-b-4 border-double border-black pb-6 mb-8">
          <h1 className="text-3xl font-black uppercase tracking-tighter">Igreja Apostólica</h1>
          <h2 className="text-xl font-bold mt-2 border border-black inline-block px-4 py-1 uppercase">Biblioteca de Hinos</h2>
          <div className="mt-4 text-sm font-bold uppercase italic border-black border-t-2 pt-2">Caderno: {notebook.code} - {notebook.name} • Total: {hymns.length} Hinos</div>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-black text-left uppercase font-black text-xs">
              <th className="px-2 py-2 w-20">Nº</th>
              <th className="px-2 py-2">Título do Hino</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(h => (
              <tr key={h.id} className="border-b border-gray-100">
                <td className="px-2 py-3 font-black text-indigo-700 text-xl">{h.number}</td>
                <td className="px-2 py-3 font-bold text-gray-800 uppercase">{h.title}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Relatórios do Módulo Admin Master ---

const AdminMasterReportView = ({ id, title, columns, data, goBack }: any) => (
  <div className="bg-gray-100 p-8 min-h-screen">
    <div className="max-w-[800px] mx-auto mb-4 flex justify-between no-print">
      <button onClick={goBack} className="bg-gray-600 text-white px-4 py-2 rounded">Voltar</button>
      <button onClick={() => downloadPDF(id, `${id}.pdf`)} className="bg-indigo-600 text-white px-4 py-2 rounded font-bold">Gerar PDF</button>
    </div>
    <div id={id} className="bg-white p-12 shadow-2xl mx-auto max-w-[210mm] min-h-[297mm]">
      <div className="text-center border-b-4 border-double border-black pb-6 mb-8">
        <h1 className="text-3xl font-black uppercase tracking-tighter">Igreja Apostólica</h1>
        <h2 className="text-xl font-bold mt-2 border border-black inline-block px-4 py-1 uppercase">{title}</h2>
        <div className="mt-4 text-xs font-bold uppercase italic border-black border-t-2 pt-2">Relatório Gerado pelo Sistema Admin Master</div>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black text-left uppercase font-black text-[10px] bg-gray-50">
            {columns.map((col: any) => <th key={col.key} className="px-2 py-2">{col.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map((item: any, idx: number) => (
            <tr key={idx} className="border-b border-gray-100">
              {columns.map((col: any) => (
                <td key={col.key} className="px-2 py-3 text-xs font-medium text-gray-700">
                  {item[col.key] || '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// --- Telas de Cadastros Admin (País, Cidade, Congregação) ---

const AdminCountriesScreen = ({ goBack, navigate }: any) => {
  const [countries, setCountries] = useState<Country[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<{ type: 'save' | 'delete', data?: any } | null>(null);

  useEffect(() => { fetchData('countries', 'gca_countries').then(setCountries); }, []);

  const prepareSave = (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmingAction({ type: 'save' });
  };

  const executeSave = async () => {
    let updated;
    if (editingId) {
      updated = countries.map(c => c.id === editingId ? { ...c, name: name.trim() } : c);
    } else {
      const maxId = countries.reduce((max, c) => Math.max(max, parseInt(c.id) || 0), 0);
      const newId = (maxId + 1).toString().padStart(2, '0');
      updated = [...countries, { id: newId, name: name.trim() }];
    }
    setCountries(updated);
    await saveData('countries', 'gca_countries', updated);
    setName('');
    setEditingId(null);
    setShowForm(false);
    setConfirmingAction(null);
  };

  const executeDelete = async () => {
    if (!confirmingAction?.data) return;
    const id = confirmingAction.data.id;
    const updated = countries.filter(c => c.id !== id);
    setCountries(updated);
    await deleteRow('countries', 'gca_countries', id, updated);
    setConfirmingAction(null);
  };

  return (
    <Layout title="Gerenciar Países" onBack={goBack}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-bold text-gray-700 uppercase">Países Cadastrados</h2>
        <div className="flex gap-2">
          <button onClick={() => navigate('admin_countries_report', countries)} className="bg-gray-100 text-indigo-600 px-4 py-2 rounded font-bold border border-indigo-200">Relatório</button>
          <button onClick={() => { setEditingId(null); setName(''); setShowForm(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded font-bold">Novo País</button>
        </div>
      </div>

      {confirmingAction?.type === 'save' && (
        <ConfirmationModal 
          title="Confirmar Registro" 
          message={editingId ? "Deseja concluir as edições para este país?" : "Deseja salvar este novo país no sistema?"}
          onConfirm={executeSave}
          onCancel={() => setConfirmingAction(null)}
        />
      )}

      {confirmingAction?.type === 'delete' && (
        <ConfirmationModal 
          title="Excluir País" 
          message={`Deseja excluir permanentemente o país "${confirmingAction.data.name}"?`}
          confirmText="Sim, Excluir"
          confirmColor="bg-red-600"
          onConfirm={executeDelete}
          onCancel={() => setConfirmingAction(null)}
        />
      )}

      {showForm && (
        <div className="bg-white p-6 rounded-xl border mb-6 shadow-sm animate-slide-down">
          <h3 className="font-black text-xs uppercase text-indigo-900 mb-4">{editingId ? 'Editando País' : 'Cadastrando Novo País'}</h3>
          <form onSubmit={prepareSave} className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Nome do País</label>
              <input required className="w-full border rounded p-2" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Brasil" />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button type="submit" className="flex-1 bg-green-600 text-white px-6 py-2 rounded font-bold">{editingId ? 'Salvar Alteração' : 'Gravar'}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 text-gray-400">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        {countries.map(c => (
          <div key={c.id} className="p-4 border-b last:border-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group hover:bg-indigo-50/30">
            <div className="flex items-center flex-1">
              <span className="font-mono bg-gray-50 px-2 py-1 rounded text-indigo-600 font-bold border">{c.id}</span>
              <span className="ml-4 font-bold text-gray-800 uppercase">{c.name}</span>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setEditingId(c.id); setName(c.name); setShowForm(true); }} className="text-indigo-600 font-bold uppercase text-[10px] hover:underline">Editar</button>
              <button onClick={() => setConfirmingAction({ type: 'delete', data: c })} className="text-red-500 font-bold uppercase text-[10px] hover:underline">Excluir</button>
            </div>
          </div>
        ))}
        {countries.length === 0 && <p className="p-12 text-center text-gray-400 italic">Nenhum país cadastrado.</p>}
      </div>
    </Layout>
  );
};

const AdminCitiesScreen = ({ goBack, navigate }: any) => {
  const [cities, setCities] = useState<City[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', cep: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<{ type: 'save' | 'delete', data?: any } | null>(null);

  useEffect(() => { fetchData('cities', 'gca_cities').then(setCities); }, []);

  const prepareSave = (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmingAction({ type: 'save' });
  };

  const executeSave = async () => {
    let updated;
    if (editingId) {
      updated = cities.map(c => c.id === editingId ? { ...c, ...formData } : c);
    } else {
      const maxId = cities.reduce((max, c) => Math.max(max, parseInt(c.id) || 0), 0);
      const newId = (maxId + 1).toString().padStart(2, '0');
      updated = [...cities, { id: newId, ...formData }];
    }
    setCities(updated);
    await saveData('cities', 'gca_cities', updated);
    setFormData({ name: '', cep: '' });
    setEditingId(null);
    setShowForm(false);
    setConfirmingAction(null);
  };

  const executeDelete = async () => {
    if (!confirmingAction?.data) return;
    const id = confirmingAction.data.id;
    const updated = cities.filter(c => c.id !== id);
    setCities(updated);
    await deleteRow('cities', 'gca_cities', id, updated);
    setConfirmingAction(null);
  };

  return (
    <Layout title="Gerenciar Cidades" onBack={goBack}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-bold text-gray-700 uppercase">Cidades Cadastradas</h2>
        <div className="flex gap-2">
          <button onClick={() => navigate('admin_cities_report', cities)} className="bg-gray-100 text-indigo-600 px-4 py-2 rounded font-bold border border-indigo-200">Relatório</button>
          <button onClick={() => { setEditingId(null); setFormData({name: '', cep: ''}); setShowForm(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded font-bold">Nova Cidade</button>
        </div>
      </div>

      {confirmingAction?.type === 'save' && (
        <ConfirmationModal 
          title="Confirmar Registro" 
          message={editingId ? "Deseja concluir as edições para esta cidade?" : "Deseja salvar esta nova cidade no sistema?"}
          onConfirm={executeSave}
          onCancel={() => setConfirmingAction(null)}
        />
      )}

      {confirmingAction?.type === 'delete' && (
        <ConfirmationModal 
          title="Excluir Cidade" 
          message={`Deseja excluir permanentemente a cidade "${confirmingAction.data.name}"?`}
          confirmText="Sim, Excluir"
          confirmColor="bg-red-600"
          onConfirm={executeDelete}
          onCancel={() => setConfirmingAction(null)}
        />
      )}

      {showForm && (
        <div className="bg-white p-6 rounded-xl border mb-6 shadow-sm animate-slide-down">
          <form onSubmit={prepareSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Nome da Cidade</label>
              <input required className="w-full border rounded p-2" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ex: São Paulo" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">CEP</label>
              <input required className="w-full border rounded p-2" value={formData.cep} onChange={e => setFormData({...formData, cep: e.target.value})} placeholder="00000-000" />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2 mt-2">
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="text-gray-400 px-4 py-2">Cancelar</button>
              <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded font-bold">{editingId ? 'Salvar Edição' : 'Salvar'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        {cities.map(c => (
          <div key={c.id} className="p-4 border-b last:border-0 flex flex-col sm:flex-row gap-4 items-start sm:items-center group hover:bg-indigo-50/30">
            <div className="flex items-center flex-1 w-full">
              <span className="font-mono bg-gray-50 px-2 py-1 rounded text-indigo-600 font-bold border">{c.id}</span>
              <span className="flex-1 ml-4 font-bold text-gray-800 uppercase">{c.name}</span>
              <span className="text-gray-400 font-medium text-sm">{c.cep}</span>
            </div>
            <div className="flex gap-4 border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto">
              <button onClick={() => { setEditingId(c.id); setFormData({name: c.name, cep: c.cep}); setShowForm(true); }} className="text-indigo-600 font-bold uppercase text-[10px] hover:underline">Editar</button>
              <button onClick={() => setConfirmingAction({ type: 'delete', data: c })} className="text-red-500 font-bold uppercase text-[10px] hover:underline">Excluir</button>
            </div>
          </div>
        ))}
        {cities.length === 0 && <p className="p-12 text-center text-gray-400 italic">Nenhuma cidade cadastrada.</p>}
      </div>
    </Layout>
  );
};

const AdminCongregationsScreen = ({ goBack, navigate }: any) => {
  const [congre, setCongre] = useState<CongregationRecord[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ country_id: '', city_id: '', address: '', address_number: '', cep: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<{ type: 'save' | 'delete', data?: any } | null>(null);
  
  const [foundCountryName, setFoundCountryName] = useState('');
  const [foundCityName, setFoundCityName] = useState('');

  useEffect(() => { 
    fetchData('congregations_admin', 'gca_congregations_admin').then(setCongre);
    fetchData('countries', 'gca_countries').then(setCountries);
    fetchData('cities', 'gca_cities').then(setCities);
  }, []);

  const handleCountryCodeChange = (code: string) => {
    setFormData({ ...formData, country_id: code });
    const found = countries.find(c => c.id === code);
    setFoundCountryName(found ? found.name : 'Não encontrado');
  };

  const handleCityCodeChange = (code: string) => {
    setFormData({ ...formData, city_id: code });
    const found = cities.find(c => c.id === code);
    setFoundCityName(found ? found.name : 'Não encontrado');
  };

  const prepareSave = (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmingAction({ type: 'save' });
  };

  const executeSave = async () => {
    let updated;
    const cityName = cities.find(ci => ci.id === formData.city_id)?.name || 'Congregação';
    
    if (editingId) {
      updated = congre.map(c => c.id === editingId ? { ...c, ...formData, name: cityName } : c);
    } else {
      const maxId = congre.reduce((max, c) => Math.max(max, parseInt(c.id) || 0), 0);
      const newId = (maxId + 1).toString().padStart(4, '0');
      updated = [...congre, { id: newId, ...formData, name: cityName }];
    }
    setCongre(updated);
    await saveData('congregations_admin', 'gca_congregations_admin', updated);
    setFormData({ country_id: '', city_id: '', address: '', address_number: '', cep: '' });
    setFoundCountryName('');
    setFoundCityName('');
    setEditingId(null);
    setShowForm(false);
    setConfirmingAction(null);
  };

  const executeDelete = async () => {
    if (!confirmingAction?.data) return;
    const id = confirmingAction.data.id;
    const updated = congre.filter(c => c.id !== id);
    setCongre(updated);
    await deleteRow('congregations_admin', 'gca_congregations_admin', id, updated);
    setConfirmingAction(null);
  };

  const startEdit = (c: CongregationRecord) => {
    setEditingId(c.id);
    setFormData({ country_id: c.country_id, city_id: c.city_id, address: c.address, address_number: c.address_number, cep: c.cep });
    const co = countries.find(x => x.id === c.country_id);
    const ci = cities.find(x => x.id === c.city_id);
    setFoundCountryName(co ? co.name : '');
    setFoundCityName(ci ? ci.name : '');
    setShowForm(true);
  };

  const getReportData = () => {
    return congre.map(c => ({
      ...c,
      city: cities.find(ci => ci.id === c.city_id)?.name || '-',
      country: countries.find(co => co.id === c.country_id)?.name || '-'
    }));
  };

  return (
    <Layout title="Gerenciar Congregações" onBack={goBack}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-bold text-gray-700 uppercase">Congregações</h2>
        <div className="flex gap-2">
          <button onClick={() => navigate('admin_congregations_report', getReportData())} className="bg-gray-100 text-indigo-600 px-4 py-2 rounded font-bold border border-indigo-200">Relatório</button>
          <button onClick={() => { setEditingId(null); setShowForm(true); setFormData({ country_id: '', city_id: '', address: '', address_number: '', cep: '' }); setFoundCountryName(''); setFoundCityName(''); }} className="bg-indigo-600 text-white px-4 py-2 rounded font-bold">Nova Congregação</button>
        </div>
      </div>

      {confirmingAction?.type === 'save' && (
        <ConfirmationModal 
          title="Confirmar Registro" 
          message={editingId ? "Deseja concluir as edições para esta congregação?" : "Deseja salvar esta nova congregação no sistema?"}
          onConfirm={executeSave}
          onCancel={() => setConfirmingAction(null)}
        />
      )}

      {confirmingAction?.type === 'delete' && (
        <ConfirmationModal 
          title="Excluir Congregação" 
          message={`Deseja excluir permanentemente a congregação "${confirmingAction.data.name}"?`}
          confirmText="Sim, Excluir"
          confirmColor="bg-red-600"
          onConfirm={executeDelete}
          onCancel={() => setConfirmingAction(null)}
        />
      )}

      {showForm && (
        <div className="bg-white p-6 rounded-xl border mb-6 shadow-sm animate-slide-down">
          <form onSubmit={prepareSave} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-3 bg-gray-50 p-2 rounded text-[10px] font-black uppercase text-indigo-600 flex items-center gap-2">
               <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
               O nome da congregação será atribuído automaticamente com base na cidade selecionada.
            </div>
            
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Cód. País</label>
              <div className="flex gap-2">
                <input required className="w-20 border rounded p-2 text-center" value={formData.country_id} onChange={e => handleCountryCodeChange(e.target.value)} placeholder="01" />
                <input readOnly className="flex-1 bg-gray-50 border rounded p-2 italic text-gray-500" value={foundCountryName} placeholder="Busca automática..." />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Cód. Cidade</label>
              <div className="flex gap-2">
                <input required className="w-20 border rounded p-2 text-center" value={formData.city_id} onChange={e => handleCityCodeChange(e.target.value)} placeholder="01" />
                <input readOnly className="flex-1 bg-gray-50 border rounded p-2 italic text-gray-500" value={foundCityName} placeholder="Busca automática..." />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">CEP</label>
              <input required className="w-full border rounded p-2" value={formData.cep} onChange={e => setFormData({...formData, cep: e.target.value})} placeholder="00000-000" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Endereço</label>
              <input required className="w-full border rounded p-2" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="Rua, Avenida..." />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Nº</label>
              <input required className="w-full border rounded p-2" value={formData.address_number} onChange={e => setFormData({...formData, address_number: e.target.value})} placeholder="123" />
            </div>

            <div className="lg:col-span-3 flex justify-end gap-2 mt-4 border-t pt-4">
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="text-gray-400 px-4 py-2">Cancelar</button>
              <button type="submit" className="bg-green-600 text-white px-8 py-2 rounded font-bold shadow-md">{editingId ? 'Confirmar Edição' : 'Salvar Congregação'}</button>
            </div>
          </form>
        </div>
      )}
      <div className="space-y-4">
        {congre.map(c => (
          <div key={c.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center group hover:border-indigo-200 transition-colors gap-4">
            <div className="flex items-start gap-4 flex-1">
              <span className="font-mono bg-gray-50 px-2 py-1 rounded text-indigo-600 font-bold border text-sm">{c.id}</span>
              <div>
                <h3 className="font-black text-indigo-900 uppercase">{c.name}</h3>
                <p className="text-xs text-gray-500 mt-1 font-medium italic">
                  {c.address}, {c.address_number} • {cities.find(ct => ct.id === c.city_id)?.name || 'Desconhecida'} / {countries.find(co => co.id === c.country_id)?.name || 'Desconhecido'}
                </p>
                <span className="text-[9px] font-black uppercase bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded tracking-tighter mt-2 inline-block">CEP: {c.cep}</span>
              </div>
            </div>
            <div className="flex gap-4 border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto">
              <button onClick={() => startEdit(c)} className="text-indigo-600 font-bold uppercase text-[10px] hover:underline">Editar</button>
              <button onClick={() => setConfirmingAction({ type: 'delete', data: c })} className="text-red-500 font-bold uppercase text-[10px] hover:underline">Excluir</button>
            </div>
          </div>
        ))}
        {congre.length === 0 && <p className="p-12 text-center text-gray-400 italic">Nenhuma congregação cadastrada.</p>}
      </div>
    </Layout>
  );
};

const AdminRegistrationsSummaryScreen = ({ navigate, goBack }: any) => {
  return (
    <Layout title="Módulo de Cadastros" onBack={goBack}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <MenuCard 
          title="País" 
          desc="Gestão de Países de atuação" 
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>} 
          onClick={() => navigate('admin_countries')} 
        />
        <MenuCard 
          title="Cidade" 
          desc="Gestão de Cidades e CEPs" 
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>} 
          onClick={() => navigate('admin_cities')} 
        />
        <MenuCard 
          title="Congregação" 
          desc="Vincular Países, Cidades e Endereços" 
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>} 
          onClick={() => navigate('admin_congregations')} 
        />
      </div>
      <div className="mt-12 flex justify-center">
        <button onClick={goBack} className="border-2 border-gray-200 text-gray-500 px-12 py-2 rounded-full font-bold hover:bg-gray-100 transition-colors uppercase text-xs">Voltar ao Painel</button>
      </div>
    </Layout>
  );
};

// --- Módulo CRR (Certificado de Registro de Regentes) ---

const AdminConductorCertificatesScreen = ({ navigate, goBack }: any) => {
  const [conductors, setConductors] = useState<Conductor[]>([]);
  const [congregations, setCongregations] = useState<CongregationRecord[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState<Conductor | null>(null);

  useEffect(() => { 
    fetchData('conductors', 'gca_conductors').then(setConductors);
    fetchData('congregations_admin', 'gca_congregations_admin').then(setCongregations);
  }, []);

  const executeDelete = async () => {
    if (!confirmingDelete) return;
    const updated = conductors.filter(c => c.id !== confirmingDelete.id);
    setConductors(updated);
    await deleteRow('conductors', 'gca_conductors', confirmingDelete.id, updated);
    setConfirmingDelete(null);
  };

  return (
    <Layout title="CRR - Gestão de Regentes" onBack={goBack}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-bold text-gray-700 uppercase">Lista de Regentes</h2>
        <div className="flex gap-2">
          <button onClick={() => navigate('admin_conductors_report', conductors)} className="bg-gray-100 text-indigo-600 px-4 py-2 rounded font-bold border border-indigo-200">Relatório</button>
          <button onClick={() => navigate('admin_new_conductor')} className="bg-indigo-600 text-white px-4 py-2 rounded font-bold shadow-md">Novo Registro</button>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmationModal 
          title="Excluir Registro" 
          message={`Deseja excluir permanentemente o regente "${confirmingDelete.name}" e revogar seu acesso?`}
          confirmText="Sim, Excluir"
          confirmColor="bg-red-600"
          onConfirm={executeDelete}
          onCancel={() => setConfirmingDelete(null)}
        />
      )}

      <div className="space-y-4">
        {conductors.map(c => (
          <div key={c.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group hover:border-indigo-200 transition-colors">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="bg-indigo-700 text-white px-2 py-0.5 rounded font-black text-xs">{c.registry_number}</span>
                <h3 className="font-black text-indigo-900 uppercase">{c.name}</h3>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {ROLE_LABELS[c.role_code]} • {congregations.find(con => con.id === c.congregation_id)?.name || 'Local não identificado'}
              </p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button onClick={() => navigate('admin_crr_card', c)} className="flex-1 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded text-[10px] font-black uppercase border border-indigo-100">Emitir CRR</button>
              <button className="bg-green-50 text-green-700 px-3 py-1.5 rounded text-[10px] font-black uppercase border border-green-100">Autorização</button>
              <button onClick={() => setConfirmingDelete(c)} className="bg-red-50 text-red-700 p-2 rounded text-[10px] font-black uppercase border border-red-100">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        ))}
        {conductors.length === 0 && <p className="p-12 text-center text-gray-400 italic">Nenhum regente registrado até o momento.</p>}
      </div>
    </Layout>
  );
};

const AdminNewConductorForm = ({ goBack }: any) => {
  const [formData, setFormData] = useState({ name: '', country_id: '', city_id: '', congregation_id: '', birth_date: '', phone: '', email: '', role_code: 'T' as any });
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [congre, setCongre] = useState<CongregationRecord[]>([]);
  const [conductors, setConductors] = useState<Conductor[]>([]);
  
  const [foundNames, setFoundNames] = useState({ country: '', city: '', congre: '' });
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchData('countries', 'gca_countries').then(setCountries);
    fetchData('cities', 'gca_cities').then(setCities);
    fetchData('congregations_admin', 'gca_congregations_admin').then(setCongre);
    fetchData('conductors', 'gca_conductors').then(setConductors);
  }, []);

  const lookup = (field: string, val: string) => {
    const nextNames = { ...foundNames };
    if (field === 'country_id') nextNames.country = countries.find(c => c.id === val)?.name || '';
    if (field === 'city_id') nextNames.city = cities.find(c => c.id === val)?.name || '';
    if (field === 'congregation_id') nextNames.congre = congre.find(c => c.id === val)?.name || '';
    setFoundNames(nextNames);
    setFormData({ ...formData, [field]: val });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    // 1. Calcular Contador para Registro
    const sameLoc = conductors.filter(c => c.country_id === formData.country_id && c.city_id === formData.city_id && c.congregation_id === formData.congregation_id);
    const counter = sameLoc.length + 1;
    const regNum = `${formData.role_code}/${formData.country_id}${formData.city_id}${formData.congregation_id}-${counter}`;

    // 2. Gerar Senha e Novo ID
    const password = generateNumericPassword();
    const newId = generateId();

    const newConductor: Conductor = { 
      id: newId, 
      ...formData, 
      registry_number: regNum, 
      created_at: new Date().toISOString() 
    };

    // 3. Salvar Regente e Criar Usuário
    try {
      const updatedConductors = [...conductors, newConductor];
      await saveData('conductors', 'gca_conductors', updatedConductors);
      
      // Criar acesso automático
      const newUser: UserAccount = {
        id: generateId(),
        name: formData.name,
        email: formData.email,
        congregation: foundNames.congre || 'Sede',
        phone: formData.phone,
        role: ROLE_LABELS[formData.role_code],
        password: password,
        status: 'authorized'
      };
      await saveData('users', 'gca_users', newUser);

      setTempPassword(password);
    } catch (err) {
      alert("Erro ao salvar registro.");
    } finally {
      setIsSaving(false);
    }
  };

  if (tempPassword) {
    return (
      <Layout title="Registro Concluído" onBack={goBack}>
        <div className="max-w-md mx-auto mt-12 bg-white p-8 rounded-3xl shadow-2xl text-center border-t-8 border-green-500 animate-scale-up">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3 className="text-2xl font-black text-gray-900 uppercase mb-2">Sucesso!</h3>
          <p className="text-gray-500 text-sm mb-8">O regente foi registrado e sua conta de acesso foi ativada automaticamente.</p>
          
          <div className="bg-gray-50 p-6 rounded-2xl border-2 border-dashed border-gray-200 mb-8">
            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Senha Provisória de Acesso</p>
            <p className="text-4xl font-black text-indigo-700 tracking-[10px]">{tempPassword}</p>
          </div>

          <button onClick={goBack} className="w-full bg-indigo-700 text-white py-4 rounded-2xl font-black uppercase shadow-lg shadow-indigo-100 hover:bg-indigo-800 transition-all">Concluir e Voltar</button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Novo Registro de Regente" onBack={goBack}>
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-3xl mx-auto animate-fade-in">
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Nome Completo</label>
            <input required className="w-full border rounded p-3 font-bold" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ex: João da Silva" />
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">País (Cód)</label>
              <div className="flex gap-2">
                <input required className="w-16 border rounded p-2 text-center font-mono" value={formData.country_id} onChange={e => lookup('country_id', e.target.value)} placeholder="01" />
                <input readOnly className="flex-1 bg-gray-50 border rounded p-2 text-xs italic text-gray-400" value={foundNames.country} placeholder="Busca automática..." />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Cidade (Cód)</label>
              <div className="flex gap-2">
                <input required className="w-16 border rounded p-2 text-center font-mono" value={formData.city_id} onChange={e => lookup('city_id', e.target.value)} placeholder="01" />
                <input readOnly className="flex-1 bg-gray-50 border rounded p-2 text-xs italic text-gray-400" value={foundNames.city} placeholder="Busca automática..." />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Congregação (Cód)</label>
              <div className="flex gap-2">
                <input required className="w-20 border rounded p-2 text-center font-mono" value={formData.congregation_id} onChange={e => lookup('congregation_id', e.target.value)} placeholder="0001" />
                <input readOnly className="flex-1 bg-gray-50 border rounded p-2 text-xs italic text-gray-400" value={foundNames.congre} placeholder="Busca automática..." />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Data de Nascimento</label>
              <div className="flex gap-3 items-center">
                <input required type="date" className="flex-1 border rounded p-2" value={formData.birth_date} onChange={e => setFormData({...formData, birth_date: e.target.value})} />
                <div className="bg-indigo-50 px-3 py-2 rounded text-indigo-700 font-black text-xs text-center border border-indigo-100 min-w-[60px]">
                  {calculateAge(formData.birth_date)} <br/> ANOS
                </div>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Telefone</label>
              <input required className="w-full border rounded p-2" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="(00) 00000-0000" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">E-mail</label>
              <input required type="email" className="w-full border rounded p-2" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="email@exemplo.com" />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Cargo Específico</label>
            <select required className="w-full border rounded p-3 font-bold bg-indigo-50 border-indigo-100" value={formData.role_code} onChange={e => setFormData({...formData, role_code: e.target.value as any})}>
              <option value="S">S - Regente da Sede</option>
              <option value="I">I - Regente Itinerante</option>
              <option value="R">R - Regente Regional</option>
              <option value="T">T - Regente Titular</option>
              <option value="TG">TG - Regente Titular de Gênero</option>
            </select>
          </div>

          <div className="md:col-span-2 flex gap-4 mt-4 pt-6 border-t">
            <button type="submit" disabled={isSaving} className={`flex-1 bg-indigo-700 text-white py-4 rounded-xl font-black uppercase shadow-lg shadow-indigo-100 transition-all active:scale-95 ${isSaving ? 'opacity-50' : 'hover:bg-indigo-800'}`}>
              {isSaving ? 'Processando...' : 'Salvar Registro e Ativar Acesso'}
            </button>
            <button type="button" onClick={goBack} className="px-8 text-gray-400 font-bold uppercase text-xs">Cancelar</button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

const CRRCardView = ({ conductor, goBack }: { conductor: Conductor, goBack: () => void }) => {
  const [cityName, setCityName] = useState<string>('');

  useEffect(() => {
    fetchData('cities', 'gca_cities').then(list => {
      const found = list.find((c: any) => c.id === conductor.city_id);
      setCityName(found ? found.name : 'Não Informada');
    });
  }, [conductor.city_id]);

  const registrationDate = conductor.created_at ? new Date(conductor.created_at).toLocaleDateString('pt-BR') : '-';

  return (
    <div className="min-h-screen bg-gray-200 p-8 flex flex-col items-center">
      <div className="mb-8 flex gap-4 no-print">
        <button onClick={goBack} className="bg-gray-700 text-white px-6 py-2 rounded-full font-bold">Voltar</button>
        <button onClick={() => downloadPDF('crr-card-body', `CRR-${conductor.registry_number}.pdf`, 'landscape')} className="bg-indigo-600 text-white px-8 py-2 rounded-full font-bold shadow-lg">Baixar Cartão (PDF)</button>
      </div>

      {/* Carteira Profissional - Formato de Crachá Horizontal Ideal (95mm x 65mm) */}
      <div id="crr-card-body" className="w-[95mm] h-[65mm] bg-white shadow-2xl relative overflow-hidden flex flex-col border border-gray-300 rounded-[2mm] font-sans">
        
        {/* Cabeçalho Oficial Centralizado (Sem logos e sem "Sede Mundial") */}
        <div className="bg-white py-3 border-b border-indigo-100 flex flex-col items-center justify-center">
          <h4 className="text-[12px] font-black uppercase text-indigo-950 leading-none mb-0.5">Igreja Apostólica</h4>
          <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest text-center">Brasil - São Paulo/SP</p>
        </div>

        {/* Faixa de Título */}
        <div className="bg-indigo-900 text-white py-1.5 text-center">
          <h2 className="text-[11px] font-black uppercase tracking-[2px]">Registro de Regente</h2>
        </div>

        {/* Conteúdo Principal */}
        <div className="flex-1 p-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div>
              <span className="text-[7px] font-black text-indigo-700 uppercase block opacity-70">Identificação do Regente</span>
              <p className="text-[14px] font-black uppercase text-gray-900 leading-tight border-b border-gray-100 pb-0.5">{conductor.name}</p>
            </div>

            <div className="flex justify-between items-start gap-4">
              <div className="flex-1">
                <span className="text-[7px] font-black text-indigo-700 uppercase block opacity-70">Congregação</span>
                <p className="text-[11px] font-bold uppercase text-gray-700 leading-tight">{cityName}</p>
              </div>
              <div className="text-right">
                <span className="text-[7px] font-black text-indigo-700 uppercase block opacity-70">Número de Registro</span>
                <p className="text-[15px] font-black text-indigo-900 tracking-wider bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                  {conductor.registry_number}
                </p>
              </div>
            </div>
          </div>

          {/* Rodapé: Data e Assinatura */}
          <div className="flex items-end justify-between mt-2 pt-2 border-t border-gray-50">
            <div className="text-left">
              <span className="text-[7px] font-black text-gray-400 uppercase block mb-0.5">Cadastrado em</span>
              <p className="text-[10px] font-black text-gray-700">{registrationDate}</p>
            </div>
            
            <div className="flex-1 max-w-[55%] flex flex-col items-center">
              <div className="w-full border-t border-gray-400 mb-1"></div>
              <p className="text-[6px] font-black text-indigo-900 uppercase tracking-tighter text-center">
                Presidente do Conselho Deliberativo
              </p>
            </div>
          </div>
        </div>

        {/* Elementos Estéticos de Segurança */}
        <div className="absolute top-0 right-0 w-1.5 h-full bg-indigo-900 opacity-[0.03]"></div>
        <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-900 opacity-[0.03]"></div>
        <div className="absolute bottom-0 left-0 w-full h-1 bg-indigo-900"></div>
      </div>
      
      <p className="mt-8 text-xs text-gray-500 max-w-sm text-center font-medium">
        Tamanho final sugerido: 9,5cm x 6,5cm.<br/>
        Ideal para crachás de identificação oficial e plastificação.
      </p>
    </div>
  );
};

// --- Fim Módulo CRR ---

const InstrumentsScreen = ({ goBack, ownerEmail, isReadOnly, onExitImpersonation }: any) => {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Omit<Instrument, 'id'>>({ name: '', modality: 'Metal', timbre: 'Sol', tuning: '' });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [instrumentToDelete, setInstrumentToDelete] = useState<Instrument | null>(null);

  useEffect(() => { fetchData('instruments', 'gca_instruments', ownerEmail).then(setInstruments); }, [ownerEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setSaveError(null);
    const isDuplicate = instruments.some(i => i.id !== editingId && i.name.trim().toLowerCase() === formData.name.trim().toLowerCase() && i.modality === formData.modality && i.timbre === formData.timbre && i.tuning.trim().toLowerCase() === formData.tuning.trim().toLowerCase());
    if (isDuplicate) { setSaveError("Instrumento Já Cadastrado"); return; }
    const newItem = { ...formData, id: editingId || generateId() };
    const updated = editingId ? instruments.map(i => i.id === editingId ? newItem : i) : [...instruments, newItem];
    setInstruments(updated);
    await saveData('instruments', 'gca_instruments', updated, ownerEmail);
    setShowForm(false); setEditingId(null);
    setFormData({ name: '', modality: 'Metal', timbre: 'Sol', tuning: '' });
  };

  const handleEdit = (i: Instrument) => { if (isReadOnly) return; setEditingId(i.id); setFormData({ name: i.name, modality: i.modality, timbre: i.timbre, tuning: i.tuning }); setSaveError(null); setShowForm(true); };
  const confirmDelete = async () => { if (isReadOnly || !instrumentToDelete) return; const id = instrumentToDelete.id; const updated = instruments.filter(i => i.id !== id); setInstruments(updated); await deleteRow('instruments', 'gca_instruments', id, updated, ownerEmail); setInstrumentToDelete(null); };

  return (
    <Layout title="Instrumentos" onBack={goBack} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation}>
      <div className="flex justify-between items-center mb-6"><h2 className="text-lg font-semibold">Instrumentos Cadastrados</h2>{!isReadOnly && <button onClick={() => { setEditingId(null); setFormData({ name: '', modality: 'Metal', timbre: 'Sol', tuning: '' }); setSaveError(null); setShowForm(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded">Novo</button>}</div>
      {instrumentToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100] animate-fade-in">
          <div className="bg-white rounded-xl p-8 w-full max-md shadow-2xl">
            <h3 className="text-xl font-bold mb-6 text-gray-900 leading-tight">Deseja Excluir o Instrumento {instrumentToDelete.name} Permanentemente?</h3>
            <div className="flex gap-4">
              <button onClick={confirmDelete} className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-md">Sim</button>
              <button onClick={() => setInstrumentToDelete(null)} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-lg font-bold hover:bg-gray-200 transition-colors">Não</button>
            </div>
          </div>
        </div>
      )}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">{editingId ? 'Editar Instrumento' : 'Novo Instrumento'}</h3>
            {saveError && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded relative mb-4 text-center text-sm font-bold animate-pulse">{saveError}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <input required placeholder="Nome" className={`w-full border rounded p-2 ${saveError ? 'border-red-500 bg-red-50' : ''}`} value={formData.name} onChange={e => { setFormData({...formData, name: e.target.value}); setSaveError(null); }} />
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase mb-1">Modalidade</p>
                <select className="w-full border rounded p-2" value={formData.modality} onChange={e => setFormData({...formData, modality: e.target.value as any})}>
                  <option value="Metal">Metal</option><option value="Palheta">Palheta</option><option value="Cordas">Cordas</option><option value="Outro">Outro</option>
                </select>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase mb-1">Clave</p>
                <select className="w-full border rounded p-2" value={formData.timbre} onChange={e => setFormData({...formData, timbre: e.target.value as any})}>
                  <option value="Sol">Sol</option>
                  <option value="Fá">Fá</option>
                  <option value="Dó">Dó</option>
                </select>
              </div>
              <input required placeholder="Afinação (Sib, Do...)" className={`w-full border rounded p-2 ${saveError ? 'border-red-500 bg-red-50' : ''}`} value={formData.tuning} onChange={e => { setFormData({...formData, tuning: e.target.value}); setSaveError(null); }} />
              <div className="flex justify-end gap-2 pt-4"><button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-500">Cancelar</button><button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded font-bold">{editingId ? 'Atualizar' : 'Salvar'}</button></div>
            </form>
          </div>
        </div>
      )}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {instruments.map(i => (
          <div key={i.id} className="p-4 border-b last:border-0 flex justify-between items-center hover:bg-gray-50 group">
            <div><p className="font-bold text-gray-800">{i.name}</p><p className="text-xs text-gray-500 uppercase font-bold">{i.modality} • {i.timbre} • {i.tuning}</p></div>
            {!isReadOnly && (
              <div className="flex gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(i)} className="text-indigo-600 font-bold hover:underline">Editar</button>
                <button onClick={() => setInstrumentToDelete(i)} className="text-red-500 font-bold hover:underline">Excluir</button>
              </div>
            )}
          </div>
        ))}
        {instruments.length === 0 && <p className="text-center text-gray-400 py-12 italic">Nenhum instrumento cadastrado.</p>}
      </div>
    </Layout>
  );
};

const MusiciansScreen = ({ goBack, ownerEmail, isReadOnly, onExitImpersonation }: any) => {
  const [musicians, setMusicians] = useState<Musician[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Omit<Musician, 'id'>>({ name: '', voices: [], instruments: [] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [musicianToDelete, setMusicianToDelete] = useState<Musician | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetchData('musicians', 'gca_musicians', ownerEmail).then(setMusicians);
    fetchData('instruments', 'gca_instruments', ownerEmail).then(setInstruments);
  }, [ownerEmail]);

  const toggleVoice = (voice: string) => { setSaveError(null); setFormData(prev => ({ ...prev, voices: prev.voices.includes(voice) ? prev.voices.filter(v => v !== voice) : [...prev.voices, voice] })); };
  const addInstrument = (id: string) => { if (!id || formData.instruments.includes(id)) return; setSaveError(null); setFormData(prev => ({ ...prev, instruments: [...prev.instruments, id] })); };
  const removeInstrument = (id: string) => { setSaveError(null); setFormData(prev => ({ ...prev, instruments: formData.instruments.filter(x => x !== id) })); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (formData.voices.length === 0 && formData.instruments.length === 0) { setSaveError("Favor Selecionar ao Menos Uma Voz ou Um Instrumento"); return; }
    const newItem = { ...formData, id: editingId || generateId() };
    const updated = editingId ? musicians.map(m => m.id === editingId ? newItem : m) : [...musicians, newItem];
    setMusicians(updated);
    await saveData('musicians', 'gca_musicians', updated, ownerEmail);
    setShowForm(false); setEditingId(null);
    setFormData({ name: '', voices: [], instruments: [] });
  };

  const handleEdit = (m: Musician) => { if (isReadOnly) return; setEditingId(m.id); setFormData({ name: m.name, voices: m.voices, instruments: m.instruments }); setSaveError(null); setShowForm(true); };
  const confirmDelete = async () => { if (isReadOnly || !musicianToDelete) return; const id = musicianToDelete.id; const updated = musicians.filter(m => m.id !== id); setMusicians(updated); await deleteRow('musicians', 'gca_musicians', id, updated, ownerEmail); setMusicianToDelete(null); };

  return (
    <Layout title="Músicos" onBack={goBack} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation}>
      <div className="flex justify-between items-center mb-6"><h2 className="text-lg font-semibold">Integrantes</h2>{!isReadOnly && <button onClick={() => { setEditingId(null); setFormData({ name: '', voices: [], instruments: [] }); setSaveError(null); setShowForm(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded">Novo</button>}</div>
      {musicianToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100] animate-fade-in">
          <div className="bg-white rounded-xl p-8 w-full max-md shadow-2xl">
            <h3 className="text-xl font-bold mb-6 text-gray-900 leading-tight">Deseja Excluir o Musico {musicianToDelete.name} Permanentemente?</h3>
            <div className="flex gap-4">
              <button onClick={confirmDelete} className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-md">Sim</button>
              <button onClick={() => setMusicianToDelete(null)} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-lg font-bold hover:bg-gray-200 transition-colors">Não</button>
            </div>
          </div>
        </div>
      )}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg my-8">
            <h3 className="text-xl font-bold mb-4">{editingId ? 'Editar Integrante' : 'Novo Integrante'}</h3>
            {saveError && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded relative mb-4 text-center text-sm font-bold animate-pulse">{saveError}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <input required placeholder="Nome Completo" className="w-full border rounded p-2" value={formData.name} onChange={e => { setFormData({...formData, name: e.target.value}); setSaveError(null); }} />
              <div>
                <p className="text-sm font-bold mb-2">Vozes</p>
                <div className="flex wrap gap-2">
                  {['Melodia', 'Contralto', 'Tenor', 'Baixo'].map(v => (
                    <button key={v} type="button" onClick={() => toggleVoice(v)} className={`px-3 py-1 rounded border transition-colors ${formData.voices.includes(v) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-100 border-gray-200'}`}>{v}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-bold mb-2">Instrumentos</p>
                <select className="w-full border rounded p-2 mb-2" onChange={e => addInstrument(e.target.value)}>
                  <option value="">Adicionar instrumento...</option>
                  {instruments.map(i => <option key={i.id} value={i.id}>{i.name} ({i.tuning})</option>)}
                </select>
                <div className="flex wrap gap-2">
                  {formData.instruments.map(id => (
                    <span key={id} className="bg-indigo-50 px-2 py-1 rounded text-xs border border-indigo-200 flex items-center gap-1">
                      {instruments.find(i => i.id === id)?.name}
                      <button type="button" onClick={() => removeInstrument(id)} className="text-indigo-400 font-bold ml-1">×</button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4"><button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-500">Cancelar</button><button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded font-bold">{editingId ? 'Atualizar' : 'Salvar'}</button></div>
            </form>
          </div>
        </div>
      )}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {musicians.sort((a,b) => a.name.localeCompare(b.name)).map(m => (
          <div key={m.id} className="p-4 border-b last:border-0 flex justify-between items-center hover:bg-gray-50 group">
            <div><p className="font-bold text-gray-800">{m.name}</p><p className="text-sm text-gray-500">{m.voices.join(', ')} • {m.instruments.map(id => instruments.find(i => i.id === id)?.name).join(', ')}</p></div>
            {!isReadOnly && (
              <div className="flex gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(m)} className="text-indigo-600 font-bold hover:underline">Editar</button>
                <button onClick={() => setMusicianToDelete(m)} className="text-red-500 font-bold hover:underline">Excluir</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Layout>
  );
};

const AttendanceMenuScreen = ({ navigate, goBack, isReadOnly, onExitImpersonation }: any) => (
  <Layout title="Presença" onBack={goBack} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation}>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
      <MenuCard title="Lista de Chamada" desc="Registrar as presenças nos ensaios" icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/></svg>} onClick={() => navigate('roll_call')} />
      <MenuCard title="Registro de Presença" desc="Onde ficam as chamadas salvas" icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} onClick={() => navigate('attendance_history')} />
      <MenuCard title="Relatório de Presença" desc="Gerar relatório em PDF por período" icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/></svg>} onClick={() => navigate('attendance_report_input')} />
      <MenuCard title="Percentual de Participação" desc="Frequência consolidada por músico" icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>} onClick={() => navigate('attendance_percentage_input')} />
    </div>
  </Layout>
);

const AttendanceReportInputScreen = ({ onGenerate, onCancel, isReadOnly, onExitImpersonation }: any) => {
  const [start, setStart] = useState(new Date().toISOString().substr(0, 10));
  const [end, setEnd] = useState(new Date().toISOString().substr(0, 10));
  const [type, setType] = useState<'Somente Presentes' | 'Somente Ausentes' | 'Somente Justificadas' | 'Todos'>('Todos');
  return (
    <Layout title="Relatório de Presença" onBack={onCancel} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation}>
      <div className="bg-white p-8 rounded shadow max-md mx-auto mt-12 space-y-6">
        <h3 className="text-xl font-bold border-b pb-4">Filtrar Período</h3>
        <div className="space-y-4">
          <div><label className="block text-sm font-bold mb-1">Data Inicial</label><input type="date" className="w-full border rounded p-2" value={start} onChange={e => setStart(e.target.value)} /></div>
          <div><label className="block text-sm font-bold mb-1">Data Final</label><input type="date" className="w-full border rounded p-2" value={end} onChange={e => setEnd(e.target.value)} /></div>
          <div><label className="block text-sm font-bold mb-1">Tipo</label><select className="w-full border rounded p-2" value={type} onChange={e => setType(e.target.value as any)}>
            <option value="Todos">Todos</option>
            <option value="Somente Presentes">Somente Presentes</option>
            <option value="Somente Ausentes">Somente Ausentes</option>
            <option value="Somente Justificadas">Somente Justificadas</option>
          </select></div>
          <div className="flex justify-end gap-2 pt-4"><button onClick={onCancel} className="px-4 py-2 font-bold text-gray-500">Voltar</button><button onClick={() => onGenerate(start, end, type)} className="bg-indigo-600 text-white px-6 py-2 rounded font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">Visualizar Relatório</button></div>
        </div>
      </div>
    </Layout>
  );
};

const RollCallScreen = ({ goBack, editData, ownerEmail, isReadOnly, onExitImpersonation }: any) => {
  const [musicians, setMusicians] = useState<Musician[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(editData?.presentMusicianIds || []));
  const [justifications, setJustifications] = useState<Record<string, string>>(editData?.justifications || {});
  
  const [showDateModal, setShowDateModal] = useState(false);
  const [date, setDate] = useState(editData?.date || new Date().toISOString().substr(0, 10));
  const [saveError, setSaveError] = useState<string | null>(null);

  // Estados para Justificativa
  const [activeJustifyId, setActiveJustifyId] = useState<string | null>(null);
  const [justifyInputText, setJustifyInputText] = useState('');
  const [justifyError, setJustifyError] = useState<string | null>(null);
  
  const [viewJustifyId, setViewJustifyId] = useState<string | null>(null);
  const [isEditingJustify, setIsEditingJustify] = useState(false);
  const [showConfirmEdit, setShowConfirmEdit] = useState(false);

  useEffect(() => { fetchData('musicians', 'gca_musicians', ownerEmail).then(setMusicians); }, [ownerEmail]);

  const togglePresent = (id: string) => { 
    if (isReadOnly) return; 
    const next = new Set(selected); 
    if (!next.has(id)) {
      next.add(id); 
      const nextJ = { ...justifications };
      delete nextJ[id];
      setJustifications(nextJ);
    }
    setSelected(next); 
  };

  const toggleAbsent = (id: string) => {
    if (isReadOnly) return;
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    }
    const nextJ = { ...justifications };
    delete nextJ[id];
    setJustifications(nextJ);
    setSelected(next);
  };

  const openJustify = (id: string) => {
    if (isReadOnly) return;
    if (justifications[id]) {
        setViewJustifyId(id);
    } else {
        setActiveJustifyId(id);
        setJustifyInputText('');
        setJustifyError(null);
    }
  };

  const saveJustify = () => {
    if (justifyInputText.length < 10) {
      setJustifyError("Favor inserir no mínimo 10 caracteres");
      return;
    }
    const nextJ = { ...justifications, [activeJustifyId!]: justifyInputText };
    setJustifications(nextJ);
    const nextS = new Set(selected);
    nextS.delete(activeJustifyId!);
    setSelected(nextS);
    
    setActiveJustifyId(null);
  };

  const startEditJustify = () => {
    setIsEditingJustify(true);
    setJustifyInputText(justifications[viewJustifyId!] || '');
    setJustifyError(null);
  };

  const handleUpdateJustify = () => {
    if (justifyInputText.length < 10) {
        setJustifyError("Favor inserir no mínimo 10 caracteres");
        return;
    }
    setShowConfirmEdit(true);
  };

  const confirmUpdateJustify = () => {
    const nextJ = { ...justifications, [viewJustifyId!]: justifyInputText };
    setJustifications(nextJ);
    setIsEditingJustify(false);
    setShowConfirmEdit(false);
  };

  const handleSaveClick = () => { if (isReadOnly) return; if (selected.size === 0 && Object.keys(justifications).length === 0) { alert("Registre ao menos uma presença ou justificativa."); return; } setSaveError(null); setShowDateModal(true); };

  const confirmSave = async () => {
    if (isReadOnly) return;
    const all = await fetchData('attendance', 'gca_attendance', ownerEmail);
    const exists = all.some((r: AttendanceRecord) => r.date === date && r.id !== editData?.id);
    if (exists) { setSaveError("Já Existe Uma Chama Nesta Data"); return; }
    const record: AttendanceRecord = { 
        id: editData?.id || generateId(), 
        date, 
        presentMusicianIds: Array.from(selected), 
        justifications,
        owner_email: ownerEmail 
    };
    const updatedList = editData ? all.map((r: any) => r.id === editData.id ? record : r) : [...all, record];
    await saveData('attendance', 'gca_attendance', updatedList, ownerEmail);
    alert(editData ? 'Chamada atualizada!' : 'Chamada salva!');
    goBack();
  };

  return (
    <Layout title={editData ? "Editar Chamada" : "Lista de Chamada"} onBack={goBack} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation}>
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-bold mb-4 border-b pb-2">Informe as Presenças</h3>
        <div className="grid grid-cols-1 gap-4">
          {musicians.sort((a,b) => a.name.localeCompare(b.name)).map(m => {
            const isPresent = selected.has(m.id);
            const hasJustify = !!justifications[m.id];
            
            return (
              <div key={m.id} className="p-4 border rounded bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm relative overflow-hidden">
                <div className="flex-1">
                    <p className="font-bold text-gray-800">{m.name}</p>
                    <p className="text-xs text-indigo-600 font-medium uppercase tracking-wider">{m.voices.join(' / ')}</p>
                    {hasJustify && (
                        <button 
                            onClick={() => setViewJustifyId(m.id)}
                            className="mt-2 flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tight hover:bg-blue-100 transition-colors border border-blue-100"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                            Ver Justificativa
                        </button>
                    )}
                </div>
                {!isReadOnly && (
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button type="button" onClick={() => togglePresent(m.id)} className={`flex-1 sm:w-24 py-2 rounded-lg font-bold text-[11px] uppercase border transition-all ${isPresent ? 'bg-green-600 border-green-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}>Presente</button>
                    <button type="button" onClick={() => toggleAbsent(m.id)} className={`flex-1 sm:w-24 py-2 rounded-lg font-bold text-[11px] uppercase border transition-all ${(!isPresent && !hasJustify) ? 'bg-red-600 border-red-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}>Ausente</button>
                    <button type="button" onClick={() => openJustify(m.id)} className={`flex-1 sm:w-24 py-2 rounded-lg font-bold text-[11px] uppercase border transition-all ${hasJustify ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}>Justificada</button>
                  </div>
                )}
                {isReadOnly && (
                    <span className={`font-black uppercase text-xs ${isPresent ? 'text-green-600' : hasJustify ? 'text-blue-600' : 'text-red-400'}`}>
                        {isPresent ? 'Presente' : hasJustify ? 'Justificada' : 'Ausente'}
                    </span>
                )}
              </div>
            );
          })}
        </div>
        {!isReadOnly && <button onClick={handleSaveClick} className="w-full bg-indigo-600 text-white py-3 rounded mt-8 font-bold text-lg shadow-lg active:scale-95 transition-transform">Salvar Chamada</button>}
      </div>

      {/* Modal Justificativa (Input) */}
      {activeJustifyId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[110] backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 w-full max-md shadow-2xl animate-fade-in">
                <h3 className="text-xl font-black text-indigo-900 uppercase mb-4">Informar Justificativa</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Mínimo 10 caracteres</p>
                {justifyError && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold mb-4 border-l-4 border-red-500">{justifyError}</div>}
                <textarea 
                    autoFocus
                    className={`w-full border-2 rounded-xl p-3 h-32 focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${justifyError ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}
                    placeholder="Escreva aqui o motivo da ausência..."
                    value={justifyInputText}
                    onChange={e => { setJustifyInputText(e.target.value); setJustifyError(null); }}
                />
                <div className="flex gap-4 mt-6">
                    <button onClick={saveJustify} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-black uppercase shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">Salvar</button>
                    <button onClick={() => setActiveJustifyId(null)} className="flex-1 bg-gray-100 text-gray-500 py-3 rounded-xl font-black uppercase hover:bg-gray-200 transition-all">Cancelar</button>
                </div>
            </div>
        </div>
      )}

      {/* Modal Justificativa (View/Edit) */}
      {viewJustifyId && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[120] backdrop-blur-sm">
              <div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl animate-scale-up">
                  <h3 className="text-2xl font-black text-indigo-900 uppercase mb-6 border-b pb-4">Detalhamento</h3>
                  
                  {isEditingJustify ? (
                      <div className="space-y-4">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Editando justificativa</p>
                          {justifyError && <div className="bg-red-50 text-red-600 p-2 rounded-lg text-xs font-bold mb-4 border-l-4 border-red-500">{justifyError}</div>}
                          <textarea 
                              className="w-full border-2 border-indigo-100 rounded-2xl p-4 h-40 focus:ring-2 focus:ring-indigo-500 outline-none"
                              value={justifyInputText}
                              onChange={e => { setJustifyInputText(e.target.value); setJustifyError(null); }}
                          />
                          <div className="flex gap-4">
                            <button onClick={handleUpdateJustify} className="flex-1 bg-green-600 text-white py-3 rounded-xl font-black uppercase">Gravar Edição</button>
                            <button onClick={() => setIsEditingJustify(false)} className="flex-1 bg-gray-100 text-gray-500 py-3 rounded-xl font-black uppercase">Descartar</button>
                          </div>
                      </div>
                  ) : (
                      <>
                        <div className="bg-indigo-50/50 p-6 rounded-2xl mb-8 border border-indigo-50 min-h-[120px]">
                            <p className="text-gray-800 leading-relaxed font-medium italic">"{justifications[viewJustifyId]}"</p>
                        </div>
                        <div className="flex gap-4">
                            {!isReadOnly && <button onClick={startEditJustify} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black uppercase shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95">Editar</button>}
                            <button onClick={() => { setViewJustifyId(null); setIsEditingJustify(false); }} className="flex-1 bg-gray-100 text-gray-500 py-4 rounded-2xl font-black uppercase hover:bg-gray-200 transition-all">Fechar</button>
                        </div>
                      </>
                  )}
              </div>
          </div>
      )}

      {/* Confirmação de Edição */}
      {showConfirmEdit && (
          <div className="fixed inset-0 bg-indigo-900/40 flex items-center justify-center p-4 z-[130] backdrop-blur-md">
              <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
                  <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m10.7 18.8 6-6a2 2 0 0 0 0-2.8l-6-6M4.3 12h13.4"/></svg>
                  </div>
                  <h4 className="text-lg font-black text-gray-900 uppercase mb-4 leading-tight">Tem certeza que deseja editar justificativa?</h4>
                  <div className="flex gap-3">
                      <button onClick={confirmUpdateJustify} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-black uppercase">Sim, alterar</button>
                      <button onClick={() => setShowConfirmEdit(false)} className="flex-1 bg-gray-100 text-gray-500 py-3 rounded-xl font-black uppercase">Não</button>
                  </div>
              </div>
          </div>
      )}

      {showDateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-sm animate-fade-in shadow-2xl">
            <h3 className="text-xl font-bold mb-4">Informar Data</h3>
            {saveError && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded relative mb-4 text-center text-sm font-bold animate-pulse">{saveError}</div>}
            <input type="date" className={`w-full border rounded p-2 mb-6 text-lg focus:ring-2 focus:ring-indigo-500 outline-none ${saveError ? 'border-red-500 bg-red-50' : ''}`} value={date} onChange={e => { setDate(e.target.value); setSaveError(null); }} />
            <div className="flex justify-end gap-3"><button onClick={() => setShowDateModal(false)} className="px-4 py-2 font-semibold text-gray-500">Cancelar</button><button onClick={confirmSave} className="px-6 py-2 bg-indigo-600 text-white rounded font-bold shadow-md hover:bg-indigo-700">Confirmar</button></div>
          </div>
        </div>
      )}
    </Layout>
  );
};

const AttendanceHistoryScreen = ({ goBack, onEdit, ownerEmail, isReadOnly, onExitImpersonation }: any) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [musicians, setMusicians] = useState<Musician[]>([]);
  const [recordToDelete, setRecordToDelete] = useState<AttendanceRecord | null>(null);

  useEffect(() => { fetchData('attendance', 'gca_attendance', ownerEmail).then(setRecords); fetchData('musicians', 'gca_musicians', ownerEmail).then(setMusicians); }, [ownerEmail]);

  const confirmDelete = async () => { if (isReadOnly || !recordToDelete) return; const id = recordToDelete.id; const updated = records.filter(r => r.id !== id); setRecords(updated); await deleteRow('attendance', 'gca_attendance', id, updated, ownerEmail); setRecordToDelete(null); };

  return (
    <Layout title="Registro de Presença" onBack={goBack} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation}>
      <div className="space-y-6">
        {recordToDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100] animate-fade-in">
            <div className="bg-white rounded-xl p-8 w-full max-md shadow-2xl">
              <h3 className="text-xl font-bold mb-6 text-gray-900 leading-tight">Deseja Excluir a Chamada do Dia {new Date(recordToDelete.date + 'T00:00:00').toLocaleDateString('pt-BR')} Permanentemente?</h3>
              <div className="flex gap-4">
                <button onClick={confirmDelete} className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-md">Sim</button>
                <button onClick={() => setRecordToDelete(null)} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-lg font-bold hover:bg-gray-200 transition-colors">Não</button>
              </div>
            </div>
          </div>
        )}
        {records.sort((a,b) => b.date.localeCompare(a.date)).map(r => {
          const presentIds = new Set(r.presentMusicianIds);
          const justifiedIds = new Set(Object.keys(r.justifications || {}));
          
          const presentList = musicians.filter(m => presentIds.has(m.id)).sort((a, b) => a.name.localeCompare(b.name));
          const justifiedList = musicians.filter(m => justifiedIds.has(m.id) && !presentIds.has(m.id)).sort((a, b) => a.name.localeCompare(b.name));
          const absentList = musicians.filter(m => !presentIds.has(m.id) && !justifiedIds.has(m.id)).sort((a, b) => a.name.localeCompare(b.name));
          
          return (
            <div key={r.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h3 className="font-black text-xl text-indigo-900">{new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                      <span className="text-[10px] font-black text-green-600 block uppercase">{r.presentMusicianIds.length} Presentes</span>
                      <span className="text-[10px] font-black text-blue-500 block uppercase">{justifiedList.length} Justificadas</span>
                      <span className="text-[10px] font-black text-red-400 block uppercase">{absentList.length} Ausentes</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => onEdit(r)} className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors">{isReadOnly ? <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg> : <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>}</button>
                    {!isReadOnly && <button onClick={() => setRecordToDelete(r)} className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div><h4 className="text-[10px] font-black text-green-700 uppercase tracking-widest mb-3 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500"></div>Presentes ({presentList.length})</h4><div className="space-y-1">{presentList.map(m => (<div key={m.id} className="text-[11px] py-1 border-b border-green-50 flex justify-between items-center group"><span className="font-medium text-gray-700">{m.name}</span></div>))}</div></div>
                <div><h4 className="text-[10px] font-black text-blue-700 uppercase tracking-widest mb-3 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-400"></div>Justificadas ({justifiedList.length})</h4><div className="space-y-1">{justifiedList.map(m => (<div key={m.id} className="text-[11px] py-1 border-b border-blue-50 flex justify-between items-center group"><span className="font-medium text-gray-700">{m.name}</span></div>))}</div></div>
                <div><h4 className="text-[10px] font-black text-red-700 uppercase tracking-widest mb-3 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-400"></div>Ausentes ({absentList.length})</h4><div className="space-y-1">{absentList.map(m => (<div key={m.id} className="text-[11px] py-1 border-b border-red-50 flex justify-between items-center group"><span className="font-medium text-gray-400 italic line-through">{m.name}</span></div>))}</div></div>
              </div>
            </div>
          );
        })}
      </div>
    </Layout>
  );
};

const AttendancePercentageInputScreen = ({ onGenerate, onCancel, isReadOnly, onExitImpersonation }: any) => {
  const [start, setStart] = useState(new Date().toISOString().substr(0, 10));
  const [end, setEnd] = useState(new Date().toISOString().substr(0, 10));
  return (
    <Layout title="Percentual de Participação" onBack={onCancel} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation}>
      <div className="bg-white p-8 rounded shadow max-md mx-auto mt-12 space-y-6">
        <h3 className="text-xl font-bold border-b pb-4">Gerar Relatório de Participação</h3>
        <div className="space-y-4">
          <div><label className="block text-sm font-bold mb-1">Data Inicial</label><input type="date" className="w-full border rounded p-2" value={start} onChange={e => setStart(e.target.value)} /></div>
          <div><label className="block text-sm font-bold mb-1">Data Final</label><input type="date" className="w-full border rounded p-2" value={end} onChange={e => setEnd(e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-4"><button onClick={onCancel} className="px-4 py-2 font-bold text-gray-500">Voltar</button><button onClick={() => onGenerate(start, end)} className="bg-indigo-600 text-white px-6 py-2 rounded font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">Gerar Relatório</button></div>
        </div>
      </div>
    </Layout>
  );
};

const HymnsLibraryScreen = ({ navigate, goBack, isReadOnly, onExitImpersonation }: any) => (
  <Layout title="Biblioteca de Hinos" onBack={goBack} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation}>
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4 mt-4">
      {Object.entries(NOTEBOOKS).map(([code, name]) => (
        <button key={code} onClick={() => navigate('notebook_detail', { code, name })} className="bg-white border p-4 rounded-lg flex flex-col items-center hover:shadow-md transition-shadow h-full">
          <span className="text-2xl font-bold text-indigo-700">{code}</span><span className="text-[10px] text-center uppercase font-bold mt-1 leading-tight">{name}</span>
        </button>
      ))}
    </div>
  </Layout>
);

const NotebookDetailScreen = ({ notebook, goBack, navigate, ownerEmail, isReadOnly, onExitImpersonation }: any) => {
  const [hymns, setHymns] = useState<MasterHymn[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ number: '', title: '' });
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hymnToDelete, setHymnToDelete] = useState<MasterHymn | null>(null);
  const [validationError, setValidationError] = useState(false);

  useEffect(() => { fetchData('hymns_library', 'gca_hymns_library', ownerEmail).then(all => { setHymns(all.filter((h: any) => h.notebook === notebook.code)); }); }, [notebook.code, ownerEmail]);

  const saveHymn = async (e: React.FormEvent) => {
    e.preventDefault(); if (isReadOnly) return;
    const isDuplicate = hymns.some(h => (h.number === formData.number || h.title.toLowerCase() === formData.title.toLowerCase()) && h.id !== editingId);
    if (isDuplicate) { setValidationError(true); return; }
    const hymnToSave: MasterHymn = { id: editingId || generateId(), notebook: notebook.code, owner_email: ownerEmail, ...formData };
    const all = await fetchData('hymns_library', 'gca_hymns_library', ownerEmail);
    const updatedAll = editingId ? all.map((h: any) => h.id === editingId ? hymnToSave : h) : [...all, hymnToSave];
    await saveData('hymns_library', 'gca_hymns_library', updatedAll, ownerEmail);
    if (editingId) setHymns(hymns.map(h => h.id === editingId ? hymnToSave : h)); else setHymns([...hymns, hymnToSave]);
    setShowForm(false); setEditingId(null); setValidationError(false); setFormData({ number: '', title: '' });
  };

  const confirmDelete = async () => { if (isReadOnly || !hymnToDelete) return; const id = hymnToDelete.id; const all = await fetchData('hymns_library', 'gca_hymns_library', ownerEmail); const updated = all.filter((h: any) => h.id !== id); await deleteRow('hymns_library', 'gca_hymns_library', id, updated, ownerEmail); setHymns(hymns.filter(h => h.id !== id)); setHymnToDelete(null); };
  const filtered = hymns.filter(h => h.number.includes(search) || h.title.toLowerCase().includes(search.toLowerCase())).sort((a,b) => parseInt(a.number) - parseInt(b.number));

  return (
    <Layout title={`${notebook.code} - ${notebook.name}`} onBack={goBack} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation}>
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
        <input placeholder="Filtrar hinos..." className="w-full sm:w-64 border rounded p-2" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={() => navigate('hymn_notebook_report', notebook)} className="flex-1 sm:flex-none bg-gray-600 text-white px-6 py-2 rounded font-bold">Relatório</button>
          {!isReadOnly && <button onClick={() => { setEditingId(null); setFormData({ number: '', title: '' }); setValidationError(false); setShowForm(true); }} className="flex-1 sm:flex-none bg-indigo-600 text-white px-6 py-2 rounded font-bold">Cadastrar Novo</button>}
        </div>
      </div>
      {hymnToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100] animate-fade-in">
          <div className="bg-white rounded-xl p-8 w-full max-md shadow-2xl">
            <h3 className="text-xl font-bold mb-6 text-gray-900 leading-tight">Deseja Excluir o Cadastro do Hino {hymnToDelete.number} - {hymnToDelete.title} Permanentemente?</h3>
            <div className="flex gap-4"><button onClick={confirmDelete} className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-bold shadow-md">Sim</button><button onClick={() => setHymnToDelete(null)} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-lg font-bold">Não</button></div>
          </div>
        </div>
      )}
      {showForm && (
        <div className="bg-white p-6 rounded shadow mb-6 animate-fade-in">
          <h3 className="font-bold mb-4">{editingId ? 'Editar Hino' : 'Adicionar Hino'}</h3>
          {validationError && <div className="mb-4 bg-red-50 border-l-4 border-red-500 text-red-700 font-bold text-sm">Número ou Título Já Cadastrado</div>}
          <form onSubmit={saveHymn} className="flex flex-col sm:flex-row gap-4">
            <input required placeholder="Nº" className={`w-full sm:w-24 border rounded p-2 transition-colors ${validationError ? 'border-red-500 bg-red-50' : ''}`} value={formData.number} onChange={e => { setFormData({...formData, number: e.target.value}); setValidationError(false); }} />
            <input required placeholder="Título" className={`flex-1 border rounded p-2 transition-colors ${validationError ? 'border-red-500 bg-red-50' : ''}`} value={formData.title} onChange={e => { setFormData({...formData, title: e.target.value}); setValidationError(false); }} />
            <div className="flex gap-2"><button type="submit" className="flex-1 bg-indigo-600 text-white px-6 py-2 rounded font-bold">{editingId ? 'Atualizar' : 'Salvar'}</button><button type="button" onClick={() => { setShowForm(false); setEditingId(null); setValidationError(false); }} className="px-4 py-2 border rounded">Cancelar</button></div>
          </form>
        </div>
      )}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filtered.map(h => (
          <div key={h.id} className="flex justify-between items-center p-4 border-b last:border-0 hover:bg-gray-50 group">
            <div className="flex items-center gap-4"><span className="font-bold text-indigo-700 text-lg w-12">{h.number}</span><span className="font-medium">{h.title}</span></div>
            {!isReadOnly && (
              <div className="flex gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => { setEditingId(h.id); setFormData({ number: h.number, title: h.title }); setValidationError(false); setShowForm(true); }} className="text-indigo-600 font-bold hover:underline">Editar</button>
                <button onClick={() => setHymnToDelete(h)} className="text-red-400 font-bold hover:underline">Excluir</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Layout>
  );
};

const ProgramsScreen = ({ navigate, goBack, isReadOnly, onExitImpersonation }: any) => (
  <Layout title="Programações" onBack={goBack} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation}>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
      <MenuCard title="Orientações" desc="Regras de elaboração" icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>} onClick={() => navigate('guidelines')} />
      <MenuCard title="Nova Lista" desc="Gerar programa de hinos" icon={<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/></svg>} onClick={() => navigate('hymn_lists')} />
      <MenuCard title="Relatórios de Hinos" desc="Uso de hinos por período" icon={<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 18v-4"/><path d="M12 18v-7"/><path d="M16 18v-2"/></svg>} onClick={() => navigate('hymn_report_input')} />
    </div>
  </Layout>
);

const GuidelinesScreen = ({ goBack, onExitImpersonation }: any) => (
  <Layout title="Diretrizes de Programação" onBack={goBack} onExitImpersonation={onExitImpersonation}>
    <div className="bg-white p-8 rounded-lg shadow prose max-w-none space-y-8">
      <h2 className="text-2xl font-bold text-indigo-900 border-b pb-4">Diretrizes da Igreja Apostólica</h2>
      
      <section>
        <h3 className="font-bold text-lg text-indigo-700">Reuniões Normais (1h30min):</h3>
        <p className="text-gray-600">4 hinos: 2 após hinos do hinário, 1 após contribuições e 1 para finalizar.</p>
      </section>
      
      <section>
        <h3 className="font-bold text-lg text-indigo-700">Reuniões Normais (2h):</h3>
        <p className="text-gray-600">5 hinos: 2 após hinos do hinário, 2 após contribuições e 1 para finalizar.</p>
      </section>

      <section>
        <h3 className="font-bold text-lg text-indigo-700">Reuniões de Oração:</h3>
        <p className="text-gray-600">O pastor deverá iniciar a reunião e antes da oração será cantado o numero 1 do hinário. Após a oração inicial deverá be cantado o hino nº 82 ou 180 do hinário. Na sequencia o coral apresentará 1 ou 2 hinos, o pastor farmá o levantamento das contribuições e o coral cantará mais 1 ou 2 hinos. O pastor fará a leitura e explicação da mensagem, após devera ser cantado um dos hinos nº 83 ou 84, 85, 107, 122, 172, 174, 176, 178, do hinário. Em seguida será a oração individual e após será cantando um dos hinos nº 81 ou 86, 116, 117, 118, 119, 120, 121, 173, 175, 177, 179, 186, 230, do hinário. Então a reunião deverá ser encerrada (não pode passar das 21hrs)</p>
      </section>

      <section>
        <h3 className="font-bold text-lg text-indigo-700">Reuniões Especiais (2h):</h3>
        <p className="text-gray-600">Até 6 hinos: 3 após hinos do hinário, 2 após contribuições e 1 para finalizar. (Obs: Reuniões especiais são para dias como primeiro dia do ano, Corpus Christi, etc.)</p>
      </section>

      <section>
        <h3 className="font-bold text-lg text-indigo-700">Reunião festiva (2h):</h3>
        <p className="text-gray-600">Entre 8 e 10 hinos (a depender da extensão dos hinos): 5 á 7 após hinos do hinário, 2 após contribuições e 1 para finalizar.</p>
      </section>

      <section>
        <h3 className="font-bold text-lg text-indigo-700">Santa Comunhão (2h á 2h30min):</h3>
        <p className="text-gray-600">Entre 10 e 12 hinos (a depender da extensão dos hinos): 8 á 10 após hinos do hinário (1 hora de apresentação), 2 após as contribuições (sendo o segundo exclusivo de comunhão), hinos do hinário para destapar a mesa são obrigatoriamente os nº 87, 90 ou 114 e para finalizar cantar o hino nº 57 do hinário.</p>
      </section>
    </div>
  </Layout>
);

const HymnListScreen = ({ goBack, onCreate, onEdit, ownerEmail, isReadOnly, onExitImpersonation }: any) => {
  const [lists, setLists] = useState<HymnList[]>([]);
  const [viewing, setViewing] = useState<HymnList | null>(null);
  const [listToDelete, setListToDelete] = useState<HymnList | null>(null);

  useEffect(() => { fetchData('hymn_lists', 'gca_hymn_lists', ownerEmail).then(setLists); }, [ownerEmail]);

  const confirmDelete = async () => { if (isReadOnly || !listToDelete) return; const id = listToDelete.id; const updated = lists.filter(l => l.id !== id); setLists(updated); await deleteRow('hymn_lists', 'gca_hymn_lists', id, updated, ownerEmail); setListToDelete(null); };

  if (viewing) return <PrintView list={viewing} onBack={() => setViewing(null)} onExitImpersonation={onExitImpersonation} />;

  return (
    <Layout title="Listas de Hinos" onBack={goBack} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation}>
      {listToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100] animate-fade-in">
          <div className="bg-white rounded-xl p-8 w-full max-md shadow-2xl">
            <h3 className="text-xl font-bold mb-6 text-gray-900 leading-tight">Deseja Excluir a Programação do Dia {new Date(listToDelete.date + 'T00:00:00').toLocaleDateString('pt-BR')} Permanentemente?</h3>
            <div className="flex gap-4"><button onClick={confirmDelete} className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-bold shadow-md">Sim</button><button onClick={() => setListToDelete(null)} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-lg font-bold">Não</button></div>
          </div>
        </div>
      )}
      <div className="flex justify-between items-center mb-6"><h2 className="text-lg font-semibold">Histórico</h2>{!isReadOnly && <button onClick={onCreate} className="bg-indigo-600 text-white px-6 py-2 rounded font-bold shadow">Nova Lista</button>}</div>
      <div className="space-y-4">
        {lists.sort((a,b) => b.date.localeCompare(a.date)).map(l => (
          <div key={l.id} className="bg-white p-4 rounded shadow flex justify-between items-center hover:bg-gray-50 transition-colors">
            <div><p className="font-bold text-indigo-900">{new Date(l.date + 'T00:00:00').toLocaleDateString('pt-BR')}</p><p className="text-sm text-gray-500">{l.congregation} • {MEETING_TYPES[l.type]}</p></div>
            <div className="flex gap-4"><button onClick={() => setViewing(l)} className="text-indigo-600 font-bold hover:underline">Ver PDF</button><button onClick={() => onEdit(l)} className="text-blue-600 font-bold hover:underline">{isReadOnly ? 'Ver Detalhes' : 'Editar'}</button>{!isReadOnly && <button onClick={() => setListToDelete(l)} className="text-red-600 font-bold hover:underline">Excluir</button>}</div>
          </div>
        ))}
      </div>
    </Layout>
  );
};

const CreateHymnListScreen = ({ onSave, onCancel, initialData, ownerEmail, isReadOnly, onExitImpersonation }: any) => {
  const [data, setData] = useState<Partial<HymnList>>(initialData || { date: new Date().toISOString().substr(0, 10), congregation: '', type: 'Normal130', startTime: '19:00', isDetailed: false, owner_email: ownerEmail, sections: { hymnal: [], choir: [], contributions: [], message: [] }, sectionDurations: { contributions: '', message: '' } });
  const [showErrorMsg, setShowErrorMsg] = useState(false);
  const isFirstRun = useRef(!initialData);

  useEffect(() => {
    if (!isFirstRun.current) return;
    isFirstRun.current = false;
    let counts = { h: 5, c: 2, co: 1, m: 1 };
    if (data.type === 'Normal200') counts = { h: 5, c: 2, co: 2, m: 1 }; else if (data.type === 'Especial200') counts = { h: 1, c: 3, co: 2, m: 1 }; else if (data.type === 'Festiva200') counts = { h: 1, c: 7, co: 2, m: 1 }; else if (data.type === 'Comunhao200') counts = { h: 1, c: 10, co: 2, m: 1 }; else if (data.type === 'NatalAnoNovo') counts = { h: 1, c: 1, co: 1, m: 1 }; 
    const empty = (n: number, defNb: string = 'Caderno') => Array(n).fill(null).map(() => ({ notebook: defNb, number: '', title: '', execution: '', duration: '', conductor: '', soloist: '', keyboardist: '', guitarist: '' }));
    const buildSections = async () => {
      const all = await fetchData('hymns_library', 'gca_hymns_library', ownerEmail);
      const findTitle = (num: string, nb: string) => all.find((h: any) => h.notebook === nb && h.number === num)?.title || '';
      let sections: any = { hymnal: empty(counts.h, 'H'), choir: empty(counts.c), contributions: empty(counts.co), message: empty(counts.m) };
      if (data.type === 'Oracao') {
        sections = { hymnal: [{ notebook: 'H', number: '1', title: findTitle('1', 'H') || 'Igreja Forte', execution: '', duration: '', conductor: '', soloist: '', keyboardist: '', guitarist: '' }], afterInitialPrayer: [{ notebook: 'H', number: '', title: '', execution: '', duration: '', conductor: '', soloist: '', keyboardist: '', guitarist: '' }], choir: empty(2), choirAfterContributions: empty(2), message: [{ notebook: 'H', number: '', title: '', execution: '', duration: '', conductor: '', soloist: '', keyboardist: '', guitarist: '' }], afterIndividualPrayer: [{ notebook: 'H', number: '', title: '', execution: '', duration: '', conductor: '', soloist: '', keyboardist: '', guitarist: '' }] };
      } else {
        if (sections.hymnal.length > 0) sections.hymnal[0] = { notebook: 'H', number: '1', title: findTitle('1', 'H') || 'Igreja Forte', execution: '', duration: '', conductor: '', soloist: '', keyboardist: '', guitarist: '' };
        if (data.type === 'Comunhao200') { sections.message = [{ notebook: 'H', number: '', title: '', execution: '', duration: '', conductor: '', soloist: '', keyboardist: '', guitarist: '' }]; sections.finalization = [{ notebook: 'H', number: '57', title: findTitle('57', 'H') || 'Vitória', execution: '', duration: '', conductor: '', soloist: '', keyboardist: '', guitarist: '' }]; }
      }
      for (let sec in sections) { sections[sec] = await Promise.all(sections[sec].map(async (e: any) => { const found = all.find((h: any) => h.notebook === e.notebook && h.number === e.number); return found ? { ...e, title: found.title } : e; })); }
      setData(prev => ({ ...prev, sections }));
    };
    buildSections();
  }, [data.type, ownerEmail]);

  const update = async (sec: string, idx: number, field: string, val: string) => {
    if (isReadOnly) return;
    const s = [...(data.sections![sec] || [])]; s[idx] = { ...s[idx], [field]: val };
    if ((field === 'number' || field === 'notebook') && s[idx].notebook && s[idx].notebook !== 'Caderno' && s[idx].number) {
      const all = await fetchData('hymns_library', 'gca_hymns_library', ownerEmail);
      const found = all.find((h: any) => h.notebook === s[idx].notebook && h.number === s[idx].number);
      s[idx].title = found ? found.title : '';
    }
    setData({ ...data, sections: { ...data.sections!, [sec]: s } });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (isReadOnly) return;
    const allLibraryHymns = await fetchData('hymns_library', 'gca_hymns_library', ownerEmail);
    let hasError = false;
    Object.values(data.sections || {}).forEach((entries: any) => entries.forEach((entry: any) => { if (entry.number.trim() !== '') { if (entry.notebook === 'Caderno') hasError = true; else if (!allLibraryHymns.some((h: MasterHymn) => h.notebook === entry.notebook && h.number === entry.number)) hasError = true; } }));
    if (hasError) { setShowErrorMsg(true); return; }
    const newList: HymnList = { id: initialData?.id || generateId(), owner_email: ownerEmail, ...data } as HymnList;
    const all = await fetchData('hymn_lists', 'gca_hymn_lists', ownerEmail);
    await saveData('hymn_lists', 'gca_hymn_lists', [...all.filter((l: any) => l.id !== initialData?.id), newList], ownerEmail);
    onSave();
  };

  const getSectionLabel = (sec: string) => {
    const labelsMap: any = { hymnal: 'Hinário', choir: 'Apresentação do Coral', contributions: 'Contribuições', communion: 'Santa Comunhão', message: 'Mensagem', finalization: 'Finalização', afterInitialPrayer: 'Hinos do Hinário', choirAfterContributions: 'Apresentação do Coral', afterIndividualPrayer: 'Hinos do Hinário' };
    return data.type === 'Oracao' ? (sec === 'hymnal' ? 'Inicio' : labelsMap[sec] || sec) : labelsMap[sec] || sec;
  };
  const sectionOrder = data.type === 'Oracao' ? ['hymnal', 'afterInitialPrayer', 'choir', 'choirAfterContributions', 'message', 'afterIndividualPrayer'] : ['hymnal', 'choir', 'contributions', 'communion', 'message', 'finalization'];

  const dynamicWidthClass = data.isDetailed ? "max-w-[98%]" : "max-w-5xl";

  const getProgressiveMarker = () => {
    if (data.type !== 'NatalAnoNovo') return null;
    let startTimeStr = data.startTime || '19:00';
    let [h, m] = startTimeStr.split(':').map(Number);
    let runningSeconds = (h * 3600) + (m * 60);
    let totalPresentationSeconds = 0;
    
    const markers: Record<string, string[]> = {};
    sectionOrder.forEach(sec => {
      markers[sec] = (data.sections?.[sec] || []).map(e => {
        const durSeconds = parseTimeToSeconds(e.duration);
        runningSeconds += durSeconds;
        totalPresentationSeconds += durSeconds;
        return formatSecondsToClockTime(runningSeconds);
      });
    });

    return { markers, totalPresentationSeconds };
  };

  const progInfo = getProgressiveMarker();

  return (
    <Layout title={initialData ? "Programa" : "Novo Programa"} onBack={onCancel} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation} widthClass={dynamicWidthClass}>
      <form onSubmit={save} className={`bg-white p-6 rounded shadow space-y-6 mx-auto ${dynamicWidthClass}`}>
        {showErrorMsg && <div className="bg-red-100 p-4 mb-4 rounded font-bold animate-pulse text-red-700">Favor Cadastrar Hino ou selecionar um Caderno válido</div>}
        <div className={`grid grid-cols-1 ${data.type === 'NatalAnoNovo' ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4 border-b pb-6`}>
          <div><label className="block text-xs font-bold uppercase text-gray-400 mb-1">Data</label><input required type="date" disabled={isReadOnly} className="w-full border rounded p-2" value={data.date} onChange={e => setData({...data, date: e.target.value})} /></div>
          <div><label className="block text-xs font-bold uppercase text-gray-400 mb-1">Congregação</label><input required disabled={isReadOnly} placeholder="Sede / Regional" className="w-full border rounded p-2" value={data.congregation} onChange={e => setData({...data, congregation: e.target.value})} /></div>
          <div><label className="block text-xs font-bold uppercase text-gray-400 mb-1">Tipo</label><select disabled={isReadOnly} className="w-full border rounded p-2" value={data.type} onChange={e => { isFirstRun.current = true; setData({...data, type: e.target.value as any}); }}>{Object.entries(MEETING_TYPES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          {data.type === 'NatalAnoNovo' && (
            <div><label className="block text-xs font-bold uppercase text-gray-400 mb-1">Início Reunião</label><input type="time" disabled={isReadOnly} className="w-full border rounded p-2" value={data.startTime || '19:00'} onChange={e => setData({...data, startTime: e.target.value})} /></div>
          )}
          <div className="flex items-center gap-2 pt-6"><input type="checkbox" id="isDetailed" disabled={isReadOnly} className="w-4 h-4" checked={data.isDetailed || false} onChange={e => setData({...data, isDetailed: e.target.checked})} /><label htmlFor="isDetailed" className="text-xs font-bold uppercase text-gray-500">Mais detalhada</label></div>
        </div>
        {sectionOrder.map((sec) => {
          const entries = data.sections?.[sec]; if (!entries || entries.length === 0) return null;
          const sectionLabel = getSectionLabel(sec);
          const hideExecution = sectionLabel === 'Hinário' || sectionLabel === 'Hinos do Hinário';
          const isDetailedRow = sectionLabel === 'Apresentação do Coral' || sectionLabel === 'Contribuições' || sectionLabel === 'Mensagem';
          return (
            <div key={sec} className="bg-gray-50 p-4 rounded-xl border">
              <h4 className="font-black uppercase text-indigo-900 mb-4">{sectionLabel}</h4>
              <div className="space-y-3">
                {entries.map((e: any, i: number) => {
                  const isFixedH = data.type === 'Oracao' && (sec === 'hymnal' || sec === 'afterInitialPrayer' || sec === 'message' || sec === 'afterIndividualPrayer');
                  const isRowAutoFixed = (e.notebook === 'H' && (e.number === '1' || e.number === '57'));
                  const notebookLocked = isReadOnly || isFixedH || isRowAutoFixed;
                  return (
                    <div key={i} className="flex flex-col sm:flex-row gap-2 items-center p-2 rounded">
                      <select disabled={notebookLocked} className={`w-full sm:w-24 border rounded p-2 ${notebookLocked ? 'bg-gray-100' : 'bg-white'}`} value={e.notebook} onChange={ev => update(sec, i, 'notebook', ev.target.value)}><option value="Caderno">Caderno</option>{Object.keys(NOTEBOOKS).map(code => <option key={code} value={code}>{code}</option>)}</select>
                      <input disabled={isReadOnly || isRowAutoFixed} placeholder="Nº" className="w-full sm:w-20 border rounded p-2" value={e.number} onChange={ev => update(sec, i, 'number', ev.target.value)} />
                      <input placeholder="Título..." className="border rounded p-2 flex-1 bg-gray-100" value={e.title} readOnly disabled />
                      {data.isDetailed && isDetailedRow && (
                        <>
                          <input disabled={isReadOnly} placeholder="Regente" className="border rounded p-2 w-28" value={e.conductor || ''} onChange={ev => update(sec, i, 'conductor', ev.target.value)} />
                          <input disabled={isReadOnly} placeholder="Solista" className="border rounded p-2 w-28" value={e.soloist || ''} onChange={ev => update(sec, i, 'soloist', ev.target.value)} />
                          <input disabled={isReadOnly} placeholder="Tecladista" className="border rounded p-2 w-28" value={e.keyboardist || ''} onChange={ev => update(sec, i, 'keyboardist', ev.target.value)} />
                          <input disabled={isReadOnly} placeholder="Violonista" className="border rounded p-2 w-28" value={e.guitarist || ''} onChange={ev => update(sec, i, 'guitarist', ev.target.value)} />
                        </>
                      )}
                      {!hideExecution && <input disabled={isReadOnly} placeholder="Execução" className="border rounded p-2 w-full sm:w-32" value={e.execution || ''} onChange={ev => update(sec, i, 'execution', ev.target.value)} />}
                      {data.type === 'NatalAnoNovo' && (
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <label className="text-[9px] font-black uppercase text-gray-400">Duração</label>
                            <input disabled={isReadOnly} placeholder="00:00:00" className="border rounded p-2 w-24 text-center font-mono text-sm" value={e.duration || ''} onChange={ev => update(sec, i, 'duration', ev.target.value)} />
                          </div>
                          {progInfo?.markers[sec][i] && (
                            <div className="flex flex-col items-center bg-indigo-600 text-white px-2 py-1 rounded shadow-sm border border-indigo-700 min-w-[75px]">
                              <span className="text-[8px] font-black uppercase opacity-80 leading-none mb-0.5">Término</span>
                              <span className="text-xs font-black tracking-wider leading-none">{progInfo.markers[sec][i]}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        
        {data.type === 'NatalAnoNovo' && progInfo && (
          <div className="bg-indigo-900 text-white p-6 rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 border-b-4 border-indigo-950">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-800 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div>
                <h5 className="text-xs font-black uppercase tracking-widest opacity-70">Tempo Total de Apresentação</h5>
                <p className="text-2xl font-black">{formatSecondsToDurationString(progInfo.totalPresentationSeconds)}</p>
              </div>
            </div>
            <div className="text-right">
              <h5 className="text-xs font-black uppercase tracking-widest opacity-70">Encerramento Previsto</h5>
              <p className="text-3xl font-black text-yellow-400">{formatSecondsToClockTime((parseTimeToSeconds(data.startTime || '19:00') + progInfo.totalPresentationSeconds))}</p>
            </div>
          </div>
        )}

        {!isReadOnly && <button type="submit" className="bg-indigo-600 text-white px-10 py-3 rounded-full font-bold shadow-lg w-full sm:w-auto">Finalizar Programa</button>}
      </form>
    </Layout>
  );
};

const PrintView = ({ list, onBack, onExitImpersonation }: any) => {
  const sectionOrder = list.type === 'Oracao' ? ['hymnal', 'afterInitialPrayer', 'choir', 'choirAfterContributions', 'message', 'afterIndividualPrayer'] : ['hymnal', 'choir', 'contributions', 'communion', 'message', 'finalization'];
  
  const getSectionLabel = (sec: string) => {
    const labelsMap: any = { hymnal: 'Hinário', choir: 'Apresentação do Coral', contributions: 'Contribuições', communion: 'Santa Comunhão', message: 'Mensagem', finalization: 'Finalização', afterInitialPrayer: 'Hinos do Hinário', choirAfterContributions: 'Apresentação do Coral', afterIndividualPrayer: 'Hinos do Hinário' };
    return list.type === 'Oracao' ? (sec === 'hymnal' ? 'Inicio' : labelsMap[sec] || sec) : labelsMap[sec] || sec;
  };

  let startTimeSeconds = parseTimeToSeconds(list.startTime || '19:00');
  let runningSeconds = startTimeSeconds;
  let totalPresentationSeconds = 0;

  return (
    <div className="bg-gray-100 p-8 min-h-screen">
      <div className="max-w-[1200px] mx-auto mb-4 flex justify-between no-print"><button onClick={onBack} className="bg-gray-600 text-white px-4 py-2 rounded">Voltar</button><button onClick={() => downloadPDF('program-print', `programa-${list.date}.pdf`, (list.isDetailed || list.type === 'NatalAnoNovo') ? 'landscape' : 'portrait')} className="bg-indigo-600 text-white px-4 py-2 rounded font-bold">Gerar PDF</button></div>
      <div id="program-print" className={`bg-white p-12 shadow-2xl mx-auto ${(list.isDetailed || list.type === 'NatalAnoNovo') ? 'max-w-[297mm]' : 'max-w-[210mm]'} min-h-[297mm]`}>
        <div className="text-center border-b-4 border-double border-black pb-6 mb-8">
          <h1 className="text-3xl font-black uppercase tracking-tighter">Igreja Apostólica</h1>
          <h2 className="text-xl font-bold mt-2 border border-black inline-block px-4 py-1 uppercase">{MEETING_TYPES[list.type]}</h2>
          <div className="mt-8 flex justify-between px-2 text-sm font-bold uppercase italic border-black border-t-2 pt-2">
            <span>Data: {new Date(list.date + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
            {list.type === 'NatalAnoNovo' && <span>Início: {list.startTime || '19:00'}</span>}
            <span>Congregação: {list.congregation}</span>
          </div>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-black text-left uppercase font-black text-[10px]">
              <th className="px-2 py-2">Cad.</th>
              <th className="px-2 py-2">Nº</th>
              <th className="px-2 py-2">Hino</th>
              {list.isDetailed && (
                <>
                  <th className="px-2 py-2">Regente</th>
                  <th className="px-2 py-2">Solista</th>
                  <th className="px-2 py-2">Tecladista</th>
                  <th className="px-2 py-2">Violonista</th>
                </>
              )}
              <th className="px-2 py-2">Execução</th>
              {list.type === 'NatalAnoNovo' && (
                <>
                  <th className="px-2 py-2 text-center">Duração</th>
                  <th className="px-2 py-2 text-center">Término</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sectionOrder.map(sec => {
              const sectionLabel = getSectionLabel(sec);
              const isDetailedRow = sectionLabel === 'Apresentação do Coral' || sectionLabel === 'Contribuições' || sectionLabel === 'Mensagem';
              const hideExecution = sectionLabel === 'Hinário' || sectionLabel === 'Hinos do Hinário';
              
              return (list.sections[sec] || []).map((e: any, i: number) => {
                const itemDurSec = parseTimeToSeconds(e.duration);
                runningSeconds += itemDurSec;
                totalPresentationSeconds += itemDurSec;
                
                return (
                  <tr key={sec + i} className="border-b border-gray-200">
                    <td className="px-2 py-3 font-bold text-gray-400 text-[10px]">{e.notebook}</td>
                    <td className="px-2 py-3 font-black text-indigo-700 text-lg">{e.number}</td>
                    <td className="px-2 py-3 font-bold text-gray-800 uppercase text-md">{e.title}</td>
                    {list.isDetailed && (
                      <>
                        <td className="px-2 py-3 text-[11px] italic">{isDetailedRow ? (e.conductor || '-') : ''}</td>
                        <td className="px-2 py-3 text-[11px] italic">{isDetailedRow ? (e.soloist || '-') : ''}</td>
                        <td className="px-2 py-3 text-[11px] italic">{isDetailedRow ? (e.keyboardist || '-') : ''}</td>
                        <td className="px-2 py-3 text-[11px] italic">{isDetailedRow ? (e.guitarist || '-') : ''}</td>
                      </>
                    )}
                    <td className="px-2 py-3 text-gray-500 italic text-[11px]">{!hideExecution ? (e.execution || '-') : ''}</td>
                    {list.type === 'NatalAnoNovo' && (
                      <>
                        <td className="px-2 py-3 text-gray-800 text-[11px] font-bold text-center font-mono">{e.duration || '00:00:00'}</td>
                        <td className="px-2 py-3 text-indigo-700 text-[11px] font-black text-center font-mono">{formatSecondsToClockTime(runningSeconds)}</td>
                      </>
                    )}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>

        {list.type === 'NatalAnoNovo' && (
          <div className="mt-12 p-4 border-2 border-black rounded flex justify-between items-center bg-gray-50">
            <div>
              <p className="text-[10px] font-black uppercase">Tempo Total de Apresentação</p>
              <p className="text-xl font-black">{formatSecondsToDurationString(totalPresentationSeconds)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase">Encerramento Previsto</p>
              <p className="text-2xl font-black">{formatSecondsToClockTime(runningSeconds)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const HymnReportInputScreen = ({ onGenerate, onCancel, onExitImpersonation }: any) => {
  const [start, setStart] = useState(new Date().toISOString().substr(0, 10));
  const [end, setEnd] = useState(new Date().toISOString().substr(0, 10));
  return (
    <Layout title="Uso de Hinos" onBack={onCancel} onExitImpersonation={onExitImpersonation}>
      <div className="bg-white p-8 rounded shadow max-w-md mx-auto mt-12 space-y-4">
        <div><label className="block text-sm font-bold">Início</label><input type="date" className="w-full border rounded p-2" value={start} onChange={e => setStart(e.target.value)} /></div>
        <div><label className="block text-sm font-bold">Término</label><input type="date" className="w-full border rounded p-2" value={end} onChange={e => setEnd(e.target.value)} /></div>
        <button onClick={() => onGenerate(start, end, 'sung')} className="w-full bg-indigo-600 text-white py-2 rounded font-bold shadow">Visualizar</button>
      </div>
    </Layout>
  );
};

const AdminMenuScreen = ({ navigate, goBack, currentUser }: any) => {
  const isMaster = currentUser.email === 'Admin';
  return (
    <Layout title="Painel Administrativo" onBack={goBack}>
      <div className="max-w-md mx-auto mt-8 grid gap-6">
        {(isMaster || currentUser.canApprove) && (
          <MenuCard 
            title="Solicitações de Acesso" 
            desc="Aprovar, negar ou excluir usuários" 
            icon={<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>} 
            onClick={() => navigate('admin_users')} 
          />
        )}
        {(isMaster || currentUser.canRegister) && (
          <MenuCard 
            title="Cadastrar Novo Acesso" 
            desc="Cadastrar e autorizar usuário instantaneamente" 
            icon={<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>} 
            onClick={() => navigate('admin_register_user')} 
          />
        )}
        
        {isMaster ? (
          <>
            <MenuCard 
              title="Cadastros" 
              desc="País, Cidade e Congregações" 
              icon={<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>} 
              onClick={() => navigate('admin_registrations_summary')} 
            />
            <MenuCard 
              title="Certificado de Registro de Regentes" 
              desc="Geração de certificados oficiais" 
              icon={<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg>} 
              onClick={() => navigate('admin_conductor_certificates')} 
            />
          </>
        ) : (
          currentUser.canViewOthers && (
            <MenuCard 
              title="Desempenho" 
              desc="Visualizar ambiente de outros usuários" 
              icon={<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>} 
              onClick={() => navigate('admin_performance')} 
            />
          )
        )}
      </div>
    </Layout>
  );
};

const AdminRegisterUserScreen = ({ goBack }: any) => {
  const [formData, setFormData] = useState({ name: '', email: '', congregation: '', phone: '', role: '', password: '' });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (formData.password !== confirmPassword) {
      setError('As senhas não conferem');
      setLoading(false);
      return;
    }
    
    try {
      const { error: err } = await supabase.from('users').insert({ 
        ...formData, 
        status: 'authorized', 
        id: generateId() 
      });
      if (err) throw err;
      alert('Usuário cadastrado e autorizado com sucesso!');
      goBack();
    } catch (err: any) {
      setError(err.message || 'Erro ao realizar cadastro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Novo Cadastro" onBack={goBack}>
      <div className="max-w-md mx-auto mt-8 bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="text-xl font-black text-indigo-900 uppercase mb-6 text-center">Dados do Usuário</h3>
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold mb-4">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input required placeholder="Nome Completo" className="w-full border rounded p-3" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          <input required type="email" placeholder="E-mail" className="w-full border rounded p-3" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
          <input required placeholder="Congregação" className="w-full border rounded p-3" value={formData.congregation} onChange={e => setFormData({...formData, congregation: e.target.value})} />
          <input required placeholder="Cargo" className="w-full border rounded p-3" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} />
          <input placeholder="Telefone" className="w-full border rounded p-3" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
          <input required type="password" placeholder="Senha" className="w-full border rounded p-3" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
          <input required type="password" placeholder="Confirmar Senha" className="w-full border rounded p-3" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          <button 
            type="submit" 
            disabled={loading}
            className={`w-full bg-indigo-700 text-white py-3 rounded-xl font-bold uppercase transition-opacity ${loading ? 'opacity-50' : 'hover:opacity-90'}`}
          >
            {loading ? 'Cadastrando...' : 'Cadastrar e Autorizar'}
          </button>
        </form>
      </div>
    </Layout>
  );
};

const AdminPerformanceScreen = ({ goBack, onImpersonate }: any) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  useEffect(() => { supabase.from('users').select('*').eq('status', 'authorized').then(({ data }) => setUsers(data || [])); }, []);
  return (
    <Layout title="Desempenho" onBack={goBack}>
      <div className="bg-white rounded-xl shadow overflow-hidden border">
        <table className="w-full text-left"><tbody className="divide-y">{users.filter(u => u.email !== 'Admin').map(u => (<tr key={u.id} className="hover:bg-gray-50"><td className="px-6 py-4 font-bold">{u.name}</td><td className="px-6 py-4 text-right"><button onClick={() => onImpersonate(u)} className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded text-[10px] font-black uppercase">Visualizar</button></td></tr>))}</tbody></table>
      </div>
    </Layout>
  );
};

const AdminUsersScreen = ({ goBack, onImpersonate, currentUser }: any) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [permissionModalUser, setPermissionModalUser] = useState<UserAccount | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const isMaster = currentUser.email === 'Admin';

  useEffect(() => { supabase.from('users').select('*').then(({ data }) => setUsers(data || [])); }, []);

  const updateStatus = async (id: string, status: any) => { 
    const { error } = await supabase.from('users').update({ status }).eq('id', id); 
    if (!error) setUsers(users.map(u => u.id === id ? { ...u, status } : u)); 
  };

  const savePermissions = async () => {
    if (!permissionModalUser) return;
    setPermissionError(null);

    if (permissionModalUser.isAdminUser) {
      const hasAnyPermission = 
        permissionModalUser.canViewOthers || 
        permissionModalUser.canRegister || 
        permissionModalUser.canApprove || 
        permissionModalUser.canDeleteUser;
        
      if (!hasAnyPermission) {
        setPermissionError("Favor habilitar usuário a realizar pelo menos uma das ações");
        return;
      }
    }

    const { error } = await supabase.from('users').update({
      isAdminUser: permissionModalUser.isAdminUser,
      canViewOthers: permissionModalUser.canViewOthers,
      canRegister: permissionModalUser.canRegister,
      canApprove: permissionModalUser.canApprove,
      canDeleteUser: permissionModalUser.canDeleteUser
    }).eq('id', permissionModalUser.id);

    if (!error) {
      setUsers(users.map(u => u.id === permissionModalUser.id ? permissionModalUser : u));
      setPermissionModalUser(null);
      alert('Permissões atualizadas!');
    }
  };

  const handleImpersonate = (u: UserAccount) => {
    if (isMaster || currentUser.canViewOthers) {
      onImpersonate(u);
    } else {
      alert('Você não tem permissão para visualizar outros ambientes.');
    }
  };

  const handleDeleteUser = async (u: UserAccount) => {
    if (isMaster || currentUser.canDeleteUser) {
      if (confirm(`Excluir usuário ${u.name} permanentemente?`)) {
        const { error } = await supabase.from('users').delete().eq('id', u.id);
        if (!error) setUsers(users.filter(usr => usr.id !== u.id));
      }
    } else {
      alert('Você não tem permissão para excluir usuários.');
    }
  };

  return (
    <Layout title="Gestão de Usuários" onBack={goBack}>
      <div className="space-y-4">
        {users.filter(u => u.email !== 'Admin').map(u => (
          <div key={u.id} className="bg-white p-4 rounded-lg shadow border flex justify-between items-center">
            <div>
              <p className="font-bold">{u.name}</p>
              <p className="text-xs text-indigo-600">{u.email}</p>
              {u.isAdminUser && <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded uppercase font-black tracking-widest mt-1 inline-block">Administrador</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleImpersonate(u)} className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wider">Ver Ambiente</button>
              {u.status === 'pending' && (
                <button 
                  onClick={() => updateStatus(u.id, 'authorized')} 
                  disabled={!isMaster && !currentUser.canApprove}
                  className={`bg-green-50 text-green-700 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wider ${(isMaster || currentUser.canApprove) ? '' : 'opacity-50'}`}
                >
                  Aceitar
                </button>
              )}
              {u.status === 'authorized' && isMaster && (
                <button onClick={() => { setPermissionModalUser(u); setPermissionError(null); }} className="bg-purple-50 text-purple-700 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wider">Níveis de Acesso</button>
              )}
              {(isMaster || currentUser.canDeleteUser) && (
                <button onClick={() => handleDeleteUser(u)} className="bg-red-50 text-red-700 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wider">Excluir</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {permissionModalUser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] animate-fade-in backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 w-full max-md shadow-2xl space-y-6">
            <h3 className="text-xl font-black text-indigo-900 uppercase border-b pb-4">Níveis de Acesso: {permissionModalUser.name}</h3>
            
            {permissionError && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-[10px] font-black uppercase border-l-4 border-red-500 animate-pulse">
                {permissionError}
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-xl">
                <span className="font-bold text-indigo-900 text-sm uppercase">Tornar Administrador</span>
                <button 
                  onClick={() => {
                    setPermissionError(null);
                    setPermissionModalUser({...permissionModalUser, isAdminUser: !permissionModalUser.isAdminUser});
                  }}
                  className={`w-12 h-6 rounded-full transition-colors relative ${permissionModalUser.isAdminUser ? 'bg-indigo-600' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${permissionModalUser.isAdminUser ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {permissionModalUser.isAdminUser && (
                <div className="pl-4 space-y-3 animate-slide-down">
                  {[
                    { label: 'Autorizar leitura de ambiente de outros usuários', key: 'canViewOthers' },
                    { label: 'Autorizar cadastrar novos usuários', key: 'canRegister' },
                    { label: 'Autorizar aceitar e recusar novos usuários', key: 'canApprove' },
                    { label: 'Autorizar excluir usuários', key: 'canDeleteUser' }
                  ].map(opt => (
                    <label key={opt.key} className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                        checked={(permissionModalUser as any)[opt.key]}
                        onChange={(e) => {
                          setPermissionError(null);
                          setPermissionModalUser({...permissionModalUser, [opt.key]: e.target.checked});
                        }}
                      />
                      <span className="text-xs font-semibold text-gray-700 group-hover:text-indigo-600 transition-colors uppercase">{opt.label}</span>
                    </label>
                  ))}
                </div>
              )}

              <button 
                onClick={() => {
                  setPermissionError(null);
                  setPermissionModalUser({...permissionModalUser, isAdminUser: false, canViewOthers: false, canRegister: false, canApprove: false, canDeleteUser: false});
                }}
                className="w-full text-center py-2 text-[10px] font-black uppercase text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                Rebaixar à usuário comum
              </button>
            </div>

            <div className="flex gap-4 pt-4 border-t">
              <button onClick={savePermissions} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-black uppercase shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all">Salvar</button>
              <button onClick={() => setPermissionModalUser(null)} className="flex-1 bg-gray-100 text-gray-500 py-3 rounded-xl font-black uppercase hover:bg-gray-200 transition-all">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

const ProfileScreen = ({ user, goBack, onUpdate, onExitImpersonation }: any) => (
  <Layout title="Meu Perfil" onBack={goBack} onExitImpersonation={onExitImpersonation}>
    <div className="max-w-2xl mx-auto mt-8 bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
      <h3 className="text-xl font-black text-indigo-900 uppercase mb-6">Dados Cadastrais</h3>
      <div className="space-y-4">
        <div><label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Nome</label><p className="font-bold text-lg">{user.name}</p></div>
        <div><label className="text-xs font-bold text-gray-400 uppercase tracking-widest">E-mail</label><p className="font-bold text-lg">{user.email}</p></div>
        <div><label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Congregação</label><p className="font-bold text-lg">{user.congregation}</p></div>
        <div><label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Cargo</label><p className="font-bold text-lg">{user.role}</p></div>
      </div>
      <button onClick={goBack} className="w-full mt-8 border-2 border-gray-100 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors">Voltar</button>
    </div>
  </Layout>
);

const AuthScreen = ({ onLogin }: any) => {
  const [mode, setMode] = useState<'login' | 'request'>('login');
  const [formData, setFormData] = useState({ name: '', email: '', congregation: '', phone: '', role: '', password: '' });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setError('');
    if (mode === 'login') { 
      if (formData.email === 'Admin' && formData.password === 'IA123*') { 
        onLogin({ id: 'admin', name: 'Administrador', email: 'Admin', status: 'authorized', password: 'IA123*' }); 
        return; 
      } 
      const { data, error: err } = await supabase.from('users').select('*').eq('email', formData.email).eq('password', formData.password).single(); 
      if (err || !data) { setError('Usuário ou senha inválidos.'); return; } 
      if (data.status !== 'authorized') { setError(`Acesso ${data.status === 'pending' ? 'em análise' : 'negado'}.`); return; } 
      onLogin(data); 
    }
    else { 
      if (formData.password !== confirmPassword) {
        setError('As senhas não conferem');
        return;
      }
      const { error: err } = await supabase.from('users').insert({ ...formData, status: 'pending', id: generateId() }); 
      if (err) { setError('Erro ao solicitar acesso.'); return; } 
      alert('Pedido enviado!'); setMode('login'); 
    }
  };
  return (
    <div className="min-h-screen bg-indigo-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-md">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-black text-indigo-900 uppercase tracking-tighter">CORUS</h2>
          <p className="text-indigo-400 font-bold uppercase text-[10px] tracking-widest mt-1">Gestor de Corais Apostólicos</p>
        </div>
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold mb-4 border-l-4 border-red-500">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'request' && <input required placeholder="Nome Completo" className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />}
          <input required type="text" placeholder="E-mail" className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
          {mode === 'request' && <input required placeholder="Congregação" className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.congregation} onChange={e => setFormData({...formData, congregation: e.target.value})} />}
          {mode === 'request' && <input required placeholder="Cargo no Ministério" className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} />}
          <input required type="password" placeholder="Senha" className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
          {mode === 'request' && <input required type="password" placeholder="Confirmar Senha" className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />}
          <button type="submit" className="w-full bg-indigo-700 text-white py-4 rounded-xl font-black uppercase shadow-lg shadow-indigo-100 hover:bg-indigo-800 transition-all active:scale-95">{mode === 'login' ? 'Entrar' : 'Solicitar Acesso'}</button>
        </form>
        <button onClick={() => { setMode(mode === 'login' ? 'request' : 'login'); setError(''); }} className="w-full text-indigo-600 text-xs font-bold uppercase mt-6 tracking-widest">{mode === 'login' ? 'Solicitar Acesso' : 'Voltar ao Login'}</button>
      </div>
    </div>
  );
};

const App = () => {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [viewingUser, setViewingUser] = useState<UserAccount | null>(null);
  const [screen, setScreen] = useState('home');
  const [history, setHistory] = useState<string[]>([]);
  const [editData, setEditData] = useState<any>(null);
  const [notebookData, setNotebookData] = useState<any>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [attendanceEditData, setAttendanceEditData] = useState<any>(null);

  const activeEmail = viewingUser ? viewingUser.email : currentUser?.email;
  const isReadOnly = currentUser?.email === 'Admin' && viewingUser !== null;
  const onExitImpersonation = viewingUser ? () => { setViewingUser(null); setScreen('admin_menu'); } : undefined;

  const navigate = (next: string, data?: any) => { setHistory([...history, screen]); setScreen(next); if (next === 'create_hymn_list') setEditData(data); if (next === 'notebook_detail' || next === 'hymn_notebook_report') setNotebookData(data); if (['attendance_report', 'hymn_report', 'musicians_voice_report', 'attendance_percentage_report', 'musicians_instrument_report', 'admin_countries_report', 'admin_cities_report', 'admin_congregations_report', 'admin_conductors_report'].includes(next)) setReportData(data); if (next === 'roll_call') setAttendanceEditData(data); if (next === 'admin_crr_card') setEditData(data); };
  const goBack = () => { const prev = history[history.length - 1] || 'home'; setHistory(history.slice(0, -1)); setScreen(prev); };
  const onLogout = () => { setCurrentUser(null); setViewingUser(null); setScreen('home'); setHistory([]); };

  if (!currentUser) return <AuthScreen onLogin={setCurrentUser} />;

  const isMaster = currentUser.email === 'Admin';
  const isAdmin = isMaster || currentUser.isAdminUser;

  switch (screen) {
    case 'profile': return <ProfileScreen user={currentUser} goBack={goBack} onUpdate={setCurrentUser} onExitImpersonation={onExitImpersonation} />;
    case 'admin_menu': return <AdminMenuScreen navigate={navigate} goBack={goBack} currentUser={currentUser} />;
    case 'admin_register_user': return <AdminRegisterUserScreen goBack={goBack} />;
    case 'admin_performance': return <AdminPerformanceScreen goBack={goBack} onImpersonate={(u: any) => { setViewingUser(u); setScreen('home'); }} />;
    case 'admin_users': return <AdminUsersScreen goBack={goBack} onImpersonate={(u: any) => { setViewingUser(u); setScreen('home'); }} currentUser={currentUser} />;
    case 'admin_countries': return <AdminCountriesScreen goBack={goBack} navigate={navigate} />;
    case 'admin_cities': return <AdminCitiesScreen goBack={goBack} navigate={navigate} />;
    case 'admin_congregations': return <AdminCongregationsScreen goBack={goBack} navigate={navigate} />;
    case 'admin_countries_report': return <AdminMasterReportView id="relatorio-paises" title="Relatório de Países Atendidos" columns={[{key:'id', label:'Cód.'}, {key:'name', label:'Nome do País'}]} data={reportData} goBack={goBack} />;
    case 'admin_cities_report': return <AdminMasterReportView id="relatorio-cidades" title="Relatório de Cidades" columns={[{key:'id', label:'Cód.'}, {key:'name', label:'Nome da Cidade'}, {key:'cep', label:'CEP'}]} data={reportData} goBack={goBack} />;
    case 'admin_congregations_report': return <AdminMasterReportView id="relatorio-congre" title="Relatório Geral de Congregações" columns={[{key:'id', label:'Cód.'}, {key:'name', label:'Congregação'}, {key:'city', label:'Cidade'}, {key:'country', label:'País'}, {key:'address', label:'Endereço'}, {key:'cep', label:'CEP'}]} data={reportData} goBack={goBack} />;
    case 'admin_conductors_report': return <AdminMasterReportView id="relatorio-regentes" title="Relatório de Regentes (CRR)" columns={[{key:'registry_number', label:'Registro'}, {key:'name', label:'Nome'}, {key:'email', label:'E-mail'}, {key:'phone', label:'Telefone'}]} data={reportData} goBack={goBack} />;
    case 'admin_conductor_certificates': return <AdminConductorCertificatesScreen navigate={navigate} goBack={goBack} />;
    case 'admin_new_conductor': return <AdminNewConductorForm goBack={goBack} />;
    case 'admin_crr_card': return <CRRCardView conductor={editData} goBack={goBack} />;
    case 'admin_registrations_summary': return <AdminRegistrationsSummaryScreen navigate={navigate} goBack={goBack} />;
    case 'home': return <HomeScreen navigate={navigate} onLogout={onLogout} isReadOnly={isReadOnly} isAdmin={isAdmin} onProfileClick={() => setScreen('profile')} onExitImpersonation={onExitImpersonation} />;
    case 'components': return <ComponentsScreen navigate={navigate} goBack={goBack} onExitImpersonation={onExitImpersonation} />;
    case 'instruments': return <InstrumentsScreen goBack={goBack} ownerEmail={activeEmail} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation} />;
    case 'musicians': return <MusiciansScreen goBack={goBack} ownerEmail={activeEmail} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation} />;
    case 'musician_report_selection': return <MusicianReportSelectionScreen navigate={navigate} goBack={goBack} onExitImpersonation={onExitImpersonation} />;
    case 'musicians_report': return <MusiciansReportScreen goBack={goBack} ownerEmail={activeEmail} />;
    case 'musicians_voice_report': return <MusiciansVoiceReportScreen goBack={goBack} ownerEmail={activeEmail} />;
    case 'musicians_instrument_report': return <MusiciansInstrumentReportScreen goBack={goBack} ownerEmail={activeEmail} />;
    case 'attendance': return <AttendanceMenuScreen navigate={navigate} goBack={goBack} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation} />;
    case 'roll_call': return <RollCallScreen goBack={goBack} editData={attendanceEditData} ownerEmail={activeEmail} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation} />;
    case 'attendance_history': return <AttendanceHistoryScreen goBack={goBack} onEdit={(r: any) => navigate('roll_call', r)} ownerEmail={activeEmail} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation} />;
    case 'attendance_report_input': return <AttendanceReportInputScreen onGenerate={(s: any, e: any, t: any) => navigate('attendance_report', {s, e, t})} onCancel={goBack} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation} />;
    case 'attendance_report': return <AttendanceReportScreen goBack={goBack} ownerEmail={activeEmail} reportData={reportData} />;
    case 'attendance_percentage_input': return <AttendancePercentageInputScreen onGenerate={(s: any, e: any) => navigate('attendance_percentage_report', {s, e})} onCancel={goBack} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation} />;
    case 'attendance_percentage_report': return <AttendancePercentageReportScreen goBack={goBack} ownerEmail={activeEmail} reportData={reportData} />;
    case 'hymns_library': return <HymnsLibraryScreen navigate={navigate} goBack={goBack} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation} />;
    case 'notebook_detail': return <NotebookDetailScreen notebook={notebookData} goBack={goBack} navigate={navigate} ownerEmail={activeEmail} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation} />;
    case 'hymn_notebook_report': return <HymnNotebookReportScreen notebook={notebookData} goBack={goBack} ownerEmail={activeEmail} />;
    case 'programs': return <ProgramsScreen navigate={navigate} goBack={goBack} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation} />;
    case 'guidelines': return <GuidelinesScreen goBack={goBack} onExitImpersonation={onExitImpersonation} />;
    case 'hymn_lists': return <HymnListScreen goBack={goBack} onCreate={() => navigate('create_hymn_list')} onEdit={l => navigate('create_hymn_list', l)} ownerEmail={activeEmail} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation} />;
    case 'create_hymn_list': return <CreateHymnListScreen onSave={goBack} onCancel={goBack} initialData={editData} ownerEmail={activeEmail} isReadOnly={isReadOnly} onExitImpersonation={onExitImpersonation} />;
    case 'hymn_report_input': return <HymnReportInputScreen onGenerate={(s: any, e: any, t: any) => navigate('hymn_report', {s, e, t})} onCancel={goBack} onExitImpersonation={onExitImpersonation} />;
    default: return <HomeScreen navigate={navigate} onLogout={onLogout} isReadOnly={isReadOnly} isAdmin={isAdmin} onProfileClick={() => setScreen('profile')} onExitImpersonation={onExitImpersonation} />;
  }
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);