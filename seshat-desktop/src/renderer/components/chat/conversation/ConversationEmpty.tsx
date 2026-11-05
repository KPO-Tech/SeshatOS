import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'

export function ConversationEmpty() {
  const { t } = useTranslation('chat')
  const navigate = useNavigate()
  return (
    <div className="conv-empty">
      <p>{t('chat.conversation.conversationEmpty.conversationNotFound')}</p>
      <button onClick={() => navigate('/')}>{t('chat.conversation.conversationEmpty.returnHome')}</button>
    </div>
  )
}
