import { useNavigate } from 'react-router'

export function ConversationEmpty() {
  const navigate = useNavigate()
  return (
    <div className="conv-empty">
      <p>Conversation not found</p>
      <button onClick={() => navigate('/')}>Return Home</button>
    </div>
  )
}
