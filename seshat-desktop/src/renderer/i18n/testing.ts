import i18next, { type TFunction } from 'i18next'
import { catalogLoader, i18nOptions } from './index'

/** A translation function in English, for the tests of code that takes `t`: they check the English text the catalogue holds. */
export async function englishT(): Promise<TFunction> {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions('en'))
  return instance.t
}
