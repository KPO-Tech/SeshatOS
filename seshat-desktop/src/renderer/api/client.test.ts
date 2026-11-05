import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { catalogLoader, i18n, i18nOptions } from '@renderer/i18n'
import { ApiError, localizeApiMessage } from './client'

describe('the messages of the backend, in the language of the app', () => {
  beforeAll(async () => {
    await i18n.use(catalogLoader).init(i18nOptions('fr'))
  })
  afterAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('tells a message a person may meet in French', () => {
    expect(localizeApiMessage('rate limit exceeded')).toBe('Trop de requêtes. Réessayez dans un instant.')
    expect(localizeApiMessage('  Authentication required ')).toBe('Connexion requise.')
    expect(new ApiError(429, 'rate limit exceeded').message).toBe('Trop de requêtes. Réessayez dans un instant.')
  })

  it('leaves what is meant for the developer as the backend wrote it', () => {
    expect(localizeApiMessage('session_id is required')).toBe('session_id is required')
    expect(new ApiError(400, 'invalid request body').message).toBe('invalid request body')
  })

  it('follows the language when it changes', async () => {
    await i18n.changeLanguage('en')
    expect(localizeApiMessage('rate limit exceeded')).toBe('Too many requests. Try again in a moment.')
  })
})
