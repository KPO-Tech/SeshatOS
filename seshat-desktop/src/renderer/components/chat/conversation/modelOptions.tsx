import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import type { SelectorOption } from '@renderer/components/ui/SelectorPill'
import { modelAlias } from '@renderer/lib/modelAlias'
import { providerDisplayName, providerInitials, type ModelChoice } from './useConversationModels'

/** The models of a model menu, grouped by provider: the menu folds each provider's models under its name. */
export function modelSelectorOptions(choices: ModelChoice[]): SelectorOption[] {
  return choices.map((choice) => {
    const provider = providerDisplayName(choice.providerName, choice.providerKind)
    return {
      id: choice.id,
      label: modelAlias(choice.model.display_name || choice.model.model_id),
      description: provider,
      icon: <ProviderIcon provider={choice.providerKind} size={17} />,
      prefix: providerInitials(choice.providerName, choice.providerKind),
      group: choice.providerId,
      groupLabel: provider,
      groupIcon: <ProviderIcon provider={choice.providerKind} size={17} />,
    }
  })
}
