import { useId, useState, type FormEvent } from 'react';
import { CalendarDays, MapPin, Sparkles, Users, Wallet } from 'lucide-react';
import { BUTTON, CHIP_ICON, Chip, Eyebrow, GlassCard } from '@/components/ui';
import { initialDetailValues, parseAmount, validateDetails, type DetailValues } from '@/lib/details';
import {
  CURRENCIES,
  EVENT_TYPE_OPTIONS,
  formatDate,
  formatMoney,
  localToday,
  type DetailField,
  type PlanInput,
  type PlannerState,
} from '@/lib/planner';
import { useFocusOnMount } from '@/lib/useFocusOnMount';

type EditableField = Exclude<DetailField, 'currency'>;

const FIELD_LABEL: Record<EditableField, string> = {
  eventType: 'What are you celebrating?',
  date: 'When is it?',
  guests: 'How many guests?',
  budget: 'Total budget',
  location: 'Where is it?',
};

const INPUT =
  'w-full h-12 rounded-2xl border-2 border-white bg-white/70 px-4 font-sans text-base font-medium text-evently-text outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-evently-prompt/50 aria-[invalid=true]:border-[#c0563a]';

/** Summary of what Gemini already understood, so the user only fills the gaps. */
function UnderstoodChips({ input }: { input: Partial<PlanInput> }) {
  const type = EVENT_TYPE_OPTIONS.find((o) => o.value === input.eventType)?.label;
  const chips = [
    type && <Chip key="type" icon={<Sparkles className={CHIP_ICON} aria-hidden="true" />}>{type}</Chip>,
    input.date && <Chip key="date" icon={<CalendarDays className={CHIP_ICON} aria-hidden="true" />}>{formatDate(input.date)}</Chip>,
    input.guests && <Chip key="guests" icon={<Users className={CHIP_ICON} aria-hidden="true" />}>{input.guests} guests</Chip>,
    input.budget && (
      <Chip key="budget" icon={<Wallet className={CHIP_ICON} aria-hidden="true" />}>
        {formatMoney(input.budget, input.currency ?? 'INR')}
      </Chip>
    ),
    input.location && <Chip key="loc" icon={<MapPin className={CHIP_ICON} aria-hidden="true" />}>{input.location}</Chip>,
    input.theme && <Chip key="theme">{input.theme}</Chip>,
  ].filter(Boolean);
  if (chips.length === 0) return null;
  return (
    <div className="mb-7">
      <p className="font-sans text-sm font-medium text-evently-muted mb-2.5">Here's what we understood:</p>
      <div className="flex flex-wrap gap-2">{chips}</div>
    </div>
  );
}

type DetailsState = Extract<PlannerState, { status: 'details' }>;

/** Asks for fields Gemini could not infer, or lets the user adjust a finished plan. */
export function DetailsCard({
  state,
  onSubmit,
  onCancel,
}: {
  state: DetailsState;
  onSubmit: (values: Partial<PlanInput>) => void;
  onCancel: () => void;
}) {
  const { input, fields, reason } = state;
  const uid = useId();
  const firstRef = useFocusOnMount<HTMLInputElement & HTMLSelectElement>();
  const [values, setValues] = useState<DetailValues>(() => initialDetailValues(input));
  const [errors, setErrors] = useState<Partial<Record<DetailField, string>>>(state.errors);
  const isEdit = reason === 'edit';

  const update = (key: keyof DetailValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const result = validateDetails(fields, values);
    setErrors(result.errors);
    if (Object.keys(result.errors).length === 0) onSubmit(result.input);
  }

  const budgetPreview = parseAmount(values.budget);
  const visible = fields.filter((f): f is EditableField => f !== 'currency');

  return (
    <GlassCard className="max-w-[640px] mx-auto">
      <Eyebrow>{isEdit ? 'Adjust your plan' : 'Almost there'}</Eyebrow>
      <h2 className="font-sans text-[30px] max-md:text-[26px] font-medium tracking-[-0.03em] text-evently-text leading-tight mb-2">
        {isEdit ? 'Change any detail and re-plan' : visible.length === 1 ? 'Just one more detail' : 'Just a few more details'}
      </h2>
      <p className="font-sans text-base text-evently-muted leading-relaxed mb-6">
        {isEdit ? 'Your budget, timeline and vendor list will be rebuilt from these.' : "We couldn't find these in your description. Everything else is ready."}
      </p>

      {!isEdit && <UnderstoodChips input={input} />}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {visible.map((field, i) => {
          const id = `${uid}-${field}`;
          const err = errors[field] ?? (field === 'budget' ? errors.currency : undefined);
          const common = {
            id,
            'aria-invalid': Boolean(err),
            'aria-describedby': err ? `${id}-err` : undefined,
            ref: i === 0 ? firstRef : undefined,
          };
          return (
            <div key={field}>
              <label htmlFor={id} className="block font-sans text-[15px] font-semibold text-evently-text mb-2">
                {FIELD_LABEL[field]}
              </label>
              {field === 'eventType' && (
                <select {...common} value={values.eventType} onChange={update('eventType')} className={INPUT}>
                  <option value="" disabled>
                    Choose one
                  </option>
                  {EVENT_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              {field === 'date' && <input {...common} type="date" min={localToday()} value={values.date} onChange={update('date')} className={INPUT} />}
              {field === 'guests' && (
                <input {...common} type="text" inputMode="numeric" autoComplete="off" placeholder="e.g. 120" value={values.guests} onChange={update('guests')} className={INPUT} />
              )}
              {field === 'budget' && (
                <>
                  <div className="flex gap-2">
                    <label htmlFor={`${id}-cur`} className="sr-only">
                      Currency
                    </label>
                    <select id={`${id}-cur`} value={values.currency} onChange={update('currency')} className={`${INPUT} w-[104px] flex-shrink-0`}>
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <input {...common} type="text" inputMode="numeric" autoComplete="off" placeholder="e.g. 1500000" value={values.budget} onChange={update('budget')} className={INPUT} />
                  </div>
                  {Number.isFinite(budgetPreview) && budgetPreview >= 1 && (
                    <p className="font-sans text-sm text-evently-muted mt-1.5">= {formatMoney(budgetPreview, values.currency)}</p>
                  )}
                </>
              )}
              {field === 'location' && (
                <input {...common} type="text" autoComplete="off" maxLength={80} placeholder="City or area" value={values.location} onChange={update('location')} className={INPUT} />
              )}
              {err && (
                <p id={`${id}-err`} className="font-sans text-sm font-medium text-[#a8462c] mt-1.5">
                  {err}
                </p>
              )}
            </div>
          );
        })}

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" className={BUTTON.dark}>
            {isEdit ? 'Re-plan my event' : 'Plan My Event'}
          </button>
          {state.previous && (
            <button type="button" onClick={onCancel} className={BUTTON.glass}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </GlassCard>
  );
}
