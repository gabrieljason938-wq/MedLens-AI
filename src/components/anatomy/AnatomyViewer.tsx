/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Html, Lightformer, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Crosshair,
  Eye,
  EyeOff,
  Flame,
  Grid3X3,
  Heart,
  Info,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  Move,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  Sliders,
  Sparkles,
  Tag,
  Undo2,
  Upload,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ANATOMICAL_SYSTEMS, SYSTEM_META_MAP } from '../../data/anatomicalSystems';
import {
  Z_ANATOMY_ATTRIBUTIONS,
  Z_ANATOMY_REFERENCE_CREDITS,
  type ZAnatomyManifest,
  type ZAnatomyManifestLayer,
} from '../../data/zAnatomyAttribution';
import {
  ANATOMICAL_DISCLAIMER,
  lookupOrganByMeshName,
  ORGAN_MESH_REGISTRY,
  type OrganRegistryEntry,
} from '../../data/anatomicalMeshRegistry';
import type {
  AnatomicalLayerState,
  AnatomicalSystemId,
  AnatomyModelAsset,
  LabParameter,
  MedicalReport,
  NavRoute,
  SelectedOrganInfo,
} from '../../types/medical';
import { correlateOrganToSystem, formatOrganDisplayName } from '../../utils/organMatcher';
import { getStatusClasses, getStatusLabel } from '../../utils/formatters';

export type CameraPreset = 'anterior' | 'posterior' | 'lateral' | 'superior' | 'reset';
export type RenderStyle = 'standard' | 'ghost-skeleton' | 'xray' | 'wireframe';

export type AnatomicalVisualizationMode =
  | 'external-body'
  | 'transparent-skin'
  | 'internal-organs'
  | 'skeletal'
  | 'muscular'
  | 'circulatory'
  | 'nervous'
  | 'digestive'
  | 'respiratory';

export interface DiscoveredOrganEntry {
  rawName: string;
  displayName: string;
  layerId: string;
  system: AnatomicalSystemId;
  meshUuid: string;
  center: [number, number, number];
  radius: number;
}

export interface AnatomyViewerProps {
  activeReport: MedicalReport | null;
  selectedSystem: AnatomicalSystemId | null;
  onSelectSystem: (system: AnatomicalSystemId | null) => void;
  selectedOrgan?: SelectedOrganInfo | null;
  onSelectOrgan?: (organ: SelectedOrganInfo | null) => void;
  modelAsset: AnatomyModelAsset | null;
  onUploadModelFile: (file: File) => Promise<void>;
  onNavigate: (route: NavRoute) => void;
  isDark: boolean;
  compact?: boolean;
  onOrgansDiscovered?: (organs: DiscoveredOrganEntry[]) => void;
  onLayersStateChange?: (layers: AnatomicalLayerState[]) => void;
}

interface QuickAnatomyTarget {
  id: string;
  label: string;
  layerId: string;
  meshPattern?: RegExp;
  system?: AnatomicalSystemId;
  elevateOpacity?: number;
}

const QUICK_ANATOMY_TARGETS: QuickAnatomyTarget[] = [
  { id: 'body', label: 'External Body', layerId: 'body', elevateOpacity: 0.72 },
  {
    id: 'brain',
    label: 'Brain',
    layerId: 'nervous',
    meshPattern: /^(Superior_frontal_gyrus|Middle_frontal_gyrus|Tonsil_of_cerebellum|Cerebellum|Midbrain)/i,
    system: 'neurological',
  },
  {
    id: 'heart',
    label: 'Heart',
    layerId: 'cardiovascular',
    meshPattern: /^(Left_ventricle|Right_ventricle|Left_atrium|Right_atrium)$/i,
    system: 'cardiovascular',
  },
  {
    id: 'lungs',
    label: 'Lungs',
    layerId: 'visceral',
    meshPattern: /^(Pleura|Superior_lobe_of_right_lung|Inferior_lobe_of_left_lung|Right_main_bronchus)/i,
    system: 'pulmonary',
  },
  {
    id: 'liver',
    label: 'Liver',
    layerId: 'visceral',
    meshPattern: /^(Liver|Left_medial_segment_of_liver|Posterior_medial_segment_of_liver)$/i,
    system: 'hepatic',
  },
  {
    id: 'kidneys',
    label: 'Kidneys',
    layerId: 'visceral',
    meshPattern: /^(Kidneyr|Kidneyl)$/i,
    system: 'renal',
  },
  {
    id: 'pancreas',
    label: 'Pancreas',
    layerId: 'visceral',
    meshPattern: /^Pancreas$/i,
    system: 'endocrine',
  },
  {
    id: 'stomach',
    label: 'Stomach',
    layerId: 'visceral',
    meshPattern: /^Stomach$/i,
    system: 'metabolic',
  },
  {
    id: 'intestines',
    label: 'Intestines',
    layerId: 'visceral',
    meshPattern: /^(Ascending_colon|Descending_colon|Sigmoid_colon|Ileum|Jejunum|Duodenum)/i,
    system: 'metabolic',
  },
  {
    id: 'thyroid',
    label: 'Thyroid Gland',
    layerId: 'visceral',
    meshPattern: /^Thyroid_gland$/i,
    system: 'endocrine',
  },
  {
    id: 'spleen',
    label: 'Spleen',
    layerId: 'lymphoid',
    meshPattern: /^Spleen$/i,
    system: 'immune',
  },
  { id: 'skeleton', label: 'Skeleton', layerId: 'skeletal', system: 'musculoskeletal' },
  { id: 'muscles', label: 'Muscles', layerId: 'muscular', system: 'musculoskeletal' },
  { id: 'vessels', label: 'Blood Vessels', layerId: 'cardiovascular', system: 'cardiovascular' },
  { id: 'nerves', label: 'Nervous System', layerId: 'nervous', system: 'neurological' },
];

export const ANATOMY_MODES_CONFIG: Array<{
  id: AnatomicalVisualizationMode;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    id: 'external-body',
    label: 'External Body',
    description: 'Integumentary surface anatomy & human contours',
    icon: 'body',
  },
  {
    id: 'transparent-skin',
    label: 'Transparent Skin',
    description: 'Translucent skin shell revealing internal thoracic & abdominal organs',
    icon: 'translucent',
  },
  {
    id: 'internal-organs',
    label: 'Internal Organs',
    description: 'Visceral organs, cardiovascular pump & lymphatic clearance',
    icon: 'visceral',
  },
  {
    id: 'skeletal',
    label: 'Skeletal System',
    description: 'Axial & appendicular osseous skeleton and articular joints',
    icon: 'skeleton',
  },
  {
    id: 'muscular',
    label: 'Muscular System',
    description: 'Superficial and deep skeletal muscular groups',
    icon: 'muscles',
  },
  {
    id: 'circulatory',
    label: 'Circulatory System',
    description: 'Arterial tree, heart chambers and venous drainage network',
    icon: 'vessels',
  },
  {
    id: 'nervous',
    label: 'Nervous System',
    description: 'Cerebrum, cerebellum, spinal cord and somatic nerves',
    icon: 'nerves',
  },
  {
    id: 'digestive',
    label: 'Digestive System',
    description: 'Alimentary canal: stomach, liver, pancreas and intestines',
    icon: 'digestive',
  },
  {
    id: 'respiratory',
    label: 'Respiratory System',
    description: 'Pulmonary parenchyma, bronchial arborization and pleura',
    icon: 'respiratory',
  },
];

const LAYER_EXPLODED_OFFSETS: Record<string, [number, number, number]> = {
  body: [0, 0, 0.45],
  muscular: [0, 0, 0.24],
  visceral: [0, 0, 0.36],
  cardiovascular: [0, 0, 0.18],
  nervous: [0, 0.05, -0.22],
  lymphoid: [-0.26, 0, 0.14],
  skeletal: [0, 0, 0],
  joints: [0, 0, 0],
};

const DEFAULT_CAMERA_POS = new THREE.Vector3(0, 0.96, 3.85);
const DEFAULT_TARGET = new THREE.Vector3(0, 0.92, 0);
const NOOP_RAYCAST = () => {};

