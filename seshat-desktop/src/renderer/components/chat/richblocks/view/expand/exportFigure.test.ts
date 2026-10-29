import { describe, expect, it } from 'vitest'
import { fileSafeName } from './exportFigure'

describe('fileSafeName', () => {
  it('turns a title into a name a file can have', () => {
    expect(fileSafeName('Application desktop locale')).toBe('application-desktop-locale')
    expect(fileSafeName("Courbe d'apprentissage : perte / validation")).toBe('courbe-d-apprentissage-perte-validation')
    expect(fileSafeName('Déploiement à Genève')).toBe('deploiement-a-geneve')
  })

  it('falls back to a plain name, and stays short', () => {
    expect(fileSafeName('***')).toBe('figure')
    expect(fileSafeName('a'.repeat(200)).length).toBeLessThanOrEqual(60)
  })
})
