import travelData from '../data/travelData.json' with { type: 'json' };
import { buildRouteGraph, aStar, bfs } from '../lib/search.js';

const clamp = n => Math.max(0, Math.min(100, n));
const normal = s => String(s ?? '').toLowerCase().trim();
const includesAny = (values, wanted) => wanted.some(w => values.some(v => normal(v).includes(normal(w)) || normal(w).includes(normal(v))));

export function calculateBudget(destination, days, travellers = 1, contingencyPct = 8) {
  const nights = Math.max(0, days - 1), people = Math.max(1, Number(travellers) || 1);
  const transport = destination.transportFromHyderabad * 2 * people;
  const accommodation = destination.accommodationNight * nights * Math.ceil(people / 2);
  const localTransport = destination.localTransportDaily * days * people;
  const food = destination.foodDaily * days * people;
  const activities = destination.activities.slice(0, Math.min(3, days + 1)).reduce((sum, a) => sum + a.cost, 0) * people;
  const subtotal = transport + accommodation + localTransport + food + activities;
  const contingency = Math.round(subtotal * contingencyPct / 100);
  return { transport, accommodation, localTransport, food, activities, contingency, total: subtotal + contingency, subtotal, currency: 'INR', travellers: people, days, nights, basis: 'Illustrative estimates; return transport is estimated at twice the one-way sample cost.' };
}

function destinationScore(d, prefs, budget) {
  const interests = Array.isArray(prefs.interests) ? prefs.interests : [];
  const style = normal(prefs.travelStyle || 'moderate');
  const interestMatch = interests.length ? (d.interests.filter(i => includesAny([i], interests)).length / interests.length) * 100 : 70;
  const dailyTarget = Number(prefs.budget || budget) / Math.max(1, Number(prefs.days || d.recommendedDays));
  const dailyEstimated = d.dailyCost + d.transportFromHyderabad * 2 / Math.max(1, Number(prefs.days || d.recommendedDays));
  const budgetSuitability = clamp(100 - Math.max(0, dailyEstimated - dailyTarget) / Math.max(dailyTarget, 1) * 100);
  const styleMatch = d.styles.some(s => s === style || s.includes(style) || style.includes(s)) ? 100 : 55;
  const durationSuitability = clamp(100 - Math.abs(Number(prefs.days || d.recommendedDays) - d.recommendedDays) * 18);
  const practicality = d.country === 'India' ? 90 : 70;
  const score = Math.round(.30 * interestMatch + .25 * budgetSuitability + .20 * styleMatch + .15 * durationSuitability + .10 * practicality);
  return { score, breakdown: { interestMatch: Math.round(interestMatch), budgetSuitability: Math.round(budgetSuitability), travelStyleMatch: styleMatch, durationSuitability: Math.round(durationSuitability), practicality } };
}

export function recommendDestinations(prefs = {}, history = []) {
  const days = Math.max(1, Math.min(21, Number(prefs.days) || 4));
  const travellers = Math.max(1, Math.min(20, Number(prefs.travellers) || 1));
  const budget = Math.max(0, Number(prefs.budget) || 30000);
  const range = normal(prefs.destinationRange || 'anywhere');
  const origin = String(prefs.origin || 'Hyderabad');
  const interests = Array.isArray(prefs.interests) ? prefs.interests : [];
  const excluded = new Set([...(prefs.excludeDestinationIds || []), ...history.map(h => h.destinationId).filter(Boolean)]);
  const filteredOut = [];
  let candidates = travelData.destinations.filter(d => {
    const rangeMatch = range === 'anywhere' || range === 'worldwide' || range === 'all' || normal(d.continent) === range || normal(d.country) === range || normal(d.name) === range || normal(d.type) === range;
    if (!rangeMatch) { filteredOut.push({id:d.id, name:d.name, reason:'Outside selected geographic range'}); return false; }
    const duration = calculateBudget(d, days, travellers);
    if (duration.total > budget) { filteredOut.push({id:d.id, name:d.name, reason:`Estimated group cost ₹${duration.total.toLocaleString('en-IN')} exceeds budget`}); return false; }
    if (prefs.accommodation && prefs.accommodation !== 'any' && prefs.accommodation === 'luxury' && d.accommodationNight < 4500) { /* preference is soft; do not reject */ }
    return true;
  });
  const results = candidates.map(d => {
    const {score, breakdown} = destinationScore(d, {...prefs, days, budget}, budget);
    const cost = calculateBudget(d, days, travellers);
    const matched = interests.filter(i => includesAny(d.interests, [i]));
    const route = travelData.routes.find(r => normal(r.from) === normal(origin) && normal(r.to) === normal(d.name)) || travelData.routes.find(r => normal(r.from) === 'hyderabad' && normal(r.to) === normal(d.name));
    return {...d, estimatedBudget:cost, recommendationScore:score, scoreBreakdown:breakdown, matchedInterests:matched, route: route || {from:origin,to:d.name,mode:'transport options to verify',hours:null,cost:d.transportFromHyderabad,distance:null}, reason: matched.length ? `Matches ${matched.join(', ')}; ${d.summary}` : `Fits the selected region and estimated budget; ${d.summary}`};
  }).filter(d => !excluded.has(d.id)).sort((a,b) => b.recommendationScore-a.recommendationScore);
  // Keep diversity meaningful by penalising same-country candidates after the first result.
  const diversified = [];
  for (const item of results) {
    if (diversified.length >= 5) break;
    const sameCountryCount = diversified.filter(x => x.country === item.country).length;
    if (sameCountryCount >= 4) continue;
    diversified.push(item);
  }
  return { recommendations: diversified, filteredOut, constraintsApplied: [`Geographic range: ${prefs.destinationRange || 'Anywhere'}`, `Budget ceiling: ₹${budget.toLocaleString('en-IN')} for ${travellers} traveller(s)`, `Duration: ${days} day(s)`, interests.length ? `Interests: ${interests.join(', ')}` : 'No mandatory interests selected'], note: 'Prices are illustrative sample estimates, not live fares or availability.', noFit: diversified.length === 0 };
}

