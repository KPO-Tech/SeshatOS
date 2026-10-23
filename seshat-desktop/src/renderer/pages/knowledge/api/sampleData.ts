import type { KnowledgeCollection, KnowledgeDocument } from './types'

// Made-up documents for a company that does not exist, used until the Knowledge pages are connected to SeshatCloud.
export const SAMPLE_COLLECTIONS: KnowledgeCollection[] = [
  { id: 'legal', name: 'Legal', description: 'Contract templates', documentCount: 1 },
  { id: 'procurement', name: 'Procurement', description: 'Suppliers, reviews and framework agreements', documentCount: 2 },
  { id: 'people', name: 'People', description: 'Policies and onboarding', documentCount: 3 }
]

export const SAMPLE_DOCUMENTS: KnowledgeDocument[] = [
  {
    id: 'doc-supplier-template',
    name: 'Supplier contract template',
    kind: 'docx',
    collectionId: 'legal',
    source: 'Google Drive',
    updatedAt: '2026-01-14',
    pageCount: 31,
    pages: [
      { number: 11, text: 'Section 8 describes the obligations of the supplier during the term of the agreement, including delivery schedules, quality checks and the handling of returned goods.' },
      { number: 12, text: 'Section 9, Termination. Either party may end this agreement by giving the other party sixty (60) days written notice. During the notice period both parties continue to meet their obligations under this agreement. Notice is given by registered letter or by the contract management platform.' },
      { number: 13, text: 'Section 10 covers confidentiality. Each party keeps the non-public information of the other party confidential for the term of the agreement and for three years after it ends.' }
    ]
  },
  {
    id: 'doc-framework-logistics',
    name: 'Framework agreement, logistics',
    kind: 'pdf',
    collectionId: 'procurement',
    source: 'SharePoint',
    updatedAt: '2026-03-02',
    pageCount: 18,
    pages: [
      { number: 3, text: 'Annex A lists the services covered by this framework agreement: road freight, warehousing and last-mile delivery for the sites named in Annex B.' },
      { number: 4, text: 'Clause 4.2. For services ordered under this framework agreement, the notice period is thirty (30) days instead of the period in the supplier contract template. Orders already confirmed are honoured until delivery.' },
      { number: 5, text: 'Clause 5 sets the service levels: delivery within the agreed window in at least 95 per cent of orders, reported monthly.' }
    ]
  },
  {
    id: 'doc-remote-policy',
    name: 'Remote work policy',
    kind: 'pdf',
    collectionId: 'people',
    source: 'SharePoint',
    updatedAt: '2025-11-20',
    pageCount: 6,
    pages: [
      { number: 1, text: 'This policy applies to every employee whose role can be done away from the office. It sets the shared rules; each team may add its own rhythm.' },
      { number: 2, text: 'Employees may work remotely up to three days per week. Days in the office are agreed with the team lead and noted in the shared calendar. Working from another country is not covered by this policy and needs approval from People.' },
      { number: 3, text: 'Equipment for remote work is requested through the IT service desk. A monthly allowance for internet costs is paid on request.' }
    ]
  },
  {
    id: 'doc-expense-policy',
    name: 'Expense policy',
    kind: 'docx',
    collectionId: 'people',
    source: 'Google Drive',
    updatedAt: '2026-02-09',
    pageCount: 9,
    pages: [
      { number: 3, text: 'Meals while travelling are reimbursed up to 35 euros per day on presentation of the receipt. Alcohol is not reimbursed.' },
      { number: 4, text: 'Any single expense above 500 euros needs the prior approval of a manager. Expenses are submitted within thirty days of the date on the receipt.' }
    ]
  },
  {
    id: 'doc-onboarding',
    name: 'Onboarding checklist',
    kind: 'md',
    collectionId: 'people',
    source: 'Notion',
    updatedAt: '2026-04-18',
    pageCount: 2,
    pages: [{ number: 1, text: 'Before day one: laptop ordered, accounts created, a buddy named. Day one: welcome meeting, tour, access check. First week: meet the team, read the policies, agree the first goals.' }]
  },
  {
    id: 'doc-supplier-review',
    name: 'Supplier review, third quarter',
    kind: 'pptx',
    collectionId: 'procurement',
    source: 'SharePoint',
    updatedAt: '2025-10-07',
    pageCount: 14,
    pages: [{ number: 6, text: 'Three suppliers were reviewed. Delivery performance improved for two of them. One supplier is placed on a watch list until the next review.' }]
  }
]
