#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Polyfill browser globals required by Three.js loaders/exporters in Node.js
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElementNS: () => ({}),
    createElement: () => ({}),
  };
}
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class NodeFileReader {
    constructor() {
      this.result = null;
      this.onload = null;
      this.onloadend = null;
      this.onerror = null;
    }
    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((buf) => {
          this.result = buf;
          const evt = { target: this };
          this.onload?.(evt);
          this.onloadend?.(evt);
        })
        .catch((err) => {
          this.onerror?.(err);
        });
    }
  };
}

const SOURCE_ROOT = process.env.Z_ANATOMY_SOURCE || '/tmp/z-anatomy-unity';
const FBX_DIR = path.resolve(SOURCE_ROOT, 'Resources', 'Models', 'FBX');
const DEFAULT_MAT_DIR = path.resolve(SOURCE_ROOT, 'Z-Anatomy PC', 'Assets', 'Models', '1.0 Materials');
const FALLBACK_MAT_DIR = '/tmp/zanat-mats/Z-Anatomy PC/Assets/Models/1.0 Materials';
const MAT_DIR = fs.existsSync(DEFAULT_MAT_DIR) ? DEFAULT_MAT_DIR : FALLBACK_MAT_DIR;
const OUT_DIR = path.resolve(process.cwd(), 'public', 'models', 'z-anatomy');
const TMP_DIR = '/tmp';

export const LAYER_SPECS = [
  {
    id: 'visceral',
    label: 'Visceral & Organs',
    fileName: 'visceral.glb',
    sourceFbx: 'VisceralSystem100.fbx',
    defaultVisible: true,
  },
  {
    id: 'cardiovascular',
    label: 'Cardiovascular',
    fileName: 'cardiovascular.glb',
    sourceFbx: 'CardioVascular41.fbx',
    defaultVisible: true,
  },
  {
    id: 'skeletal',
    label: 'Skeletal System',
    fileName: 'skeletal.glb',
    sourceFbx: 'SkeletalSystem100.fbx',
    defaultVisible: true,
  },
  {
    id: 'nervous',
    label: 'Nervous System',
    fileName: 'nervous.glb',
    sourceFbx: 'NervousSystem100.fbx',
    defaultVisible: false,
  },
  {
    id: 'muscular',
    label: 'Muscular System',
    fileName: 'muscular.glb',
    sourceFbx: 'MuscularSystem100.fbx',
    defaultVisible: false,
  },
  {
    id: 'lymphoid',
    label: 'Lymphatic System',
    fileName: 'lymphoid.glb',
    sourceFbx: 'LymphoidOrgans100.fbx',
    defaultVisible: false,
  },
  {
    id: 'joints',
    label: 'Joints & Ligaments',
    fileName: 'joints.glb',
    sourceFbx: 'Joints100.fbx',
    defaultVisible: false,
  },
  {
    id: 'body',
    label: 'External Body',
    fileName: 'body.glb',
    sourceFbx: 'Regions of human body100.fbx',
    defaultVisible: true,
    defaultOpacity: 0.16,
  },
];

const EXCLUDED_MAT_DIRS = new Set(['KeyColors', 'References']);

const MATERIAL_NAME_ALIASES = {
  'end-adduction': 'End-Adduction 1',
  'lung-base': 'Lung',
  'nucleus (afferent fibers)': 'Nucleus afferent',
  'nucleus (efferent fibers)': 'Nucleus efferent 1',
};

// Thin enclosing sheaths/membranes stay semi-translucent so underlying organs remain visible
const TRANSLUCENT_SHEATH_ALPHAS = [
  [/^fascia/i, 0.24],
  [/^peritoneum/i, 0.26],
  [/^ligament/i, 0.36],
  [/^bursa/i, 0.44],
  [/^cornea/i, 0.35],
  [/^articular capsule/i, 0.45],
];

function normalizeMatKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\.mat$/i, '')
    .replace(/[_/\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function walkFiles(dir, ext) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_MAT_DIRS.has(entry.name)) continue;
      out.push(...walkFiles(full, ext));
    } else if (entry.name.toLowerCase().endsWith(ext)) {
      out.push(full);
    }
  }
  return out;
}

