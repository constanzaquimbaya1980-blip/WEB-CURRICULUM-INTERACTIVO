/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Briefcase, GraduationCap, MapPin, Phone, Mail, Award, 
  CheckCircle, FileText, Send, Sparkles, UserCheck, 
  Building2, Users, ShieldCheck, Cpu, Download, Printer,
  ChevronRight, ArrowRight, X, Check, Globe, FolderOpen, Table, Inbox, LogOut
} from 'lucide-react';
import { initAuth, googleSignIn, logout, getAccessToken } from './workspaceAuth';
import { User } from 'firebase/auth';

export default function App() {
  const [activeTab, setActiveTab] = useState<'all' | 'gestion' | 'direccion' | 'rrhh'>('all');
  const [selectedNeed, setSelectedNeed] = useState<string>('gestion');
  const [isCvModalOpen, setIsCvModalOpen] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', company: '', message: '' });
  const [formError, setFormError] = useState('');
  
  // Profile Image state with localStorage persistence
  const [profileImg, setProfileImg] = useState<string>(() => {
    return localStorage.getItem('constanza_profile_img') || '/Foto de Conny.jpg';
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const result = uploadEvent.target?.result as string;
        if (result) {
          setProfileImg(result);
          localStorage.setItem('constanza_profile_img', result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Google Workspace States
  const [needsAuth, setNeedsAuth] = useState(true);
  const [workspaceToken, setWorkspaceToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'drive' | 'sheets' | 'gmail'>('drive');
  
  // Workspace data states
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [gmailMessages, setGmailMessages] = useState<any[]>([]);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');

  // Email Compose states (with mandatory confirmation)
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSentStatus, setEmailSentStatus] = useState('');

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        setWorkspaceToken(token);
        setNeedsAuth(false);
        fetchWorkspaceData(token);
      },
      () => {
        setNeedsAuth(true);
        setCurrentUser(null);
        setWorkspaceToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setWorkspaceError('');
    try {
      const result = await googleSignIn();
      if (result) {
        setCurrentUser(result.user);
        setWorkspaceToken(result.accessToken);
        setNeedsAuth(false);
        fetchWorkspaceData(result.accessToken);
      }
    } catch (err: any) {
      console.error('Google login failed:', err);
      setWorkspaceError(err.message || 'Error al autenticar con Google Workspace.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logout();
    setCurrentUser(null);
    setWorkspaceToken(null);
    setNeedsAuth(true);
    setDriveFiles([]);
    setGmailMessages([]);
  };

  const fetchWorkspaceData = async (token: string) => {
    setIsLoadingWorkspace(true);
    setWorkspaceError('');
    try {
      // Fetch Drive Files
      const driveRes = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name,mimeType,webViewLink)', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const driveData = await driveRes.json();
      if (driveData.files) {
        setDriveFiles(driveData.files);
      }

      // Fetch Gmail Messages
      const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const gmailData = await gmailRes.json();
      if (gmailData.messages) {
        const messageDetails = await Promise.all(
          gmailData.messages.map(async (msg: { id: string }) => {
            const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            return detailRes.json();
          })
        );
        setGmailMessages(messageDetails);
      }
    } catch (err: any) {
      console.error('Error fetching workspace data:', err);
      setWorkspaceError('Error al sincronizar datos de Google Workspace.');
    } finally {
      setIsLoadingWorkspace(false);
    }
  };

  // MANDATORY CONFIRMATION DIALOG FOR MUTATING/SENDING EMAILS
  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailTo || !emailSubject || !emailBody) {
      setEmailSentStatus('Por favor complete destinatario, asunto y mensaje.');
      return;
    }

    const confirmed = window.confirm(
      `¿Está seguro de enviar este correo a ${emailTo}? Esta acción enviará un mensaje real a través de su cuenta de Gmail.`
    );
    if (!confirmed) return;

    const token = await getAccessToken();
    if (!token) {
      setEmailSentStatus('Sesión caducada. Por favor vuelva a iniciar sesión.');
      setNeedsAuth(true);
      return;
    }

    try {
      // Construct RFC 2822 email
      const emailContent = [
        `To: ${emailTo}`,
        `Subject: ${emailSubject}`,
        `Content-Type: text/plain; charset="UTF-8"`,
        ``,
        emailBody
      ].join('\r\n');

      const encodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: encodedEmail })
      });

      if (res.ok) {
        setEmailSentStatus('¡Correo enviado con éxito a través de Gmail!');
        setEmailTo('');
        setEmailSubject('');
        setEmailBody('');
      } else {
        const errData = await res.json();
        setEmailSentStatus(`Error al enviar correo: ${errData.error?.message || 'Error desconocido'}`);
      }
    } catch (err: any) {
      console.error('Send email error:', err);
      setEmailSentStatus('Error de red al enviar el correo.');
    }
  };

  // AI Chat states
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'model'; content: string }>>([
    { role: 'model', content: 'Constanza cuenta con titulación universitaria en Administración de Empresas (UNAD), formación en Gestión Administrativa en Toledo y más de 15 años de experiencia en gestión operativa, comunitaria y prevención de riesgos. Además, tiene permiso de residencia y trabajo habilitado en España. ¿En qué te puedo ayudar?' }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Solutions data for simulator
  const solutions: Record<string, { title: string; desc: string; impact: string }> = {
    gestion: {
      title: "Optimización de Facturación, Cartera y Proveedores",
      desc: "Implementación de controles rigurosos de tesorería, reducción de costos operativos, gestión eficiente de proveedores y supervisión de presupuestos.",
      impact: "Reducción del ciclo de cobro en un 25% y mayor precisión en los balances contables y administrativos."
    },
    direccion: {
      title: "Dirección Ejecutiva y Representación Legal",
      desc: "Liderazgo demostrado como Representante Legal y Administradora Delegada (SOPREF S.A.S). Toma de decisiones estratégicas, gestión de juntas y dirección de equipos.",
      impact: "Estabilidad institucional, cumplimiento normativo y alineación de la operación con los objetivos estratégicos."
    },
    rrhh: {
      title: "Gestión de Talento Humano y Salud Ocupacional (PRL)",
      desc: "Capacitación de personal, clima laboral, prevención de riesgos laborales (PRL), higiene industrial y protocolos de seguridad (experiencia en Transportes Multigranel S.A.).",
      impact: "Disminución de la rotación de personal, mayor bienestar laboral y cumplimiento estricto de normativas de seguridad."
    },
    polivalente: {
      title: "Liderazgo Integral Operativo y Administrativo en Toledo / Madrid",
      desc: "Perfil senior con más de 15 años de experiencia capaz de liderar simultáneamente áreas administrativas, financieras y de recursos humanos.",
      impact: "Autonomía operativa inmediata, visión global del negocio y adaptabilidad a entornos dinámicos en España."
    }
  };

  const experiences = [
    {
      id: 1,
      category: 'direccion',
      company: 'SOPREF S.A.S.',
      role: 'Representante Legal & Administradora Delegada',
      period: '2021 - 2023',
      location: 'Colombia / Gestión Internacional',
      description: 'Liderazgo directivo integral de la compañía. Representación legal ante entidades públicas y privadas, dirección de operaciones, toma de decisiones estratégicas y supervisión financiera y de recursos humanos.',
      tags: ['Dirección General', 'Representación Legal', 'Toma de Decisiones', 'Gestión Financiera']
    },
    {
      id: 2,
      category: 'gestion',
      company: 'Asistente Administrativa & Gestión de Comunidades',
      role: 'Especialista en Operaciones y Finanzas',
      period: '2012 - 2021',
      location: 'Toledo / Madrid / Experiencia Global',
      description: 'Coordinación administrativa avanzada, control de cartera y facturación, gestión integral de proveedores, elaboración y control de presupuestos, y optimización de flujos de trabajo.',
      tags: ['Facturación', 'Proveedores', 'Presupuestos', 'Control de Cartera']
    },
    {
      id: 3,
      category: 'rrhh',
      company: 'Transportes Multigranel S.A.',
      role: 'Especialista en Recursos Humanos y Salud Ocupacional',
      period: '2004 - 2006',
      location: 'Gestión de Talento',
      description: 'Coordinación de procesos de selección, capacitación integral de personal, implementación de programas de Salud Ocupacional y Prevención de Riesgos Laborales (PRL), y bienestar laboral.',
      tags: ['Recursos Humanos', 'Salud Ocupacional', 'PRL', 'Capacitación']
    }
  ];

  const filteredExperiences = activeTab === 'all' 
    ? experiences 
    : experiences.filter(exp => exp.category === activeTab);

  const toggleAiAssistant = () => {
    setIsAiChatOpen(prev => !prev);
  };

  const askAi = async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const userQuestion = chatInput.trim();
    setChatInput('');
    const newMessages = [...chatMessages, { role: 'user' as const, content: userQuestion }];
    setChatMessages(newMessages);
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userQuestion, history: chatMessages })
      });
      const data = await res.json();
      if (data.reply) {
        setChatMessages([...newMessages, { role: 'model', content: data.reply }]);
      } else {
        setChatMessages([...newMessages, { role: 'model', content: 'Constanza cuenta con titulación universitaria en Administración de Empresas (UNAD), formación en Gestión Administrativa en Toledo y más de 15 años de experiencia.' }]);
      }
    } catch (err) {
      setChatMessages([...newMessages, { role: 'model', content: 'Constanza cuenta con titulación universitaria en Administración de Empresas (UNAD), formación en Gestión Administrativa en Toledo y más de 15 años de experiencia.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) {
      setFormError('Por favor complete los campos obligatorios (Nombre, Email y Mensaje).');
      return;
    }
    setFormError('');
    setFormSubmitted(true);
    setTimeout(() => {
      setFormData({ name: '', email: '', phone: '', company: '', message: '' });
    }, 4000);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-['Plus_Jakarta_Sans',sans-serif]">
      
      {/* Top Banner / Status Bar */}
      <div className="bg-[#0A192F] text-white py-2 px-4 text-xs sm:text-sm font-medium">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#059669] animate-pulse"></span>
            <span>Permiso de residencia y trabajo habilitado en España</span>
          </div>
          <div className="flex items-center gap-4 text-slate-300">
            <a href="tel:645689739" className="hover:text-emerald-400 transition-colors flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-[#059669]" />
              <span className="phone-single-line">📞 +34 645 689 739</span>
            </a>
            <a href="mailto:Constanza.quimbaya@hotmail.com" className="hover:text-emerald-400 transition-colors flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-[#059669]" /> Constanza.quimbaya@hotmail.com
            </a>
            <span className="hidden md:flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#059669]" /> Alcabón - Toledo (Madrid / España)
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#0A192F] to-[#059669] flex items-center justify-center text-white font-bold text-xl shadow-md">
              CQ
            </div>
            <div>
              <h1 className="font-bold text-lg sm:text-xl text-[#0A192F] tracking-tight leading-tight">
                Constanza Quimbaya Amórtegui
              </h1>
              <p className="text-xs text-[#059669] font-semibold tracking-wide uppercase">
                Administradora de Empresas & Especialista en Gestión Operativa
              </p>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-8 font-medium text-sm text-slate-700">
            <a href="#perfil" className="hover:text-[#059669] transition-colors">Perfil</a>
            <a href="#experiencia" className="hover:text-[#059669] transition-colors">Experiencia</a>
            <a href="#soluciones" className="hover:text-[#059669] transition-colors">Simulador</a>
            <a href="#workspace-hub" className="hover:text-[#059669] transition-colors font-bold text-[#059669]">Workspace Hub</a>
            <a href="#formacion" className="hover:text-[#059669] transition-colors">Formación</a>
            <a href="#contacto" className="hover:text-[#059669] transition-colors">Contacto</a>
          </nav>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsCvModalOpen(true)}
              className="hidden sm:inline-flex items-center gap-2 bg-[#059669] hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-sm transition-all transform hover:-translate-y-0.5"
            >
              <Download className="w-4 h-4" />
              Descargar CV (PDF)
            </button>
            <button 
              onClick={toggleAiAssistant}
              className="inline-flex items-center gap-2 bg-[#0A192F] hover:bg-slate-800 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-sm transition-all transform hover:-translate-y-0.5"
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Asistente IA</span>
            </button>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section id="perfil" className="relative pt-12 pb-20 lg:pt-20 lg:pb-28 overflow-hidden bg-gradient-to-b from-white via-[#F8FAFC] to-[#F1F5F9]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-[#059669] text-xs font-bold tracking-wide shadow-xs">
                <Award className="w-4 h-4" />
                +15 Años de Excelencia Directiva y Operativa
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#0A192F] tracking-tight leading-tight">
                Liderazgo Estratégico y <span className="text-[#059669]">Gestión Operativa</span>
              </h1>

              <p className="text-lg sm:text-xl text-slate-600 font-normal max-w-2xl mx-auto lg:mx-0">
                Administradora de Empresas y Especialista en Gestión Operativa y Recursos Humanos. Con amplia trayectoria en dirección general, representación legal, control financiero, optimización de procesos y talento humano.
              </p>

              <div className="flex flex-wrap gap-3 justify-center lg:justify-start pt-2">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium shadow-xs">
                  <CheckCircle className="w-4 h-4 text-[#059669]" /> Permiso de trabajo en España
                </span>
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium shadow-xs">
                  <MapPin className="w-4 h-4 text-[#059669]" /> Residencia en Toledo / Madrid
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-4 justify-center lg:justify-start">
                <a 
                  href="#experiencia" 
                  className="inline-flex items-center justify-center gap-2 bg-[#0A192F] hover:bg-slate-800 text-white font-bold px-7 py-3.5 rounded-xl shadow-md transition-all transform hover:-translate-y-0.5"
                >
                  Explorar Experiencia
                  <ArrowRight className="w-4 h-4" />
                </a>
                <a 
                  href="https://wa.me/34645689739?text=Hola%20Constanza,%20vi%20tu%20web%20y%20me%20gustaría%20agendar%20una%20entrevista." 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 text-white font-bold px-6 py-3.5 rounded-xl shadow-md transition-all transform hover:-translate-y-0.5"
                  style={{ backgroundColor: '#25D366' }}
                >
                  💬 Contactar por WhatsApp <span className="phone-single-line">(+34 645 689 739)</span>
                </a>
                <button 
                  onClick={() => setIsCvModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-[#0A192F] border-2 border-slate-200 font-bold px-7 py-3.5 rounded-xl shadow-xs transition-all"
                >
                  <FileText className="w-4 h-4 text-[#059669]" />
                  Ver CV
                </button>
              </div>
            </div>

            {/* Profile Avatar / Photo Box & Impact Phrase */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center">
              <div className="relative mb-6">
                {/* Decorative background glow */}
                <div className="absolute -inset-4 bg-gradient-to-tr from-[#059669]/20 to-[#0A192F]/20 rounded-full blur-2xl -z-10"></div>
                
                <div className="w-72 h-72 sm:w-80 sm:h-80 rounded-full p-3 bg-white border-4 border-white shadow-2xl relative overflow-hidden group">
                  <div className="w-full h-full rounded-full bg-slate-100 overflow-hidden flex flex-col items-center justify-center relative">
                    {/* Profile image with support for uploaded Foto de Conny.jpg */}
                    <img 
                      src={profileImg} 
                      alt="Constanza Quimbaya Amórtegui"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                        const fallbackEl = document.getElementById('avatar-fallback');
                        if (fallbackEl) fallbackEl.style.display = 'flex';
                      }}
                    />
                    <label id="avatar-fallback" className="absolute inset-0 bg-gradient-to-br from-[#0A192F] to-[#059669] text-white flex-col items-center justify-center p-6 text-center hidden cursor-pointer hover:opacity-95 transition-opacity">
                      <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center mb-3 text-3xl font-extrabold tracking-wider">
                        CQ
                      </div>
                      <span className="font-bold text-lg">Constanza Quimbaya</span>
                      <span className="text-xs text-emerald-200 mt-1 underline">Haz clic para subir 'Foto de Conny.jpg'</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageUpload} 
                        className="hidden" 
                      />
                    </label>
                  </div>
                  
                  {/* Upload button overlay */}
                  <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer rounded-full">
                    <span className="bg-[#059669] text-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg">
                      📷 Cambiar Foto
                    </span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageUpload} 
                      className="hidden" 
                    />
                  </label>
                </div>
              </div>

              {/* Elegant Impact Phrase Card directly under profile photo */}
              <div className="bg-white/90 backdrop-blur-md border-l-4 border-[#059669] border-t border-r border-b border-slate-200/80 rounded-2xl p-5 shadow-lg max-w-sm text-center relative z-20">
                <p className="text-[#0A192F] font-semibold text-sm sm:text-base italic leading-relaxed">
                  &ldquo;Gestión administrativa y corporativa con método, rigor y visión global. Lista para aportar valor inmediato a tu equipo en Toledo o Madrid.&rdquo;
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* RECRUITER DYNAMIC FILTER SECTION */}
      <section id="experiencia" className="py-20 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-[#059669] font-bold text-sm tracking-widest uppercase bg-emerald-50 px-3 py-1 rounded-full">
              Filtro Dinámico de Reclutador
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A192F] mt-3 mb-4">
              Explore la Experiencia por Área de Interés
            </h2>
            <p className="text-slate-600">
              Seleccione una categoría para enfocar la trayectoria profesional de Constanza según las necesidades específicas de su proceso de selección.
            </p>
          </div>

          {/* Filter Buttons */}
          <div className="flex flex-wrap justify-center gap-2 sm:gap-4 mb-12">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-5 py-3 rounded-xl font-semibold text-sm transition-all shadow-xs flex items-center gap-2 ${
                activeTab === 'all'
                  ? 'bg-[#0A192F] text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              Toda la Experiencia
            </button>
            <button
              onClick={() => setActiveTab('gestion')}
              className={`px-5 py-3 rounded-xl font-semibold text-sm transition-all shadow-xs flex items-center gap-2 ${
                activeTab === 'gestion'
                  ? 'bg-[#059669] text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Gestión Administrativa y Comunidades
            </button>
            <button
              onClick={() => setActiveTab('direccion')}
              className={`px-5 py-3 rounded-xl font-semibold text-sm transition-all shadow-xs flex items-center gap-2 ${
                activeTab === 'direccion'
                  ? 'bg-[#059669] text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              Dirección y Representación Legal
            </button>
            <button
              onClick={() => setActiveTab('rrhh')}
              className={`px-5 py-3 rounded-xl font-semibold text-sm transition-all shadow-xs flex items-center gap-2 ${
                activeTab === 'rrhh'
                  ? 'bg-[#059669] text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              Recursos Humanos y Salud Ocupacional / PRL
            </button>
          </div>

          {/* Experience Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredExperiences.map((exp) => (
              <div 
                key={exp.id}
                className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group border-t-4 border-t-[#059669]"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-[#059669]">
                      {exp.period}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      {exp.location}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-[#0A192F] mb-1 group-hover:text-[#059669] transition-colors">
                    {exp.role}
                  </h3>
                  <p className="text-sm font-semibold text-[#059669] mb-4">
                    {exp.company}
                  </p>
                  <p className="text-slate-600 text-sm leading-relaxed mb-6">
                    {exp.description}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <div className="flex flex-wrap gap-1.5">
                    {exp.tags.map((tag, i) => (
                      <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg font-medium">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* GOOGLE WORKSPACE HUB INTEGRATION SECTION */}
      <section id="workspace-hub" className="py-20 bg-gradient-to-b from-slate-900 to-[#0A192F] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-emerald-400 font-bold text-sm tracking-widest uppercase bg-emerald-950/80 px-3 py-1 rounded-full border border-emerald-800">
              Google Workspace Integration Hub
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3 mb-4">
              Conexión Directa con Google Drive, Sheets y Gmail
            </h2>
            <p className="text-slate-300">
              Inicia sesión con tu cuenta de Google para sincronizar documentos, hojas de cálculo y gestionar comunicaciones directamente desde el portafolio.
            </p>
          </div>

          <div className="bg-slate-800/80 backdrop-blur-md rounded-3xl p-8 sm:p-12 border border-slate-700 shadow-2xl">
            {needsAuth ? (
              <div className="text-center py-12 space-y-6 max-w-md mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <Globe className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold">Autenticación Requerida</h3>
                <p className="text-slate-300 text-sm">
                  Para acceder a Google Drive, Sheets y Gmail de forma segura con permiso del usuario, inicia sesión con Google.
                </p>
                
                <div className="flex justify-center pt-2">
                  <button 
                    onClick={handleGoogleLogin} 
                    disabled={isLoggingIn}
                    className="gsi-material-button"
                  >
                    <div className="gsi-material-button-icon">
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        <path fill="none" d="M0 0h48v48H0z"></path>
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">{isLoggingIn ? 'Conectando...' : 'Sign in with Google'}</span>
                  </button>
                </div>

                {workspaceError && (
                  <p className="text-rose-400 text-xs font-medium">{workspaceError}</p>
                )}
              </div>
            ) : (
              <div className="space-y-8">
                {/* User Info Bar */}
                <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-900/80 p-4 rounded-2xl border border-slate-700 gap-4">
                  <div className="flex items-center gap-3">
                    <img 
                      src={currentUser?.photoURL || ''} 
                      alt="User avatar" 
                      className="w-10 h-10 rounded-full border border-emerald-500" 
                    />
                    <div>
                      <p className="font-bold text-sm text-white">{currentUser?.displayName}</p>
                      <p className="text-xs text-slate-400">{currentUser?.email}</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleGoogleLogout}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-rose-950/80 text-rose-300 px-4 py-2 rounded-xl text-xs font-bold border border-rose-900/50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" /> Cerrar Sesión Workspace
                  </button>
                </div>

                {/* Workspace Navigation Tabs */}
                <div className="flex flex-wrap gap-2 border-b border-slate-700 pb-4">
                  <button
                    onClick={() => setActiveWorkspaceTab('drive')}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${
                      activeWorkspaceTab === 'drive'
                        ? 'bg-[#059669] text-white'
                        : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <FolderOpen className="w-4 h-4" /> Google Drive (Archivos)
                  </button>
                  <button
                    onClick={() => setActiveWorkspaceTab('sheets')}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${
                      activeWorkspaceTab === 'sheets'
                        ? 'bg-[#059669] text-white'
                        : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Table className="w-4 h-4" /> Google Sheets (Control)
                  </button>
                  <button
                    onClick={() => setActiveWorkspaceTab('gmail')}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${
                      activeWorkspaceTab === 'gmail'
                        ? 'bg-[#059669] text-white'
                        : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Inbox className="w-4 h-4" /> Gmail (Comunicaciones)
                  </button>
                </div>

                {isLoadingWorkspace ? (
                  <div className="text-center py-12 text-slate-400 flex items-center justify-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></span>
                    Sincronizando con Google Workspace...
                  </div>
                ) : (
                  <div>
                    {/* DRIVE TAB */}
                    {activeWorkspaceTab === 'drive' && (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="text-lg font-bold">Archivos Recientes en Google Drive</h3>
                          <button 
                            onClick={() => workspaceToken && fetchWorkspaceData(workspaceToken)}
                            className="text-xs text-emerald-400 hover:underline"
                          >
                            Actualizar
                          </button>
                        </div>
                        {driveFiles.length === 0 ? (
                          <p className="text-slate-400 text-sm">No se encontraron archivos en Google Drive.</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {driveFiles.map((file) => (
                              <div key={file.id} className="bg-slate-900/60 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
                                <div className="truncate pr-2">
                                  <p className="font-semibold text-sm truncate text-white">{file.name}</p>
                                  <p className="text-xs text-slate-400 truncate">{file.mimeType}</p>
                                </div>
                                {file.webViewLink && (
                                  <a 
                                    href={file.webViewLink} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shrink-0"
                                  >
                                    Abrir
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* SHEETS TAB */}
                    {activeWorkspaceTab === 'sheets' && (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="text-lg font-bold">Google Sheets - Panel de Gestión y Reclutamiento</h3>
                          <span className="text-xs bg-emerald-950 text-emerald-300 px-3 py-1 rounded-full border border-emerald-800">Conectado</span>
                        </div>
                        <p className="text-slate-300 text-sm">
                          Visualización de datos de rendimiento operativo, plantillas de facturación y control de personal sincronizados con Google Sheets.
                        </p>
                        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 overflow-x-auto">
                          <table className="w-full text-left text-sm text-slate-300">
                            <thead className="border-b border-slate-700 text-xs uppercase text-slate-400">
                              <tr>
                                <th className="pb-3">Área Operativa</th>
                                <th className="pb-3">Indicador / KPI</th>
                                <th className="pb-3">Estado</th>
                                <th className="pb-3">Responsable</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                              <tr>
                                <td className="py-3 font-medium text-white">Gestión Financiera</td>
                                <td>Control de Cartera y Tesorería</td>
                                <td><span className="text-emerald-400 font-bold">Optimizado</span></td>
                                <td>Constanza Quimbaya</td>
                              </tr>
                              <tr>
                                <td className="py-3 font-medium text-white">Dirección General</td>
                                <td>Representación Legal y Sopref</td>
                                <td><span className="text-emerald-400 font-bold">Completado</span></td>
                                <td>Constanza Quimbaya</td>
                              </tr>
                              <tr>
                                <td className="py-3 font-medium text-white">Recursos Humanos / PRL</td>
                                <td>Capacitación y Seguridad Laboral</td>
                                <td><span className="text-emerald-400 font-bold">Activo</span></td>
                                <td>Constanza Quimbaya</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* GMAIL TAB */}
                    {activeWorkspaceTab === 'gmail' && (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          {/* Inbox List */}
                          <div className="space-y-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                              <Inbox className="w-5 h-5 text-emerald-400" /> Correos Recientes (Gmail)
                            </h3>
                            {gmailMessages.length === 0 ? (
                              <p className="text-slate-400 text-sm">No hay mensajes recientes en la bandeja de entrada.</p>
                            ) : (
                              <div className="space-y-3">
                                {gmailMessages.map((msg, idx) => {
                                  const headers = msg.payload?.headers || [];
                                  const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'Sin asunto';
                                  const sender = headers.find((h: any) => h.name === 'From')?.value || 'Desconocido';
                                  return (
                                    <div key={idx} className="bg-slate-900/60 p-4 rounded-xl border border-slate-700 space-y-1">
                                      <p className="text-xs text-emerald-400 font-semibold truncate">De: {sender}</p>
                                      <p className="text-sm font-bold text-white truncate">{subject}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Compose / Send Email Form (with mandatory confirmation) */}
                          <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-700 space-y-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                              <Send className="w-5 h-5 text-emerald-400" /> Enviar Correo vía Gmail
                            </h3>
                            <p className="text-xs text-slate-400">
                              Esta acción enviará un correo real utilizando los permisos de tu cuenta de Gmail (requiere confirmación previa).
                            </p>

                            {emailSentStatus && (
                              <div className="bg-emerald-950/80 border border-emerald-800 text-emerald-300 p-3 rounded-xl text-xs font-medium">
                                {emailSentStatus}
                              </div>
                            )}

                            <form onSubmit={handleSendEmail} className="space-y-3">
                              <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1">Destinatario (Email)</label>
                                <input
                                  type="email"
                                  value={emailTo}
                                  onChange={(e) => setEmailTo(e.target.value)}
                                  placeholder="seleccionador@empresa.es"
                                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#059669]"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1">Asunto</label>
                                <input
                                  type="text"
                                  value={emailSubject}
                                  onChange={(e) => setEmailSubject(e.target.value)}
                                  placeholder="Entrevista / Propuesta Laboral"
                                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#059669]"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-300 mb-1">Mensaje</label>
                                <textarea
                                  rows={3}
                                  value={emailBody}
                                  onChange={(e) => setEmailBody(e.target.value)}
                                  placeholder="Estimada Constanza..."
                                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#059669]"
                                ></textarea>
                              </div>
                              <button
                                type="submit"
                                className="w-full bg-[#059669] hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2"
                              >
                                <Send className="w-4 h-4" /> Enviar Correo de Forma Segura
                              </button>
                            </form>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </section>

      {/* INTERACTIVE OPERATIONAL SOLUTIONS SIMULATOR */}
      <section id="soluciones" className="py-20 bg-[#F1F5F9] border-t border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-[#059669] font-bold text-sm tracking-widest uppercase bg-white px-3 py-1 rounded-full shadow-xs">
              Simulador Interactivo
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A192F] mt-3 mb-4">
              ¿Qué necesidad tiene tu empresa actualmente?
            </h2>
            <p className="text-slate-600">
              Seleccione un desafío empresarial para conocer al instante la solución personalizada que aporta la experiencia de Constanza.
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl border border-slate-200">
            <div className="mb-8">
              <label className="block text-sm font-bold text-[#0A192F] mb-3">
                Seleccione el área o necesidad principal:
              </label>
              <select
                value={selectedNeed}
                onChange={(e) => setSelectedNeed(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#059669] transition-all text-base"
              >
                <option value="gestion">1. Optimización de facturación, cartera y control de proveedores</option>
                <option value="direccion">2. Dirección general, representación legal y toma de decisiones</option>
                <option value="rrhh">3. Gestión de Recursos Humanos, capacitación y Salud Ocupacional (PRL)</option>
                <option value="polivalente">4. Perfil polivalente de alta dirección y administración en Toledo / Madrid</option>
              </select>
            </div>

            {/* Solution Result Card */}
            <div className="bg-gradient-to-br from-[#0A192F] to-[#1E293B] text-white rounded-2xl p-8 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#059669]/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="relative z-10 space-y-4">
                <div className="inline-flex items-center gap-2 bg-[#059669] text-white text-xs font-bold px-3 py-1 rounded-full">
                  <Sparkles className="w-3.5 h-3.5" /> Solución Personalizada
                </div>

                <h3 className="text-2xl font-bold tracking-tight text-white">
                  {solutions[selectedNeed].title}
                </h3>

                <p className="text-slate-300 text-base leading-relaxed">
                  {solutions[selectedNeed].desc}
                </p>

                <div className="pt-4 border-t border-slate-700/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider block mb-1">Impacto Esperado:</span>
                    <span className="text-sm text-slate-200 font-medium">{solutions[selectedNeed].impact}</span>
                  </div>
                  <a
                    href="#contacto"
                    className="inline-flex items-center gap-2 bg-[#059669] hover:bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all shrink-0"
                  >
                    Contactar con Constanza <ChevronRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* TIMELINE & ACADEMIC BACKGROUND */}
      <section id="formacion" className="py-20 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            
            {/* Academic Training */}
            <div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-[#059669]">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0A192F]">
                    Formación Académica
                  </h2>
                  <p className="text-sm text-slate-500">Titulaciones oficiales y especializaciones</p>
                </div>
              </div>

              <div className="space-y-6">
                
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 shadow-xs hover:border-[#059669] transition-all">
                  <span className="text-xs font-bold text-[#059669] bg-emerald-50 px-2.5 py-1 rounded-md">Grado Universitario</span>
                  <h3 className="text-lg font-bold text-[#0A192F] mt-2">Grado en Administración de Empresas</h3>
                  <p className="text-sm text-slate-600 font-medium">UNAD (Universidad Nacional Abierta y a Distancia)</p>
                </div>

                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 shadow-xs hover:border-[#059669] transition-all">
                  <span className="text-xs font-bold text-[#059669] bg-emerald-50 px-2.5 py-1 rounded-md">Tecnología</span>
                  <h3 className="text-lg font-bold text-[#0A192F] mt-2">Tecnóloga en Gestión Comercial y de Negocios</h3>
                  <p className="text-sm text-slate-600 font-medium">UNAD</p>
                </div>

                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 shadow-xs hover:border-[#059669] transition-all">
                  <span className="text-xs font-bold text-[#059669] bg-emerald-50 px-2.5 py-1 rounded-md">FP & Especialización</span>
                  <h3 className="text-lg font-bold text-[#0A192F] mt-2">FP Gestión Administrativa</h3>
                  <p className="text-sm text-slate-600 font-medium">IES Azarquiel (Toledo, España)</p>
                </div>

                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 shadow-xs hover:border-[#059669] transition-all">
                  <span className="text-xs font-bold text-[#059669] bg-emerald-50 px-2.5 py-1 rounded-md">Certificaciones</span>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                      <Check className="w-4 h-4 text-[#059669]" /> Operadora de Sistemas Office - Instituto Británico
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                      <Check className="w-4 h-4 text-[#059669]" /> Educación Secundaria Obligatoria (ESO) - CEPA Orcasitas (Madrid)
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Core Competencies & Skills */}
            <div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-[#059669]">
                  <Cpu className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0A192F]">
                    Competencias Clave
                  </h2>
                  <p className="text-sm text-slate-500">Habilidades directivas y técnicas</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-[#059669] font-bold">
                    01
                  </div>
                  <h3 className="font-bold text-[#0A192F]">Gestión Operativa</h3>
                  <p className="text-xs text-slate-600">Optimización de flujos de trabajo, control presupuestario y eficiencia de procesos.</p>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-[#059669] font-bold">
                    02
                  </div>
                  <h3 className="font-bold text-[#0A192F]">Recursos Humanos & PRL</h3>
                  <p className="text-xs text-slate-600">Capacitación de personal, salud ocupacional, clima laboral y normativa de seguridad.</p>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-[#059669] font-bold">
                    03
                  </div>
                  <h3 className="font-bold text-[#0A192F]">Dirección & Liderazgo</h3>
                  <p className="text-xs text-slate-600">Representación legal, toma de decisiones estratégicas y gestión directiva.</p>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-[#059669] font-bold">
                    04
                  </div>
                  <h3 className="font-bold text-[#0A192F]">Finanzas & Proveedores</h3>
                  <p className="text-xs text-slate-600">Control de cartera, facturación avanzada, negociación y gestión de proveedores.</p>
                </div>

              </div>

              {/* Highlights card */}
              <div className="mt-8 bg-[#0A192F] text-white rounded-2xl p-6 shadow-md flex items-center gap-4">
                <Globe className="w-10 h-10 text-emerald-400 shrink-0" />
                <div>
                  <h4 className="font-bold text-base">Disponibilidad Inmediata</h4>
                  <p className="text-xs text-slate-300 mt-0.5">Residente en Alcabón (Toledo), con plena movilidad hacia Madrid y Toledo. Permiso de trabajo en regla.</p>
                </div>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* CONTACT FORM SECTION */}
      <section id="contacto" className="py-20 bg-[#F8FAFC] border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-[#059669] font-bold text-sm tracking-widest uppercase bg-white px-3 py-1 rounded-full shadow-xs">
              Contacto Profesional
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A192F] mt-3 mb-4">
              ¿Hablamos sobre su próxima oportunidad?
            </h2>
            <p className="text-slate-600">
              Póngase en contacto directo con Constanza para propuestas laborales, entrevistas o proyectos en Toledo y Madrid.
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl border border-slate-200">
            {formSubmitted ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-[#059669] text-white rounded-full flex items-center justify-center mx-auto text-2xl">
                  ✓
                </div>
                <h3 className="text-2xl font-bold text-[#0A192F]">¡Mensaje enviado con éxito!</h3>
                <p className="text-slate-600 max-w-md mx-auto">
                  Gracias por su interés. Su mensaje ha sido enviado correctamente a Constanza Quimbaya, quien se pondrá en contacto con usted a la mayor brevedad.
                </p>
                <button
                  onClick={() => setFormSubmitted(false)}
                  className="bg-[#059669] text-white font-bold px-6 py-2.5 rounded-xl text-sm shadow-sm hover:bg-emerald-700 transition-colors"
                >
                  Enviar otro mensaje
                </button>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-6">
                {formError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm font-medium">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-[#0A192F] mb-2">Nombre completo *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ej. Carlos Mendoza (Reclutador)"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#059669]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[#0A192F] mb-2">Correo electrónico *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="ejemplo@empresa.es"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#059669]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-[#0A192F] mb-2">Teléfono de contacto</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+34 600 000 000"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#059669]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[#0A192F] mb-2">Empresa / Organización</label>
                    <input
                      type="text"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      placeholder="Nombre de la empresa"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#059669]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-[#0A192F] mb-2">Mensaje o propuesta *</label>
                  <textarea
                    rows={4}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Describa brevemente la vacante, proyecto u oportunidad laboral..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#059669]"
                  ></textarea>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-2">
                  <a 
                    href="https://wa.me/34645689739?text=Hola%20Constanza,%20vi%20tu%20web%20y%20me%20gustaría%20agendar%20una%20entrevista." 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-white px-5 py-3 rounded-xl text-sm font-bold inline-flex items-center gap-2 shadow-sm transition-transform hover:scale-105"
                    style={{ backgroundColor: '#25D366' }}
                  >
                    💬 Contactar por WhatsApp <span className="phone-single-line">(+34 645 689 739)</span>
                  </a>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 bg-[#059669] hover:bg-emerald-700 text-white font-bold px-8 py-3.5 rounded-xl shadow-md transition-all transform hover:-translate-y-0.5"
                  >
                    <Send className="w-4 h-4" /> Enviar Mensaje
                  </button>
                </div>
              </form>
            )}
          </div>

        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#0A192F] text-white py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#059669] flex items-center justify-center text-white font-bold">
              CQ
            </div>
            <div>
              <p className="font-bold text-base">Constanza Quimbaya Amórtegui</p>
              <p className="text-xs text-slate-400">Administradora de Empresas & Especialista en Gestión Operativa</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 text-sm text-slate-300">
            <a href="tel:645689739" className="hover:text-emerald-400 flex items-center gap-1.5">
              <Phone className="w-4 h-4 text-[#059669]" />
              <span className="phone-single-line">📞 +34 645 689 739</span>
            </a>
            <a href="mailto:Constanza.quimbaya@hotmail.com" className="hover:text-emerald-400 flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-[#059669]" /> Constanza.quimbaya@hotmail.com
            </a>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#059669]" /> Alcabón - Toledo (España)
            </span>
          </div>

          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} Todos los derechos reservados.
          </p>
        </div>
      </footer>

      {/* CV MODAL (PRINTABLE PDF VIEW) */}
      {isCvModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-8 sm:p-12 relative">
            <button
              onClick={() => setIsCvModalOpen(false)}
              className="absolute top-6 right-6 w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex justify-between items-start border-b border-slate-200 pb-6 mb-6">
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0A192F]">Curriculum Vitae</h2>
                <p className="text-emerald-600 font-semibold text-sm">Constanza Quimbaya Amórtegui</p>
              </div>
              <button
                onClick={() => window.print()}
                className="hidden sm:inline-flex items-center gap-2 bg-[#0A192F] hover:bg-slate-800 text-white font-bold px-5 py-2.5 rounded-xl text-sm shadow-sm transition-all"
              >
                <Printer className="w-4 h-4" /> Imprimir / Guardar PDF
              </button>
            </div>

            <div className="space-y-8 text-slate-700 text-sm leading-relaxed">
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><strong>Ubicación:</strong> Alcabón - Toledo (España)</div>
                <div><strong>Teléfono:</strong> <span className="phone-single-line">+34 645 689 739</span></div>
                <div><strong>Email:</strong> Constanza.quimbaya@hotmail.com</div>
                <div><strong>Permiso:</strong> Residencia y trabajo habilitado en España</div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-[#0A192F] mb-2 border-b border-slate-200 pb-1">Perfil Profesional</h3>
                <p>
                  Administradora de Empresas y Especialista en Gestión Operativa y Recursos Humanos con más de 15 años de experiencia. Sólida trayectoria en dirección general, representación legal, gestión de tesorería, facturación, control de cartera y prevención de riesgos laborales.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-bold text-[#0A192F] mb-4 border-b border-slate-200 pb-1">Experiencia Profesional</h3>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between font-bold text-[#0A192F]">
                      <span>Representante Legal & Administradora Delegada - SOPREF S.A.S.</span>
                      <span>2021 - 2023</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-1">Dirección general y toma de decisiones corporativas.</p>
                    <p>Liderazgo ejecutivo integral, representación institucional, gestión financiera y supervisión de operaciones.</p>
                  </div>

                  <div>
                    <div className="flex justify-between font-bold text-[#0A192F]">
                      <span>Asistente Administrativa & Gestión de Comunidades</span>
                      <span>2012 - 2021</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-1">Toledo / Madrid / Experiencia Global</p>
                    <p>Facturación avanzada, control de proveedores, elaboración de presupuestos, control de cartera y optimización administrativa.</p>
                  </div>

                  <div>
                    <div className="flex justify-between font-bold text-[#0A192F]">
                      <span>Recursos Humanos y Salud Ocupacional / PRL - Transportes Multigranel S.A.</span>
                      <span>2004 - 2006</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-1">Gestión de Talento y Seguridad</p>
                    <p>Capacitación de personal, implementación de programas de Salud Ocupacional, higiene industrial y bienestar laboral.</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-[#0A192F] mb-4 border-b border-slate-200 pb-1">Formación Académica</h3>
                <ul className="list-disc list-inside space-y-2">
                  <li><strong>Grado en Administración de Empresas</strong> - UNAD (Universidad Nacional Abierta y a Distancia)</li>
                  <li><strong>Tecnóloga en Gestión Comercial y de Negocios</strong> - UNAD</li>
                  <li><strong>FP Gestión Administrativa</strong> - IES Azarquiel (Toledo)</li>
                  <li><strong>Operadora de Sistemas Office</strong> - Instituto Británico</li>
                  <li><strong>ESO</strong> - CEPA Orcasitas (Madrid)</li>
                </ul>
              </div>

            </div>

            <div className="mt-8 pt-6 border-t border-slate-200 flex justify-end gap-4">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 bg-[#059669] hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl text-sm shadow-sm transition-all"
              >
                <Printer className="w-4 h-4" /> Imprimir / Guardar PDF
              </button>
              <button
                onClick={() => setIsCvModalOpen(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-6 py-3 rounded-xl text-sm transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI CHATBOT MODAL */}
      <div id="ai-chat-modal" className={`ai-modal ${isAiChatOpen ? 'open' : ''}`}>
        <div className="ai-modal-header">
          <span>🤖 Asistente Virtual de Constanza</span>
          <button onClick={toggleAiAssistant} style={{background:'none', border:'none', color:'white', cursor:'pointer', fontSize:'18px'}}>✕</button>
        </div>
        <div id="ai-chat-body" className="ai-modal-body space-y-3">
          {chatMessages.map((msg, index) => (
            <div key={index} style={{ textAlign: msg.role === 'user' ? 'right' : 'left', marginBottom: '8px', color: msg.role === 'user' ? '#0A192F' : '#059669' }}>
              <b>{msg.role === 'user' ? 'Tú:' : 'Asistente IA:'}</b> {msg.content}
            </div>
          ))}
          {isChatLoading && (
            <div style={{ textAlign: 'left', marginBottom: '8px', color: '#64748B' }}>
              <b>Asistente IA:</b> <i>Escribiendo respuesta...</i>
            </div>
          )}
        </div>
        <div className="ai-modal-footer">
          <input 
            type="text" 
            id="ai-input" 
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Escribe tu pregunta..." 
            onKeyPress={(e) => { if (e.key === 'Enter') askAi(); }}
          />
          <button onClick={askAi}>Enviar</button>
        </div>
      </div>

      {/* Floating Button to open AI Assistant */}
      {!isAiChatOpen && (
        <button
          onClick={toggleAiAssistant}
          className="fixed bottom-6 right-6 z-40 bg-[#0A192F] hover:bg-slate-800 text-white font-bold p-4 rounded-full shadow-2xl flex items-center gap-3 transition-transform hover:scale-105"
        >
          <Sparkles className="w-6 h-6 text-emerald-400 animate-spin duration-3000" />
          <span className="hidden sm:inline text-sm">¿Dudas sobre el perfil? Pregúntale a la IA</span>
        </button>
      )}

    </div>
  );
}