export function generateItinerary(destinationId, prefs = {}, history = []) {
  const d = travelData.destinations.find(x => x.id === destinationId);
  if (!d) throw Object.assign(new Error('Destination not found.'), {status:404});
  const days = Math.max(1, Math.min(14, Number(prefs.days) || d.recommendedDays));
  const travellers = Math.max(1, Math.min(20, Number(prefs.travellers) || 1));
  const budget = Math.max(0, Number(prefs.budget) || 30000);
  const cost = calculateBudget(d, days, travellers);
  if (cost.total > budget) throw Object.assign(new Error(`This plan is estimated at ₹${cost.total.toLocaleString('en-IN')}, above your ₹${budget.toLocaleString('en-IN')} budget. Try a shorter stay or a lower-cost destination.`), {status:422, details:{cost,budget}});
  const interests = Array.isArray(prefs.interests) ? prefs.interests : [];
  const historyIds = new Set(history.flatMap(h => h.activityIds || []));
  const pool = [...d.activities].sort((a,b) => {
    const am = interests.some(i => normal(a.category).includes(normal(i)) || normal(i).includes(normal(a.category))) ? 1 : 0;
    const bm = interests.some(i => normal(b.category).includes(normal(i)) || normal(i).includes(normal(b.category))) ? 1 : 0;
    return bm-am;
  });
  const unseen = pool.filter(a => !historyIds.has(a.id));
  const available = unseen.length >= Math.min(days, pool.length) ? unseen : pool;
  const picked = [];
  let offset = Math.max(0, Number(prefs.alternativeIndex) || 0) % Math.max(1, available.length);
  for (let i=0; i<Math.min(days*2, available.length); i++) picked.push(available[(offset+i)%available.length]);
  const dayBuckets = Array.from({length:days}, () => []);
  picked.forEach((activity, index) => dayBuckets[index % days].push(activity));
  const itineraryDays = Array.from({length:days}, (_,i) => {
    const items = dayBuckets[i];
    const periods = ['Morning','Afternoon','Evening'];
    const schedule = items.map((a,j) => ({...a, period:periods[j], travelHint:j===0?'Start after breakfast; allow time to reach the area.':'Allow a local transfer and a meal break before this stop.'}));
    return {day:i+1, title:i===0?'Arrival and first explorations':i===days-1?'Final explorations and departure':`Explore ${d.name} — day ${i+1}`, schedule, estimatedDailyExpense:Math.round(cost.total/days), restNote:'Leave buffer time for meals, rest, weather and local travel.'};
  });
  const routeGraph = buildRouteGraph(travelData.routes);
  const routeSearch = aStar(routeGraph, 'Hyderabad', d.name, () => 0);
  const graphForBfs = Object.fromEntries(Object.entries(routeGraph).map(([key, edges])=>[key,edges.map(e=>e.to)]));
  const bfsPath = bfs(graphForBfs, 'Hyderabad', d.name);
  const id = `plan-${d.id}-${days}-${travellers}-${Date.now().toString(36)}`;
  return {id, destination:{id:d.id,name:d.name,country:d.country,continent:d.continent,lat:d.lat,lng:d.lng,season:d.season,summary:d.summary}, days:itineraryDays, budget:cost, budgetRemaining:budget-cost.total, budgetLimit:budget, withinBudget:cost.total<=budget, accommodation:{category:prefs.accommodation || 'mid-range hotel', estimatedNightlyCost:d.accommodationNight, note:'Sample price estimate; confirm availability before booking.'}, transport:{mode:prefs.transport || d.route?.mode || 'flight / train / road', estimatedRoundTripCost:cost.transport, note:'Indicative estimate; not a live fare.'}, routeSearch:{algorithm:'A* demonstration graph', path:routeSearch?.path || ['Hyderabad',d.name], distanceCost:routeSearch?.cost ?? null, bfsFewestEdgesPath:bfsPath, explanation:'A* uses accumulated edge distance plus a heuristic. This demo uses a zero heuristic, so it behaves like uniform-cost search over the sample graph. BFS finds a path with the fewest edges, not necessarily the cheapest or fastest.'}, activityIds:picked.map(a=>a.id), generatedAt:new Date().toISOString(), note:'Sample itinerary built from the local travel knowledge dataset. Verify opening hours, ticket prices, visas and transport before travelling.'};
}

export function getTravelData() { return travelData; }