function parseUnityMaterials(matDir = MAT_DIR) {
  const map = new Map();
  const matFiles = walkFiles(matDir, '.mat');
  for (const file of matFiles) {
    const raw = fs.readFileSync(file, 'utf-8');
    const baseName = path.basename(file, '.mat').trim();
    const mNameMatches = [...raw.matchAll(/^\s*m_Name:\s*([^\r\n]+)/gm)]
      .map((m) => m[1].trim())
      .filter((x) => x && !x.startsWith('m_EditorClassIdentifier'));

    const colorMatch =
      raw.match(/- _BaseColor:\s*\{r:\s*([0-9eE.-]+),\s*g:\s*([0-9eE.-]+),\s*b:\s*([0-9eE.-]+),\s*a:\s*([0-9eE.-]+)\}/) ||
      raw.match(/- _Color:\s*\{r:\s*([0-9eE.-]+),\s*g:\s*([0-9eE.-]+),\s*b:\s*([0-9eE.-]+),\s*a:\s*([0-9eE.-]+)\}/);

    const smoothMatch = raw.match(/- _Smoothness:\s*([0-9eE.-]+)/);
    const metalMatch = raw.match(/- _Metallic:\s*([0-9eE.-]+)/);

    if (colorMatch) {
      const def = {
        r: THREE.MathUtils.clamp(Number(colorMatch[1]), 0, 1),
        g: THREE.MathUtils.clamp(Number(colorMatch[2]), 0, 1),
        b: THREE.MathUtils.clamp(Number(colorMatch[3]), 0, 1),
        a: THREE.MathUtils.clamp(Number(colorMatch[4]), 0, 1),
        smoothness: smoothMatch ? THREE.MathUtils.clamp(Number(smoothMatch[1]), 0, 1) : 0.4,
        metallic: metalMatch ? THREE.MathUtils.clamp(Number(metalMatch[1]), 0, 1) : 0,
      };
      for (const candidateKey of [baseName, ...mNameMatches]) {
        const norm = normalizeMatKey(candidateKey);
        if (norm && !map.has(norm)) {
          map.set(norm, def);
        }
      }
    }
  }
  return map;
}

function resolveMaterial(matName, matMap) {
  if (!matName) return null;
  const trimmed = matName.replace(/\.mat$/i, '').trim();
  const aliased = MATERIAL_NAME_ALIASES[trimmed.toLowerCase()] || trimmed;
  const candidates = [
    aliased,
    aliased.replace(/\.\d+$/, ''),
    aliased.replace(/\.\d+$/, '').replace(/-\d+$/, ''),
    aliased.replace(/\s*\(\d+\)$/, ''),
  ];
  for (const c of candidates) {
    const def = matMap.get(normalizeMatKey(c));
    if (def) return def;
  }
  return null;
}

function computePbrProperties(matName, matDef) {
  const color = new THREE.Color();
  if (matDef) {
    color.setRGB(matDef.r, matDef.g, matDef.b, THREE.SRGBColorSpace);
  } else {
    color.set('#cbd5e1');
  }

  let alpha = 1;
  for (const [pattern, sheathAlpha] of TRANSLUCENT_SHEATH_ALPHAS) {
    if (pattern.test(matName || '')) {
      alpha = sheathAlpha;
      break;
    }
  }
  if (/__DEFAULT/i.test(matName || '')) {
    alpha = 0;
  }

  const roughness = matDef
    ? THREE.MathUtils.clamp(1 - matDef.smoothness, 0.25, 0.86)
    : 0.55;
  const metallic = matDef ? THREE.MathUtils.clamp(matDef.metallic, 0, 0.15) : 0.03;

  return { color, alpha, roughness, metallic };
}

function exportGlbBuffer(scene) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(Buffer.from(result));
        } else {
          reject(new Error('GLTFExporter did not return binary ArrayBuffer'));
        }
      },
      (err) => reject(err),
      { binary: true }
    );
  });
}

