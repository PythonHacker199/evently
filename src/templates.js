/**
 * Planning knowledge base for each supported event type.
 *
 * Budget splits are industry rule-of-thumb starting points (they always sum to 100%).
 * Milestones and vendor lead times are expressed as "days before the event"; negative
 * values are follow-ups after the event. The planner compresses them for short-notice events.
 */

/** @typedef {{ key: string, label: string, pct: number }} BudgetCategory */
/** @typedef {{ id: string, days: number, title: string, detail: string }} Milestone */
/** @typedef {{ key: string, name: string, budgetKey: string, leadDays: number, mapsTerm: string, questions: string[] }} VendorTemplate */
/** @typedef {{ title: string, description: string }} Idea */
/** @typedef {{ time: string, activity: string }} AgendaItem */

export const EVENT_TYPES = Object.freeze({
  wedding: {
    label: 'Wedding',
    budget: [
      { key: 'venue', label: 'Venue & rentals', pct: 30 },
      { key: 'catering', label: 'Food & beverages', pct: 28 },
      { key: 'photo', label: 'Photography & video', pct: 10 },
      { key: 'decor', label: 'Decor & flowers', pct: 9 },
      { key: 'attire', label: 'Attire & beauty', pct: 8 },
      { key: 'entertainment', label: 'Music & entertainment', pct: 6 },
      { key: 'stationery', label: 'Invitations & stationery', pct: 2 },
      { key: 'transport', label: 'Transport & logistics', pct: 2 },
      { key: 'contingency', label: 'Contingency buffer', pct: 5 },
    ],
    milestones: [
      { id: 'w-budget', days: 365, title: 'Set budget and draft guest list', detail: 'Agree on the total budget, who contributes, and a first guest list. It drives every other decision.' },
      { id: 'w-venue', days: 300, title: 'Book the venue', detail: 'Popular venues book out early. Confirm capacity, inclusions and the weather backup plan.' },
      { id: 'w-core', days: 270, title: 'Book caterer and photographer', detail: 'Lock in the two vendors that sell out fastest after venues.' },
      { id: 'w-std', days: 180, title: 'Send save-the-dates', detail: 'Give guests time to plan travel, especially for out-of-town attendees.' },
      { id: 'w-attire', days: 150, title: 'Shop for attire', detail: 'Leave room for alterations and fittings.' },
      { id: 'w-vendors', days: 120, title: 'Book decor, music and transport', detail: 'Share your theme brief and venue layout with each vendor.' },
      { id: 'w-invites', days: 75, title: 'Send invitations', detail: 'Include RSVP deadline, dietary-needs question and accessibility info.' },
      { id: 'w-tasting', days: 45, title: 'Menu tasting and finalise menu', detail: 'Confirm dietary options and service style with the caterer.' },
      { id: 'w-rsvp', days: 30, title: 'Chase RSVPs and confirm headcount', detail: 'Most caterers need a final guaranteed count 2–3 weeks out.' },
      { id: 'w-confirm', days: 14, title: 'Final vendor confirmations and payment schedule', detail: 'Re-confirm arrival times, balances due and contact people for the day.' },
      { id: 'w-runsheet', days: 7, title: 'Share the day-of run sheet', detail: 'Send one timeline with every vendor’s arrival, setup and contact number.' },
      { id: 'w-prep', days: 1, title: 'Rehearsal and emergency kit', detail: 'Rehearse the ceremony and pack a kit: safety pins, chargers, medicines, snacks.' },
      { id: 'w-day', days: 0, title: 'Wedding day', detail: 'Hand the run sheet to a trusted coordinator and enjoy the day.' },
      { id: 'w-thanks', days: -7, title: 'Thank-you notes and vendor reviews', detail: 'Settle final balances and thank guests and vendors.' },
    ],
    vendors: [
      { key: 'venue', name: 'Venue', budgetKey: 'venue', leadDays: 300, mapsTerm: 'wedding venue', questions: ['What is included in the fee (tables, chairs, lighting, staff)?', 'What is the seated vs. standing capacity?', 'What is the backup plan for bad weather?', 'Are there noise or end-time restrictions?', 'What is the cancellation and refund policy?'] },
      { key: 'caterer', name: 'Caterer', budgetKey: 'catering', leadDays: 270, mapsTerm: 'wedding caterer', questions: ['Can we do a tasting before signing?', 'How do you handle dietary needs and allergies?', 'What does the per-plate price include (service staff, crockery)?', 'What is the minimum guarantee and the final headcount deadline?'] },
      { key: 'photographer', name: 'Photographer & videographer', budgetKey: 'photo', leadDays: 270, mapsTerm: 'wedding photographer', questions: ['Can we see two complete event galleries, not just highlights?', 'How many hours of coverage and how many shooters?', 'When will edited photos and video be delivered?', 'Who owns the usage rights?'] },
      { key: 'attire', name: 'Attire, makeup & hair', budgetKey: 'attire', leadDays: 150, mapsTerm: 'bridal makeup artist', questions: ['How many fittings or trials are included?', 'What is the turnaround for alterations?', 'Do you travel to the venue on the day?'] },
      { key: 'decorator', name: 'Decorator & florist', budgetKey: 'decor', leadDays: 120, mapsTerm: 'wedding decorator', questions: ['Can you share a mood board or mock-up before we pay the balance?', 'Which flowers are in season for our date?', 'Is setup and teardown included?'] },
      { key: 'music', name: 'DJ / band / entertainment', budgetKey: 'entertainment', leadDays: 120, mapsTerm: 'wedding DJ', questions: ['Can we provide a must-play and do-not-play list?', 'What sound and lighting equipment do you bring?', 'What happens if you are unwell on the day?'] },
      { key: 'stationery', name: 'Invitation designer / printer', budgetKey: 'stationery', leadDays: 120, mapsTerm: 'wedding invitation printer', questions: ['Can you produce matching digital invitations?', 'How long do proofs and printing take?'] },
      { key: 'transport', name: 'Transport & guest logistics', budgetKey: 'transport', leadDays: 90, mapsTerm: 'wedding car rental', questions: ['Is fuel, driver and waiting time included?', 'Can you shuttle guests between venues and hotels?'] },
    ],
    ideas: [
      { title: 'Personal story stations', description: 'Mark milestones of your relationship around the venue with photos and short captions guests discover while mingling.' },
      { title: 'Regional tasting menu', description: 'Serve small plates from both families’ home regions so the menu itself tells your story.' },
      { title: 'Living guest book', description: 'Ask guests to write wishes on seed-paper tags you can later plant together.' },
      { title: 'Golden-hour portraits', description: 'Schedule a 20-minute portrait slot around sunset for the best natural light.' },
    ],
    agenda: [
      { time: '-3:00', activity: 'Vendors arrive, setup and sound check' },
      { time: '0:00', activity: 'Guest arrival and welcome drinks' },
      { time: '0:45', activity: 'Ceremony' },
      { time: '1:30', activity: 'Family portraits and cocktail hour' },
      { time: '2:30', activity: 'Dinner and toasts' },
      { time: '4:00', activity: 'First dance and open dance floor' },
      { time: '6:00', activity: 'Send-off' },
    ],
    tips: [
      'Assign one trusted person as the day-of point of contact for all vendors.',
      'Collect dietary needs and accessibility requirements in the RSVP form.',
      'Keep the contingency buffer untouched until the final month.',
    ],
    savingTips: [
      'Consider an off-peak day or season for venue discounts.',
      'Use seasonal, local flowers and reuse ceremony decor at the reception.',
      'Send digital invitations and print only for elders who prefer paper.',
    ],
    risks: [
      'Weather: confirm an indoor or covered backup space.',
      'Vendor no-shows: keep each vendor’s backup contact on the run sheet.',
    ],
  },

  birthday: {
    label: 'Birthday',
    budget: [
      { key: 'venue', label: 'Venue', pct: 20 },
      { key: 'catering', label: 'Food & drinks', pct: 30 },
      { key: 'cake', label: 'Cake & desserts', pct: 10 },
      { key: 'decor', label: 'Decor & theme', pct: 12 },
      { key: 'entertainment', label: 'Entertainment & activities', pct: 13 },
      { key: 'photo', label: 'Photos & memories', pct: 5 },
      { key: 'stationery', label: 'Invites & party favors', pct: 3 },
      { key: 'contingency', label: 'Contingency buffer', pct: 7 },
    ],
    milestones: [
      { id: 'b-plan', days: 60, title: 'Pick theme, budget and guest list', detail: 'Decide whether it is a surprise, the age group and the overall vibe.' },
      { id: 'b-venue', days: 45, title: 'Book the venue', detail: 'Check kid-friendliness or late-night rules depending on your crowd.' },
      { id: 'b-invite', days: 30, title: 'Send invitations', detail: 'Mention theme or dress code and ask about allergies.' },
      { id: 'b-book', days: 21, title: 'Book entertainment and order the cake', detail: 'Popular bakers and entertainers fill weekend slots early.' },
      { id: 'b-shop', days: 14, title: 'Buy decor and party favors', detail: 'Order online early to avoid last-minute delivery delays.' },
      { id: 'b-rsvp', days: 7, title: 'Confirm RSVPs and final headcount', detail: 'Update caterer and venue with the final count.' },
      { id: 'b-prep', days: 2, title: 'Playlist, schedule and shopping run', detail: 'Prepare a simple run sheet and charge cameras and speakers.' },
      { id: 'b-day', days: 0, title: 'Party day', detail: 'Set up early and delegate the cake moment to someone you trust.' },
      { id: 'b-thanks', days: -3, title: 'Share photos and thank-you messages', detail: 'Send a photo album link to guests.' },
    ],
    vendors: [
      { key: 'venue', name: 'Venue / party space', budgetKey: 'venue', leadDays: 45, mapsTerm: 'party hall', questions: ['How long is the booking slot, including setup and cleanup?', 'Can we bring outside food or a cake?', 'Is there a sound limit or curfew?'] },
      { key: 'caterer', name: 'Caterer / restaurant', budgetKey: 'catering', leadDays: 30, mapsTerm: 'party caterer', questions: ['Do you have a kids or party menu?', 'How do you label allergens?', 'What is the per-head price with service?'] },
      { key: 'bakery', name: 'Bakery (cake & desserts)', budgetKey: 'cake', leadDays: 21, mapsTerm: 'custom cake bakery', questions: ['Can you match our theme on the cake design?', 'Do you offer eggless, vegan or allergy-friendly options?', 'Is delivery to the venue included?'] },
      { key: 'entertainer', name: 'Entertainer / activity host', budgetKey: 'entertainment', leadDays: 21, mapsTerm: 'party entertainer', questions: ['How long is the act and is it age-appropriate?', 'What space and equipment do you need?'] },
      { key: 'decor', name: 'Decor & balloon artist', budgetKey: 'decor', leadDays: 14, mapsTerm: 'balloon decoration', questions: ['Can you share photos of similar themed setups?', 'Is setup and removal included?'] },
      { key: 'photo', name: 'Photographer / photo booth', budgetKey: 'photo', leadDays: 21, mapsTerm: 'event photographer', questions: ['How quickly are photos shared after the party?', 'Do you bring props for the booth?'] },
    ],
    ideas: [
      { title: 'Memory lane wall', description: 'Display one photo from every year of the guest of honour’s life along the entrance.' },
      { title: 'Interactive dessert bar', description: 'Let guests decorate their own cupcakes or cookies; it doubles as an activity.' },
      { title: 'Video messages', description: 'Collect short video wishes from friends who cannot attend and play them during the cake moment.' },
      { title: 'Theme-matched favors', description: 'Send guests home with a small, useful favor tied to the theme instead of plastic trinkets.' },
    ],
    agenda: [
      { time: '-1:30', activity: 'Setup decor, music and food stations' },
      { time: '0:00', activity: 'Guests arrive, welcome drinks and snacks' },
      { time: '0:45', activity: 'Main activity or entertainment' },
      { time: '1:45', activity: 'Food is served' },
      { time: '2:30', activity: 'Cake cutting and toasts' },
      { time: '3:00', activity: 'Games, dancing and favors as guests leave' },
    ],
    tips: [
      'Set the RSVP deadline a week before the party so headcounts are reliable.',
      'Keep one adult or friend in charge of the timeline so the host can enjoy the party.',
      'Ask about allergies on the invitation, not on the day.',
    ],
    savingTips: [
      'Host at home or in a community space and spend more on food and fun.',
      'Choose one statement decor piece instead of decorating every corner.',
      'Make a playlist instead of hiring a DJ for small groups.',
    ],
    risks: [
      'Late cake delivery: schedule it at least two hours before the party.',
      'Headcount surprises: order 10% extra food for walk-ins.',
    ],
  },

  community: {
    label: 'Community event',
    budget: [
      { key: 'venue', label: 'Venue & infrastructure', pct: 25 },
      { key: 'catering', label: 'Food & refreshments', pct: 20 },
      { key: 'av', label: 'Sound, stage & AV', pct: 12 },
      { key: 'marketing', label: 'Promotion & signage', pct: 10 },
      { key: 'permits', label: 'Permits, insurance & safety', pct: 8 },
      { key: 'decor', label: 'Decor & branding', pct: 8 },
      { key: 'entertainment', label: 'Performers & activities', pct: 7 },
      { key: 'volunteers', label: 'Volunteer kits & supplies', pct: 5 },
      { key: 'contingency', label: 'Contingency buffer', pct: 5 },
    ],
    milestones: [
      { id: 'c-goals', days: 120, title: 'Define goals, audience and organising committee', detail: 'Write down what success looks like (attendance, funds raised, sign-ups).' },
      { id: 'c-venue', days: 100, title: 'Secure venue and apply for permits', detail: 'Public spaces often need police, fire or municipal approval.' },
      { id: 'c-sponsors', days: 90, title: 'Approach sponsors and partners', detail: 'Offer clear sponsorship tiers with visibility benefits.' },
      { id: 'c-vendors', days: 75, title: 'Book AV, food vendors and performers', detail: 'Get written quotes and confirm power and space needs.' },
      { id: 'c-promo', days: 60, title: 'Launch promotion and registrations', detail: 'Use posters, local groups, social media and a simple sign-up form.' },
      { id: 'c-volunteers', days: 45, title: 'Recruit volunteers', detail: 'Plan roles: registration, wayfinding, first aid, cleanup.' },
      { id: 'c-safety', days: 30, title: 'Confirm insurance, safety and accessibility plan', detail: 'Map exits, first-aid point, step-free access and lost-child procedure.' },
      { id: 'c-brief', days: 14, title: 'Volunteer briefing and run-of-show', detail: 'Walk everyone through the schedule, radio channels and escalation contacts.' },
      { id: 'c-final', days: 7, title: 'Final headcount and vendor confirmations', detail: 'Re-confirm deliveries, setup times and payments.' },
      { id: 'c-setup', days: 1, title: 'Setup and site walkthrough', detail: 'Test sound, signage and accessibility routes.' },
      { id: 'c-day', days: 0, title: 'Event day', detail: 'Run a quick volunteer huddle before doors open.' },
      { id: 'c-report', days: -7, title: 'Post-event report and thank sponsors', detail: 'Share attendance, photos and impact with sponsors and volunteers.' },
    ],
    vendors: [
      { key: 'venue', name: 'Venue / public space', budgetKey: 'venue', leadDays: 100, mapsTerm: 'community hall', questions: ['What permits does the venue already hold?', 'Is there step-free access and accessible toilets?', 'What power supply and water access is available?'] },
      { key: 'permits', name: 'Local authority / permits office', budgetKey: 'permits', leadDays: 100, mapsTerm: 'municipal office', questions: ['Which permits are needed (police, fire, sound, food)?', 'How long does approval take?', 'Is public liability insurance mandatory?'] },
      { key: 'av', name: 'Sound, stage & AV provider', budgetKey: 'av', leadDays: 75, mapsTerm: 'sound system rental', questions: ['Is a technician included for the full event?', 'Do you provide backup microphones and a generator?'] },
      { key: 'food', name: 'Food vendors / caterer', budgetKey: 'catering', leadDays: 75, mapsTerm: 'event caterer', questions: ['Do you hold valid food-safety certification?', 'Can you serve quickly at peak times?', 'How do you handle waste and recycling?'] },
      { key: 'performers', name: 'Performers / speakers', budgetKey: 'entertainment', leadDays: 75, mapsTerm: 'event performers', questions: ['What is your technical rider?', 'Are you comfortable with a family audience?'] },
      { key: 'printing', name: 'Printing & promotion', budgetKey: 'marketing', leadDays: 60, mapsTerm: 'printing shop', questions: ['Can you print weather-resistant signage?', 'What is the turnaround for banners and flyers?'] },
      { key: 'safety', name: 'First aid & security', budgetKey: 'permits', leadDays: 30, mapsTerm: 'event security services', questions: ['How many staff do you recommend for our crowd size?', 'Do you provide a first-aid tent and trained responders?'] },
    ],
    ideas: [
      { title: 'Neighbourhood skills fair', description: 'Invite residents to run 10-minute mini workshops: cooking, repair, art or coding.' },
      { title: 'Zero-waste pledge', description: 'Use reusable plates, water refill stations and clearly labelled sorting bins.' },
      { title: 'Community story wall', description: 'Let attendees pin notes about what they love about the area; photograph it for the post-event report.' },
      { title: 'Inclusive quiet zone', description: 'Set up a calm, low-noise space for families, elders and neurodivergent guests.' },
    ],
    agenda: [
      { time: '-2:00', activity: 'Setup, volunteer huddle and safety check' },
      { time: '0:00', activity: 'Doors open, registration and welcome' },
      { time: '0:30', activity: 'Opening address and partner thank-yous' },
      { time: '1:00', activity: 'Main programme: activities, stalls, performances' },
      { time: '3:00', activity: 'Community highlight or awards' },
      { time: '3:30', activity: 'Closing remarks and group photo' },
      { time: '4:00', activity: 'Cleanup and volunteer debrief' },
    ],
    tips: [
      'Publish a single information page with time, map, accessibility and contact details.',
      'Give volunteers colour-coded roles and a one-page cheat sheet.',
      'Track registrations to forecast food quantities and staffing.',
    ],
    savingTips: [
      'Offer sponsors in-kind visibility in exchange for food, printing or AV.',
      'Partner with local schools or colleges for venues and volunteers.',
      'Borrow equipment from other community groups and return the favour.',
    ],
    risks: [
      'Permit delays: apply as early as possible and keep copies on site.',
      'Crowd safety: plan entry and exit flow for peak attendance.',
    ],
  },
});

export const EVENT_TYPE_KEYS = Object.freeze(Object.keys(EVENT_TYPES));

export const CURRENCIES = Object.freeze(['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY']);

/**
 * Public, client-safe view of the templates used to build the form.
 * @returns {{ eventTypes: { key: string, label: string, categories: { key: string, label: string }[] }[], currencies: readonly string[] }}
 */
export function getPublicConfig() {
  return {
    eventTypes: EVENT_TYPE_KEYS.map((key) => ({
      key,
      label: EVENT_TYPES[key].label,
      categories: EVENT_TYPES[key].budget
        .filter((c) => c.key !== 'contingency')
        .map(({ key: k, label }) => ({ key: k, label })),
    })),
    currencies: CURRENCIES,
  };
}
