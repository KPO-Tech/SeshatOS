import { useId } from 'react'
import { TextInput } from '../../knowledge/KnowledgePrimitives'
import { SelectField, SettingRow } from '../../../settings/kit'
import type { AudioField } from './audioFields'
import type { AudioDraft } from './useAudioDraft'

const DEFAULT_CHOICE = '__default__'

/** One row per field: a list when the values are fixed, a text box with suggestions when any name goes. */
export function AudioFieldRows({ fields, draft }: { fields: readonly AudioField[]; draft: AudioDraft }) {
  const listId = useId()
  return (
    <>
      {fields.map((field) => (
        <SettingRow key={field.name} title={field.label}>
          <div className="w-[240px]">
            {field.choices ? (
              <SelectField
                compact
                value={draft.form[field.name] || DEFAULT_CHOICE}
                options={[{ value: DEFAULT_CHOICE, label: 'Provider default' }, ...field.choices]}
                onChange={(value) => draft.update(field.name, value === DEFAULT_CHOICE ? '' : value)}
              />
            ) : (
              <>
                <TextInput
                  className="h-9 w-full"
                  value={draft.form[field.name] ?? ''}
                  onChange={(event) => draft.update(field.name, event.target.value)}
                  placeholder={field.placeholder}
                  list={field.suggestions ? `${listId}-${field.name}` : undefined}
                  disabled={draft.loading}
                />
                {field.suggestions && (
                  <datalist id={`${listId}-${field.name}`}>
                    {field.suggestions.map((value) => (
                      <option key={value} value={value} />
                    ))}
                  </datalist>
                )}
              </>
            )}
          </div>
        </SettingRow>
      ))}
    </>
  )
}