async function convertSingleLayer(spec, matMap) {
  const fbxPath = path.join(FBX_DIR, spec.sourceFbx);
  if (!fs.existsSync(fbxPath)) {
    throw new Error(`Missing source FBX: ${fbxPath}`);
  }

  console.log(`[convert] Loading ${spec.sourceFbx}...`);
  const buf = fs.readFileSync(fbxPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loader = new FBXLoader();
  const root = loader.parse(ab, '');

  const cleanGroup = new THREE.Group();
  cleanGroup.name = spec.id;

  const layerBox = new THREE.Box3();
  const sampleOrgans = [];
  let meshCount = 0;

  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const rawName = (obj.name || '').trim();
    if (!rawName || /^Cross_Section/i.test(rawName)) return;

    const posAttr = obj.geometry?.getAttribute?.('position');
    if (!posAttr || posAttr.count === 0) return;

    const firstMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const matName = firstMat?.name || '';

    // Skip small Z-Anatomy label anchor boxes
    if (posAttr.count <= 48 && (/__DEFAULT/i.test(matName) || /j$/i.test(rawName))) {
      return;
    }

    let geom = obj.geometry.clone();
    // Apply world transform directly into vertices for clean flattened hierarchy
    geom.applyMatrix4(obj.matrixWorld);
    geom.deleteAttribute('uv');
    geom.deleteAttribute('uv1');
    geom.deleteAttribute('color');
    try {
      geom = mergeVertices(geom, 1e-4);
    } catch {
      // Keep original geometry if mergeVertices fails
    }
    if (!geom.getAttribute('normal')) {
      geom.computeVertexNormals();
    }
    geom.computeBoundingBox();
    if (geom.boundingBox) {
      layerBox.union(geom.boundingBox);
    }

    const matDef = resolveMaterial(matName, matMap);
    const { color, alpha, roughness, metallic } = computePbrProperties(matName, matDef);

    const material = new THREE.MeshStandardMaterial({
      name: matName || `${spec.id}_mat`,
      color,
      roughness,
      metalness: metallic,
      transparent: alpha < 0.98,
      opacity: alpha,
    });

    const cleanMesh = new THREE.Mesh(geom, material);
    cleanMesh.name = rawName;
    cleanGroup.add(cleanMesh);

    meshCount += 1;
    if (sampleOrgans.length < 20) {
      sampleOrgans.push(rawName);
    }
  });

  const exportScene = new THREE.Scene();
  exportScene.add(cleanGroup);

  const glbBuf = await exportGlbBuffer(exportScene);
  const rawOutPath = path.join(TMP_DIR, `raw_${spec.id}.glb`);
  fs.writeFileSync(rawOutPath, glbBuf);

  const meta = {
    id: spec.id,
    label: spec.label,
    fileName: spec.fileName,
    url: `/models/z-anatomy/${spec.fileName}`,
    sourceFbx: spec.sourceFbx,
    defaultVisible: spec.defaultVisible,
    ...(spec.defaultOpacity !== undefined ? { defaultOpacity: spec.defaultOpacity } : {}),
    meshCount,
    sizeBytes: glbBuf.length,
    bounds: {
      min: [layerBox.min.x, layerBox.min.y, layerBox.min.z],
      max: [layerBox.max.x, layerBox.max.y, layerBox.max.z],
    },
    sampleOrgans,
  };
  fs.writeFileSync(path.join(TMP_DIR, `meta_${spec.id}.json`), JSON.stringify(meta, null, 2));
  console.log(
    `[convert] Wrote ${rawOutPath}: ${meshCount} meshes, ${(glbBuf.length / 1048576).toFixed(2)} MB`
  );
}

