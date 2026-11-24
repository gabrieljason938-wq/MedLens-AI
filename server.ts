import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const MODELS_DIR = path.resolve(DATA_DIR, 'models');
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const PUBLIC_MODELS_DIR = path.resolve(PUBLIC_DIR, 'models');
const REPORTS_FILE = path.resolve(DATA_DIR, 'reports.json');
const SETTINGS_FILE = path.resolve(DATA_DIR, 'settings.json');

const VALID_SYSTEMS = new Set([
  'cardiovascular',
  'hepatic',
  'renal',
  'pulmonary',
  'endocrine',
  'hematologic',
  'metabolic',
  'neurological',
  'musculoskeletal',
  'immune',
]);

const VALID_STATUSES = new Set(['optimal', 'borderline', 'high', 'low', 'critical']);

interface StoredSettings {
  clinicianName: string;
  clinicianRole: string;
  institution: string;
  unitPreference: 'conventional' | 'si';
  modelAssetUrl: string;
}

interface StoredReport {
  id: string;
  title: string;
  reportDate: string;
  uploadedAt: string;
  sourceFileName: string;
  sourceMimeType: string;
  laboratoryName?: string;
  patientReference?: string;
  overallSummary: string;
  systemsAffected: string[];
  parameters: Array<{
    id: string;
    name: string;
    abbreviation?: string;
    value: number | null;
    displayValue: string;
    unit: string;
    referenceRange: string;
    referenceMin?: number | null;
    referenceMax?: number | null;
    status: string;
    system: string;
    organTarget: string;
    clinicalNote: string;
  }>;
  insights: Array<{
    id: string;
    title: string;
    severity: 'informational' | 'attention' | 'priority';
    system: string;
    summary: string;
    relatedParameters: string[];
    physicianQuestions: string[];
  }>;
  followUpRecommendations: string[];
}

const DEFAULT_SETTINGS: StoredSettings = {
  clinicianName: 'Clinical Workstation',
  clinicianRole: 'Diagnostic Reviewer',
  institution: 'MedLens Clinical Unit',
  unitPreference: 'conventional',
  modelAssetUrl: '',
};

function ensureDataDirs(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }
}

function safeResolveWithin(baseDir: string, unsafeName: string): string {
  const sanitized = path.basename(unsafeName);
  const resolved = path.resolve(baseDir, sanitized);
  if (!resolved.startsWith(baseDir + path.sep)) {
    throw new Error('Invalid file path boundary');
  }
  return resolved;
}

