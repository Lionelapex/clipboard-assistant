export interface FormField {
  id: string;
  heading: string;
  description: string;
  guidance: string;
  placeholder: string;
  minLength: number;
  maxLength: number;
  rows: number;
}

export const FORM_FIELDS: FormField[] = [
  {
    id: 'project-summary',
    heading: 'Project summary',
    description:
      'Give us a short overview of the work you are applying to fund, who it is for and where it will take place.',
    guidance: 'Around 250 characters is usually enough for a summary.',
    placeholder: 'We are applying to extend our weekend youth club to a second venue in…',
    minLength: 250,
    maxLength: 4000,
    rows: 6,
  },
  {
    id: 'statement-of-need',
    heading: 'Statement of need',
    description:
      'Describe the need your project responds to. Include local evidence, such as your own data, consultation findings or referrals from partners.',
    guidance: 'Explain who experiences the need and how you know it exists.',
    placeholder: 'Our 2026 member survey of 148 families showed that 62% of respondents…',
    minLength: 400,
    maxLength: 4000,
    rows: 8,
  },
  {
    id: 'approach-and-activities',
    heading: 'Approach and activities',
    description:
      'Explain what you will actually do, how often the activity will run, and who will deliver it.',
    guidance: 'Include a brief delivery timeline and the roles responsible for each activity.',
    placeholder: 'The project will run three after-school sessions per week for 36 weeks…',
    minLength: 400,
    maxLength: 4000,
    rows: 8,
  },
  {
    id: 'outcomes-and-measurement',
    heading: 'Outcomes and measurement',
    description:
      'What will change for the people you work with, and how will you know? Describe the measures you will use and when you will review them.',
    guidance: 'We look for specific, realistic outcomes rather than broad aims.',
    placeholder: 'We expect 90 young people to attend at least six sessions, measured by…',
    minLength: 300,
    maxLength: 4000,
    rows: 7,
  },
  {
    id: 'budget-summary',
    heading: 'Budget summary',
    description:
      'Summarise how the grant would be spent. A full budget can be uploaded at stage two, but we need the main cost lines here.',
    guidance: 'Include staff, delivery, equipment and evaluation costs, and any match funding.',
    placeholder: 'Total project cost: £38,400. We are requesting £24,000, with the balance…',
    minLength: 250,
    maxLength: 4000,
    rows: 7,
  },
  {
    id: 'organisational-capacity',
    heading: 'Organisational capacity',
    description:
      'Tell us about your organisation’s track record, governance and the people who will manage this grant.',
    guidance: 'Include relevant safeguarding, finance and monitoring arrangements.',
    placeholder: 'Founded in 2011, we deliver youth and family services across two boroughs…',
    minLength: 200,
    maxLength: 4000,
    rows: 6,
  },
];

export function fieldById(id: string): FormField | undefined {
  return FORM_FIELDS.find((field) => field.id === id);
}

export type AnswerState = Record<string, string>;

export type CompletionStatus = 'not-started' | 'in-progress' | 'complete';

export function completionStatus(field: FormField, value: string | undefined): CompletionStatus {
  const length = (value ?? '').trim().length;
  if (length === 0) return 'not-started';
  if (length < field.minLength) return 'in-progress';
  return 'complete';
}

export function completedCount(answers: AnswerState): number {
  return FORM_FIELDS.filter((field) => completionStatus(field, answers[field.id]) === 'complete').length;
}