function patchExistingGlbMaterials(matMap) {
  let totalMaterials = 0;
  let totalResolved = 0;

  for (const spec of LAYER_SPECS) {
    const glbPath = path.join(OUT_DIR, spec.fileName);
    if (!fs.existsSync(glbPath)) {
      throw new Error(`Missing GLB for material patch: ${glbPath}`);
    }
    const buf = fs.readFileSync(glbPath);
    if (buf.readUInt32LE(0) !== 0x46546c67 || buf.readUInt32LE(4) !== 2) {
      throw new Error(`Invalid GLB header in ${spec.fileName}`);
    }
    const jsonChunkLen = buf.readUInt32LE(12);
    const jsonChunkType = buf.readUInt32LE(16);
    if (jsonChunkType !== 0x4e4f534a) {
      throw new Error(`Unexpected first chunk type in ${spec.fileName}`);
    }

    const jsonStart = 20;
    const jsonEnd = jsonStart + jsonChunkLen;
    const remainder = buf.subarray(jsonEnd);
    const gltfJson = JSON.parse(buf.subarray(jsonStart, jsonEnd).toString('utf8'));

    let layerResolved = 0;
    for (const mat of gltfJson.materials || []) {
      totalMaterials += 1;
      const matDef = resolveMaterial(mat.name, matMap);
      if (matDef) {
        layerResolved += 1;
        totalResolved += 1;
      }
      const { color, alpha, roughness, metallic } = computePbrProperties(mat.name, matDef);
      mat.pbrMetallicRoughness = {
        baseColorFactor: [
          Number(color.r.toFixed(6)),
          Number(color.g.toFixed(6)),
          Number(color.b.toFixed(6)),
          Number(alpha.toFixed(4)),
        ],
        roughnessFactor: Number(roughness.toFixed(4)),
        metallicFactor: Number(metallic.toFixed(4)),
      };
      if (alpha < 0.98) {
        mat.alphaMode = 'BLEND';
      } else {
        delete mat.alphaMode;
        delete mat.alphaCutoff;
      }
    }

    const jsonBytes = Buffer.from(JSON.stringify(gltfJson), 'utf8');
    const padLen = (4 - (jsonBytes.length % 4)) % 4;
    const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc(padLen, 0x20)]);

    const totalLen = 12 + 8 + paddedJson.length + remainder.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(totalLen, 8);

    const chunk0Hdr = Buffer.alloc(8);
    chunk0Hdr.writeUInt32LE(paddedJson.length, 0);
    chunk0Hdr.writeUInt32LE(0x4e4f534a, 4);

    const outBuf = Buffer.concat([header, chunk0Hdr, paddedJson, remainder]);
    fs.writeFileSync(glbPath, outBuf);
    console.log(
      `[patch] ${spec.fileName}: ${(gltfJson.materials || []).length} materials (${layerResolved} matched official .mat), ${(outBuf.length / 1048576).toFixed(2)} MB`
    );
  }

  console.log(`[patch] Total materials patched: ${totalResolved}/${totalMaterials} matched official Z-Anatomy .mat definitions.`);
}

function finalizeManifest() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const layers = [];
  const globalMin = [Infinity, Infinity, Infinity];
  const globalMax = [-Infinity, -Infinity, -Infinity];

  for (const spec of LAYER_SPECS) {
    const metaPath = path.join(TMP_DIR, `meta_${spec.id}.json`);
    const glbPath = path.join(OUT_DIR, spec.fileName);
    if (!fs.existsSync(metaPath) || !fs.existsSync(glbPath)) {
      throw new Error(`Missing converted artifact for layer ${spec.id}`);
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    meta.sizeBytes = fs.statSync(glbPath).size;
    layers.push(meta);

    for (let i = 0; i < 3; i++) {
      globalMin[i] = Math.min(globalMin[i], meta.bounds.min[i]);
      globalMax[i] = Math.max(globalMax[i], meta.bounds.max[i]);
    }
  }

  const manifest = {
    source: 'Z-Anatomy (Official Models-of-human-anatomy / Unity-app_Z-Anatomy)',
    license: 'CC BY-SA 4.0',
    derivedFrom: 'BodyParts3D (The Database Center for Life Science) — CC BY-SA 2.1 Japan',
    generatedAt: new Date().toISOString(),
    globalBounds: {
      min: globalMin,
      max: globalMax,
    },
    layers,
  };

  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`[finalize] Wrote ${manifestPath} (${layers.length} layers)`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--finalize')) {
    finalizeManifest();
    return;
  }

  const matDirArg = args.find((a) => a.startsWith('--mat-dir='));
  const activeMatDir = matDirArg ? matDirArg.split('=')[1] : MAT_DIR;
  const matMap = parseUnityMaterials(activeMatDir);
  console.log(`[convert] Loaded ${matMap.size} Z-Anatomy material lookup keys from ${activeMatDir}.`);

  if (args.includes('--patch-materials')) {
    patchExistingGlbMaterials(matMap);
    return;
  }

  const layerArg = args.find((a) => a.startsWith('--layer='));
  const targetId = layerArg ? layerArg.split('=')[1] : null;

  const targets = targetId
    ? LAYER_SPECS.filter((s) => s.id === targetId)
    : LAYER_SPECS;

  if (targets.length === 0) {
    throw new Error(`Unknown layer: ${targetId}`);
  }

  for (const spec of targets) {
    await convertSingleLayer(spec, matMap);
  }

  if (!targetId) {
    finalizeManifest();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