function detectSoftwareGl(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function createConfiguredGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

function disposeMaterial(mat: THREE.Material | THREE.Material[] | undefined) {
  if (!mat) return;
  if (Array.isArray(mat)) {
    for (const m of mat) m.dispose();
  } else {
    mat.dispose();
  }
}

interface CameraRigProps {
  selectedSystem: AnatomicalSystemId | null;
  selectedOrgan: SelectedOrganInfo | null;
  preset: CameraPreset | null;
  presetNonce: number;
  zoomRequest: { delta: number; nonce: number } | null;
  autoRotate: boolean;
  isSoftwareGl: boolean;
}

const _desiredPos = new THREE.Vector3();
const _desiredTarget = new THREE.Vector3();
const _viewDir = new THREE.Vector3();

function CameraRig({
  selectedSystem,
  selectedOrgan,
  preset,
  presetNonce,
  zoomRequest,
  autoRotate,
  isSoftwareGl,
}: CameraRigProps) {
  const { camera, invalidate } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const activeTransition = useRef(false);

  useEffect(() => {
    if (!selectedOrgan) return;
    const controls = controlsRef.current;
    _desiredTarget.set(...selectedOrgan.center);

    if (controls) {
      _viewDir.subVectors(camera.position, controls.target);
    } else {
      _viewDir.set(0.2, 0.15, 1);
    }
    if (_viewDir.lengthSq() < 0.001) {
      _viewDir.set(0.25, 0.15, 1);
    }
    _viewDir.normalize();

    const dist = THREE.MathUtils.clamp(selectedOrgan.radius * 3.2, 0.36, 1.85);
    _desiredPos.copy(_desiredTarget).addScaledVector(_viewDir, dist);
    activeTransition.current = true;
    invalidate();
  }, [selectedOrgan, camera, invalidate]);

  useEffect(() => {
    if (selectedOrgan || !selectedSystem) return;
    const meta = SYSTEM_META_MAP[selectedSystem];
    if (meta) {
      _desiredTarget.set(...meta.cameraTarget);
      _desiredPos.set(...meta.cameraOffset);
      activeTransition.current = true;
      invalidate();
    }
  }, [selectedSystem, selectedOrgan, invalidate]);

  useEffect(() => {
    if (!preset) return;
    if (preset === 'anterior') {
      _desiredTarget.copy(DEFAULT_TARGET);
      _desiredPos.set(0, 0.96, 3.85);
    } else if (preset === 'posterior') {
      _desiredTarget.copy(DEFAULT_TARGET);
      _desiredPos.set(0, 0.96, -3.85);
    } else if (preset === 'lateral') {
      _desiredTarget.copy(DEFAULT_TARGET);
      _desiredPos.set(3.75, 0.96, 0.2);
    } else if (preset === 'superior') {
      _desiredTarget.copy(DEFAULT_TARGET);
      _desiredPos.set(0, 3.8, 0.25);
    } else if (preset === 'reset') {
      _desiredTarget.copy(DEFAULT_TARGET);
      _desiredPos.copy(DEFAULT_CAMERA_POS);
    }
    activeTransition.current = true;
    invalidate();
  }, [preset, presetNonce, invalidate]);

  useEffect(() => {
    if (!zoomRequest) return;
    const controls = controlsRef.current;
    const target = controls ? controls.target : DEFAULT_TARGET;
    _desiredTarget.copy(target);
    _viewDir.subVectors(camera.position, target);
    const currentDist = _viewDir.length() || 2.5;
    _viewDir.normalize();
    const nextDist = THREE.MathUtils.clamp(currentDist * zoomRequest.delta, 0.24, 6.2);
    _desiredPos.copy(target).addScaledVector(_viewDir, nextDist);
    activeTransition.current = true;
    invalidate();
  }, [zoomRequest, camera, invalidate]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (activeTransition.current) {
      const dampLambda = isSoftwareGl ? 14 : 5.8;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, _desiredPos.x, dampLambda, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _desiredPos.y, dampLambda, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _desiredPos.z, dampLambda, delta);

      controls.target.x = THREE.MathUtils.damp(controls.target.x, _desiredTarget.x, dampLambda, delta);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, _desiredTarget.y, dampLambda, delta);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, _desiredTarget.z, dampLambda, delta);

      if (
        camera.position.distanceTo(_desiredPos) < 0.008 &&
        controls.target.distanceTo(_desiredTarget) < 0.008
      ) {
        activeTransition.current = false;
      } else {
        invalidate();
      }
    }
    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={[0, 0.92, 0]}
      enableRotate
      enableZoom
      enablePan
      screenSpacePanning
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      autoRotate={autoRotate}
      autoRotateSpeed={1.1}
      enableDamping={!isSoftwareGl}
      dampingFactor={0.06}
      minDistance={0.16}
      maxDistance={6.5}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI * 0.72}
      onStart={() => {
        activeTransition.current = false;
      }}
    />
  );
}

function cloneMaterialWithOverrides(
  base: THREE.Material,
  opts: {
    opacity: number;
    wireframe: boolean;
    xray: boolean;
    highlighted: boolean;
    dimmed: boolean;
    isolated: boolean;
  }
): THREE.Material {
  const std =
    base instanceof THREE.MeshStandardMaterial
      ? base.clone()
      : new THREE.MeshStandardMaterial({ color: '#cbd5e1' });

  const baseOpacity = base.transparent ? base.opacity : 1;
  let targetOpacity = baseOpacity * opts.opacity;

  if (opts.highlighted) {
    targetOpacity = 1;
  } else if (opts.isolated) {
    targetOpacity = 0.04;
  } else if (opts.dimmed) {
    targetOpacity = Math.min(targetOpacity, 0.22);
  } else if (opts.xray) {
    targetOpacity = Math.min(0.26, targetOpacity);
  }

  std.wireframe = opts.wireframe || (opts.isolated && !opts.highlighted);
  std.transparent = targetOpacity < 0.98;
  std.opacity = targetOpacity;
  std.depthWrite = targetOpacity >= 0.9;

  if (opts.highlighted) {
    std.emissive = new THREE.Color('#06b6d4');
    std.emissiveIntensity = 0.75;
    std.roughness = 0.2;
    std.metalness = 0.15;
  } else {
    std.emissive = new THREE.Color('#000000');
    std.emissiveIntensity = 0;
  }
  std.needsUpdate = true;
  return std;
}

interface ZAnatomyLayerMeshProps {
  layerMeta: ZAnatomyManifestLayer;
  visible: boolean;
  layerOpacity: number;
  globalOpacity: number;
  renderStyle: RenderStyle;
  selectedOrganUuid: string | null;
  selectedSystem: AnatomicalSystemId | null;
  isolatedOrganUuid: string | null;
  hiddenMeshUuids: Set<string>;
  explodedFactor: number;
  normalizeTransform: { scale: number; offset: [number, number, number] };
  onLayerProgress: (layerId: string, loadedBytes: number, totalBytes: number) => void;
  onLayerLoaded: (layerId: string, organs: DiscoveredOrganEntry[]) => void;
  onLayerError: (layerId: string, error: string) => void;
  onOrganHover: (info: { displayName: string; layerLabel: string; system: AnatomicalSystemId } | null) => void;
  onOrganClick: (organ: SelectedOrganInfo) => void;
}

