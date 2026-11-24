import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Html, Lightformer, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  AlertCircle,
  Box,
  ChevronDown,
  ChevronUp,
  Compass,
  Crosshair,
  Eye,
  EyeOff,
  Grid3X3,
  Info,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  Settings,
  Sliders,
  Upload,
  X,
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

type CameraPreset = 'anterior' | 'posterior' | 'lateral' | 'reset';
type RenderMode = 'standard' | 'ghost-skeleton' | 'xray' | 'wireframe';

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

const DEFAULT_CAMERA_POS = new THREE.Vector3(0, 0.98, 3.65);
const DEFAULT_TARGET = new THREE.Vector3(0, 0.9, 0);
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

    const dist = THREE.MathUtils.clamp(selectedOrgan.radius * 3.1, 0.34, 1.85);
    _desiredPos.copy(_desiredTarget).addScaledVector(_viewDir, dist);
    activeTransition.current = true;
    invalidate();
  }, [selectedOrgan, camera, invalidate]);

  useEffect(() => {
    if (selectedOrgan || !selectedSystem) return;
    const meta = SYSTEM_META_MAP[selectedSystem];
    _desiredTarget.set(...meta.cameraTarget);
    _desiredPos.set(...meta.cameraOffset);
    activeTransition.current = true;
    invalidate();
  }, [selectedSystem, selectedOrgan, invalidate]);

  useEffect(() => {
    if (!preset) return;
    if (preset === 'anterior') {
      _desiredTarget.copy(DEFAULT_TARGET);
      _desiredPos.set(0, 0.98, 3.65);
    } else if (preset === 'posterior') {
      _desiredTarget.copy(DEFAULT_TARGET);
      _desiredPos.set(0, 0.98, -3.65);
    } else if (preset === 'lateral') {
      _desiredTarget.copy(DEFAULT_TARGET);
      _desiredPos.set(3.55, 0.98, 0.25);
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
    const nextDist = THREE.MathUtils.clamp(currentDist * zoomRequest.delta, 0.24, 5.8);
    _desiredPos.copy(target).addScaledVector(_viewDir, nextDist);
    activeTransition.current = true;
    invalidate();
  }, [zoomRequest, camera, invalidate]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (activeTransition.current) {
      const dampLambda = isSoftwareGl ? 16 : 6.5;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, _desiredPos.x, dampLambda, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _desiredPos.y, dampLambda, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _desiredPos.z, dampLambda, delta);

      controls.target.x = THREE.MathUtils.damp(controls.target.x, _desiredTarget.x, dampLambda, delta);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, _desiredTarget.y, dampLambda, delta);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, _desiredTarget.z, dampLambda, delta);

      if (
        camera.position.distanceTo(_desiredPos) < 0.01 &&
        controls.target.distanceTo(_desiredTarget) < 0.01
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
      target={[0, 0.9, 0]}
      enableRotate
      enableZoom
      enablePan
      screenSpacePanning
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      autoRotate={autoRotate}
      autoRotateSpeed={1.2}
      enableDamping={!isSoftwareGl}
      dampingFactor={0.07}
      minDistance={0.18}
      maxDistance={6.0}
      minPolarAngle={0.08}
      maxPolarAngle={Math.PI * 0.65}
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
  }
): THREE.Material {
  const std =
    base instanceof THREE.MeshStandardMaterial
      ? base.clone()
      : new THREE.MeshStandardMaterial({ color: '#cbd5e1' });
  const baseOpacity = base.transparent ? base.opacity : 1;
  const targetOpacity = opts.highlighted
    ? 1
    : opts.xray
      ? Math.min(0.28, opts.opacity)
      : baseOpacity * opts.opacity * (opts.dimmed ? 0.45 : 1);

  std.wireframe = opts.wireframe;
  std.transparent = targetOpacity < 0.98;
  std.opacity = targetOpacity;
  std.depthWrite = targetOpacity >= 0.92;

  if (opts.highlighted) {
    std.emissive = new THREE.Color('#06b6d4');
    std.emissiveIntensity = 0.42;
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
  renderMode: RenderMode;
  selectedOrganUuid: string | null;
  selectedSystem: AnatomicalSystemId | null;
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
  renderMode,
  selectedOrganUuid,
  selectedSystem,
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

  useEffect(() => {
    if (!sceneRoot) return;
    sceneRoot.visible = visible;
    if (!visible) {
      invalidate();
      return;
    }

    const isGhostLayer =
      renderMode === 'ghost-skeleton' &&
      (layerMeta.id === 'skeletal' || layerMeta.id === 'muscular' || layerMeta.id === 'joints' || layerMeta.id === 'body');
    const effectiveLayerOpacity = isGhostLayer
      ? Math.min(layerOpacity, 0.2)
      : layerOpacity * globalOpacity;

    const passThroughBodyShell = layerMeta.id === 'body' && effectiveLayerOpacity < 0.45;

    sceneRoot.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      const orig = originalMaterialsRef.current.get(mesh);
      if (!orig) return;

      mesh.raycast = passThroughBodyShell ? NOOP_RAYCAST : THREE.Mesh.prototype.raycast;

      const isSelected = Boolean(selectedOrganUuid && mesh.uuid === selectedOrganUuid);
      const meshSys = mesh.userData.system as AnatomicalSystemId | undefined;
      const dimmed = Boolean(
        !selectedOrganUuid && selectedSystem && meshSys && meshSys !== selectedSystem && layerMeta.id !== 'body'
      );

      const opts = {
        opacity: effectiveLayerOpacity,
        wireframe: renderMode === 'wireframe',
        xray: renderMode === 'xray',
        highlighted: isSelected,
        dimmed,
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
    renderMode,
    selectedOrganUuid,
    selectedSystem,
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

interface SingleCustomAssetProps {
  url: string;
  renderMode: RenderMode;
  globalOpacity: number;
  selectedOrganUuid: string | null;
  selectedSystem: AnatomicalSystemId | null;
  onOrgansDiscovered?: (organs: DiscoveredOrganEntry[]) => void;
  onLoadStateChange: (state: { loading: boolean; progress: number; error: string | null }) => void;
  onOrganHover: (info: { displayName: string; layerLabel: string; system: AnatomicalSystemId } | null) => void;
  onOrganClick: (organ: SelectedOrganInfo) => void;
}

const SingleCustomAsset: React.FC<SingleCustomAssetProps> = ({
  url,
  renderMode,
  globalOpacity,
  selectedOrganUuid,
  selectedSystem,
  onOrgansDiscovered,
  onLoadStateChange,
  onOrganHover,
  onOrganClick,
}) => {
  const { invalidate } = useThree();
  const [sceneRoot, setSceneRoot] = useState<THREE.Group | null>(null);
  const originalMaterialsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const loader = createConfiguredGltfLoader();
    onLoadStateChange({ loading: true, progress: 5, error: null });

    loader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        const root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 1.85 / maxDim;
        root.scale.setScalar(scale);

        root.updateMatrixWorld(true);
        const scaledBox = new THREE.Box3().setFromObject(root);
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        root.position.set(-scaledCenter.x, -scaledBox.min.y + 0.02, -scaledCenter.z);
        root.updateMatrixWorld(true);

        const organs: DiscoveredOrganEntry[] = [];
        const matMap = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
        const tmpBox = new THREE.Box3();
        const tmpCenter = new THREE.Vector3();
        const tmpSphere = new THREE.Sphere();

        root.traverse((obj) => {
          if (!(obj as THREE.Mesh).isMesh) return;
          const mesh = obj as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          matMap.set(mesh, mesh.material);

          const rawName = mesh.name || 'Structure';
          const system = correlateOrganToSystem(rawName);
          mesh.userData.system = system;

          tmpBox.setFromObject(mesh);
          if (!tmpBox.isEmpty()) {
            tmpBox.getCenter(tmpCenter);
            tmpBox.getBoundingSphere(tmpSphere);
            organs.push({
              rawName,
              displayName: formatOrganDisplayName(rawName),
              layerId: 'custom',
              system,
              meshUuid: mesh.uuid,
              center: [tmpCenter.x, tmpCenter.y, tmpCenter.z],
              radius: tmpSphere.radius || 0.14,
            });
          }
        });

        originalMaterialsRef.current = matMap;
        onOrgansDiscovered?.(organs);
        setSceneRoot(root);
        onLoadStateChange({ loading: false, progress: 100, error: null });
        invalidate();
      },
      (evt) => {
        if (cancelled) return;
        const pct = evt.lengthComputable && evt.total > 0 ? Math.round((evt.loaded / evt.total) * 100) : 50;
        onLoadStateChange({ loading: true, progress: pct, error: null });
      },
      (err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Unable to load 3D model file.';
        setSceneRoot(null);
        onLoadStateChange({ loading: false, progress: 0, error: msg });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [url, onLoadStateChange, onOrgansDiscovered, invalidate]);

  useEffect(() => {
    if (!sceneRoot) return;
    sceneRoot.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      const orig = originalMaterialsRef.current.get(mesh);
      if (!orig) return;

      const isSelected = Boolean(selectedOrganUuid && mesh.uuid === selectedOrganUuid);
      const meshSys = mesh.userData.system as AnatomicalSystemId | undefined;
      const dimmed = Boolean(
        !selectedOrganUuid && selectedSystem && meshSys && meshSys !== selectedSystem
      );

      const opts = {
        opacity: globalOpacity,
        wireframe: renderMode === 'wireframe',
        xray: renderMode === 'xray',
        highlighted: isSelected,
        dimmed,
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
  }, [sceneRoot, renderMode, globalOpacity, selectedOrganUuid, selectedSystem, invalidate]);

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

  if (!sceneRoot) return null;

  return (
    <primitive
      object={sceneRoot}
      onPointerOver={(e: { stopPropagation: () => void; object: THREE.Object3D }) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
        const mesh = e.object as THREE.Mesh;
        onOrganHover({
          displayName: formatOrganDisplayName(mesh.name || 'Structure'),
          layerLabel: 'Custom GLB',
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

        onOrganClick({
          rawName,
          displayName: formatOrganDisplayName(rawName),
          layerId: 'custom',
          system: correlateOrganToSystem(rawName),
          meshUuid: mesh.uuid,
          center: [center.x, center.y, center.z],
          radius: sphere.radius || 0.14,
        });
      }}
    />
  );
};

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
        <cylinderGeometry args={[0.88, 0.96, 0.05, 64]} />
        <meshStandardMaterial color={plinthColor} roughness={0.48} metalness={0.42} />
      </mesh>

      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.72, 0.74, 64]} />
        <meshBasicMaterial color="#06b6d4" transparent opacity={0.55} />
      </mesh>

      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.84, 0.85, 64]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.28} />
      </mesh>

      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.45, 0.458, 64]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.4} />
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

  const [renderMode, setRenderMode] = useState<RenderMode>('standard');
  const [globalOpacity, setGlobalOpacity] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [showSystemMarkers, setShowSystemMarkers] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(compact);
  const [layersDrawerOpen, setLayersDrawerOpen] = useState(false);
  const [structuresOpen, setStructuresOpen] = useState(false);
  const [attributionOpen, setAttributionOpen] = useState(false);
  const [contextLost, setContextLost] = useState(false);

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

  const [customLoadState, setCustomLoadState] = useState<{
    loading: boolean;
    progress: number;
    error: string | null;
  }>({
    loading: false,
    progress: 0,
    error: null,
  });
  const [uploadingModel, setUploadingModel] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [internalSelectedOrgan, setInternalSelectedOrgan] = useState<SelectedOrganInfo | null>(null);
  const activeOrgan = controlledOrgan !== undefined ? controlledOrgan : internalSelectedOrgan;
  const [hoveredOrgan, setHoveredOrgan] = useState<{
    displayName: string;
    layerLabel: string;
    system: AnatomicalSystemId;
  } | null>(null);

  const isZAnatomyAtlas =
    !modelAsset || modelAsset.url === '/models/z-anatomy/manifest.json';

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

  const handleModelFile = async (file: File) => {
    setUploadError(null);
    setUploadingModel(true);
    try {
      await onUploadModelFile(file);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to load 3D model.');
    } finally {
      setUploadingModel(false);
    }
  };

  const triggerPreset = (nextPreset: CameraPreset) => {
    if (nextPreset === 'reset') {
      handleOrganSelect(null);
      onSelectSystem(null);
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

  const hasActiveAtlas = Boolean(isZAnatomyAtlas && manifest);
  const hasCustomGlb = Boolean(!isZAnatomyAtlas && modelAsset);
  const hasAnyRealModel = hasActiveAtlas || hasCustomGlb;

  const visibleAtlasLayers = useMemo(
    () => (hasActiveAtlas ? manifest!.layers.filter((l) => layerVisibility[l.id]) : []),
    [hasActiveAtlas, manifest, layerVisibility]
  );

  const anyVisibleLoading = visibleAtlasLayers.some(
    (l) => !loadedLayers[l.id] && !layerErrors[l.id]
  );

  const visibleLayerErrorEntries = useMemo(
    () =>
      visibleAtlasLayers
        .filter((l) => layerErrors[l.id])
        .map((l) => ({ id: l.id, label: l.label, url: l.url, error: layerErrors[l.id] })),
    [visibleAtlasLayers, layerErrors]
  );

  const loadingProgressStats = useMemo(() => {
    if (hasCustomGlb && customLoadState.loading) {
      return { percent: customLoadState.progress, label: 'Loading custom .GLB asset' };
    }
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
  }, [hasCustomGlb, customLoadState, hasActiveAtlas, visibleAtlasLayers, layerProgress, loadedLayers]);

  const stageBg = isDark ? '#060B16' : '#F1F5F9';

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden border border-slate-200 dark:border-slate-800/80 bg-slate-100 dark:bg-[#060B16] ${
        isFullscreen
          ? 'fixed inset-0 z-50 w-screen h-screen rounded-none'
          : `w-full rounded-xl ${compact ? 'h-[480px] lg:h-[560px]' : 'h-[580px] lg:h-[700px]'}`
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void handleModelFile(file);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleModelFile(file);
          e.target.value = '';
        }}
      />

      {/* Top HUD Bar */}
      <div className="pointer-events-none absolute top-3 left-3 right-3 z-20 flex items-start justify-between gap-2">
        <div className="pointer-events-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/94 px-3 py-1.5 max-w-[280px]">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
            <Box className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
            <span className="truncate">
              {hasActiveAtlas
                ? 'Z-Anatomy 3D Human Atlas'
                : hasCustomGlb
                  ? modelAsset!.name
                  : '3D Anatomical Workspace'}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">
            {hasActiveAtlas
              ? 'Click organs to focus · Drag to rotate · Right-drag to pan'
              : hasCustomGlb
                ? 'Click meshes to inspect organ correlations'
                : 'Awaiting anatomical .GLB/.GLTF asset'}
          </p>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5 shrink-0">
          {hasActiveAtlas && (
            <button
              type="button"
              onClick={() => {
                setStructuresOpen((v) => !v);
                setLayersDrawerOpen(false);
                setAttributionOpen(false);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                structuresOpen
                  ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                  : 'border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/94 text-slate-700 dark:text-slate-200 hover:border-cyan-500/50'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              Structures
            </button>
          )}

          {hasActiveAtlas && (
            <button
              type="button"
              onClick={() => {
                setLayersDrawerOpen((v) => !v);
                setStructuresOpen(false);
                setAttributionOpen(false);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                layersDrawerOpen
                  ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                  : 'border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/94 text-slate-700 dark:text-slate-200 hover:border-cyan-500/50'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Layers
            </button>
          )}

          {hasActiveAtlas && (
            <button
              type="button"
              onClick={() => {
                setAttributionOpen((v) => !v);
                setLayersDrawerOpen(false);
                setStructuresOpen(false);
              }}
              title="Z-Anatomy & BodyParts3D License Attribution"
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                attributionOpen
                  ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                  : 'border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/94 text-slate-600 dark:text-slate-300 hover:border-cyan-500/50'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CC BY-SA 4.0</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/94 p-1.5 text-slate-600 dark:text-slate-300 hover:border-cyan-500/50 transition-colors cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Selected / Hover Organ HUD */}
      {(hoveredOrgan || activeOrgan) && (
        <div className="pointer-events-none absolute top-[68px] left-3 z-20 flex flex-col gap-1.5 max-w-xs">
          {activeOrgan && (
            <div className="pointer-events-auto flex items-center justify-between gap-2.5 rounded-lg border border-cyan-500/50 bg-white/96 dark:bg-[#0B1222]/96 px-3 py-2 text-xs shadow-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-cyan-600 dark:text-cyan-400">
                  <Crosshair className="w-3 h-3" />
                  <span>Selected Organ · {SYSTEM_META_MAP[activeOrgan.system].label}</span>
                </div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                  {activeOrgan.displayName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => triggerPreset('reset')}
                aria-label="Clear organ focus"
                className="p-1 rounded text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {hoveredOrgan && hoveredOrgan.displayName !== activeOrgan?.displayName && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/94 px-3 py-1.5 text-[11px]">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {hoveredOrgan.displayName}
              </span>
              <span className="text-slate-500 dark:text-slate-400 ml-1.5">
                · {hoveredOrgan.layerLabel}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Real Model Loading Progress Indicator */}
      {(anyVisibleLoading || customLoadState.loading) && (
        <div className="pointer-events-none absolute top-[68px] right-3 z-20">
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
                        min={0.08}
                        max={1}
                        step={0.04}
                        value={opac}
                        onChange={(e) =>
                          setLayerOpacities((prev) => ({
                            ...prev,
                            [layer.id]: parseFloat(e.target.value),
                          }))
                        }
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
              <div key={attr.title} className="rounded-lg bg-slate-50 dark:bg-[#070C18] p-2 border border-slate-200/80 dark:border-slate-800/70">
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

      {/* Actionable Model Setup / Load Failure State (never renders fake primitive anatomy) */}
      {manifestChecked && !hasAnyRealModel && (
        <div className="pointer-events-none absolute inset-x-4 top-20 z-10 flex justify-end">
          <div className="pointer-events-auto w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/95 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-500">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Anatomical 3D Asset Setup Required
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {manifestError
                    ? `Asset manifest unavailable (${manifestError}).`
                    : 'No anatomical .GLB/.GLTF asset is loaded.'}{' '}
                  Place converted Z-Anatomy GLB layers under{' '}
                  <code className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400">
                    public/models/z-anatomy/
                  </code>{' '}
                  or upload a licensed `.glb` / `.gltf` file.
                </p>
              </div>
            </div>

            {uploadError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-xs text-rose-600 dark:text-rose-300">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={uploadingModel}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploadingModel ? 'Loading Asset...' : 'Load .GLB / .GLTF'}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Settings className="w-3.5 h-3.5" />
                Configure Asset Path
              </button>
            </div>
          </div>
        </div>
      )}

      {(customLoadState.error || visibleLayerErrorEntries.length > 0) && (
        <div className="pointer-events-none absolute top-20 right-4 z-10 max-w-sm">
          <div className="pointer-events-auto flex items-start gap-2 rounded-lg border border-rose-500/30 bg-white/95 dark:bg-[#0B1222]/95 px-3.5 py-2.5 text-xs text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              {customLoadState.error ? (
                <span>Failed to load custom model: {customLoadState.error}</span>
              ) : (
                <span>
                  Failed to load layer asset ({visibleLayerErrorEntries[0].url}):{' '}
                  {visibleLayerErrorEntries[0].error}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {isDragging && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-cyan-950/75 border-2 border-dashed border-cyan-400">
          <div className="rounded-xl bg-[#0B1222] px-6 py-4 text-center border border-cyan-500/40">
            <Upload className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-100">Drop .GLB or .GLTF Anatomical Asset</p>
          </div>
        </div>
      )}

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
          camera={{ position: [0, 0.98, 3.65], fov: 40, near: 0.05, far: 40 }}
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
          <fog attach="fog" args={[stageBg, 5, 13]} />

          <hemisphereLight args={['#e0f2fe', isDark ? '#0b1120' : '#cbd5e1', 0.65]} />
          <directionalLight
            position={[2.8, 4.2, 3.2]}
            intensity={1.35}
            color="#fff7ed"
            castShadow={!isSoftwareGl}
            shadow-mapSize={[1024, 1024]}
            shadow-bias={-0.0005}
          />
          <directionalLight position={[-3.2, 2.2, -2.5]} intensity={0.7} color="#38bdf8" />

          {/* Procedural Studio Environment (zero external HDR fetch) */}
          <Environment resolution={128} frames={1} environmentIntensity={0.45}>
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
                renderMode={renderMode}
                selectedOrganUuid={activeOrgan?.meshUuid || null}
                selectedSystem={selectedSystem}
                normalizeTransform={zAnatomyTransform}
                onLayerProgress={handleLayerProgress}
                onLayerLoaded={handleLayerLoaded}
                onLayerError={handleLayerError}
                onOrganHover={setHoveredOrgan}
                onOrganClick={handleOrganSelect}
              />
            ))}

          {hasCustomGlb && (
            <SingleCustomAsset
              url={modelAsset!.url}
              renderMode={renderMode}
              globalOpacity={globalOpacity}
              selectedOrganUuid={activeOrgan?.meshUuid || null}
              selectedSystem={selectedSystem}
              onOrgansDiscovered={onOrgansDiscovered}
              onLoadStateChange={setCustomLoadState}
              onOrganHover={setHoveredOrgan}
              onOrganClick={handleOrganSelect}
            />
          )}

          {!isSoftwareGl && (
            <ContactShadows
              position={[0, 0.004, 0]}
              opacity={isDark ? 0.45 : 0.25}
              scale={3.5}
              blur={2.2}
              far={2}
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

      {/* Unified Collapsible Bottom Control Dock */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center max-w-[96%]">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="mb-1 inline-flex items-center gap-1 rounded-t-lg border border-b-0 border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/94 px-3 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-cyan-500 transition-colors cursor-pointer"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Show Controls
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Hide Controls
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1222]/95 px-3 py-2 shadow-sm">
            <div className="flex items-center gap-1 pr-2 border-r border-slate-200 dark:border-slate-800">
              {(
                [
                  { id: 'anterior', label: 'Front' },
                  { id: 'posterior', label: 'Back' },
                  { id: 'lateral', label: 'Side' },
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
                onClick={() => triggerZoom(0.78)}
                title="Zoom In"
                aria-label="Zoom In"
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => triggerZoom(1.28)}
                title="Zoom Out"
                aria-label="Zoom Out"
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => triggerPreset('reset')}
                title="Reset Camera"
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

            {hasAnyRealModel && (
              <div className="flex items-center gap-1 pr-2 border-r border-slate-200 dark:border-slate-800">
                {(
                  [
                    { id: 'standard', label: 'Natural' },
                    { id: 'ghost-skeleton', label: 'Ghost Shell' },
                    { id: 'xray', label: 'X-Ray' },
                    { id: 'wireframe', label: 'Wire' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setRenderMode(mode.id)}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      renderMode === mode.id
                        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/30'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            )}

            {hasAnyRealModel && (
              <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Opacity</span>
                <input
                  type="range"
                  min={0.15}
                  max={1}
                  step={0.05}
                  value={globalOpacity}
                  onChange={(e) => setGlobalOpacity(parseFloat(e.target.value))}
                  aria-label="Global model opacity"
                  className="w-16 accent-cyan-500 cursor-pointer"
                />
              </div>
            )}

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

            <button
              type="button"
              onClick={() => setShowSystemMarkers((m) => !m)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                showSystemMarkers
                  ? 'bg-slate-200/70 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              Pins
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/10 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              Custom .GLB
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
