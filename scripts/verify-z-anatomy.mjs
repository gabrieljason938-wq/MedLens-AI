#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElementNS: () => ({}),
    createElement: () => ({}),
  };
}

const MANIFEST_PATH = path.resolve(process.cwd(), 'public', 'models', 'z-anatomy', 'manifest.json');

async function parseGlbFile(filePath) {
  const buf = fs.readFileSync(filePath);
  const magic = buf.subarray(0, 4).toString('ascii');
  if (magic !== 'glTF') {
    throw new Error(`${filePath} is not a self-contained binary GLB (magic=${magic})`);
  }

  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  return new Promise((resolve, reject) => {
    loader.parse(ab, '', resolve, reject);
  });
}

async function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifest missing at ${MANIFEST_PATH}`);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  let totalMeshes = 0;
  let totalBytes = 0;

  for (const layer of manifest.layers) {
    const glbPath = path.resolve(process.cwd(), 'public', 'models', 'z-anatomy', layer.fileName);
    if (!fs.existsSync(glbPath)) {
      throw new Error(`Missing GLB file: ${glbPath}`);
    }
    const stat = fs.statSync(glbPath);
    const gltf = await parseGlbFile(glbPath);
    let meshes = 0;
    const names = [];
    gltf.scene.traverse((obj) => {
      if (obj.isMesh) {
        meshes += 1;
        if (obj.name) names.push(obj.name);
        if (!obj.geometry?.getAttribute?.('position')) {
          throw new Error(`Mesh ${obj.name} in ${layer.fileName} missing position attribute`);
        }
      }
    });

    if (meshes !== layer.meshCount) {
      throw new Error(
        `Mesh count mismatch for ${layer.fileName}: manifest=${layer.meshCount}, parsed=${meshes}`
      );
    }

    totalMeshes += meshes;
    totalBytes += stat.size;
    console.log(
      `[OK] ${layer.fileName}: ${meshes} meshes (${(stat.size / 1048576).toFixed(2)} MB) · sample: ${names.slice(0, 4).join(', ')}`
    );
  }

  console.log(
    `\nVerified all ${manifest.layers.length} Z-Anatomy GLB layers: ${totalMeshes} anatomical structures, ${(totalBytes / 1048576).toFixed(2)} MB total.`
  );
}

main().catch((err) => {
  console.error('[VERIFY FAILED]', err);
  process.exit(1);
});
