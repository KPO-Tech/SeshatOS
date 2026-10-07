# 0001 - Where Go ends and Python begins

Moved to SeshatCloud (`docs/decisions/0001-go-python-boundary.md`), 2026-10-05, together with
`seshat-intelligence`: the Python service only runs next to `seshat-server`.
`seshat-backend` stays Go, is the local desktop backend, and reaches a document reading service only
through the optional `DOCUMENT_READER_URL`.