const ZAnatomyLayerMesh: React.FC<ZAnatomyLayerMeshProps> = ({
  layerMeta,
  visible,
  layerOpacity,
  globalOpacity,
  renderStyle,
  selectedOrganUuid,
  selectedSystem,
  isolatedOrganUuid,
  hiddenMeshUuids,
  explodedFactor,
  normalizeTransform,
  onLayerProgress,
  onLayerLoaded,
  onLayerError,
  onOrganHover,
  onOrganClick,
}) => {
  const { invalidate } = useThree();
  const [sceneRoot, setSceneRoot] = useState<THREE.Group | null>(null);
  const originalMaterialsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());
  const hasStartedLoad = useRef(false);

  useEffect(() => {
    if (!visible || hasStartedLoad.current) return;
    hasStartedLoad.current = true;
    let cancelled = false;

    const loader = createConfiguredGltfLoader();
    onLayerProgress(layerMeta.id, 0, layerMeta.sizeBytes || 1);

    loader.load(
      layerMeta.url,
      (gltf) => {
        if (cancelled) return;
        const root = gltf.scene;
        root.scale.setScalar(normalizeTransform.scale);
        root.position.set(...normalizeTransform.offset);
        root.updateMatrixWorld(true);

        const organs: DiscoveredOrganEntry[] = [];
        const matMap = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
        const tmpBox = new THREE.Box3();
        const tmpCenter = new THREE.Vector3();
        const tmpSphere = new THREE.Sphere();

        root.traverse((obj) => {
          if (!(obj as THREE.Mesh).isMesh) return;
          const mesh = obj as THREE.Mesh;
          const matArr = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          if (matArr.every((m) => /__DEFAULT/i.test(m?.name || ''))) {
            mesh.visible = false;
            return;
          }
          mesh.castShadow = layerMeta.id !== 'body';
          mesh.receiveShadow = true;
          matMap.set(mesh, mesh.material);

          const rawName = mesh.name || 'Structure';
          const system = correlateOrganToSystem(rawName, layerMeta.id);
          mesh.userData.layerId = layerMeta.id;
          mesh.userData.layerLabel = layerMeta.label;
          mesh.userData.system = system;

          tmpBox.setFromObject(mesh);
          if (!tmpBox.isEmpty()) {
            tmpBox.getCenter(tmpCenter);
            tmpBox.getBoundingSphere(tmpSphere);
            organs.push({
              rawName,
              displayName: formatOrganDisplayName(rawName),
              layerId: layerMeta.id,
              system,
              meshUuid: mesh.uuid,
              center: [tmpCenter.x, tmpCenter.y, tmpCenter.z],
              radius: tmpSphere.radius || 0.12,
            });
          }
        });

        originalMaterialsRef.current = matMap;
        onLayerProgress(layerMeta.id, layerMeta.sizeBytes || 1, layerMeta.sizeBytes || 1);
        setSceneRoot(root);
        onLayerLoaded(layerMeta.id, organs);
        invalidate();
      },
      (evt) => {
        if (cancelled) return;
        const total = evt.lengthComputable && evt.total > 0 ? evt.total : layerMeta.sizeBytes || 1;
        onLayerProgress(layerMeta.id, Math.min(evt.loaded, total), total);
      },
      (err) => {
        if (cancelled) return;
        hasStartedLoad.current = false;
        const msg = err instanceof Error ? err.message : `Failed to load ${layerMeta.fileName}`;
        onLayerError(layerMeta.id, msg);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [visible, layerMeta, normalizeTransform, onLayerProgress, onLayerLoaded, onLayerError, invalidate]);

  useFrame((_, delta) => {
    if (!sceneRoot) return;
    const explOffset = LAYER_EXPLODED_OFFSETS[layerMeta.id] || [0, 0, 0];
    const targetX = normalizeTransform.offset[0] + explOffset[0] * explodedFactor;
    const targetY = normalizeTransform.offset[1] + explOffset[1] * explodedFactor;
    const targetZ = normalizeTransform.offset[2] + explOffset[2] * explodedFactor;

    if (
      Math.abs(sceneRoot.position.x - targetX) > 0.001 ||
      Math.abs(sceneRoot.position.y - targetY) > 0.001 ||
      Math.abs(sceneRoot.position.z - targetZ) > 0.001
    ) {
      sceneRoot.position.x = THREE.MathUtils.damp(sceneRoot.position.x, targetX, 6.5, delta);
      sceneRoot.position.y = THREE.MathUtils.damp(sceneRoot.position.y, targetY, 6.5, delta);
      sceneRoot.position.z = THREE.MathUtils.damp(sceneRoot.position.z, targetZ, 6.5, delta);
      invalidate();
    }
  });

  useEffect(() => {
    if (!sceneRoot) return;
    sceneRoot.visible = visible;
    if (!visible) {
      invalidate();
      return;
    }

    const isGhostLayer =
      renderStyle === 'ghost-skeleton' &&
      (layerMeta.id === 'skeletal' || layerMeta.id === 'muscular' || layerMeta.id === 'joints' || layerMeta.id === 'body');
    const effectiveLayerOpacity = isGhostLayer
      ? Math.min(layerOpacity, 0.18)
      : layerOpacity * globalOpacity;

    const passThroughBodyShell = layerMeta.id === 'body' && effectiveLayerOpacity < 0.45;

    sceneRoot.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      const orig = originalMaterialsRef.current.get(mesh);
      if (!orig) return;

      if (hiddenMeshUuids.has(mesh.uuid)) {
        mesh.visible = false;
        mesh.raycast = NOOP_RAYCAST;
        return;
      }

      mesh.visible = true;
      mesh.raycast = passThroughBodyShell ? NOOP_RAYCAST : THREE.Mesh.prototype.raycast;

      const isSelected = Boolean(selectedOrganUuid && mesh.uuid === selectedOrganUuid);
      const isIsolated = Boolean(isolatedOrganUuid && mesh.uuid !== isolatedOrganUuid);
      const meshSys = mesh.userData.system as AnatomicalSystemId | undefined;

      const dimmed = Boolean(
        selectedOrganUuid && !isSelected && !isIsolated
      ) || Boolean(
        !selectedOrganUuid && selectedSystem && meshSys && meshSys !== selectedSystem && layerMeta.id !== 'body'
      );

      const opts = {
        opacity: effectiveLayerOpacity,
        wireframe: renderStyle === 'wireframe',
        xray: renderStyle === 'xray',
        highlighted: isSelected,
        dimmed,
        isolated: isIsolated,
      };

      if (mesh.material !== orig) {
        disposeMaterial(mesh.material);
      }
      if (Array.isArray(orig)) {
        mesh.material = orig.map((m) => cloneMaterialWithOverrides(m, opts));
      } else {
        mesh.material = cloneMaterialWithOverrides(orig, opts);
      }
    });
    invalidate();
  }, [
    sceneRoot,
    visible,
    layerOpacity,
    globalOpacity,
    renderStyle,
    selectedOrganUuid,
    selectedSystem,
    isolatedOrganUuid,
    hiddenMeshUuids,
    layerMeta.id,
    invalidate,
  ]);

  useEffect(() => {
    if (!sceneRoot) return;
    return () => {
      sceneRoot.traverse((obj) => {
        if (!(obj as THREE.Mesh).isMesh) return;
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        disposeMaterial(mesh.material);
        const orig = originalMaterialsRef.current.get(mesh);
        if (orig && orig !== mesh.material) {
          disposeMaterial(orig);
        }
      });
    };
  }, [sceneRoot]);

  if (!sceneRoot || !visible) return null;

  return (
    <primitive
      object={sceneRoot}
      onPointerOver={(e: { stopPropagation: () => void; object: THREE.Object3D }) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
        const mesh = e.object as THREE.Mesh;
        onOrganHover({
          displayName: formatOrganDisplayName(mesh.name || 'Structure'),
          layerLabel: layerMeta.label,
          system: (mesh.userData.system as AnatomicalSystemId) || 'metabolic',
        });
      }}
      onPointerOut={(e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        document.body.style.cursor = 'auto';
        onOrganHover(null);
      }}
      onClick={(e: { stopPropagation: () => void; object: THREE.Object3D }) => {
        e.stopPropagation();
        const mesh = e.object as THREE.Mesh;
        const box = new THREE.Box3().setFromObject(mesh);
        const center = new THREE.Vector3();
        const sphere = new THREE.Sphere();
        box.getCenter(center);
        box.getBoundingSphere(sphere);
        const rawName = mesh.name || 'Structure';
        const system = correlateOrganToSystem(rawName, layerMeta.id);

        onOrganClick({
          rawName,
          displayName: formatOrganDisplayName(rawName),
          layerId: layerMeta.id,
          system,
          meshUuid: mesh.uuid,
          center: [center.x, center.y, center.z],
          radius: sphere.radius || 0.12,
        });
      }}
    />
  );
};

interface AnatomicalLabelsProps {
  onSelectTarget: (target: QuickAnatomyTarget) => void;
  isDark: boolean;
}

const LANDMARK_LABELS: Array<{ id: string; label: string; pos: [number, number, number] }> = [
  { id: 'brain', label: 'Brain / Cerebrum', pos: [0, 1.72, 0.05] },
  { id: 'thyroid', label: 'Thyroid Gland', pos: [0, 1.55, 0.06] },
  { id: 'lungs', label: 'Lungs & Pleura', pos: [-0.18, 1.34, 0.12] },
  { id: 'heart', label: 'Heart & Aorta', pos: [0.06, 1.28, 0.14] },
  { id: 'liver', label: 'Liver', pos: [0.16, 1.14, 0.15] },
  { id: 'stomach', label: 'Stomach', pos: [-0.12, 1.16, 0.14] },
  { id: 'pancreas', label: 'Pancreas', pos: [0, 1.08, 0.08] },
  { id: 'kidneys', label: 'Kidneys', pos: [0.14, 0.98, -0.08] },
  { id: 'spleen', label: 'Spleen', pos: [-0.22, 1.15, 0.04] },
  { id: 'intestines', label: 'Intestinal Tract', pos: [0, 0.88, 0.14] },
  { id: 'skeleton', label: 'Osseous Skeleton', pos: [-0.28, 0.95, 0] },
];

