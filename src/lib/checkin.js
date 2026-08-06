import { formatDate } from './moments.js';

// The two check-in types share everything except their question list and
// how a "period" (one day vs one ISO week) is keyed.
export const CHECKIN_TYPES = ['daily', 'weekly'];

export const DAILY_QUESTIONS = [
  {
    type: 'scale',
    id: 'felt_supported_stress',
    label: "I felt supported by my partner during today's stress.",
    options: ['1', '2', '3', '4', '5'],
    required: true,
  },
  {
    type: 'scale',
    id: 'felt_loved_today',
    label: 'I felt loved by my partner today.',
    options: ['1', '2', '3', '4', '5'],
    required: true,
  },
  {
    type: 'scale',
    id: 'felt_cared_attention',
    label: 'I got the attention and care I needed from my partner today.',
    options: ['1', '2', '3', '4', '5'],
    required: true,
  },
  {
    type: 'scale',
    id: 'relationship_rating',
    label: 'What rating would you give our relationship today?',
    hint: '1 awful · 2 bad · 3 normal · 4 good · 5 amazing',
    options: ['1', '2', '3', '4', '5'],
    required: true,
  },
  {
    type: 'textarea',
    id: 'free_expression',
    label: "Is there anything you'd like to share with your partner — good or bad? Trust each other, and don't hold it in.",
    required: false,
  },
];

// Ported verbatim (question text, ids, types, options) from the weekly
// check-in already built in personal/lovissimi (public/tickets/js/checkin.js)
// — same content, just rendered with insieme's own design.
export const WEEKLY_QUESTIONS = [
  { type: 'scale', id: 'feel_right_now', label: 'How do I feel right now?', options: ['1', '2', '3', '4', '5'], required: true },
  { type: 'heading', label: 'Emotional connection, intimacy, and affection', description: 'This is to establish feelings, basically, so we can read the next sections with more context of what the other is feeling and understand that those feelings affect the tone, or rather the content, of the answers. How does our emotional connection feel this week?' },
  { type: 'scale', id: 'closeness_week', label: 'How do I feel our closeness has been this week', options: ['1', '2', '3', '4', '5'], required: true },
  { type: 'scale', id: 'affection_week', label: 'How do I feel our affection has been this week', options: ['1', '2', '3', '4', '5'], required: true },
  { type: 'scale', id: 'connection_week', label: 'How do I feel our connection has been this week', options: ['1', '2', '3', '4', '5'], required: true },
  { type: 'scale', id: 'good_energy_week', label: 'How do I feel our good energy has been this week', options: ['1', '2', '3', '4', '5'], required: true },
  { type: 'choice_text', id: 'feel_more_loved', label: 'Is there anything that would help me feel more loved or understood?', options: ['Yes', 'No'], required: true },
  { type: 'choice_text', id: 'affection_more_less', label: "Is there anything about how we show affection that I'd want more of or less of", options: ['Yes', 'No'], required: true },
  { type: 'heading', label: 'Communication, boundaries, and comfort', description: 'Basically, this is to establish how our communication has been first and foremost and what can be done to improve it, then to share our thoughts about our boundaries (established and not), and to express what could make us feel more comfortable with this.' },
  { type: 'scale', id: 'communication_week', label: 'How do I feel our communication has been this week?', options: ['1', '2', '3', '4', '5'], required: true },
  { type: 'choice_text', id: 'hesitant_to_bring_up', label: "Is there anything I've been hesitant to bring up that I'd like to talk about now?", options: ['Yes', 'No'], required: true },
  { type: 'choice_text', id: 'not_my_place_bothers', label: "Is there anything I felt wasn't important or wasn't my place to say, but it bothers me not to communicate it?", options: ['Yes', 'No'], required: true },
  { type: 'choice_text', id: 'uncomfortable_unclear_behavior', label: 'Is there anywhere I felt uncomfortable or unclear about your behavior?', options: ['Yes', 'No'], required: true },
  { type: 'scale', id: 'heard_understood', label: 'Have I been feeling heard and understood?', options: ['1', '2', '3', '4', '5'], required: true },
  { type: 'choice_text', id: 'better_ways_talk', label: 'Are there better ways to talk about these stuff without it being so stressful?', options: ['Yes', 'No'], required: true },
  { type: 'heading', label: 'Boundaries', description: 'This includes all our thoughts about the current ones and future possible ones. It does not have to be perfectly clear, but just us sharing our little uncomfortable thoughts and worries so they don’t ramp up and intertwine with other issues.' },
  { type: 'choice_text', id: 'boundary_retalk', label: 'Is there any boundary that made me uncomfortable that we should re-talk?', options: ['Yes', 'No'], required: true },
  { type: 'choice_text', id: 'boundaries_respected', label: 'Do I feel my boundaries were respected?', options: ['Yes', 'No'], required: true },
  { type: 'choice_text', id: 'struggle_boundary_working_on', label: "Do I struggle with a boundary I'm working on?", options: ['Yes', 'No'], required: true },
  { type: 'choice_text', id: 'struggle_following_boundary', label: 'Do I struggle following a boundary and need guidance or discussing it further?', options: ['Yes', 'No'], required: true },
  { type: 'choice_text', id: 'boundary_not_clear', label: 'Do I feel like a boundary is not clear or covers too much and is overwhelming?', options: ['Yes', 'No'], required: true },
  { type: 'choice_text', id: 'make_boundary_respected', label: 'Is there something you could do differently next week to make me feel more respected/comfortable with a boundary?', options: ['Yes', 'No'], required: true },
  { type: 'heading', label: 'Comfort', description: 'This is more about the reassurance and emotions beyond the robotic logic, not necessarily about rules or boundaries.' },
  { type: 'choice_text', id: 'less_uneasy_anxious', label: 'Is there anything that can make me feel less uneasy or anxious about a boundary or our communication?', options: ['Yes', 'No'], required: true },
  { type: 'textarea', id: 'comfortable_expressing', label: 'How can I feel more comfortable being myself and expressing my feelings with you right now?', required: true },
  { type: 'choice_text', id: 'more_at_ease_reassured', label: 'Is there anything you could do that would help me feel more at ease or reassured?', options: ['Yes', 'No'], required: true },
  { type: 'heading', label: 'Life stuff and outside stress', description: "Of course, what affects us is not only brought by the other or the relationship itself, but also by life in general. We do talk, share a lot, and discuss things during the week, but if something is not brought up, we can dump it here as well." },
  { type: 'textarea', id: 'outside_relationship', label: "What's been going on outside of our relationship that has affected how I feel?", required: true },
  { type: 'choice_text', id: 'stress_support', label: "Is anything stressful happening in my life right now that you'd like my support with?", options: ['Yes', 'No'], required: true },
  { type: 'scale', id: 'supported_life_stress', label: 'Do I feel supported by you in dealing with life stress this week?', options: ['1', '2', '3', '4', '5'], required: true },
  { type: 'choice_text', id: 'help_workload_stress', label: 'Is there anything you can do next week to help me with my workload or stress?', options: ['Yes', 'No'], required: true },
  { type: 'textarea', id: 'routines_schedules_stress', label: 'Have our routines or schedules been adding stress for me? And if so, what adjustment can be made to improve this?', required: true },
  { type: 'heading', label: 'Appreciation', description: "Now, we do show a lot of appreciation and love toward each other, and that is one of the things that I love the most in our relationship, along with how we talk a lot about stuff. But still, it's nice to say the things that are not always said during our normal convos and/or in the express channel and dump them here. Because while the above sections might get stressful at times, it's nice to end with the things that make us remember why we're doing this effort in the first place." },
  { type: 'textarea', id: 'made_me_feel_loved', label: 'What did you do this week that made me feel loved or appreciated?', required: true },
  { type: 'textarea', id: 'enjoyed_most', label: 'What is one thing I enjoyed the most about us this week?', required: true },
  { type: 'choice_text', id: 'keep_doing_more', label: 'Is there something you did recently that I want you to keep doing more?', options: ['Yes', 'Not necessarily'], required: true },
  { type: 'textarea', id: 'most_supported_now', label: 'What makes me feel most supported by you right now?', required: true },
  { type: 'choice_text', id: 'small_thing_meant_a_lot', label: 'Is there any small thing that meant a lot to me this past week?', options: ['Yes', 'No'], required: true },
  { type: 'scale', id: 'feel_now', label: 'How do I feel now?', options: ['1', '2', '3', '4', '5'], required: true },
  { type: 'textarea', id: 'notes', label: 'Notes', required: false },
];

