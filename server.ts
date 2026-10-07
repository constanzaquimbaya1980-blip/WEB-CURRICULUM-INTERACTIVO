import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  app.use(express.json());

  const PORT = Number(process.env.PORT) || 3000;

  // Initialize Gemini API client if key is available
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

  // API endpoint for AI Recruiter Assistant
  app.post('/api/ai-chat', async (req, res) => {
    try {
      const { message, history } = req.body;
      if (!ai) {
        return res.status(500).json({ 
          error: 'Gemini API key no configurada en el servidor. Por favor configure GEMINI_API_KEY.' 
        });
      }

      const systemInstruction = `Eres el asistente virtual de reclutamiento de Constanza Quimbaya Amórtegui. 
Tu objetivo es responder de manera profesional, amable, precisa y persuasiva a los reclutadores y directores de recursos humanos que visitan este portafolio.

DATOS CLAVE DE CONSTANZA QUIMBAYA AMÓRTEGUI:
- Título: Administradora de Empresas & Especialista en Gestión Operativa y Recursos Humanos.
- Ubicación: Alcabón - Toledo (España) | Teléfono: 645 689 739 | Email: Constanza.quimbaya@hotmail.com
- Situación legal: Permiso de residencia y trabajo habilitado en España. Residencia en Toledo / Madrid.
- Experiencia destacada: +15 Años de Experiencia.
  * SOPREF S.A.S (2021-2023): Representante Legal y Administradora Delegada.
  * Asistente Administrativa & Gestión de Comunidades (2012-2021): Facturación, proveedores, presupuestos, cartera.
  * Transportes Multigranel S.A. (2004-2006): Recursos Humanos, Salud Ocupacional / PRL, capacitación de personal.
- Formación Académica: Grado en Administración de Empresas (UNAD), Tecnóloga en Gestión Comercial y de Negocios (UNAD), Operadora de Sistemas Office (Instituto Británico), ESO (CEPA Orcasitas, Madrid), FP Gestión Administrativa (IES Azarquiel, Toledo).

Responde siempre en español, destacando el valor profesional, la disponibilidad inmediata en España y la capacidad de liderazgo operativo de Constanza.`;

      const contents = [
        ...(history || []).map((msg: { role: string; content: string }) => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        })),
        { role: 'user', parts: [{ text: message }] }
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      res.json({ reply: response.text });
    } catch (error: any) {
      console.error('Error in /api/ai-chat:', error);
      res.status(500).json({ error: error.message || 'Error al procesar la solicitud de IA.' });
    }
  });

  // Vite middleware setup for development
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