function AnatomicalLabels({ onSelectTarget, isDark }: AnatomicalLabelsProps) {
  return (
    <group>
      {LANDMARK_LABELS.map((lm) => (
        <group key={lm.id} position={lm.pos}>
          <mesh>
            <sphereGeometry args={[0.012, 16, 16]} />
            <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={0.8} />
          </mesh>
          <Html position={[0.025, 0.02, 0]} distanceFactor={3.6} zIndexRange={[15, 0]}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const target = QUICK_ANATOMY_TARGETS.find((t) => t.id === lm.id);
                if (target) onSelectTarget(target);
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-medium tracking-tight whitespace-nowrap border cursor-pointer shadow-sm transition-transform hover:scale-105 ${
                isDark
                  ? 'bg-[#0B1222]/95 text-cyan-300 border-cyan-500/50 hover:bg-cyan-950/80'
                  : 'bg-white/95 text-cyan-900 border-cyan-400 hover:bg-cyan-50'
              }`}
            >
              {lm.label}
            </button>
          </Html>
        </group>
      ))}
    </group>
  );
}

interface DiagnosticStageProps {
  activeReport: MedicalReport | null;
  selectedSystem: AnatomicalSystemId | null;
  onSelectSystem: (sys: AnatomicalSystemId) => void;
  showGrid: boolean;
  showSystemMarkers: boolean;
  isDark: boolean;
}

function DiagnosticStage({
  activeReport,
  selectedSystem,
  onSelectSystem,
  showGrid,
  showSystemMarkers,
  isDark,
}: DiagnosticStageProps) {
  const paramsBySystem = useMemo(() => {
    const map = new Map<AnatomicalSystemId, LabParameter[]>();
    if (!activeReport) return map;
    for (const p of activeReport.parameters) {
      const list = map.get(p.system) ?? [];
      list.push(p);
      map.set(p.system, list);
    }
    return map;
  }, [activeReport]);

  const plinthColor = isDark ? '#0b1426' : '#e2e8f0';
  const ringColor = isDark ? '#1e3a5f' : '#94a3b8';

  return (
    <group>
      {/* Futuristic circular platform beneath the human atlas */}
      <mesh position={[0, -0.025, 0]} receiveShadow>
        <cylinderGeometry args={[0.92, 1.02, 0.05, 64]} />
        <meshStandardMaterial color={plinthColor} roughness={0.48} metalness={0.42} />
      </mesh>

      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.74, 0.76, 64]} />
        <meshBasicMaterial color="#06b6d4" transparent opacity={0.65} />
      </mesh>

      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.88, 0.89, 64]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.32} />
      </mesh>

      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.48, 0.488, 64]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.45} />
      </mesh>

      {showGrid && (
        <gridHelper
          args={[8, 24, isDark ? '#153252' : '#cbd5e1', isDark ? '#0c1a30' : '#e2e8f0']}
          position={[0, -0.049, 0]}
        />
      )}

      {showSystemMarkers &&
        ANATOMICAL_SYSTEMS.map((sys) => {
          const sysParams = paramsBySystem.get(sys.id) ?? [];
          if (sysParams.length === 0 && selectedSystem !== sys.id) return null;

          const hasFlagged = sysParams.some((p) => p.status !== 'optimal');
          const isCritical = sysParams.some((p) => p.status === 'critical');
          const isSelected = selectedSystem === sys.id;
          const nodeColor = isCritical
            ? '#f43f5e'
            : hasFlagged
              ? '#f59e0b'
              : sysParams.length > 0
                ? '#10b981'
                : '#38bdf8';

          return (
            <group key={sys.id} position={sys.position}>
              <mesh
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSystem(sys.id);
                }}
              >
                <sphereGeometry args={[isSelected ? 0.026 : 0.018, 20, 20]} />
                <meshStandardMaterial
                  color={nodeColor}
                  emissive={nodeColor}
                  emissiveIntensity={0.65}
                  roughness={0.25}
                />
              </mesh>
              <Html position={[0.04, 0.02, 0]} zIndexRange={[5, 0]}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSystem(sys.id);
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap border cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-500 text-slate-950 border-cyan-300 font-semibold'
                      : isDark
                        ? 'bg-[#0B1222]/90 text-slate-200 border-slate-700/80'
                        : 'bg-white/95 text-slate-800 border-slate-300'
                  }`}
                >
                  {sys.label}
                  {sysParams.length > 0 ? ` · ${sysParams.length}` : ''}
                </button>
              </Html>
            </group>
          );
        })}
    </group>
  );
}

