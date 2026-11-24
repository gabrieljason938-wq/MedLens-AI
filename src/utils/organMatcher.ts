import type { AnatomicalSystemId } from '../types/medical';

export function formatOrganDisplayName(rawName: string): string {
  if (!rawName) return 'Anatomical Structure';
  return rawName
    .replace(/\.[0-9]+$/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LAYER_TO_SYSTEM: Record<string, AnatomicalSystemId> = {
  cardiovascular: 'cardiovascular',
  skeletal: 'musculoskeletal',
  muscular: 'musculoskeletal',
  nervous: 'neurological',
  lymphoid: 'immune',
  joints: 'musculoskeletal',
  body: 'musculoskeletal',
  visceral: 'metabolic',
};

const ORGAN_KEYWORD_TO_SYSTEM: Array<[RegExp, AnatomicalSystemId]> = [
  [/heart|atrium|ventricle|aort|coronary|arter|vein|vena|carotid|pulmonary_trunk|pericard/i, 'cardiovascular'],
  [/liver|hepat|gallbladder|bile|biliary|cystic_duct|portal/i, 'hepatic'],
  [/kidney|renal|nephr|ureter|bladder|urethra|suprarenal/i, 'renal'],
  [/lung|bronch|trachea|larynx|pharynx|pleura|diaphragm|alveol|nasal/i, 'pulmonary'],
  [/thyroid|parathyroid|pituitary|adrenal|pineal|pancrea|islet|ovary|testis/i, 'endocrine'],
  [/spleen|lymph|thymus|tonsil|cisterna/i, 'immune'],
  [/brain|cerebr|cerebell|cortex|hippocamp|thalam|medulla|pons|spinal|nerve|plexus|ganglion|eye|optic/i, 'neurological'],
  [/stomach|duoden|jejun|ileum|colon|rectum|esophag|oesophag|intestin|cecum|appendix|peritoneum|omentum/i, 'metabolic'],
  [/bone|skull|cranium|mandible|vertebra|rib|sternum|clavicle|scapula|humerus|radius|ulna|femur|tibia|fibula|pelvis|sacrum|muscle|tendon|ligament|cartilage|joint/i, 'musculoskeletal'],
  [/marrow|erythro|heme/i, 'hematologic'],
];

export function correlateOrganToSystem(
  organName: string,
  layerId?: string
): AnatomicalSystemId {
  for (const [regex, system] of ORGAN_KEYWORD_TO_SYSTEM) {
    if (regex.test(organName)) {
      return system;
    }
  }
  if (layerId && LAYER_TO_SYSTEM[layerId]) {
    return LAYER_TO_SYSTEM[layerId];
  }
  return 'metabolic';
}
