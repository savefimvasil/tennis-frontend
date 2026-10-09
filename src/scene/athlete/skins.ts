// Selectable players: Rocketbox avatars (MIT) and shirt recolours.

export interface Skin {
  id: string
  label: string
  /** Swatch colour shown in the menu. */
  swatch: string
  glb: string
  body: string
  bodyNormal: string
  head: string
  headNormal: string
  /** Hair cards alpha (alpha-tested). */
  opacity?: string
  /** Recolour the avatar's blue top to this colour at load time. */
  shirt?: string
}

const MALE = {
  glb: 'Sports_Male_04.glb',
  body: 'm026_body_color.jpg',
  bodyNormal: 'm026_body_normal.jpg',
  head: 'm026_head_color.jpg',
  headNormal: 'm026_head_normal.jpg',
}

export const SKINS: Skin[] = [
  { id: 'navy', label: 'Navy', swatch: '#1f3f7a', ...MALE },
  { id: 'coral', label: 'Coral', swatch: '#f0604f', ...MALE, shirt: '#f0604f' },
  { id: 'white', label: 'White', swatch: '#f2f2ee', ...MALE, shirt: '#f2f2ee' },
  { id: 'black', label: 'Black', swatch: '#26272b', ...MALE, shirt: '#26272b' },
  { id: 'lime', label: 'Lime', swatch: '#b9d63a', ...MALE, shirt: '#b9d63a' },
  {
    id: 'female',
    label: 'Grey',
    swatch: '#9aa0a6',
    glb: 'Sports_Female_02.glb',
    body: 'f013_body_color.jpg',
    bodyNormal: 'f013_body_normal.jpg',
    head: 'f013_head_color.jpg',
    headNormal: 'f013_head_normal.jpg',
    opacity: 'f013_opacity.png',
  },
]

export function skinById(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]
}

/** The opponent wears something that contrasts with the player's choice. */
export function opponentSkin(playerId: string): Skin {
  return skinById(playerId === 'coral' ? 'navy' : 'coral')
}