function readReports(): StoredReport[] {
  ensureDataDirs();
  if (!fs.existsSync(REPORTS_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(REPORTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeReports(reports: StoredReport[]): void {
  ensureDataDirs();
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf-8');
}

function readSettings(): StoredSettings {
  ensureDataDirs();
  if (!fs.existsSync(SETTINGS_FILE)) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...(typeof parsed === 'object' && parsed !== null ? parsed : {}),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings: StoredSettings): void {
  ensureDataDirs();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizeSystem(sys: string | undefined): string {
  const lowered = (sys || '').toLowerCase().trim();
  if (VALID_SYSTEMS.has(lowered)) return lowered;
  if (lowered.includes('cardio') || lowered.includes('heart') || lowered.includes('lipid')) {
    return 'cardiovascular';
  }
  if (lowered.includes('liver') || lowered.includes('hepat')) return 'hepatic';
  if (lowered.includes('kidney') || lowered.includes('renal')) return 'renal';
  if (lowered.includes('lung') || lowered.includes('pulmon') || lowered.includes('respir')) {
    return 'pulmonary';
  }
  if (lowered.includes('thyroid') || lowered.includes('hormon') || lowered.includes('endocrin')) {
    return 'endocrine';
  }
  if (lowered.includes('blood') || lowered.includes('hemat') || lowered.includes('iron')) {
    return 'hematologic';
  }
  if (lowered.includes('neuro') || lowered.includes('brain')) return 'neurological';
  if (lowered.includes('bone') || lowered.includes('musc')) return 'musculoskeletal';
  if (lowered.includes('immun') || lowered.includes('inflam')) return 'immune';
  return 'metabolic';
}

function normalizeStatus(status: string | undefined): string {
  const lowered = (status || '').toLowerCase().trim();
  if (VALID_STATUSES.has(lowered)) return lowered;
  if (lowered.includes('crit')) return 'critical';
  if (lowered.includes('border') || lowered.includes('watch')) return 'borderline';
  if (lowered.includes('high') || lowered.includes('elev')) return 'high';
  if (lowered.includes('low') || lowered.includes('defic')) return 'low';
  return 'optimal';
}

function discoverAvailableModelAsset(): {
  id: string;
  name: string;
  url: string;
  source: 'uploaded' | 'configured' | 'server';
  sizeBytes?: number;
  loadedAt: string;
} | null {
  const settings = readSettings();
  const now = new Date().toISOString();

  if (settings.modelAssetUrl && settings.modelAssetUrl.trim().length > 0) {
    const trimmed = settings.modelAssetUrl.trim();
    if (trimmed.startsWith('/api/anatomy/models/')) {
      try {
        const filePath = safeResolveWithin(MODELS_DIR, trimmed.replace('/api/anatomy/models/', ''));
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          return {
            id: 'uploaded-model',
            name: path.basename(filePath),
            url: trimmed,
            source: 'uploaded',
            sizeBytes: stat.size,
            loadedAt: now,
          };
        }
      } catch {
        // Ignore invalid local path
      }
    } else if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('/models/')
    ) {
      return {
        id: 'configured-model',
        name: path.basename(trimmed.split('?')[0]) || 'configured-anatomy.glb',
        url: trimmed,
        source: 'configured',
        loadedAt: now,
      };
    }
  }

  const zAnatomyManifest = path.resolve(PUBLIC_MODELS_DIR, 'z-anatomy', 'manifest.json');
  if (fs.existsSync(zAnatomyManifest)) {
    const stat = fs.statSync(zAnatomyManifest);
    return {
      id: 'z-anatomy-atlas',
      name: 'Z-Anatomy Human Atlas (CC BY-SA 4.0)',
      url: '/models/z-anatomy/manifest.json',
      source: 'server',
      sizeBytes: stat.size,
      loadedAt: now,
    };
  }

  if (fs.existsSync(PUBLIC_MODELS_DIR)) {
    const files = fs
      .readdirSync(PUBLIC_MODELS_DIR)
      .filter((f) => f.toLowerCase().endsWith('.glb') || f.toLowerCase().endsWith('.gltf'));
    if (files.length > 0) {
      const target = safeResolveWithin(PUBLIC_MODELS_DIR, files[0]);
      const stat = fs.statSync(target);
      return {
        id: 'public-model',
        name: files[0],
        url: `/models/${encodeURIComponent(files[0])}`,
        source: 'server',
        sizeBytes: stat.size,
        loadedAt: now,
      };
    }
  }

  return null;
}

const reportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const modelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
});

async function startServer() {
  ensureDataDirs();
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.use(
    express.static(PUBLIC_DIR, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.glb')) {
          res.setHeader('Content-Type', 'model/gltf-binary');
        }
      },
    })
  );

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'medlens-ai', modelAsset: discoverAvailableModelAsset() });
  });

  app.get('/api/bootstrap', (_req: Request, res: Response) => {
    res.json({
      reports: readReports(),
      settings: readSettings(),
      modelAsset: discoverAvailableModelAsset(),
    });
  });

  app.get('/api/anatomy/models/:file', (req: Request, res: Response) => {
    try {
      const target = safeResolveWithin(MODELS_DIR, String(req.params.file || ''));
      if (!fs.existsSync(target)) {
        res.status(404).json({ error: 'Model file not found.' });
        return;
      }
      if (target.endsWith('.glb')) {
        res.setHeader('Content-Type', 'model/gltf-binary');
      }
      res.sendFile(target);
    } catch {
      res.status(400).json({ error: 'Invalid model path.' });
    }
  });

  app.post(
    '/api/anatomy/upload',
    modelUpload.single('model'),
    (req: Request, res: Response) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: 'No .GLB or .GLTF model file received.' });
          return;
        }
        const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        if (!safeName.toLowerCase().endsWith('.glb') && !safeName.toLowerCase().endsWith('.gltf')) {
          res.status(400).json({ error: 'Only .glb and .gltf anatomical assets are supported.' });
          return;
        }
        const dest = safeResolveWithin(MODELS_DIR, `${Date.now()}-${safeName}`);
        fs.writeFileSync(dest, req.file.buffer);
        const url = `/api/anatomy/models/${encodeURIComponent(path.basename(dest))}`;
        const nextSettings = { ...readSettings(), modelAssetUrl: url };
        writeSettings(nextSettings);
        res.json({
          modelAsset: {
            id: 'uploaded-model',
            name: safeName,
            url,
            source: 'uploaded',
            sizeBytes: req.file.size,
            loadedAt: new Date().toISOString(),
          },
        });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to store uploaded 3D model.',
        });
      }
    }
  );

  app.put('/api/settings', (req: Request, res: Response) => {
    const current = readSettings();
    const body = (req.body || {}) as Partial<StoredSettings>;
    const updated: StoredSettings = {
      clinicianName:
        typeof body.clinicianName === 'string' && body.clinicianName.trim()
          ? body.clinicianName.trim().slice(0, 80)
          : current.clinicianName,
      clinicianRole:
        typeof body.clinicianRole === 'string' && body.clinicianRole.trim()
          ? body.clinicianRole.trim().slice(0, 80)
          : current.clinicianRole,
      institution:
        typeof body.institution === 'string' && body.institution.trim()
          ? body.institution.trim().slice(0, 120)
          : current.institution,
      unitPreference: body.unitPreference === 'si' ? 'si' : current.unitPreference,
      modelAssetUrl:
        typeof body.modelAssetUrl === 'string' ? body.modelAssetUrl.trim() : current.modelAssetUrl,
    };
    writeSettings(updated);
    res.json({ settings: updated, modelAsset: discoverAvailableModelAsset() });
  });

  app.post(
    '/api/reports/analyze',
    reportUpload.single('file'),
    async (req: Request, res: Response) => {
      try {
        const ai = getAiClient();
        const rawText = typeof req.body?.rawText === 'string' ? req.body.rawText.trim() : '';
        const providedTitle = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
        const providedDate =
          typeof req.body?.reportDate === 'string' && req.body.reportDate.trim()
            ? req.body.reportDate.trim()
            : new Date().toISOString().slice(0, 10);

        const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

        if (req.file) {
          const mime = req.file.mimetype || 'application/octet-stream';
          if (mime.startsWith('text/') || req.file.originalname.toLowerCase().endsWith('.csv')) {
            parts.push({
              text: `Uploaded laboratory document (${req.file.originalname}):\n${req.file.buffer.toString('utf-8')}`,
            });
          } else {
            parts.push({
              inlineData: {
                mimeType: mime === 'application/octet-stream' ? 'application/pdf' : mime,
                data: req.file.buffer.toString('base64'),
              },
            });
          }
        }

        if (rawText) {
          parts.push({ text: `Additional laboratory text:\n${rawText}` });
        }

        if (parts.length === 0) {
          res.status(400).json({ error: 'Please provide a medical report file or laboratory text.' });
          return;
        }

        parts.push({
          text:
            'Extract all real laboratory parameters explicitly present in the provided report. ' +
            'Do NOT invent or extrapolate any unlisted test values. Map each parameter to one of the following anatomical systems: ' +
            'cardiovascular, hepatic, renal, pulmonary, endocrine, hematologic, metabolic, neurological, musculoskeletal, immune. ' +
            'Provide an objective clinical summary, system-level insights, and follow-up physician questions.',
        });

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            systemInstruction:
              'You are a clinical laboratory data extraction engine. Extract only biomarkers actually present in the document with strict accuracy.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                laboratoryName: { type: Type.STRING },
                overallSummary: { type: Type.STRING },
                parameters: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      abbreviation: { type: Type.STRING },
                      value: { type: Type.NUMBER, nullable: true },
                      displayValue: { type: Type.STRING },
                      unit: { type: Type.STRING },
                      referenceRange: { type: Type.STRING },
                      status: { type: Type.STRING },
                      system: { type: Type.STRING },
                      organTarget: { type: Type.STRING },
                      clinicalNote: { type: Type.STRING },
                    },
                    required: ['name', 'displayValue', 'status', 'system', 'organTarget'],
                  },
                },
                insights: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      severity: { type: Type.STRING },
                      system: { type: Type.STRING },
                      summary: { type: Type.STRING },
                      relatedParameters: { type: Type.ARRAY, items: { type: Type.STRING } },
                      physicianQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: ['title', 'severity', 'system', 'summary'],
                  },
                },
                followUpRecommendations: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['title', 'overallSummary', 'parameters', 'insights'],
            },
          },
        });

        const parsed = JSON.parse((response.text ?? '{}').trim()) as {
          title?: string;
          laboratoryName?: string;
          overallSummary?: string;
          parameters?: Array<Record<string, unknown>>;
          insights?: Array<Record<string, unknown>>;
          followUpRecommendations?: string[];
        };

        const normalizedParams = (parsed.parameters || []).map((p, idx) => ({
          id: `param-${idx}-${crypto.randomUUID().slice(0, 6)}`,
          name: String(p.name || `Parameter ${idx + 1}`),
          abbreviation: p.abbreviation ? String(p.abbreviation) : undefined,
          value: typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : null,
          displayValue: String(p.displayValue ?? p.value ?? 'N/A'),
          unit: String(p.unit || ''),
          referenceRange: String(p.referenceRange || 'See lab reference'),
          status: normalizeStatus(typeof p.status === 'string' ? p.status : undefined),
          system: normalizeSystem(typeof p.system === 'string' ? p.system : undefined),
          organTarget: String(p.organTarget || 'Systemic'),
          clinicalNote: String(p.clinicalNote || ''),
        }));

        const normalizedInsights = (parsed.insights || []).map((ins, idx) => {
          const rawSev = String(ins.severity || 'informational').toLowerCase();
          const severity: 'informational' | 'attention' | 'priority' =
            rawSev === 'priority' || rawSev === 'attention' ? rawSev : 'informational';
          return {
            id: `ins-${idx}-${crypto.randomUUID().slice(0, 6)}`,
            title: String(ins.title || 'Clinical Observation'),
            severity,
            system: normalizeSystem(typeof ins.system === 'string' ? ins.system : undefined),
            summary: String(ins.summary || ''),
            relatedParameters: Array.isArray(ins.relatedParameters)
              ? ins.relatedParameters.map(String)
              : [],
            physicianQuestions: Array.isArray(ins.physicianQuestions)
              ? ins.physicianQuestions.map(String)
              : [],
          };
        });

        const systemsAffected = Array.from(new Set(normalizedParams.map((p) => p.system)));

        const report: StoredReport = {
          id: `rep-${crypto.randomUUID().slice(0, 8)}`,
          title: providedTitle || parsed.title || req.file?.originalname || 'Laboratory Report',
          reportDate: providedDate,
          uploadedAt: new Date().toISOString(),
          sourceFileName: req.file?.originalname || 'Pasted Clinical Text',
          sourceMimeType: req.file?.mimetype || 'text/plain',
          laboratoryName: parsed.laboratoryName || undefined,
          overallSummary: parsed.overallSummary || 'Laboratory report parsed.',
          systemsAffected,
          parameters: normalizedParams,
          insights: normalizedInsights,
          followUpRecommendations: Array.isArray(parsed.followUpRecommendations)
            ? parsed.followUpRecommendations.map(String)
            : [],
        };

        const existing = readReports();
        const updated = [report, ...existing];
        writeReports(updated);
        res.json({ report, reports: updated });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to analyze medical report.',
        });
      }
    }
  );

  app.delete('/api/reports/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    const updated = readReports().filter((r) => r.id !== id);
    writeReports(updated);
    res.json({ reports: updated });
  });

  app.delete('/api/reports', (_req: Request, res: Response) => {
    writeReports([]);
    res.json({ reports: [] });
  });

  app.post('/api/reports/compare', async (req: Request, res: Response) => {
    try {
      const { baselineId, currentId } = req.body as { baselineId?: string; currentId?: string };
      const all = readReports();
      const baseline = all.find((r) => r.id === baselineId);
      const current = all.find((r) => r.id === currentId);
      if (!baseline || !current) {
        res.status(404).json({ error: 'One or both selected reports were not found.' });
        return;
      }

      const ai = getAiClient();
      const prompt = JSON.stringify({
        baseline: {
          title: baseline.title,
          date: baseline.reportDate,
          parameters: baseline.parameters.map((p) => ({
            name: p.name,
            value: p.displayValue,
            unit: p.unit,
            status: p.status,
            system: p.system,
          })),
        },
        current: {
          title: current.title,
          date: current.reportDate,
          parameters: current.parameters.map((p) => ({
            name: p.name,
            value: p.displayValue,
            unit: p.unit,
            status: p.status,
            system: p.system,
          })),
        },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Compare these two laboratory reports objectively and summarize longitudinal deltas:\n${prompt}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              executiveSummary: { type: Type.STRING },
              parameterDeltas: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    unit: { type: Type.STRING },
                    system: { type: Type.STRING },
                    baselineValue: { type: Type.STRING },
                    currentValue: { type: Type.STRING },
                    baselineStatus: { type: Type.STRING },
                    currentStatus: { type: Type.STRING },
                    deltaText: { type: Type.STRING },
                    direction: { type: Type.STRING },
                  },
                },
              },
            },
            required: ['executiveSummary', 'parameterDeltas'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        executiveSummary?: string;
        parameterDeltas?: Array<Record<string, unknown>>;
      };

      res.json({
        comparison: {
          baselineReportId: baseline.id,
          currentReportId: current.id,
          executiveSummary: parsed.executiveSummary || '',
          systemShifts: [],
          parameterDeltas: (parsed.parameterDeltas || []).map((d) => ({
            name: String(d.name || ''),
            unit: String(d.unit || ''),
            system: normalizeSystem(typeof d.system === 'string' ? d.system : undefined),
            baselineValue: String(d.baselineValue || '-'),
            currentValue: String(d.currentValue || '-'),
            baselineStatus: normalizeStatus(
              typeof d.baselineStatus === 'string' ? d.baselineStatus : undefined
            ),
            currentStatus: normalizeStatus(
              typeof d.currentStatus === 'string' ? d.currentStatus : undefined
            ),
            deltaText: String(d.deltaText || ''),
            direction:
              d.direction === 'improved' || d.direction === 'worsened' || d.direction === 'unchanged'
                ? d.direction
                : 'changed',
          })),
        },
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to compare reports.',
      });
    }
  });

  app.post('/api/assistant/chat', async (req: Request, res: Response) => {
    try {
      const { reportId, message, history } = req.body as {
        reportId?: string | null;
        message?: string;
        history?: Array<{ role: string; content: string }>;
      };
      if (!message || !message.trim()) {
        res.status(400).json({ error: 'Message cannot be empty.' });
        return;
      }

      const ai = getAiClient();
      const report = reportId ? readReports().find((r) => r.id === reportId) : null;
      const contextStr = report
        ? `Active Medical Report (${report.title}, ${report.reportDate}):\nSummary: ${report.overallSummary}\nParameters:\n${report.parameters
            .map((p) => `- ${p.name}: ${p.displayValue} ${p.unit} (Ref: ${p.referenceRange}, Status: ${p.status}, System: ${p.system}, Organ: ${p.organTarget})`)
            .join('\n')}`
        : 'No active laboratory report is loaded.';

      const historyText = Array.isArray(history)
        ? history
            .slice(-6)
            .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`)
            .join('\n')
        : '';

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `${contextStr}\n\n${historyText ? `Conversation history:\n${historyText}\n\n` : ''}User question: ${message.trim()}`,
        config: {
          systemInstruction:
            'You are a careful, clear medical report explainer inside MedLens AI. Reference only biomarkers actually present in the report when discussing user data, explain physiological/anatomical links clearly, and remind users to confirm clinical decisions with their physician.',
        },
      });

      const replyText = (response.text || '').trim();
      const referencedParameters = report
        ? report.parameters
            .filter((p) => replyText.toLowerCase().includes(p.name.toLowerCase()))
            .map((p) => p.name)
            .slice(0, 6)
        : [];

      res.json({ reply: replyText, referencedParameters });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Assistant request failed.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MedLens AI server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MedLens AI server:', err);
  process.exit(1);
});