// The daily overall rating drives the relationship heatmap. Colors live here
// rather than in CSS so the web grid, its legend, and the monthly PDF all read
// from one place and can't drift apart.
export const RATING_QUESTION_ID = 'relationship_rating';

export const RATING_COLORS = {
  1: '#8fc6dc',
  2: '#cfe9ee',
  3: '#f2dfa8',
  4: '#f2b02e',
  5: '#e8804a',
};

export const RATING_LABELS = {
  1: 'Awful',
  2: 'Bad',
  3: 'Normal',
  4: 'Good',
  5: 'Amazing',
};

export function questionsForType(type) {
  return type === 'weekly' ? WEEKLY_QUESTIONS : DAILY_QUESTIONS;
}

export function typeLabel(type) {
  return type === 'weekly' ? 'Weekly Check-in' : 'Daily Check-in';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function getDailyPeriodInfo(date) {
  const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return { key, label: formatDate(date) };
}

// ISO 8601 week numbering — ported from lovissimi's checkin.js.
function getWeeklyPeriodInfo(date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);
  const year = utcDate.getUTCFullYear();
  return { key: `${year}-W${pad(week)}`, label: `Week ${week}, ${year}` };
}

export function getPeriodInfo(type, date = new Date()) {
  return type === 'weekly' ? getWeeklyPeriodInfo(date) : getDailyPeriodInfo(date);
}