export const AnatomyViewer: React.FC<AnatomyViewerProps> = ({
  activeReport,
  selectedSystem,
  onSelectSystem,
  selectedOrgan: controlledOrgan,
  onSelectOrgan: onControlledSelectOrgan,
  modelAsset,
  onUploadModelFile,
  onNavigate,
  isDark,
  compact = false,
  onOrgansDiscovered,
  onLayersStateChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isSoftwareGl] = useState(() => detectSoftwareGl());
  const [preset, setPreset] = useState<CameraPreset | null>(null);
  const [presetNonce, setPresetNonce] = useState(0);
  const [zoomRequest, setZoomRequest] = useState<{ delta: number; nonce: number } | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Advanced Visual Modes & Controls
  const [activeMode, setActiveMode] = useState<AnatomicalVisualizationMode>('transparent-skin');
  const [renderStyle, setRenderStyle] = useState<RenderStyle>('standard');
  const [skinOpacity, setSkinOpacity] = useState(0.2);
  const [globalOpacity, setGlobalOpacity] = useState(1);
  const [explodedFactor, setExplodedFactor] = useState(0);
  const [showLabels, setShowLabels] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showSystemMarkers, setShowSystemMarkers] = useState(false);

  // Organ Isolation & Structure Hiding
  const [isolatedOrganUuid, setIsolatedOrganUuid] = useState<string | null>(null);
  const [hiddenMeshUuids, setHiddenMeshUuids] = useState<Set<string>>(new Set());

  // Search & Navigation
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(compact);
  const [modesDrawerOpen, setModesDrawerOpen] = useState(false);
  const [layersDrawerOpen, setLayersDrawerOpen] = useState(false);
  const [structuresOpen, setStructuresOpen] = useState(false);
  const [attributionOpen, setAttributionOpen] = useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  // Model & Layers State
  const [manifest, setManifest] = useState<ZAnatomyManifest | null>(null);
  const [manifestChecked, setManifestChecked] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [layerOpacities, setLayerOpacities] = useState<Record<string, number>>({});
  const [loadedLayers, setLoadedLayers] = useState<Record<string, boolean>>({});
  const [layerProgress, setLayerProgress] = useState<Record<string, { loaded: number; total: number }>>({});
  const [layerErrors, setLayerErrors] = useState<Record<string, string>>({});
  const organsByLayerRef = useRef<Map<string, DiscoveredOrganEntry[]>>(new Map());
  const pendingTargetRef = useRef<QuickAnatomyTarget | null>(null);

  const [internalSelectedOrgan, setInternalSelectedOrgan] = useState<SelectedOrganInfo | null>(null);
  const activeOrgan = controlledOrgan !== undefined ? controlledOrgan : internalSelectedOrgan;
  const [hoveredOrgan, setHoveredOrgan] = useState<{
    displayName: string;
    layerLabel: string;
    system: AnatomicalSystemId;
  } | null>(null);

  const activeOrganRegistryEntry: OrganRegistryEntry | null = useMemo(() => {
    if (!activeOrgan) return null;
    return lookupOrganByMeshName(activeOrgan.rawName);
  }, [activeOrgan]);

  const activeOrganLinkedParams: LabParameter[] = useMemo(() => {
    if (!activeReport || !activeOrgan) return [];
    const directMatches = activeReport.parameters.filter(
      (p) =>
        p.organTarget.toLowerCase().includes(activeOrgan.displayName.toLowerCase()) ||
        activeOrgan.displayName.toLowerCase().includes(p.organTarget.toLowerCase())
    );
    if (directMatches.length > 0) return directMatches;
    return activeReport.parameters.filter((p) => p.system === activeOrgan.system);
  }, [activeReport, activeOrgan]);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      } else if (document.fullscreenElement === containerRef.current) {
        setIsFullscreen(true);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/models/z-anatomy/manifest.json')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} loading /models/z-anatomy/manifest.json`);
        }
        return res.json();
      })
      .then((data: ZAnatomyManifest | null) => {
        if (cancelled) return;
        if (data && Array.isArray(data.layers) && data.layers.length > 0) {
          setManifest(data);
          setManifestError(null);
          const vis: Record<string, boolean> = {};
          const opac: Record<string, number> = {};
          for (const l of data.layers) {
            vis[l.id] = l.defaultVisible;
            opac[l.id] = l.defaultOpacity ?? 1;
          }
          setLayerVisibility(vis);
          setLayerOpacities(opac);
          if (opac.body !== undefined) {
            setSkinOpacity(opac.body);
          }
        } else {
          setManifestError('Z-Anatomy manifest contained no anatomical layer entries.');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setManifestError(
            err instanceof Error ? err.message : 'Unable to fetch /models/z-anatomy/manifest.json'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setManifestChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const zAnatomyTransform = useMemo(() => {
    if (!manifest) return { scale: 0.01, offset: [0, 0.02, 0] as [number, number, number] };
    const [minX, minY, minZ] = manifest.globalBounds.min;
    const [maxX, maxY, maxZ] = manifest.globalBounds.max;
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const maxDim = Math.max(sizeX, sizeY, sizeZ) || 1;
    const scale = 1.85 / maxDim;
    const centerX = (minX + maxX) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    return {
      scale,
      offset: [-centerX * scale, -minY * scale + 0.02, -centerZ * scale] as [number, number, number],
    };
  }, [manifest]);

  // Synchronize layers state to parent views
  useEffect(() => {
    if (!manifest || !onLayersStateChange) return;
    const list: AnatomicalLayerState[] = manifest.layers.map((l) => {
      const visible = Boolean(layerVisibility[l.id]);
      const loaded = Boolean(loadedLayers[l.id]);
      const err = layerErrors[l.id] || null;
      return {
        id: l.id,
        label: l.label,
        visible,
        opacity: layerOpacities[l.id] ?? 1,
        meshCount: l.meshCount,
        loaded,
        loading: visible && !loaded && !err,
        error: err,
      };
    });
    onLayersStateChange(list);
  }, [manifest, layerVisibility, layerOpacities, loadedLayers, layerErrors, onLayersStateChange]);

  const handleOrganSelect = useCallback(
    (organ: SelectedOrganInfo | null) => {
      if (onControlledSelectOrgan) {
        onControlledSelectOrgan(organ);
      } else {
        setInternalSelectedOrgan(organ);
      }
      if (organ) {
        onSelectSystem(organ.system);
      }
    },
    [onControlledSelectOrgan, onSelectSystem]
  );

  const applyQuickTarget = useCallback(
    (target: QuickAnatomyTarget, organs: DiscoveredOrganEntry[]) => {
      if (target.elevateOpacity !== undefined) {
        setLayerOpacities((prev) => ({ ...prev, [target.layerId]: target.elevateOpacity! }));
      }
      if (target.meshPattern) {
        const match = organs.find((o) => target.meshPattern!.test(o.rawName));
        if (match) {
          handleOrganSelect(match);
          return true;
        }
      }
      handleOrganSelect(null);
      if (target.system) {
        onSelectSystem(target.system);
      } else {
        onSelectSystem(null);
        setPreset('anterior');
        setPresetNonce((n) => n + 1);
      }
      return true;
    },
    [handleOrganSelect, onSelectSystem]
  );

  const handleLayerProgress = useCallback(
    (layerId: string, loadedBytes: number, totalBytes: number) => {
      setLayerProgress((prev) => ({
        ...prev,
        [layerId]: { loaded: loadedBytes, total: Math.max(totalBytes, 1) },
      }));
    },
    []
  );

  const handleLayerLoaded = useCallback(
    (layerId: string, organs: DiscoveredOrganEntry[]) => {
      setLoadedLayers((prev) => ({ ...prev, [layerId]: true }));
      organsByLayerRef.current.set(layerId, organs);
      if (onOrgansDiscovered) {
        const merged: DiscoveredOrganEntry[] = [];
        for (const arr of organsByLayerRef.current.values()) {
          merged.push(...arr);
        }
        onOrgansDiscovered(merged);
      }
      const pending = pendingTargetRef.current;
      if (pending && pending.layerId === layerId) {
        pendingTargetRef.current = null;
        applyQuickTarget(pending, organs);
      }
    },
    [onOrgansDiscovered, applyQuickTarget]
  );

  const handleLayerError = useCallback((layerId: string, error: string) => {
    setLayerErrors((prev) => ({ ...prev, [layerId]: error }));
  }, []);

  const handleQuickStructureSelect = (target: QuickAnatomyTarget) => {
    setStructuresOpen(false);
    setSearchOpen(false);
    setLayerVisibility((prev) => ({ ...prev, [target.layerId]: true }));
    if (loadedLayers[target.layerId]) {
      const layerOrgans = organsByLayerRef.current.get(target.layerId) || [];
      applyQuickTarget(target, layerOrgans);
    } else {
      pendingTargetRef.current = target;
      if (target.elevateOpacity !== undefined) {
        setLayerOpacities((prev) => ({ ...prev, [target.layerId]: target.elevateOpacity! }));
      }
      if (!target.meshPattern && target.system) {
        handleOrganSelect(null);
        onSelectSystem(target.system);
      }
    }
  };

  // Switch between the 9 Anatomical Visualization Modes
  const handleSelectMode = (mode: AnatomicalVisualizationMode) => {
    setActiveMode(mode);
    setModesDrawerOpen(false);
    setIsolatedOrganUuid(null);

    setLayerVisibility((prev) => {
      const next = { ...prev };
      switch (mode) {
        case 'external-body':
          return {
            body: true,
            visceral: false,
            cardiovascular: false,
            skeletal: false,
            muscular: false,
            nervous: false,
            lymphoid: false,
            joints: false,
          };
        case 'transparent-skin':
          return {
            body: true,
            visceral: true,
            cardiovascular: true,
            skeletal: true,
            muscular: false,
            nervous: false,
            lymphoid: true,
            joints: false,
          };
        case 'internal-organs':
          return {
            body: false,
            visceral: true,
            cardiovascular: true,
            skeletal: true,
            muscular: false,
            nervous: false,
            lymphoid: true,
            joints: false,
          };
        case 'skeletal':
          return {
            body: false,
            visceral: false,
            cardiovascular: false,
            skeletal: true,
            muscular: false,
            nervous: false,
            lymphoid: false,
            joints: true,
          };
        case 'muscular':
          return {
            body: false,
            visceral: false,
            cardiovascular: false,
            skeletal: true,
            muscular: true,
            nervous: false,
            lymphoid: false,
            joints: true,
          };
        case 'circulatory':
          return {
            body: false,
            visceral: false,
            cardiovascular: true,
            skeletal: true,
            muscular: false,
            nervous: false,
            lymphoid: false,
            joints: false,
          };
        case 'nervous':
          return {
            body: false,
            visceral: false,
            cardiovascular: false,
            skeletal: true,
            muscular: false,
            nervous: true,
            lymphoid: false,
            joints: false,
          };
        case 'digestive':
          return {
            body: false,
            visceral: true,
            cardiovascular: false,
            skeletal: true,
            muscular: false,
            nervous: false,
            lymphoid: false,
            joints: false,
          };
        case 'respiratory':
          return {
            body: false,
            visceral: true,
            cardiovascular: false,
            skeletal: true,
            muscular: false,
            nervous: false,
            lymphoid: false,
            joints: false,
          };
        default:
          return next;
      }
    });

    setLayerOpacities((prev) => {
      const next = { ...prev };
      if (mode === 'external-body') {
        next.body = 1.0;
        setSkinOpacity(1.0);
      } else if (mode === 'transparent-skin') {
        next.body = 0.2;
        setSkinOpacity(0.2);
      } else if (mode === 'skeletal' || mode === 'muscular' || mode === 'circulatory' || mode === 'nervous' || mode === 'digestive' || mode === 'respiratory') {
        next.skeletal = mode === 'skeletal' ? 1.0 : 0.16;
      }
      return next;
    });

    if (mode === 'digestive') {
      onSelectSystem('metabolic');
    } else if (mode === 'respiratory') {
      onSelectSystem('pulmonary');
    } else if (mode === 'circulatory') {
      onSelectSystem('cardiovascular');
    } else if (mode === 'nervous') {
      onSelectSystem('neurological');
    } else if (mode === 'skeletal' || mode === 'muscular') {
      onSelectSystem('musculoskeletal');
    } else {
      onSelectSystem(null);
    }
  };

  const handleSkinOpacityChange = (val: number) => {
    setSkinOpacity(val);
    setLayerOpacities((prev) => ({ ...prev, body: val }));
  };

  const handleIsolateOrgan = () => {
    if (!activeOrgan) return;
    setIsolatedOrganUuid((curr) => (curr === activeOrgan.meshUuid ? null : activeOrgan.meshUuid));
  };

  const handleHideSelectedStructure = () => {
    if (!activeOrgan) return;
    setHiddenMeshUuids((prev) => {
      const next = new Set(prev);
      next.add(activeOrgan.meshUuid);
      return next;
    });
    handleOrganSelect(null);
  };

  const handleUnhideAll = () => {
    setHiddenMeshUuids(new Set());
  };

  const handleRestoreCompleteBody = () => {
    setIsolatedOrganUuid(null);
    setHiddenMeshUuids(new Set());
    setExplodedFactor(0);
    handleOrganSelect(null);
    onSelectSystem(null);
    handleSelectMode('transparent-skin');
    triggerPreset('anterior');
  };

  const triggerPreset = (nextPreset: CameraPreset) => {
    if (nextPreset === 'reset') {
      handleRestoreCompleteBody();
      setAutoRotate(false);
    }
    setPreset(nextPreset);
    setPresetNonce((n) => n + 1);
  };

  const triggerZoom = (factor: number) => {
    setZoomRequest((prev) => ({ delta: factor, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!isFullscreen && el.requestFullscreen) {
        await el.requestFullscreen();
        setIsFullscreen(true);
      } else if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        setIsFullscreen((v) => !v);
      }
    } catch {
      setIsFullscreen((v) => !v);
    }
  };

  const allDiscoveredOrgans: DiscoveredOrganEntry[] = useMemo(() => {
    const list: DiscoveredOrganEntry[] = [];
    for (const arr of organsByLayerRef.current.values()) {
      list.push(...arr);
    }
    return list;
  }, [loadedLayers]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allDiscoveredOrgans
      .filter((org) => org.displayName.toLowerCase().includes(q) || org.rawName.toLowerCase().includes(q))
      .slice(0, 16);
  }, [searchQuery, allDiscoveredOrgans]);

  const hasActiveAtlas = Boolean(manifest);
  const visibleAtlasLayers = useMemo(
    () => (hasActiveAtlas ? manifest!.layers.filter((l) => layerVisibility[l.id]) : []),
    [hasActiveAtlas, manifest, layerVisibility]
  );

  const anyVisibleLoading = visibleAtlasLayers.some(
    (l) => !loadedLayers[l.id] && !layerErrors[l.id]
  );

  const loadingProgressStats = useMemo(() => {
    if (!hasActiveAtlas || visibleAtlasLayers.length === 0) {
      return { percent: 100, label: '' };
    }
    let loadedBytes = 0;
    let totalBytes = 0;
    let doneCount = 0;
    for (const l of visibleAtlasLayers) {
      const p = layerProgress[l.id];
      const layerTotal = p?.total || l.sizeBytes || 1;
      totalBytes += layerTotal;
      if (loadedLayers[l.id]) {
        loadedBytes += layerTotal;
        doneCount += 1;
      } else {
        loadedBytes += Math.min(p?.loaded || 0, layerTotal);
      }
    }
    const percent = totalBytes > 0 ? Math.min(99, Math.round((loadedBytes / totalBytes) * 100)) : 0;
    return {
      percent: doneCount === visibleAtlasLayers.length ? 100 : percent,
      label: `Loading Z-Anatomy layers (${doneCount}/${visibleAtlasLayers.length})`,
    };
  }, [hasActiveAtlas, visibleAtlasLayers, layerProgress, loadedLayers]);

  const stageBg = isDark ? '#060B16' : '#F1F5F9';

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden border border-slate-200 dark:border-slate-800/80 bg-slate-100 dark:bg-[#060B16] select-none ${
        isFullscreen
          ? 'fixed inset-0 z-50 w-screen h-screen rounded-none'
          : `w-full rounded-xl ${compact ? 'h-[500px] lg:h-[580px]' : 'h-[600px] lg:h-[720px]'}`
      }`}
    >
      {/* Top HUD Bar */}
      <div className="pointer-events-none absolute top-3 left-3 right-3 z-20 flex items-start justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/95 px-3 py-1.5 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <Box className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
              <span>Z-Anatomy 3D Human Atlas</span>
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
              PBR Medical Visualizer · Real Mesh Layers
            </p>
          </div>

          {/* Educational Disclaimer Pill */}
          <button
            type="button"
            onClick={() => setDisclaimerOpen((v) => !v)}
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-2.5 py-1.5 text-[11px] font-medium text-cyan-700 dark:text-cyan-300 transition-colors cursor-pointer hidden md:flex items-center gap-1.5"
            title="General educational anatomical model disclaimer"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-cyan-500" />
            <span>General Educational Model</span>
          </button>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5 shrink-0">
          {/* Organ Search Trigger */}
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              searchOpen
                ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                : 'border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/94 text-slate-700 dark:text-slate-200 hover:border-cyan-500/50'
            }`}
            title="Search Anatomical Structures"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Search</span>
          </button>

          {/* 9 Visualization Modes Dropdown */}
          <button
            type="button"
            aria-label="Visualization Modes"
            onClick={() => {
              setModesDrawerOpen((v) => !v);
              setLayersDrawerOpen(false);
              setStructuresOpen(false);
              setAttributionOpen(false);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              modesDrawerOpen
                ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 font-semibold'
                : 'border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/94 text-slate-700 dark:text-slate-200 hover:border-cyan-500/50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
            <span className="capitalize">{activeMode.replace('-', ' ')}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {/* Quick Structures Drawer */}
          <button
            type="button"
            onClick={() => {
              setStructuresOpen((v) => !v);
              setModesDrawerOpen(false);
              setLayersDrawerOpen(false);
              setAttributionOpen(false);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              structuresOpen
                ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                : 'border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/94 text-slate-700 dark:text-slate-200 hover:border-cyan-500/50'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Organs</span>
          </button>

          {/* Layers Drawer */}
          <button
            type="button"
            onClick={() => {
              setLayersDrawerOpen((v) => !v);
              setModesDrawerOpen(false);
              setStructuresOpen(false);
              setAttributionOpen(false);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              layersDrawerOpen
                ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                : 'border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/94 text-slate-700 dark:text-slate-200 hover:border-cyan-500/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Layers</span>
          </button>

          {/* License & Attribution */}
          <button
            type="button"
            onClick={() => {
              setAttributionOpen((v) => !v);
              setModesDrawerOpen(false);
              setLayersDrawerOpen(false);
              setStructuresOpen(false);
            }}
            title="Z-Anatomy & BodyParts3D License Attribution"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/94 px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-cyan-500/50 cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" />
            <span className="hidden md:inline">CC BY-SA</span>
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/94 p-1.5 text-slate-600 dark:text-slate-300 hover:border-cyan-500/50 transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Educational Disclaimer Banner Modal */}
      {disclaimerOpen && (
        <div className="absolute top-14 left-3 z-30 max-w-md rounded-xl border border-cyan-500/40 bg-white/98 dark:bg-[#0B1222]/98 p-3.5 shadow-lg text-xs leading-relaxed text-slate-700 dark:text-slate-300">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-900 dark:text-slate-100">
            <span className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400">
              <ShieldAlert className="w-4 h-4" />
              General Educational Model Notice
            </span>
            <button
              type="button"
              aria-label="Close educational notice"
              onClick={() => setDisclaimerOpen(false)}
              className="text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="mt-2 text-[11px]">{ANATOMICAL_DISCLAIMER}</p>
        </div>
      )}

      {/* Organ Search Overlay */}
      {searchOpen && (
        <div className="absolute top-14 left-3 right-3 sm:right-auto sm:w-80 z-30 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/98 dark:bg-[#0B1222]/98 p-3 shadow-xl">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search organ, muscle, bone, or vessel..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] pl-8 pr-7 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="mt-2 max-h-56 overflow-y-auto space-y-1 pr-1">
            {searchResults.length === 0 && searchQuery ? (
              <p className="py-4 text-center text-xs text-slate-400">No matching anatomical structure found.</p>
            ) : searchResults.length === 0 ? (
              <div className="py-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-300">Quick suggestions:</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {['Heart', 'Liver', 'Kidneys', 'Lungs', 'Brain', 'Stomach', 'Pancreas', 'Skeleton'].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setSearchQuery(q)}
                      className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              searchResults.map((org) => (
                <button
                  key={org.meshUuid}
                  type="button"
                  onClick={() => {
                    handleOrganSelect(org);
                    setSearchOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-2 rounded-lg border border-transparent hover:border-cyan-500/40 hover:bg-cyan-500/10 px-2.5 py-1.5 text-left text-xs text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{org.displayName}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">
                      {org.layerId} · {SYSTEM_META_MAP[org.system]?.label || org.system}
                    </div>
                  </div>
                  <Crosshair className="w-3.5 h-3.5 text-cyan-500 shrink-0 opacity-75" />
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* 9 Visualization Modes Drawer */}
      {modesDrawerOpen && (
        <div className="absolute top-14 right-3 z-30 w-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/98 dark:bg-[#0B1222]/98 p-3 shadow-xl">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 font-semibold text-xs text-slate-900 dark:text-slate-100">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
              Anatomical Visualization Modes
            </span>
            <button
              type="button"
              onClick={() => setModesDrawerOpen(false)}
              className="text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-2.5 space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {ANATOMY_MODES_CONFIG.map((mode) => {
              const isSelected = activeMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => handleSelectMode(mode.id)}
                  className={`w-full text-left rounded-lg border p-2.5 transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-900 dark:text-cyan-200'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#070C18]/60 text-slate-700 dark:text-slate-300 hover:border-cyan-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-xs font-semibold">
                    <span>{mode.label}</span>
                    {isSelected && <span className="text-[10px] font-mono text-cyan-500">ACTIVE</span>}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    {mode.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Hover Tooltip HUD */}
      {hoveredOrgan && !activeOrgan && (
        <div className="pointer-events-none absolute top-16 left-3 z-10 max-w-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/95 px-3 py-1.5 text-xs shadow-xs">
          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
            {hoveredOrgan.displayName}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            {hoveredOrgan.layerLabel} · Click to inspect biological function & biomarkers
          </div>
        </div>
      )}

      {/* Organ Inspection Card (Full Medical Educational Details & Biomarkers) */}
      {activeOrgan && (
        <div className="absolute top-14 left-3 z-20 w-84 sm:w-96 max-w-[calc(100%-24px)] rounded-xl border border-cyan-500/50 bg-white/98 dark:bg-[#0B1222]/98 p-4 shadow-xl">
          <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wide">
                <Crosshair className="w-3.5 h-3.5" />
                <span>Selected Anatomical Structure</span>
              </div>
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {activeOrganRegistryEntry?.normalizedName || activeOrgan.displayName}
              </h3>
              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Layer: <span className="font-medium capitalize">{activeOrgan.layerId}</span> · System:{' '}
                <span className="font-medium text-cyan-600 dark:text-cyan-400">
                  {SYSTEM_META_MAP[activeOrgan.system]?.label || activeOrgan.system}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleOrganSelect(null)}
              className="p-1 rounded text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              title="Close inspection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 space-y-2.5 max-h-72 overflow-y-auto pr-1 text-xs text-slate-700 dark:text-slate-300">
            {/* Biological Function */}
            <div>
              <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1 text-[11px]">
                <Activity className="w-3.5 h-3.5 text-cyan-500" />
                Biological Function:
              </span>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                {activeOrganRegistryEntry?.biologicalFunction ||
                  'Specialized anatomical tissue executing vital physiological processes and structural integrity within its corresponding body system.'}
              </p>
            </div>

            {/* Educational Role */}
            <div>
              <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1 text-[11px]">
                <Info className="w-3.5 h-3.5 text-cyan-500" />
                Role in Human Body:
              </span>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                {activeOrganRegistryEntry?.educationalRole ||
                  'Maintains coordinated physiological homeostasis through spatial orientation and anatomical continuity with adjacent structures.'}
              </p>
            </div>

            {/* Clinical & Laboratory Biomarkers */}
            <div>
              <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1 text-[11px]">
                <Activity className="w-3.5 h-3.5 text-cyan-500" />
                Related Laboratory Biomarkers:
              </span>
              {activeOrganLinkedParams.length > 0 ? (
                <div className="mt-1.5 space-y-1">
                  {activeOrganLinkedParams.map((p) => {
                    const cls = getStatusClasses(p.status);
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-50 dark:bg-[#070C18] border border-slate-200 dark:border-slate-800 text-[11px]"
                      >
                        <div className="truncate">
                          <span className="font-medium text-slate-900 dark:text-slate-100">{p.name}</span>
                          <span className="text-[10px] text-slate-400 ml-1.5">
                            ({p.displayValue} {p.unit})
                          </span>
                        </div>
                        <span className={`inline-flex items-center gap-1 font-medium text-[10px] ${cls.text}`}>
                          {p.status === 'optimal' ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <AlertTriangle className="w-3 h-3" />
                          )}
                          {getStatusLabel(p.status)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : activeOrganRegistryEntry?.associatedLabParameters ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {activeOrganRegistryEntry.associatedLabParameters.map((param) => (
                    <span
                      key={param}
                      className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 text-[10px] font-mono border border-cyan-500/20"
                    >
                      {param}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-slate-400">No active parameters linked to this specific structure.</p>
              )}
            </div>
          </div>

          {/* Action Buttons for Selected Organ */}
          <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleIsolateOrgan}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer transition-colors ${
                  isolatedOrganUuid === activeOrgan.meshUuid
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-semibold'
                    : 'border-slate-200 dark:border-slate-700 hover:border-cyan-500/50'
                }`}
              >
                {isolatedOrganUuid === activeOrgan.meshUuid ? 'Unisolate' : 'Isolate Organ'}
              </button>

              <button
                type="button"
                onClick={handleHideSelectedStructure}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-slate-700 hover:border-rose-500/50 hover:text-rose-500 cursor-pointer transition-colors"
              >
                Hide Structure
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleOrganSelect(activeOrgan)}
              className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
            >
              Re-center Focus
            </button>
          </div>
        </div>
      )}

      {/* Real Model Loading Progress Indicator */}
      {anyVisibleLoading && (
        <div className="pointer-events-none absolute top-14 right-3 z-20">
          <div className="w-60 rounded-lg border border-cyan-500/35 bg-white/95 dark:bg-[#0B1222]/95 px-3 py-2 text-xs text-cyan-700 dark:text-cyan-300 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 truncate text-[11px] font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span className="truncate">{loadingProgressStats.label}</span>
              </span>
              <span className="font-mono tabular-nums text-[11px] font-semibold">
                {loadingProgressStats.percent}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-cyan-500 transition-all duration-200"
                style={{ width: `${loadingProgressStats.percent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 15 Anatomical Structures Quick-Focus Drawer */}
      {structuresOpen && manifest && (
        <div className="absolute top-14 right-3 z-30 w-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/98 dark:bg-[#0B1222]/98 p-3.5 shadow-lg">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <Compass className="w-3.5 h-3.5 text-cyan-500" />
              Focus Anatomical Structure
            </div>
            <button
              type="button"
              onClick={() => setStructuresOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
            {QUICK_ANATOMY_TARGETS.map((target) => {
              const isLayerOn = Boolean(layerVisibility[target.layerId]);
              return (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => handleQuickStructureSelect(target)}
                  className={`flex items-center justify-between gap-1 rounded-lg border px-2.5 py-2 text-left text-[11px] font-medium transition-colors cursor-pointer ${
                    isLayerOn
                      ? 'border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#070C18] text-slate-900 dark:text-slate-100 hover:border-cyan-500/50'
                      : 'border-slate-200/70 dark:border-slate-800/60 bg-slate-50/40 dark:bg-[#070C18]/50 text-slate-500 dark:text-slate-400 hover:border-cyan-500/40'
                  }`}
                >
                  <span className="truncate">{target.label}</span>
                  <Crosshair className="w-3 h-3 shrink-0 text-cyan-500 opacity-75" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Layers Drawer */}
      {layersDrawerOpen && manifest && (
        <div className="absolute top-14 right-3 z-30 w-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/98 dark:bg-[#0B1222]/98 p-3.5 shadow-lg">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <Sliders className="w-3.5 h-3.5 text-cyan-500" />
              Anatomical Layers ({manifest.layers.length})
            </div>
            <button
              type="button"
              onClick={() => setLayersDrawerOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-2.5 space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {manifest.layers.map((layer) => {
              const vis = Boolean(layerVisibility[layer.id]);
              const opac = layerOpacities[layer.id] ?? 1;
              const isLoaded = Boolean(loadedLayers[layer.id]);
              const err = layerErrors[layer.id];

              return (
                <div
                  key={layer.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#070C18] p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setLayerVisibility((prev) => ({ ...prev, [layer.id]: !prev[layer.id] }))
                      }
                      className="flex items-center gap-2 text-left text-xs font-medium text-slate-900 dark:text-slate-100 cursor-pointer min-w-0"
                    >
                      {vis ? (
                        <Eye className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="truncate">{layer.label}</span>
                    </button>

                    <span className="font-mono tabular-nums text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
                      {vis && !isLoaded && !err ? 'Loading...' : `${layer.meshCount}`}
                    </span>
                  </div>

                  {err && <div className="mt-1 text-[10px] text-rose-500">{err}</div>}

                  {vis && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        Opacity
                      </span>
                      <input
                        type="range"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={opac}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setLayerOpacities((prev) => ({ ...prev, [layer.id]: val }));
                          if (layer.id === 'body') setSkinOpacity(val);
                        }}
                        aria-label={`${layer.label} opacity`}
                        className="flex-1 accent-cyan-500 cursor-pointer"
                      />
                      <span className="font-mono tabular-nums text-[10px] text-slate-500 dark:text-slate-400 w-7 text-right">
                        {Math.round(opac * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* License & Attribution Drawer */}
      {attributionOpen && (
        <div className="absolute top-14 right-3 z-30 w-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/98 dark:bg-[#0B1222]/98 p-3.5 shadow-lg text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Anatomical Mesh Licensing
            </span>
            <button
              type="button"
              onClick={() => setAttributionOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-2.5 space-y-2 text-[11px] text-slate-600 dark:text-slate-300">
            {Z_ANATOMY_ATTRIBUTIONS.map((attr) => (
              <div
                key={attr.title}
                className="rounded-lg bg-slate-50 dark:bg-[#070C18] p-2 border border-slate-200/80 dark:border-slate-800/70"
              >
                <div className="font-semibold text-slate-900 dark:text-slate-100">{attr.title}</div>
                <div className="text-slate-500 dark:text-slate-400">{attr.authors}</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-cyan-600 dark:text-cyan-400">
                    {attr.license}
                  </span>
                  <a
                    href={attr.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-600 dark:text-cyan-400 hover:underline"
                  >
                    Official Source
                  </a>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
              References: {Z_ANATOMY_REFERENCE_CREDITS.join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Hidden Structures Restorer Indicator */}
      {hiddenMeshUuids.size > 0 && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
          <span>{hiddenMeshUuids.size} anatomical structure(s) hidden</span>
          <button
            type="button"
            onClick={handleUnhideAll}
            className="font-semibold underline hover:text-amber-900 dark:hover:text-amber-100 cursor-pointer ml-1"
          >
            Show All
          </button>
        </div>
      )}

      {/* Isolated Mode Indicator */}
      {isolatedOrganUuid && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-lg border border-cyan-500/50 bg-cyan-500/15 px-3 py-1.5 text-xs text-cyan-700 dark:text-cyan-300 font-medium">
          <span>Organ Isolation Active</span>
          <button
            type="button"
            onClick={handleRestoreCompleteBody}
            className="font-semibold underline hover:text-cyan-900 dark:hover:text-cyan-100 cursor-pointer ml-1"
          >
            Restore Body
          </button>
        </div>
      )}

      {/* 3D WebGL Canvas */}
      {contextLost ? (
        <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
          <AlertCircle className="w-8 h-8 text-amber-400 mb-3" />
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            3D WebGL Context Interrupted
          </h4>
          <p className="mt-1 max-w-md text-xs text-slate-600 dark:text-slate-400">
            Graphics context was suspended. Click below to reinitialize the 3D stage.
          </p>
          <button
            type="button"
            onClick={() => setContextLost(false)}
            className="mt-4 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
          >
            Reinitialize Viewport
          </button>
        </div>
      ) : (
        <Canvas
          frameloop={isSoftwareGl && !autoRotate ? 'demand' : 'always'}
          shadows={!isSoftwareGl}
          dpr={isSoftwareGl ? 1 : [1, 2]}
          camera={{ position: [0, 0.96, 3.85], fov: 38, near: 0.02, far: 60 }}
          gl={{
            antialias: !isSoftwareGl,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.08,
          }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            const canvas = gl.domElement;
            canvas.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              setContextLost(true);
            });
            canvas.addEventListener('webglcontextrestored', () => {
              setContextLost(false);
            });
          }}
        >
          <color attach="background" args={[stageBg]} />
          <fog attach="fog" args={[stageBg, 5.5, 14]} />

          <hemisphereLight args={['#e0f2fe', isDark ? '#0b1120' : '#cbd5e1', 0.68]} />
          <directionalLight
            position={[2.8, 4.2, 3.2]}
            intensity={1.38}
            color="#fff7ed"
            castShadow={!isSoftwareGl}
            shadow-mapSize={[1024, 1024]}
            shadow-bias={-0.0005}
          />
          <directionalLight position={[-3.2, 2.2, -2.5]} intensity={0.72} color="#38bdf8" />

          {/* Procedural Studio Environment */}
          <Environment resolution={128} frames={1} environmentIntensity={0.48}>
            <Lightformer form="rect" intensity={1.8} position={[0, 4, 2]} scale={[6, 4, 1]} color="#f8fafc" />
            <Lightformer form="rect" intensity={1.1} position={[-4, 2, -2]} scale={[4, 4, 1]} color="#bae6fd" />
            <Lightformer form="rect" intensity={0.9} position={[4, 1, -2]} scale={[4, 4, 1]} color="#e0f2fe" />
          </Environment>

          <DiagnosticStage
            activeReport={activeReport}
            selectedSystem={selectedSystem}
            onSelectSystem={(sys) => onSelectSystem(sys)}
            showGrid={showGrid}
            showSystemMarkers={showSystemMarkers}
            isDark={isDark}
          />

          {hasActiveAtlas &&
            manifest!.layers.map((layer) => (
              <ZAnatomyLayerMesh
                key={layer.id}
                layerMeta={layer}
                visible={Boolean(layerVisibility[layer.id])}
                layerOpacity={layerOpacities[layer.id] ?? 1}
                globalOpacity={globalOpacity}
                renderStyle={renderStyle}
                selectedOrganUuid={activeOrgan?.meshUuid || null}
                selectedSystem={selectedSystem}
                isolatedOrganUuid={isolatedOrganUuid}
                hiddenMeshUuids={hiddenMeshUuids}
                explodedFactor={explodedFactor}
                normalizeTransform={zAnatomyTransform}
                onLayerProgress={handleLayerProgress}
                onLayerLoaded={handleLayerLoaded}
                onLayerError={handleLayerError}
                onOrganHover={setHoveredOrgan}
                onOrganClick={handleOrganSelect}
              />
            ))}

          {showLabels && (
            <AnatomicalLabels
              onSelectTarget={handleQuickStructureSelect}
              isDark={isDark}
            />
          )}

          {!isSoftwareGl && (
            <ContactShadows
              position={[0, 0.004, 0]}
              opacity={isDark ? 0.45 : 0.25}
              scale={3.6}
              blur={2.2}
              far={2.2}
            />
          )}

          <CameraRig
            selectedSystem={selectedSystem}
            selectedOrgan={activeOrgan}
            preset={preset}
            presetNonce={presetNonce}
            zoomRequest={zoomRequest}
            autoRotate={autoRotate}
            isSoftwareGl={isSoftwareGl}
          />
        </Canvas>
      )}

      {/* Unified Ergonomic Bottom Control Dock */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center max-w-[96%]">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="mb-1 inline-flex items-center gap-1 rounded-t-lg border border-b-0 border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/94 px-3 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-cyan-500 transition-colors cursor-pointer shadow-xs"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-cyan-500" />
              Show Anatomical Controls
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              Hide Controls
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/96 dark:bg-[#0B1222]/96 px-3.5 py-2 shadow-lg backdrop-blur-none">
            {/* Camera View Presets */}
            <div className="flex items-center gap-1 pr-2 border-r border-slate-200 dark:border-slate-800">
              {(
                [
                  { id: 'anterior', label: 'Front' },
                  { id: 'posterior', label: 'Back' },
                  { id: 'lateral', label: 'Side' },
                  { id: 'superior', label: 'Top' },
                ] as const
              ).map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => triggerPreset(view.id)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    preset === view.id
                      ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {view.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => triggerZoom(0.76)}
                title="Zoom In"
                aria-label="Zoom In"
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => triggerZoom(1.3)}
                title="Zoom Out"
                aria-label="Zoom Out"
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => triggerPreset('reset')}
                title="Reset Camera & Selection"
                aria-label="Reset Camera"
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setAutoRotate((r) => !r)}
                title="Toggle Auto-Rotate"
                aria-label="Toggle Auto-Rotate"
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  autoRotate
                    ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <RefreshCw className={`w-3 h-3 ${autoRotate ? 'animate-spin' : ''}`} />
                Spin
              </button>
            </div>

            {/* Skin Transparency Slider */}
            <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                Skin Opacity
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={skinOpacity}
                onChange={(e) => handleSkinOpacityChange(parseFloat(e.target.value))}
                aria-label="Adjust skin transparency"
                className="w-16 accent-cyan-500 cursor-pointer"
              />
              <span className="font-mono tabular-nums text-[10px] text-slate-500 dark:text-slate-400 w-6">
                {Math.round(skinOpacity * 100)}%
              </span>
            </div>

            {/* Exploded View Slider & Reset */}
            <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                Explode
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={explodedFactor}
                onChange={(e) => setExplodedFactor(parseFloat(e.target.value))}
                aria-label="Anatomical exploded view"
                className="w-16 accent-cyan-500 cursor-pointer"
              />
              {explodedFactor > 0 && (
                <button
                  type="button"
                  onClick={() => setExplodedFactor(0)}
                  title="Reset Exploded View"
                  className="p-1 rounded text-cyan-500 hover:text-cyan-600 cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Rendering Styles (Natural, Ghost, X-Ray, Wireframe) */}
            <div className="flex items-center gap-1 pr-2 border-r border-slate-200 dark:border-slate-800">
              {(
                [
                  { id: 'standard', label: 'Natural' },
                  { id: 'ghost-skeleton', label: 'Ghost' },
                  { id: 'xray', label: 'X-Ray' },
                  { id: 'wireframe', label: 'Wire' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setRenderStyle(mode.id)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    renderStyle === mode.id
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {/* 3D Anatomical Landmark Labels Toggle */}
            <button
              type="button"
              onClick={() => setShowLabels((l) => !l)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                showLabels
                  ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              Labels
            </button>

            {/* Grid Toggle */}
            <button
              type="button"
              onClick={() => setShowGrid((g) => !g)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                showGrid
                  ? 'bg-slate-200/70 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              Grid
            </button>

            {/* Restore Complete Body Action */}
            <button
              type="button"
              onClick={handleRestoreCompleteBody}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/10 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" />
              Restore Body
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
