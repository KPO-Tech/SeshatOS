import i18next, { type i18n, type TFunction } from 'i18next'
import { catalogLoader, i18nOptions } from './index'

/** An English instance, for the tests that draw a component: wrap it in an I18nextProvider. */
export async function englishI18n(): Promise<i18n> {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions('en'))
  return instance
}

/** A translation function in English, for the tests of code that takes `t`: they check the English text the catalogue holds. */
export async function englishT(): Promise<TFunction> {
  return (await englishI18n()).t
}
